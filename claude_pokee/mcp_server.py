"""MCP server exposing Pokee Isaac as tools inside Claude Code.

Speaks JSON-RPC 2.0 over stdio — newline-delimited JSON on stdin/stdout.
Stdlib only, so there is nothing to pip install.

Tools:
  health   — check key/endpoint wiring
  ask      — one-shot prompt, answer comes back as text
  build    — generate a single-file artifact straight to disk (context-safe)
  iterate  — feed an existing file back to Isaac with a change request
"""

import json
import os
import sys
import time
from pathlib import Path

from . import client
from .client import IsaacError, PROJECT_ROOT

PROTOCOL_VERSION = "2025-06-18"
SUPPORTED_PROTOCOLS = {"2024-11-05", "2025-03-26", PROTOCOL_VERSION}
SERVER_INFO = {"name": "isaac", "version": "1.0.0"}

# Where build/iterate write when given a relative path.
BUILD_DIR = PROJECT_ROOT / "builds"

# Response text over this size gets summarised instead of returned inline, so a
# 200KB game does not land in the conversation context.
INLINE_LIMIT = 12000

BUILDER_SYSTEM = (
    "You are a master builder of self-contained browser artifacts. "
    "You output ONE complete file with no external dependencies: no CDN links, "
    "no imports, no network calls. All assets are procedurally generated or "
    "embedded inline. Think step by step about the architecture before you "
    "write, then emit the entire file in a single fenced code block with no "
    "commentary before or after. Never abbreviate, never use placeholder "
    "comments like '// rest of code here' — the file must run as-is."
)


# --------------------------------------------------------------------------
# tool implementations
# --------------------------------------------------------------------------

def _resolve_out(path_str):
    """Resolve a user-supplied output path, keeping writes inside the project."""
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = BUILD_DIR / path
    path = path.resolve()
    root = PROJECT_ROOT.resolve()
    if root not in path.parents and path != root:
        raise IsaacError(
            "Refusing to write outside the project: {} (use a path under {})".format(path, root)
        )
    return path


def _incomplete_warning(code, lang):
    """Flag a file that stopped early even though the API reported a clean stop.

    `truncated` only tracks finish_reason == "length". Isaac also stops mid-file
    for its own reasons, and extraction can drop part of a reply, so a False
    there is not evidence the document is whole — ask the document instead.
    """
    if not code:
        return None
    lowered = code.lower()
    head = lowered.lstrip()[:200]
    is_html = (lang or "").lower() == "html" or head.startswith("<!doctype") or head.startswith("<html")
    if not is_html:
        return None
    if not head.startswith("<!doctype") and not head.startswith("<html"):
        return (
            "WARNING: the file does not begin with <!DOCTYPE html> — the reply's "
            "opening was lost. Rebuild rather than trusting this file."
        )
    if "</html>" not in lowered:
        return (
            "WARNING: no closing </html> — the file is incomplete even though the "
            "API reported a clean stop. Call iterate with 'finish the incomplete "
            "sections', or rebuild."
        )
    return None


def _describe(path, text, result, extra=None):
    code_note = ""
    if result.get("rounds", 1) > 1:
        code_note = " (stitched from {} continuation rounds)".format(result["rounds"])
    lines = [
        "Wrote {}".format(path),
        "{:,} bytes, {:,} lines{}".format(len(text.encode("utf-8")), text.count("\n") + 1, code_note),
    ]
    if result.get("truncated"):
        lines.append(
            "WARNING: Isaac still hit the token limit — the file is incomplete. "
            "Raise max_tokens or max_continuations, or call iterate to finish it."
        )
    usage = result.get("usage") or {}
    if usage.get("total_tokens"):
        lines.append("tokens: {:,}".format(usage["total_tokens"]))
    if extra:
        lines.extend(extra)
    lines.append("")
    lines.append("Preview (first 40 lines):")
    lines.append("\n".join(text.split("\n")[:40]))
    return "\n".join(lines)


def tool_health(args):
    config = client.load_config()
    masked = config["api_key"][:8] + "..." + config["api_key"][-4:]
    started = time.time()
    result = client.chat(
        [{"role": "user", "content": "Reply with exactly: OK"}],
        max_tokens=16,
        temperature=0,
        config=config,
    )
    return (
        "Pokee Isaac reachable.\n"
        "endpoint: {}\nmodel: {}\nkey: {}\nlatency: {:.1f}s\nreply: {}".format(
            config["api_url"], config["model"], masked,
            time.time() - started, result["text"].strip()[:80],
        )
    )


