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

# Isaac generations are long-running by design (5-30s typical, minutes for
# 32k-token single-file builds).
DEFAULT_TIMEOUT = 900


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


def _request(config, payload, timeout):
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
        hint = ""
        if exc.code in (401, 403):
            hint = " (check POKEE_API_KEY)"
        elif exc.code == 402:
            hint = " (out of balance — top up at developer.pokee.ai)"
        elif exc.code == 429:
            hint = " (rate limited — wait and retry)"
        raise IsaacError(
            "Pokee API error {}{}: {}".format(exc.code, hint, detail)
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
    payload = {
        "model": config["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": bool(stream),
    }

    if not stream:
        with _request(config, payload, timeout) as resp:
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
    with _request(config, payload, timeout) as resp:
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


def _strip_resume_artifacts(text):
    """Drop a leading code fence a continuation round may have re-opened."""
    stripped = text.lstrip()
    if stripped.startswith("```"):
        newline = stripped.find("\n")
        if newline != -1:
            return stripped[newline + 1 :]
    return text


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
