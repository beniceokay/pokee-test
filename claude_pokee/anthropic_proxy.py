"""Anthropic Messages API router: claude-* passes through, Isaac is translated.

Two ways to run Claude Code against it:

    claude-pokee          normal Claude, pokee-isaac as an extra /model entry
    claude-pokee isaac    everything on pokee-isaac (Isaac as THE model)

Routing rule, per request:
  - `model` starts with "claude-" (or is missing/unparseable), or the path is
    not an Isaac-capable endpoint -> forwarded byte-for-byte to
    api.anthropic.com, auth headers and query string included. Your saved
    claude.ai login keeps working because nothing is rewritten.
  - any other model on POST /v1/messages[/count_tokens] -> translated to
    Pokee's OpenAI chat/completions API (the original proxy behavior).

Locally served: GET /health (Isaac config check), GET /router (capability
probe so launchers can detect a stale pre-router proxy).

Design note: Isaac's NON-streaming endpoint returns `finish_reason: "tool_calls"`
with an empty body and no tool_calls array — a server-side bug. Streaming emits
tool calls correctly. So we always call upstream with stream=True and aggregate,
regardless of what the client asked for.
"""

import json
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from . import client
from .client import IsaacError

# Pokee rejects anything above this with invalid_max_tokens. Claude Code asks
# for 64000 by default, so every request must be clamped.
MAX_COMPLETION_TOKENS = 60000

ANTHROPIC_UPSTREAM = "https://api.anthropic.com"

# Only these paths can be served by Isaac; every other path is Anthropic's.
ISAAC_ROUTES = ("/v1/messages", "/v1/messages/count_tokens")

# Hop-by-hop headers (RFC 9110 §7.6.1) plus ones urllib/BaseHTTPRequestHandler
# manage themselves. Accept-Encoding is forced to identity so the bytes we
# relay are never compressed mid-stream.
_SKIP_REQUEST_HEADERS = {
    "host", "connection", "keep-alive", "transfer-encoding", "content-length",
    "accept-encoding", "proxy-connection", "te", "upgrade", "trailer",
}
_SKIP_RESPONSE_HEADERS = {
    "connection", "keep-alive", "transfer-encoding", "content-length",
    "te", "upgrade", "trailer", "date", "server",
}

# Anthropic stop_reason <- OpenAI finish_reason
STOP_REASON = {
    "stop": "end_turn",
    "length": "max_tokens",
    "tool_calls": "tool_use",
    "content_filter": "end_turn",
    "function_call": "tool_use",
}


# --------------------------------------------------------------------------
# request translation: Anthropic -> OpenAI
# --------------------------------------------------------------------------

def _text_of(content):
    """Anthropic content may be a bare string or a list of blocks."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out = []
    for block in content:
        if isinstance(block, str):
            out.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            out.append(block.get("text") or "")
    return "\n".join(p for p in out if p)


def _tool_result_text(block):
    """A tool_result's content is a string or a list of blocks."""
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for sub in content:
            if isinstance(sub, dict):
                if sub.get("type") == "text":
                    parts.append(sub.get("text") or "")
                elif sub.get("type") == "image":
                    parts.append("[image omitted — Isaac is text-only]")
            elif isinstance(sub, str):
                parts.append(sub)
        return "\n".join(parts)
    return "" if content is None else json.dumps(content)