def tool_ask(args):
    prompt = args.get("prompt")
    if not prompt:
        raise IsaacError("'prompt' is required")
    messages = []
    if args.get("system"):
        messages.append({"role": "system", "content": args["system"]})
    messages.append({"role": "user", "content": prompt})

    result = client.chat_complete(
        messages,
        max_tokens=int(args.get("max_tokens", 8192)),
        temperature=float(args.get("temperature", 0.7)),
        max_continuations=int(args.get("max_continuations", 1)),
    )
    text = result["text"]

    save_to = args.get("save_to")
    if save_to:
        path = _resolve_out(save_to)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return _describe(path, text, result)

    if len(text) > INLINE_LIMIT:
        return (
            "Response is {:,} chars — too large to return inline. "
            "Re-run with save_to=\"<filename>\" to write it to disk instead.\n\n"
            "First {:,} chars:\n{}".format(len(text), INLINE_LIMIT, text[:INLINE_LIMIT])
        )
    if result.get("truncated"):
        text += "\n\n[truncated at the token limit — raise max_tokens or max_continuations]"
    return text


def tool_build(args):
    spec = args.get("spec")
    out = args.get("out_path")
    if not spec:
        raise IsaacError("'spec' is required")
    if not out:
        raise IsaacError("'out_path' is required")

    path = _resolve_out(out)
    system = args.get("system") or BUILDER_SYSTEM
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": spec},
    ]

    result = client.chat_complete(
        messages,
        max_tokens=int(args.get("max_tokens", 32000)),
        temperature=float(args.get("temperature", 0.7)),
        max_continuations=int(args.get("max_continuations", 3)),
    )

    code, lang = client.extract_artifact(result["text"])
    extra = []
    if code is None:
        code = result["text"]
        extra.append("NOTE: no code block in the response — wrote the raw reply.")
    elif lang:
        extra.append("language: {}".format(lang))
    warning = _incomplete_warning(code, lang)
    if warning:
        extra.append(warning)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(code, encoding="utf-8")
    return _describe(path, code, result, extra)


def tool_iterate(args):
    target = args.get("path")
    changes = args.get("changes")
    if not target:
        raise IsaacError("'path' is required")
    if not changes:
        raise IsaacError("'changes' is required")

    path = _resolve_out(target)
    if not path.exists():
        raise IsaacError("No such file: {}".format(path))
    current = path.read_text(encoding="utf-8")

    messages = [
        {"role": "system", "content": args.get("system") or BUILDER_SYSTEM},
        {
            "role": "user",
            "content": (
                "Here is the current file `{}`:\n\n```\n{}\n```\n\n"
                "Apply these changes:\n{}\n\n"
                "Return the COMPLETE updated file in a single fenced code block. "
                "Keep everything that already works. No commentary.".format(
                    path.name, current, changes
                )
            ),
        },
    ]

    result = client.chat_complete(
        messages,
        max_tokens=int(args.get("max_tokens", 32000)),
        temperature=float(args.get("temperature", 0.6)),
        max_continuations=int(args.get("max_continuations", 3)),
    )

    code, lang = client.extract_artifact(result["text"])
    if code is None:
        raise IsaacError(
            "Isaac did not return a code block — file left untouched. "
            "Response started: " + result["text"][:300]
        )

    backup = None
    if args.get("backup", True):
        backup = path.with_suffix(path.suffix + ".bak")
        backup.write_text(current, encoding="utf-8")

    path.write_text(code, encoding="utf-8")
    extra = ["previous size: {:,} bytes".format(len(current.encode("utf-8")))]
    if backup:
        extra.append("backup: {}".format(backup))
    warning = _incomplete_warning(code, lang)
    if warning:
        extra.append(warning)
    return _describe(path, code, result, extra)


