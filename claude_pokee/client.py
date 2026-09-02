"""Pokee Isaac API client.

Stdlib only — no pip installs. Shared by the MCP server, the local chat
server, and the CLI.

Config resolution order (first non-empty wins):
  1. real process environment
  2. ./.env (the directory Claude Code / the shell was launched from)
  3. ~/.pokee/.env  (recommended home for the key once pip-installed)

Never writes to stdout: the MCP server owns stdout for JSON-RPC framing.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# The working directory at launch: where .env is looked up, where builds/
# lands, and the MCP server's write-confinement root. Deliberately NOT the
# package directory — when pip-installed that lives in site-packages.
PROJECT_ROOT = Path.cwd()

DEFAULT_API_URL = "https://api.pokee.ai/v1/chat/completions"
DEFAULT_MODEL = "pokee-isaac"

# Documented limits of the Pokee API (developer.pokee.ai). Kept here so the
# code fails locally with a clear message instead of paying to upload a body
# the gateway will reject.
MAX_REQUEST_BYTES = 45 * 1024 * 1024   # hard body cap
SSE_REQUIRED_BYTES = 16 * 1024 * 1024  # above this, stream=true is mandatory
MAX_OUTPUT_TOKENS = 60000              # both the default and the maximum
CONTEXT_TOKENS = 10000000              # ~10M prompt tokens

# Credits are $0.01 each; usage is billed in whole credits, rounded up.
USD_PER_1M_INPUT = 0.15
USD_PER_1M_OUTPUT = 1.00

# Isaac generations are long-running by design (5-30s typical, minutes for
# 32k-token single-file builds, and around seven minutes for a 10M-token
# prompt — hence a timeout far above the usual 30-60s client default).
DEFAULT_TIMEOUT = 900

# error.code values worth translating into advice, from the documented table.
_ERROR_HINTS = {
    "invalid_api_key": "check POKEE_API_KEY",
    "key_revoked": "this key was revoked — create a new one at developer.pokee.ai",
    "insufficient_credits": "out of credits — top up at developer.pokee.ai",
    "payload_too_large": "body exceeds Pokee's {} MiB limit".format(
        MAX_REQUEST_BYTES // (1024 * 1024)),
    "large_request_requires_sse": "bodies over {} MiB must set stream=true".format(
        SSE_REQUIRED_BYTES // (1024 * 1024)),
    "model_not_found": "check POKEE_MODEL",
    "invalid_max_tokens": "max_tokens must be <= {:,}".format(MAX_OUTPUT_TOKENS),
}


class IsaacError(Exception):
    """Anything that went wrong talking to Pokee."""


def log(msg):
    """Diagnostics go to stderr, always."""
    print(msg, file=sys.stderr, flush=True)


def _parse_env_file(path):
    values = {}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key:
            values[key] = val
    return values


def load_config():
    """Resolve api_key / api_url / model, with a clear error if the key is missing."""
    layers = [
        os.environ,
        _parse_env_file(PROJECT_ROOT / ".env"),
        _parse_env_file(Path.home() / ".pokee" / ".env"),
    ]

    def pick(name, default=None):
        for layer in layers:
            val = layer.get(name)
            if val:
                return val
        return default

    api_key = pick("POKEE_API_KEY")
    if not api_key or api_key.startswith("YOUR"):
        raise IsaacError(
            "No Pokee API key found. Export POKEE_API_KEY=pk-live-... in your "
            "shell, or put that line in {} or {}. Keys come from "
            "developer.pokee.ai -> API Keys.".format(
                Path.home() / ".pokee" / ".env", PROJECT_ROOT / ".env"
            )
        )
    return {
        "api_key": api_key,
        "api_url": pick("POKEE_API_URL", DEFAULT_API_URL),
        "model": pick("POKEE_MODEL", DEFAULT_MODEL),
    }


def _request(config, payload, timeout, body=None):
    # Callers that already serialised the payload pass it in: at multi-megabyte
    # sizes encoding it twice is real memory and CPU.
    if body is None:
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        config["api_url"],
        data=body,
        headers={
            "Authorization": "Bearer " + config["api_key"],
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if payload.get("stream") else "application/json",
            # Identify the client honestly; the urllib default is rejected by
            # some WAFs outright.
            "User-Agent": "isaac-claude-code/1.0 (+python-urllib)",
        },
        method="POST",
    )
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        # Read the body exactly once — reading twice yields an empty string.
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:800]
        except Exception:
            pass
        # Errors share one OpenAI-shaped envelope; error.code names the cause
        # far more precisely than the status alone.
        code = ""
        try:
            code = ((json.loads(detail) or {}).get("error") or {}).get("code") or ""
        except ValueError:
            pass

        hint = _ERROR_HINTS.get(code, "")
        if not hint:
            if exc.code in (401, 403):
                hint = "check POKEE_API_KEY"
            elif exc.code == 402:
                hint = "out of credits — top up at developer.pokee.ai"
            elif exc.code == 429:
                hint = "rate limited"
        if exc.code == 429:
            retry_after = (exc.headers or {}).get("Retry-After")
            if retry_after:
                hint = (hint + " — " if hint else "") + "retry after {}s".format(retry_after)
        raise IsaacError(
            "Pokee API error {}{}: {}".format(
                exc.code, " ({})".format(hint) if hint else "", detail)
        ) from exc
    except urllib.error.URLError as exc:
        raise IsaacError("Could not reach {}: {}".format(config["api_url"], exc.reason)) from exc


def _iter_sse(resp):
    """Yield decoded `data:` payloads from an SSE stream."""
    buffer = b""
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            line = line.strip()
            if not line or not line.startswith(b"data:"):
                continue
            data = line[5:].strip()
            if data == b"[DONE]":
                return
            yield data.decode("utf-8", "replace")
    tail = buffer.strip()
    if tail.startswith(b"data:"):
        data = tail[5:].strip()
        if data and data != b"[DONE]":
            yield data.decode("utf-8", "replace")


def chat(
    messages,
    max_tokens=8192,
    temperature=0.7,
    config=None,
    timeout=DEFAULT_TIMEOUT,
    on_delta=None,
    stream=True,
):
    """One chat/completions round-trip.

    Returns {"text", "finish_reason", "usage"}. Streams by default so long
    generations keep the socket alive; falls back to a non-streaming call if
    the stream comes back empty.
    """
    config = config or load_config()

    # Above 16 MiB the gateway rejects a request that has not negotiated SSE,
    # before it reserves credits. Decide before serialising: flipping the flag
    # afterwards would mean encoding a multi-megabyte body twice.
    approx_bytes = sum(len(msg.get("content") or "") for msg in messages
                       if isinstance(msg.get("content"), str))
    if approx_bytes > SSE_REQUIRED_BYTES and not stream:
        log("[isaac] body is over {} MiB — forcing stream=True, which Pokee "
            "requires at this size".format(SSE_REQUIRED_BYTES // (1024 * 1024)))
        stream = True

    payload = {
        "model": config["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": bool(stream),
    }
    body = json.dumps(payload).encode("utf-8")
    if len(body) > MAX_REQUEST_BYTES:
        # Fail here rather than spend minutes uploading a body that ends in a 413.
        raise IsaacError(
            "Request body is {:.1f} MiB; Pokee's limit is {} MiB. Send less "
            "context — roughly 10M tokens is the ceiling, and dense text hits "
            "the byte cap first.".format(
                len(body) / (1024 * 1024), MAX_REQUEST_BYTES // (1024 * 1024))
        )

    if not stream:
        with _request(config, payload, timeout, body=body) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
        choice = (data.get("choices") or [{}])[0]
        return {
            "text": (choice.get("message") or {}).get("content") or "",
            "finish_reason": choice.get("finish_reason"),
            "usage": data.get("usage") or {},
        }

    parts = []
    finish_reason = None
    usage = {}
    with _request(config, payload, timeout, body=body) as resp:
        for data in _iter_sse(resp):
            try:
                event = json.loads(data)
            except ValueError:
                continue  # keep-alive or malformed frame
            if event.get("usage"):
                usage = event["usage"]
            for choice in event.get("choices") or []:
                delta = choice.get("delta") or {}
                piece = delta.get("content")
                if piece:
                    parts.append(piece)
                    if on_delta:
                        on_delta(piece)
                if choice.get("finish_reason"):
                    finish_reason = choice["finish_reason"]

    text = "".join(parts)
    if not text:
        if len(body) > SSE_REQUIRED_BYTES:
            # The usual retry is a non-streaming call, which a body this size
            # is not allowed to make — it would come back 400
            # large_request_requires_sse and bill nothing useful.
            raise IsaacError(
                "Isaac returned an empty stream and the request is too large "
                "({:.1f} MiB) to retry without streaming.".format(
                    len(body) / (1024 * 1024))
            )
        log("[isaac] empty stream, retrying without stream=True")
        return chat(
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
            config=config,
            timeout=timeout,
            stream=False,
        )
    return {"text": text, "finish_reason": finish_reason, "usage": usage}


CONTINUE_PROMPT = (
    "Continue from exactly where you left off. Do not repeat any content "
    "already sent, do not restart the file, and do not add commentary or "
    "code fences — resume mid-token if necessary."
)


def chat_complete(
    messages,
    max_tokens=8192,
    temperature=0.7,
    config=None,
    max_continuations=0,
    timeout=DEFAULT_TIMEOUT,
    on_delta=None,
):
    """chat(), but auto-resumes when the model stops on the token limit.

    Returns {"text", "finish_reason", "rounds", "truncated", "usage"}.
    """
    config = config or load_config()
    convo = list(messages)
    chunks = []
    rounds = 0
    result = {"finish_reason": None, "usage": {}}

    while True:
        result = chat(
            convo,
            max_tokens=max_tokens,
            temperature=temperature,
            config=config,
            timeout=timeout,
            on_delta=on_delta,
        )
        rounds += 1
        piece = result["text"]
        if rounds > 1:
            piece = _strip_resume_artifacts(piece)
        chunks.append(piece)

        if result["finish_reason"] != "length" or rounds > max_continuations:
            break
        convo = convo + [
            {"role": "assistant", "content": result["text"]},
            {"role": "user", "content": CONTINUE_PROMPT},
        ]

    return {
        "text": "".join(chunks),
        "finish_reason": result["finish_reason"],
        "rounds": rounds,
        "truncated": result["finish_reason"] == "length",
        "usage": result.get("usage") or {},
    }


_RESUME_HINT = re.compile(
    r"\b(?:cut off|left off|last line|continue the file|continuing the file|"
    r"resuming|picking up where)\b",
    re.IGNORECASE,
)


def _is_resume_narration(line):
    """True for a prose line a resume round wrote *about* resuming.

    Deliberately strict. Code resuming mid-function can legitimately start with
    words like `continue`, so a line only counts as narration when it reads as a
    sentence: several words, no code punctuation, and an explicit resume phrase.
    """
    if any(ch in line for ch in "{};<>=()"):
        return False
    if len(line.split()) < 4:
        return False
    return bool(_RESUME_HINT.search(line))


def _strip_resume_artifacts(text):
    """Drop what a continuation round prepends before the resumed content.

    Two things turn up, and both corrupt the artifact if left in place: a
    re-opened code fence, and a line of narration such as "Need to continue the
    file exactly from where it was cut off." The fence is the damaging one — it
    splits the stitched reply into several fenced blocks, and picking one of
    them then discards the rest of the file.

    Anything that is neither is returned untouched, so a round that resumes
    mid-token keeps its leading characters.
    """
    out = text
    for _ in range(2):  # narration, then the fence it introduces
        stripped = out.lstrip()
        if stripped.startswith("```"):
            newline = stripped.find("\n")
            if newline == -1:
                return ""
            out = stripped[newline + 1 :]
            continue
        line, sep, rest = stripped.partition("\n")
        if sep and _is_resume_narration(line):
            out = rest
            continue
        break
    return out


def _fenced_blocks(text):
    """Every fenced block in `text`, in order, as (body, language)."""
    blocks = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("```"):
            lang = lines[i].lstrip()[3:].strip() or None
            body = []
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                body.append(lines[i])
                i += 1
            blocks.append(("\n".join(body), lang))
        i += 1
    return blocks


def _starts_a_document(body):
    head = body.lstrip()[:200].lower()
    return head.startswith("<!doctype") or head.startswith("<html")


def extract_artifact(text):
    """Pull a single-file artifact out of a build reply.

    extract_code() keeps only the largest fenced block, which is right when a
    reply is prose around one snippet but wrong for a build: a long file comes
    back as several blocks — Isaac narrates between sections, or a resume
    re-opens the fence — and keeping the biggest silently discards the rest.
    Observed in the wild as a 32,947-token reply that landed on disk as 1,751
    bytes of mid-file JavaScript.

    So anchor on the block that opens the document and treat every later block
    as its continuation. With no such block this is exactly extract_code().
    """
    blocks = _fenced_blocks(text)
    start = next((i for i, (body, _) in enumerate(blocks) if _starts_a_document(body)), None)
    if start is None:
        return extract_code(text)

    body, lang = blocks[start]
    parts = [body] + [b for b, _ in blocks[start + 1 :]]
    joined = "\n".join(p.strip("\n") for p in parts if p.strip())
    return joined + "\n", lang or "html"


def extract_code(text):
    """Pull the payload out of a response: largest fenced block, or raw HTML.

    Isaac usually wraps single-file builds in ```html ... ```, sometimes with
    prose around them. Returns (code, language_or_None).
    """
    blocks = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            lang = line.lstrip()[3:].strip() or None
            body = []
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                body.append(lines[i])
                i += 1
            blocks.append(("\n".join(body), lang))
        i += 1

    if blocks:
        code, lang = max(blocks, key=lambda b: len(b[0]))
        return code.strip("\n") + "\n", lang

    head = text.lstrip()[:200].lower()
    if head.startswith("<!doctype") or head.startswith("<html"):
        return text.strip() + "\n", "html"
    return None, None