def translate_request(body, model):
    """Anthropic Messages request -> OpenAI chat/completions payload."""
    messages = []

    system = body.get("system")
    if system:
        text = _text_of(system)
        if text:
            messages.append({"role": "system", "content": text})

    for msg in body.get("messages") or []:
        role = msg.get("role")
        content = msg.get("content")

        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            continue
        if not isinstance(content, list):
            continue

        if role == "user":
            # A user turn may carry tool_results, which become separate
            # OpenAI `tool` messages, plus any ordinary text.
            texts = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_result":
                    messages.append({
                        "role": "tool",
                        "tool_call_id": block.get("tool_use_id") or "call_unknown",
                        "content": _tool_result_text(block) or "(no output)",
                    })
                elif btype == "text":
                    texts.append(block.get("text") or "")
                elif btype == "image":
                    texts.append("[image omitted — Isaac is text-only]")
            if any(t.strip() for t in texts):
                messages.append({"role": "user", "content": "\n".join(texts)})

        elif role == "assistant":
            texts = []
            tool_calls = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "text":
                    texts.append(block.get("text") or "")
                elif block.get("type") == "tool_use":
                    tool_calls.append({
                        "id": block.get("id") or "call_" + uuid.uuid4().hex[:8],
                        "type": "function",
                        "function": {
                            "name": block.get("name"),
                            "arguments": json.dumps(block.get("input") or {}),
                        },
                    })
            entry = {"role": "assistant", "content": "\n".join(t for t in texts if t) or None}
            if tool_calls:
                entry["tool_calls"] = tool_calls
            if entry["content"] or tool_calls:
                messages.append(entry)

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": min(int(body.get("max_tokens") or 8192), MAX_COMPLETION_TOKENS),
        # Isaac's non-streaming tool_calls are broken — always stream upstream.
        "stream": True,
    }
    if body.get("temperature") is not None:
        payload["temperature"] = body["temperature"]
    if body.get("top_p") is not None:
        payload["top_p"] = body["top_p"]
    if body.get("stop_sequences"):
        payload["stop"] = body["stop_sequences"]

    tools = []
    for tool in body.get("tools") or []:
        name = tool.get("name")
        if not name or tool.get("type") in ("computer_20241022", "bash_20241022", "text_editor_20241022"):
            continue  # server-side Anthropic builtins have no OpenAI equivalent
        tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": (tool.get("description") or "")[:4096],
                "parameters": tool.get("input_schema") or {"type": "object", "properties": {}},
            },
        })
    if tools:
        payload["tools"] = tools
        choice = body.get("tool_choice") or {}
        ctype = choice.get("type")
        if ctype == "any":
            payload["tool_choice"] = "required"
        elif ctype == "tool" and choice.get("name"):
            payload["tool_choice"] = {"type": "function", "function": {"name": choice["name"]}}
        elif ctype == "none":
            payload["tool_choice"] = "none"
        else:
            payload["tool_choice"] = "auto"

    return payload


# --------------------------------------------------------------------------
# upstream streaming -> normalised events
# --------------------------------------------------------------------------

def _stream_upstream(config, payload, timeout):
    """Yield ("text", str) / ("tool", index) / ("tool_args", (index, str)) /
    ("finish", reason) / ("usage", dict) from Isaac's SSE stream."""
    seen_tools = {}
    with client._request(config, payload, timeout) as resp:
        for data in client._iter_sse(resp):
            try:
                event = json.loads(data)
            except ValueError:
                continue
            if event.get("usage"):
                yield "usage", event["usage"]
            for choice in event.get("choices") or []:
                delta = choice.get("delta") or {}
                if delta.get("content"):
                    yield "text", delta["content"]
                for call in delta.get("tool_calls") or []:
                    idx = call.get("index", 0)
                    fn = call.get("function") or {}
                    if idx not in seen_tools:
                        seen_tools[idx] = True
                        yield "tool", {
                            "index": idx,
                            "id": call.get("id") or "toolu_" + uuid.uuid4().hex[:16],
                            "name": fn.get("name") or "",
                        }
                    elif fn.get("name"):
                        yield "tool_name", {"index": idx, "name": fn["name"]}
                    if fn.get("arguments"):
                        yield "tool_args", {"index": idx, "args": fn["arguments"]}
                if choice.get("finish_reason"):
                    yield "finish", choice["finish_reason"]


def _sse(event_type, payload):
    return "event: {}\ndata: {}\n\n".format(event_type, json.dumps(payload)).encode("utf-8")


# --------------------------------------------------------------------------
# HTTP layer
# --------------------------------------------------------------------------