TOOLS = [
    {
        "name": "health",
        "description": (
            "Verify the Pokee Isaac wiring: reads the API key, pings the endpoint, "
            "reports latency. Run this first when anything looks broken."
        ),
        "inputSchema": {"type": "object", "properties": {}},
        "handler": tool_health,
    },
    {
        "name": "ask",
        "description": (
            "Send a one-shot prompt to Pokee Isaac and get the text back. Use for "
            "prose, analysis, explanations, or short code. For anything that "
            "produces a large file, use `build` instead so it goes to disk."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "The user prompt."},
                "system": {
                    "type": "string",
                    "description": "Optional persona/system prompt. A specific role measurably improves Isaac's output.",
                },
                "max_tokens": {"type": "integer", "default": 8192},
                "temperature": {"type": "number", "default": 0.7},
                "max_continuations": {
                    "type": "integer",
                    "default": 1,
                    "description": "Auto-resume rounds if the reply stops on the token limit.",
                },
                "save_to": {
                    "type": "string",
                    "description": "Write the reply to this path (relative paths land in builds/) instead of returning it inline.",
                },
            },
            "required": ["prompt"],
        },
        "handler": tool_ask,
    },
    {
        "name": "build",
        "description": (
            "Have Isaac generate a complete self-contained artifact (game, dashboard, "
            "tool, landing page) and write it straight to a file. Returns the path, "
            "size and a short preview — never the whole file — so large builds do not "
            "flood the context. Auto-resumes if Isaac hits the token limit. Write a "
            "detailed spec: name the mechanics, the visual style, and the quality bar."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "spec": {
                    "type": "string",
                    "description": "Full build spec. Be specific and demanding — Isaac responds to detail and quality cues.",
                },
                "out_path": {
                    "type": "string",
                    "description": "Destination file, e.g. 'dungeon.html'. Relative paths land in builds/.",
                },
                "system": {
                    "type": "string",
                    "description": "Override the default single-file-builder persona.",
                },
                "max_tokens": {"type": "integer", "default": 32000},
                "temperature": {"type": "number", "default": 0.7},
                "max_continuations": {"type": "integer", "default": 3},
            },
            "required": ["spec", "out_path"],
        },
        "handler": tool_build,
    },
    {
        "name": "iterate",
        "description": (
            "Refine a file Isaac already produced: reads it, sends it back with your "
            "change request, writes the updated version in place (with a .bak). "
            "Isaac's output improves markedly across 2-3 iterations — use this rather "
            "than rebuilding from scratch."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File to refine. Relative paths resolve under builds/."},
                "changes": {
                    "type": "string",
                    "description": "What to change. Concrete beats vague: name the mechanic, the effect, the polish.",
                },
                "system": {"type": "string"},
                "max_tokens": {"type": "integer", "default": 32000},
                "temperature": {"type": "number", "default": 0.6},
                "max_continuations": {"type": "integer", "default": 3},
                "backup": {"type": "boolean", "default": True},
            },
            "required": ["path", "changes"],
        },
        "handler": tool_iterate,
    },
]

HANDLERS = {tool["name"]: tool["handler"] for tool in TOOLS}
TOOL_SPECS = [{k: v for k, v in tool.items() if k != "handler"} for tool in TOOLS]


# --------------------------------------------------------------------------
# JSON-RPC plumbing
# --------------------------------------------------------------------------

def _write(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def _result(request_id, payload):
    _write({"jsonrpc": "2.0", "id": request_id, "result": payload})


def _error(request_id, code, message):
    _write({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def _handle(request):
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params") or {}
    is_notification = request_id is None

    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in SUPPORTED_PROTOCOLS else PROTOCOL_VERSION
        _result(request_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
        })
        return

    if is_notification:
        return  # initialized / cancelled / progress — nothing to reply to

    if method == "ping":
        _result(request_id, {})
    elif method == "tools/list":
        _result(request_id, {"tools": TOOL_SPECS})
    elif method in ("prompts/list", "resources/list", "resources/templates/list"):
        key = method.split("/")[0]
        _result(request_id, {key: []})
    elif method == "tools/call":
        name = params.get("name")
        handler = HANDLERS.get(name)
        if handler is None:
            _error(request_id, -32602, "Unknown tool: {}".format(name))
            return
        args = params.get("arguments") or {}
        started = time.time()
        client.log("[isaac] {} {}".format(name, json.dumps(args)[:200]))
        try:
            text = handler(args)
            client.log("[isaac] {} ok in {:.1f}s".format(name, time.time() - started))
            _result(request_id, {"content": [{"type": "text", "text": text}]})
        except IsaacError as exc:
            client.log("[isaac] {} failed: {}".format(name, exc))
            _result(request_id, {
                "content": [{"type": "text", "text": "Isaac error: {}".format(exc)}],
                "isError": True,
            })
        except Exception as exc:  # noqa: BLE001 - never kill the server on a tool bug
            client.log("[isaac] {} crashed: {}: {}".format(name, type(exc).__name__, exc))
            _result(request_id, {
                "content": [{
                    "type": "text",
                    "text": "Unexpected {}: {}".format(type(exc).__name__, exc),
                }],
                "isError": True,
            })
    else:
        _error(request_id, -32601, "Method not found: {}".format(method))


def main():
    client.log("[isaac] MCP server up (project: {})".format(PROJECT_ROOT))
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError as exc:
            client.log("[isaac] bad JSON on stdin: {}".format(exc))
            continue
        try:
            _handle(request)
        except Exception as exc:  # noqa: BLE001
            client.log("[isaac] dispatch error: {}: {}".format(type(exc).__name__, exc))
            if request.get("id") is not None:
                _error(request["id"], -32603, "Internal error: {}".format(exc))
    client.log("[isaac] stdin closed, exiting")
