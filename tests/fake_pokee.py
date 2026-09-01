"""A stand-in for api.pokee.ai (and, for pass-through tests, api.anthropic.com).

Stdlib only, same as the code under test. Behaviour is driven by markers in the
last user message so a single server can cover every branch:

  TOOLCALL     stream an OpenAI tool_calls delta, finish_reason=tool_calls
  LONG         finish_reason=length until the client sends a continuation turn
  EMPTYSTREAM  stream with no content deltas (exercises the non-stream retry)
  CODE         reply with prose around a fenced html block
  BOOM         respond 402, to exercise HTTPError handling
  NEEDLE=      context-window probe: the server drops the oldest characters
               beyond `window_chars` (silently, like the real one) and can
               only echo the needle if it survived

Any other prompt gets "OK". Requests are recorded on the server instance so
tests can assert on what was actually sent upstream.
"""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NEEDLE_RE = re.compile(r"NEEDLE=([0-9a-f]+)")

CODE_REPLY = (
    "Here you go:\n\n```html\n<!DOCTYPE html>\n<title>t</title>\n<p>hi</p>\n```\n\nEnjoy!"
)


def _sse(obj):
    return ("data: " + json.dumps(obj) + "\n\n").encode("utf-8")


def _chunk(delta, finish=None):
    choice = {"index": 0, "delta": delta}
    if finish:
        choice["finish_reason"] = finish
    return {"choices": [choice]}


class FakeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # -- helpers ----------------------------------------------------------
    def _json(self, status, payload, extra_headers=()):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _stream(self, frames):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for frame in frames:
            payload = frame if isinstance(frame, bytes) else _sse(frame)
            self.wfile.write(b"%x\r\n" % len(payload) + payload + b"\r\n")
            self.wfile.flush()
        done = b"data: [DONE]\n\n"
        self.wfile.write(b"%x\r\n" % len(done) + done + b"\r\n")
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    @staticmethod
    def _last_user_text(messages):
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content")
                return content if isinstance(content, str) else json.dumps(content)
        return ""

    # -- routes -----------------------------------------------------------
    def do_GET(self):
        # Stands in for a plain Anthropic GET during pass-through tests.
        self._json(200, {"passthrough": True, "path": self.path, "method": "GET"},
                   extra_headers=[("X-Fake-Upstream", "1")])

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw or b"{}")
        except ValueError:
            payload = {}

        self.server.requests.append({
            "path": self.path,
            "payload": payload,
            "headers": dict(self.headers.items()),
        })

        if self.path != "/v1/chat/completions":
            # Anthropic pass-through target.
            self._json(200, {"passthrough": True, "path": self.path,
                             "model": payload.get("model")},
                       extra_headers=[("X-Fake-Upstream", "1")])
            return

        messages = payload.get("messages") or []
        prompt = self._last_user_text(messages)
        streaming = bool(payload.get("stream"))

        if "BOOM" in prompt:
            self._json(402, {"error": {"message": "insufficient balance"}})
            return

        if "NEEDLE=" in prompt:
            self._answer_probe(prompt, streaming)
            return

        if "EMPTYSTREAM" in prompt:
            if streaming:
                self._stream([_chunk({"role": "assistant"})])
            else:
                self._json(200, {
                    "choices": [{"message": {"role": "assistant", "content": "recovered"},
                                 "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
                })
            return

        if "TOOLCALL" in prompt:
            self._stream([
                _chunk({"content": "Looking that up. "}),
                _chunk({"tool_calls": [{"index": 0, "id": "call_abc", "type": "function",
                                        "function": {"name": "get_weather", "arguments": '{"ci'}}]}),
                _chunk({"tool_calls": [{"index": 0,
                                        "function": {"arguments": 'ty": "Paris"}'}}]}),
                _chunk({}, finish="tool_calls"),
                {"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}},
            ])
            return

        # A continuation turn carries the resume prompt, not the original marker,
        # so it has to be matched before anything else.
        if "Continue from exactly where you left off" in prompt:
            # The re-opened code fence a resume round emits must get stripped.
            self._stream([_chunk({"content": "```\nPART2"}), _chunk({}, finish="stop")])
            return

        if "LONG" in prompt:
            self._stream([_chunk({"content": "PART1"}), _chunk({}, finish="length")])
            return

        if "CODE" in prompt:
            body = CODE_REPLY
        else:
            body = "OK"

        if not streaming:
            self._json(200, {
                "choices": [{"message": {"role": "assistant", "content": body},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
            })
            return

        self._stream([
            _chunk({"content": body[: len(body) // 2 or 1]}),
            _chunk({"content": body[len(body) // 2 or 1:]}),
            _chunk({}, finish="stop"),
            {"usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}},
        ])

    def _answer_probe(self, prompt, streaming):
        """Truncate from the left past the window, then try to echo the needle."""
        window = self.server.window_chars
        seen = prompt if window is None else prompt[-window:]
        match = NEEDLE_RE.search(seen)
        body = match.group(1) if match else "I see no NEEDLE value."
        usage = {"prompt_tokens": len(seen) // 4, "completion_tokens": 4,
                 "total_tokens": len(seen) // 4 + 4}
        if streaming:
            self._stream([_chunk({"content": body}), _chunk({}, finish="stop"),
                          {"usage": usage}])
        else:
            self._json(200, {
                "choices": [{"message": {"role": "assistant", "content": body},
                             "finish_reason": "stop"}],
                "usage": usage,
            })

    def log_message(self, fmt, *args):
        pass


def start(host="127.0.0.1", port=0, window_chars=None):
    """Start the fake in a daemon thread; returns (server, base_url).

    window_chars caps how much of a probe prompt the server "reads"; None means
    unlimited.
    """
    server = ThreadingHTTPServer((host, port), FakeHandler)
    server.daemon_threads = True
    server.requests = []
    server.window_chars = window_chars
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, "http://{}:{}".format(host, server.server_port)