class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "IsaacAnthropicProxy/1.0"

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message, etype="api_error"):
        client.log("[proxy] error {}: {}".format(status, message))
        self._send_json(status, {"type": "error", "error": {"type": etype, "message": message}})

    def _chunk(self, data):
        self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
        self.wfile.flush()

    @property
    def route(self):
        """Path without query string — Claude Code calls /v1/messages?beta=true."""
        return urlsplit(self.path).path.rstrip("/") or "/"

    # -- Anthropic pass-through --------------------------------------------
    def _forward_upstream(self, body=None):
        """Relay this request to api.anthropic.com untouched and stream the
        response back — status, headers, and bytes as-is (SSE included)."""
        headers = {"Accept-Encoding": "identity"}
        for name, value in self.headers.items():
            if name.lower() not in _SKIP_REQUEST_HEADERS:
                headers[name] = value
        req = urllib.request.Request(
            ANTHROPIC_UPSTREAM + self.path, data=body, headers=headers,
            method=self.command,
        )
        try:
            resp = urllib.request.urlopen(req, timeout=client.DEFAULT_TIMEOUT)
        except urllib.error.HTTPError as exc:
            resp = exc  # 4xx/5xx bodies relay exactly like successes
        except urllib.error.URLError as exc:
            self._error(502, "Anthropic upstream unreachable: {}".format(exc.reason))
            return

        with resp:
            status = getattr(resp, "status", None) or resp.getcode()
            self.send_response(status)
            for name, value in resp.headers.items():
                if name.lower() not in _SKIP_RESPONSE_HEADERS:
                    self.send_header(name, value)
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            read1 = getattr(resp, "read1", None)
            while True:
                piece = read1(65536) if read1 else resp.read(8192)
                if not piece:
                    break
                self._chunk(piece)
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()

    def _refuse_if_not_local(self):
        """403 anything that is not a local, non-browser client. True if refused."""
        why = client.local_request_error(self.headers)
        if why:
            self.close_connection = True
            self._error(403, why, "permission_error")
        return bool(why)

    def do_GET(self):
        if self._refuse_if_not_local():
            return
        if self.route == "/router":
            # Capability probe — lets launchers detect a stale pre-router proxy.
            self._send_json(200, {"ok": True, "router": True})
        elif self.route == "/health":
            try:
                config = client.load_config()
                self._send_json(200, {"ok": True, "upstream": config["api_url"], "model": config["model"]})
            except IsaacError as exc:
                self._send_json(500, {"ok": False, "error": str(exc)})
        else:
            try:
                self._forward_upstream()
            except (BrokenPipeError, ConnectionResetError):
                client.log("[proxy] client disconnected")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        if self._refuse_if_not_local():
            return
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = None

        # Route: Isaac gets non-claude models on the endpoints it implements;
        # everything else belongs to the real API (which also produces the
        # correct errors for malformed bodies and unknown endpoints).
        model = (body or {}).get("model") or ""
        if body is None or self.route not in ISAAC_ROUTES or not model or model.startswith("claude-"):
            client.log("[proxy] passthrough {} {} model={}".format(
                self.command, self.route, model or "?"))
            try:
                self._forward_upstream(raw)
            except (BrokenPipeError, ConnectionResetError):
                client.log("[proxy] client disconnected")
            return

        if self.route == "/v1/messages/count_tokens":
            # Rough estimate; Claude Code only uses this for context accounting.
            approx = len(json.dumps(body)) // 4
            self._send_json(200, {"input_tokens": approx})
            return

        try:
            config = client.load_config()
        except IsaacError as exc:
            self._error(500, str(exc), "authentication_error")
            return

        payload = translate_request(body, config["model"])
        want_stream = bool(body.get("stream"))
        n_tools = len(payload.get("tools") or [])
        client.log("[proxy] {} msgs, {} tools, stream={} -> {}".format(
            len(payload["messages"]), n_tools, want_stream, config["model"]))

        try:
            if want_stream:
                self._stream_response(config, payload)
            else:
                self._buffered_response(config, payload)
        except IsaacError as exc:
            self._error(502, str(exc), "api_error")
        except (BrokenPipeError, ConnectionResetError):
            client.log("[proxy] client disconnected")

    # -- collection shared by both response modes -------------------------
    def _collect(self, config, payload):
        text_parts = []
        tools = {}
        order = []
        finish = "stop"
        usage = {}
        for kind, value in _stream_upstream(config, payload, client.DEFAULT_TIMEOUT):
            if kind == "text":
                text_parts.append(value)
            elif kind == "tool":
                tools[value["index"]] = {"id": value["id"], "name": value["name"], "args": ""}
                order.append(value["index"])
            elif kind == "tool_name":
                tools[value["index"]]["name"] = value["name"]
            elif kind == "tool_args":
                tools[value["index"]]["args"] += value["args"]
            elif kind == "finish":
                finish = value
            elif kind == "usage":
                usage = value
        return "".join(text_parts), [tools[i] for i in order], finish, usage

    @staticmethod
    def _blocks(text, tool_list):
        blocks = []
        if text.strip():
            blocks.append({"type": "text", "text": text})
        for tool in tool_list:
            try:
                parsed = json.loads(tool["args"]) if tool["args"].strip() else {}
            except ValueError:
                parsed = {}
            blocks.append({
                "type": "tool_use",
                "id": tool["id"],
                "name": tool["name"],
                "input": parsed,
            })
        return blocks

    def _buffered_response(self, config, payload):
        text, tool_list, finish, usage = self._collect(config, payload)
        self._send_json(200, {
            "id": "msg_" + uuid.uuid4().hex[:24],
            "type": "message",
            "role": "assistant",
            "model": payload["model"],
            "content": self._blocks(text, tool_list) or [{"type": "text", "text": ""}],
            "stop_reason": STOP_REASON.get(finish, "end_turn"),
            "stop_sequence": None,
            "usage": {
                "input_tokens": usage.get("prompt_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
            },
        })

    def _stream_response(self, config, payload):
        msg_id = "msg_" + uuid.uuid4().hex[:24]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        self._chunk(_sse("message_start", {
            "type": "message_start",
            "message": {
                "id": msg_id, "type": "message", "role": "assistant",
                "model": payload["model"], "content": [],
                "stop_reason": None, "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }))

        block_index = -1
        text_open = False
        open_tool = None          # currently streaming tool block index
        tool_blocks = {}          # upstream index -> our block index
        finish = "stop"
        usage = {}

        def close_open_block():
            nonlocal text_open, open_tool
            if text_open or open_tool is not None:
                self._chunk(_sse("content_block_stop",
                                 {"type": "content_block_stop", "index": block_index}))
                text_open = False
                open_tool = None

        for kind, value in _stream_upstream(config, payload, client.DEFAULT_TIMEOUT):
            if kind == "text":
                if open_tool is not None:
                    close_open_block()
                if not text_open:
                    block_index += 1
                    text_open = True
                    self._chunk(_sse("content_block_start", {
                        "type": "content_block_start", "index": block_index,
                        "content_block": {"type": "text", "text": ""},
                    }))
                self._chunk(_sse("content_block_delta", {
                    "type": "content_block_delta", "index": block_index,
                    "delta": {"type": "text_delta", "text": value},
                }))

            elif kind == "tool":
                close_open_block()
                block_index += 1
                open_tool = value["index"]
                tool_blocks[value["index"]] = block_index
                self._chunk(_sse("content_block_start", {
                    "type": "content_block_start", "index": block_index,
                    "content_block": {
                        "type": "tool_use", "id": value["id"], "name": value["name"], "input": {},
                    },
                }))

            elif kind == "tool_args":
                target = tool_blocks.get(value["index"])
                if target is not None:
                    self._chunk(_sse("content_block_delta", {
                        "type": "content_block_delta", "index": target,
                        "delta": {"type": "input_json_delta", "partial_json": value["args"]},
                    }))

            elif kind == "finish":
                finish = value
            elif kind == "usage":
                usage = value

        close_open_block()

        self._chunk(_sse("message_delta", {
            "type": "message_delta",
            "delta": {"stop_reason": STOP_REASON.get(finish, "end_turn"), "stop_sequence": None},
            "usage": {"output_tokens": usage.get("completion_tokens", 0)},
        }))
        self._chunk(_sse("message_stop", {"type": "message_stop"}))
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def log_message(self, fmt, *args):
        pass


def serve(port=8787, host="127.0.0.1"):
    try:
        config = client.load_config()
        client.log("[proxy] upstream {} model={}".format(config["api_url"], config["model"]))
    except IsaacError as exc:
        client.log("[proxy] WARNING: {}".format(exc))

    server = ThreadingHTTPServer((host, port), ProxyHandler)
    server.daemon_threads = True
    base = "http://{}:{}".format(host, port)
    print("Anthropic router on " + base)
    print()
    print("claude-* models  -> {} (pass-through, your login)".format(ANTHROPIC_UPSTREAM))
    print("everything else  -> Pokee Isaac (translated)")
    print()
    print("Launchers: claude-pokee (Isaac next to Claude)   claude-pokee isaac (Isaac only)")
    print("Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()
