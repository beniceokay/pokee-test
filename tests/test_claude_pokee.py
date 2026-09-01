"""End-to-end tests for claude-pokee against a fake Pokee endpoint.

Stdlib only:  python3 -m unittest discover -s tests   (from the project root)

Nothing here touches the network — `fake_pokee` stands in both for
api.pokee.ai and, in the pass-through tests, for api.anthropic.com.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fake_pokee  # noqa: E402
from claude_pokee import anthropic_proxy, cli, client, mcp_server  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _post(url, payload, headers=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers=dict({"Content-Type": "application/json"}, **(headers or {})),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode("utf-8")


def _parse_sse(body):
    """[(event_name, parsed_data), ...] from an SSE response body."""
    events = []
    for block in body.split("\n\n"):
        name, data = None, None
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data = line[5:].strip()
        if data:
            events.append((name, json.loads(data)))
    return events


class FakeUpstreamCase(unittest.TestCase):
    """Points the client at the fake endpoint for the duration of the test."""

    def setUp(self):
        self.server, self.base = fake_pokee.start()
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)

        self._saved_env = {k: os.environ.get(k) for k in
                           ("POKEE_API_KEY", "POKEE_API_URL", "POKEE_MODEL")}
        os.environ["POKEE_API_KEY"] = "pk-live-testkey1234"
        os.environ["POKEE_API_URL"] = self.base + "/v1/chat/completions"
        os.environ["POKEE_MODEL"] = "pokee-isaac"
        self.addCleanup(self._restore_env)

    def _restore_env(self):
        for key, value in self._saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def last_payload(self):
        return self.server.requests[-1]["payload"]


# --------------------------------------------------------------------------
# config
# --------------------------------------------------------------------------

class ConfigTests(FakeUpstreamCase):
    def test_env_wins_and_defaults_fill_in(self):
        os.environ.pop("POKEE_MODEL")
        config = client.load_config()
        self.assertEqual(config["api_key"], "pk-live-testkey1234")
        self.assertEqual(config["model"], client.DEFAULT_MODEL)

    def test_dotenv_is_read_when_env_is_empty(self):
        os.environ.pop("POKEE_API_KEY")
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".env").write_text(
                '# comment\nPOKEE_API_KEY="pk-live-fromfile"\nJUNK\n', encoding="utf-8")
            with _patched(client, PROJECT_ROOT=Path(tmp)):
                self.assertEqual(client.load_config()["api_key"], "pk-live-fromfile")

    def test_missing_key_explains_where_to_put_one(self):
        os.environ.pop("POKEE_API_KEY")
        with _patched(client, _parse_env_file=lambda path: {}):
            with self.assertRaises(client.IsaacError) as caught:
                client.load_config()
        self.assertIn("POKEE_API_KEY", str(caught.exception))

    def test_placeholder_key_is_rejected(self):
        os.environ["POKEE_API_KEY"] = "YOUR_KEY_HERE"
        with _patched(client, _parse_env_file=lambda path: {}):
            with self.assertRaises(client.IsaacError):
                client.load_config()


# --------------------------------------------------------------------------
# client
# --------------------------------------------------------------------------

class ClientTests(FakeUpstreamCase):
    def test_streaming_round_trip_aggregates_deltas(self):
        seen = []
        result = client.chat([{"role": "user", "content": "hello"}],
                             on_delta=seen.append)
        self.assertEqual(result["text"], "OK")
        self.assertEqual("".join(seen), "OK")
        self.assertEqual(result["finish_reason"], "stop")
        self.assertEqual(result["usage"]["total_tokens"], 7)
        self.assertTrue(self.last_payload()["stream"])

    def test_sends_a_real_user_agent(self):
        client.chat([{"role": "user", "content": "hello"}])
        agent = self.server.requests[-1]["headers"].get("User-Agent", "")
        self.assertNotIn("Python-urllib", agent)

    def test_empty_stream_falls_back_to_a_buffered_call(self):
        result = client.chat([{"role": "user", "content": "EMPTYSTREAM"}])
        self.assertEqual(result["text"], "recovered")
        self.assertFalse(self.last_payload()["stream"])

    def test_http_errors_surface_the_body_and_a_hint(self):
        with self.assertRaises(client.IsaacError) as caught:
            client.chat([{"role": "user", "content": "BOOM"}])
        message = str(caught.exception)
        self.assertIn("402", message)
        self.assertIn("insufficient balance", message)

    def test_unreachable_endpoint_is_reported_clearly(self):
        os.environ["POKEE_API_URL"] = "http://127.0.0.1:1/v1/chat/completions"
        with self.assertRaises(client.IsaacError) as caught:
            client.chat([{"role": "user", "content": "hi"}])
        self.assertIn("Could not reach", str(caught.exception))

    def test_error_code_becomes_specific_advice(self):
        for marker, expected in (("REVOKED", "revoked"),
                                 ("TOOBIG", "45 MiB limit")):
            with self.assertRaises(client.IsaacError) as caught:
                client.chat([{"role": "user", "content": marker}])
            self.assertIn(expected, str(caught.exception))

    def test_rate_limit_surfaces_retry_after(self):
        with self.assertRaises(client.IsaacError) as caught:
            client.chat([{"role": "user", "content": "RATELIMIT"}])
        self.assertIn("retry after 17s", str(caught.exception))

    def test_oversized_body_is_refused_before_upload(self):
        with _patched(client, MAX_REQUEST_BYTES=2000):
            with self.assertRaises(client.IsaacError) as caught:
                client.chat([{"role": "user", "content": "x" * 5000}])
        self.assertIn("Pokee's limit is", str(caught.exception))
        self.assertEqual(self.server.requests, [])  # nothing was sent

    def test_the_documented_limits_are_what_we_enforce(self):
        self.assertEqual(client.MAX_REQUEST_BYTES, 45 * 1024 * 1024)
        self.assertEqual(client.SSE_REQUIRED_BYTES, 16 * 1024 * 1024)
        self.assertEqual(client.MAX_OUTPUT_TOKENS, 60000)
        # The router clamps to the same output ceiling the API documents.
        self.assertEqual(anthropic_proxy.MAX_COMPLETION_TOKENS,
                         client.MAX_OUTPUT_TOKENS)

    def test_a_large_body_forces_streaming(self):
        # Pokee rejects a >16 MiB body that has not negotiated SSE, so the
        # client must upgrade rather than honour stream=False.
        with _patched(client, SSE_REQUIRED_BYTES=1000):
            client.chat([{"role": "user", "content": "hello " + "x" * 4000}],
                        stream=False)
        self.assertTrue(self.last_payload()["stream"])

    def test_a_large_body_does_not_retry_unstreamed(self):
        with _patched(client, SSE_REQUIRED_BYTES=1000):
            with self.assertRaises(client.IsaacError) as caught:
                client.chat([{"role": "user", "content": "EMPTYSTREAM " + "x" * 4000}])
        self.assertIn("too large", str(caught.exception))
        # One attempt only: the unstreamed retry would just 400.
        self.assertEqual(len(self.server.requests), 1)

    def test_length_stop_auto_resumes_and_stitches(self):
        result = client.chat_complete([{"role": "user", "content": "LONG"}],
                                      max_continuations=2)
        self.assertEqual(result["text"], "PART1PART2")
        self.assertEqual(result["rounds"], 2)
        self.assertFalse(result["truncated"])

    def test_continuations_can_be_disabled(self):
        result = client.chat_complete([{"role": "user", "content": "LONG"}],
                                      max_continuations=0)
        self.assertEqual(result["text"], "PART1")
        self.assertTrue(result["truncated"])


class ExtractCodeTests(unittest.TestCase):
    def test_picks_the_largest_fenced_block(self):
        text = "intro\n```js\nx\n```\nmid\n```html\n<p>bigger block here</p>\n```\nend"
        code, lang = client.extract_code(text)
        self.assertEqual(lang, "html")
        self.assertIn("bigger block", code)

    def test_bare_html_needs_no_fence(self):
        code, lang = client.extract_code("<!DOCTYPE html>\n<title>x</title>")
        self.assertEqual(lang, "html")
        self.assertTrue(code.endswith("\n"))

    def test_prose_yields_nothing(self):
        self.assertEqual(client.extract_code("just some prose"), (None, None))


# --------------------------------------------------------------------------
# request translation
# --------------------------------------------------------------------------

class TranslateTests(unittest.TestCase):
    def test_system_and_text_blocks_flatten(self):
        payload = anthropic_proxy.translate_request({
            "system": [{"type": "text", "text": "be brief"}],
            "messages": [{"role": "user", "content": [{"type": "text", "text": "hi"}]}],
            "max_tokens": 100,
        }, "pokee-isaac")
        self.assertEqual(payload["messages"][0], {"role": "system", "content": "be brief"})
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "hi"})
        self.assertTrue(payload["stream"])

    def test_max_tokens_is_clamped(self):
        payload = anthropic_proxy.translate_request(
            {"messages": [], "max_tokens": 64000}, "pokee-isaac")
        self.assertEqual(payload["max_tokens"], anthropic_proxy.MAX_COMPLETION_TOKENS)

    def test_tool_use_and_tool_result_round_trip(self):
        payload = anthropic_proxy.translate_request({
            "messages": [
                {"role": "user", "content": "weather?"},
                {"role": "assistant", "content": [
                    {"type": "text", "text": "checking"},
                    {"type": "tool_use", "id": "toolu_1", "name": "get_weather",
                     "input": {"city": "Paris"}},
                ]},
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "toolu_1", "content": "18C"},
                    {"type": "text", "text": "thanks"},
                ]},
            ],
            "max_tokens": 100,
        }, "pokee-isaac")
        roles = [m["role"] for m in payload["messages"]]
        self.assertEqual(roles, ["user", "assistant", "tool", "user"])
        call = payload["messages"][1]["tool_calls"][0]
        self.assertEqual(call["function"]["name"], "get_weather")
        self.assertEqual(json.loads(call["function"]["arguments"]), {"city": "Paris"})
        self.assertEqual(payload["messages"][2]["tool_call_id"], "toolu_1")

    def test_images_become_placeholders(self):
        payload = anthropic_proxy.translate_request({
            "messages": [{"role": "user", "content": [
                {"type": "image", "source": {"data": "..."}},
            ]}],
            "max_tokens": 100,
        }, "pokee-isaac")
        self.assertIn("image omitted", payload["messages"][0]["content"])

    def test_tools_and_tool_choice_map_over(self):
        payload = anthropic_proxy.translate_request({
            "messages": [],
            "max_tokens": 100,
            "tools": [
                {"name": "search", "description": "d",
                 "input_schema": {"type": "object", "properties": {}}},
                {"type": "bash_20241022", "name": "bash"},
            ],
            "tool_choice": {"type": "any"},
        }, "pokee-isaac")
        self.assertEqual([t["function"]["name"] for t in payload["tools"]], ["search"])
        self.assertEqual(payload["tool_choice"], "required")


# --------------------------------------------------------------------------
# router
# --------------------------------------------------------------------------

class ProxyTests(FakeUpstreamCase):
    def setUp(self):
        super().setUp()
        self.proxy = ThreadingHTTPServer(("127.0.0.1", 0), anthropic_proxy.ProxyHandler)
        self.proxy.daemon_threads = True
        import threading
        threading.Thread(target=self.proxy.serve_forever, daemon=True).start()
        self.addCleanup(self.proxy.shutdown)
        self.addCleanup(self.proxy.server_close)
        self.url = "http://127.0.0.1:{}".format(self.proxy.server_port)

        self._saved_upstream = anthropic_proxy.ANTHROPIC_UPSTREAM
        anthropic_proxy.ANTHROPIC_UPSTREAM = self.base
        self.addCleanup(self._restore_upstream)

    def _restore_upstream(self):
        anthropic_proxy.ANTHROPIC_UPSTREAM = self._saved_upstream

    def test_router_probe(self):
        with urllib.request.urlopen(self.url + "/router", timeout=5) as resp:
            self.assertTrue(json.load(resp)["router"])

    def test_health_reports_the_isaac_config(self):
        with urllib.request.urlopen(self.url + "/health", timeout=5) as resp:
            body = json.load(resp)
        self.assertTrue(body["ok"])
        self.assertEqual(body["model"], "pokee-isaac")

    def test_claude_models_pass_through_untouched(self):
        status, body = _post(self.url + "/v1/messages",
                             {"model": "claude-sonnet-4-20250514",
                              "messages": [{"role": "user", "content": "hi"}],
                              "max_tokens": 10})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["passthrough"])

    def test_unknown_paths_pass_through(self):
        with urllib.request.urlopen(self.url + "/v1/models", timeout=5) as resp:
            self.assertTrue(json.load(resp)["passthrough"])

    def test_query_string_does_not_defeat_routing(self):
        status, body = _post(self.url + "/v1/messages?beta=true",
                             {"model": "pokee-isaac",
                              "messages": [{"role": "user", "content": "hi"}],
                              "max_tokens": 10})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["type"], "message")

    def test_buffered_response_carries_text_and_tool_use(self):
        status, body = _post(self.url + "/v1/messages",
                             {"model": "pokee-isaac", "max_tokens": 64000,
                              "messages": [{"role": "user", "content": "TOOLCALL"}]})
        self.assertEqual(status, 200)
        message = json.loads(body)
        self.assertEqual(message["stop_reason"], "tool_use")
        kinds = [block["type"] for block in message["content"]]
        self.assertEqual(kinds, ["text", "tool_use"])
        tool = message["content"][1]
        self.assertEqual(tool["name"], "get_weather")
        self.assertEqual(tool["input"], {"city": "Paris"})
        self.assertEqual(message["usage"]["input_tokens"], 10)
        # Claude Code's 64000 must have been clamped before it left the router.
        self.assertEqual(self.last_payload()["max_tokens"],
                         anthropic_proxy.MAX_COMPLETION_TOKENS)

    def test_streaming_response_is_a_valid_anthropic_event_sequence(self):
        req = urllib.request.Request(
            self.url + "/v1/messages",
            data=json.dumps({"model": "pokee-isaac", "stream": True, "max_tokens": 100,
                             "messages": [{"role": "user", "content": "hi"}]}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            self.assertEqual(resp.headers["Content-Type"], "text/event-stream")
            events = _parse_sse(resp.read().decode("utf-8"))

        names = [name for name, _ in events]
        self.assertEqual(names[0], "message_start")
        self.assertEqual(names[-1], "message_stop")
        self.assertIn("content_block_start", names)
        self.assertIn("content_block_stop", names)
        text = "".join(data["delta"]["text"] for name, data in events
                       if name == "content_block_delta")
        self.assertEqual(text, "OK")
        delta = [data for name, data in events if name == "message_delta"][0]
        self.assertEqual(delta["delta"]["stop_reason"], "end_turn")

    def test_streaming_tool_calls_emit_input_json_deltas(self):
        req = urllib.request.Request(
            self.url + "/v1/messages",
            data=json.dumps({"model": "pokee-isaac", "stream": True, "max_tokens": 100,
                             "messages": [{"role": "user", "content": "TOOLCALL"}]}).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            events = _parse_sse(resp.read().decode("utf-8"))

        starts = [data for name, data in events if name == "content_block_start"]
        self.assertEqual([s["content_block"]["type"] for s in starts], ["text", "tool_use"])
        partial = "".join(data["delta"]["partial_json"] for name, data in events
                          if name == "content_block_delta"
                          and data["delta"]["type"] == "input_json_delta")
        self.assertEqual(json.loads(partial), {"city": "Paris"})

    def test_count_tokens_is_answered_locally(self):
        status, body = _post(self.url + "/v1/messages/count_tokens",
                             {"model": "pokee-isaac",
                              "messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(status, 200)
        self.assertIsInstance(json.loads(body)["input_tokens"], int)

    def test_missing_key_becomes_an_anthropic_shaped_error(self):
        os.environ.pop("POKEE_API_KEY")
        with _patched(client, _parse_env_file=lambda path: {}):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                _post(self.url + "/v1/messages",
                      {"model": "pokee-isaac", "max_tokens": 10,
                       "messages": [{"role": "user", "content": "hi"}]})
        body = json.loads(caught.exception.read().decode())
        self.assertEqual(body["error"]["type"], "authentication_error")


# --------------------------------------------------------------------------
# MCP server (as Claude Code actually launches it: a stdio subprocess)
# --------------------------------------------------------------------------

class McpStdioTests(FakeUpstreamCase):
    def setUp(self):
        super().setUp()
        self.workdir = tempfile.mkdtemp(prefix="isaac-mcp-")
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        self.proc = subprocess.Popen(
            [sys.executable, str(PROJECT_ROOT / "pokee_cli.py"), "mcp"],
            cwd=self.workdir, env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1,
        )
        self.addCleanup(self._stop)
        self._id = 0

    def _stop(self):
        if self.proc.poll() is None:
            self.proc.stdin.close()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=10)
        for stream in (self.proc.stdin, self.proc.stdout):
            if stream and not stream.closed:
                stream.close()

    def rpc(self, method, params=None):
        self._id += 1
        self.proc.stdin.write(json.dumps({
            "jsonrpc": "2.0", "id": self._id, "method": method,
            "params": params or {},
        }) + "\n")
        self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def notify(self, method):
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method}) + "\n")
        self.proc.stdin.flush()

    def call_tool(self, name, arguments):
        return self.rpc("tools/call", {"name": name, "arguments": arguments})

    @staticmethod
    def text_of(response):
        return response["result"]["content"][0]["text"]

    def test_initialize_handshake(self):
        response = self.rpc("initialize", {"protocolVersion": "2024-11-05",
                                           "capabilities": {}})
        self.assertEqual(response["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(response["result"]["serverInfo"]["name"], "isaac")
        self.notify("notifications/initialized")  # must not produce a reply

        names = [t["name"] for t in self.rpc("tools/list")["result"]["tools"]]
        self.assertEqual(sorted(names), ["ask", "build", "health", "iterate"])

    def test_unknown_protocol_falls_back_to_ours(self):
        response = self.rpc("initialize", {"protocolVersion": "1999-01-01"})
        self.assertEqual(response["result"]["protocolVersion"],
                         mcp_server.PROTOCOL_VERSION)

    def test_empty_optional_registries(self):
        for method, key in (("prompts/list", "prompts"), ("resources/list", "resources")):
            self.assertEqual(self.rpc(method)["result"][key], [])

    def test_unknown_method_is_a_jsonrpc_error(self):
        self.assertEqual(self.rpc("does/not/exist")["error"]["code"], -32601)

    def test_health(self):
        text = self.text_of(self.call_tool("health", {}))
        self.assertIn("Pokee Isaac reachable", text)
        self.assertIn("pk-live-", text)
        self.assertNotIn("testkey1234", text)  # key stays masked

    def test_ask_returns_text_inline(self):
        self.assertIn("OK", self.text_of(self.call_tool("ask", {"prompt": "hello"})))

    def test_ask_validates_its_arguments(self):
        response = self.call_tool("ask", {})
        self.assertTrue(response["result"]["isError"])
        self.assertIn("'prompt' is required", self.text_of(response))

    def test_build_writes_to_disk_and_returns_a_summary(self):
        text = self.text_of(self.call_tool(
            "build", {"spec": "CODE: a page", "out_path": "page.html"}))
        built = Path(self.workdir) / "builds" / "page.html"
        self.assertTrue(built.exists())
        self.assertIn("<!DOCTYPE html>", built.read_text())
        self.assertNotIn("Enjoy!", built.read_text())  # prose stripped, code kept
        self.assertIn("Wrote", text)
        self.assertIn("language: html", text)

    def test_iterate_rewrites_in_place_and_keeps_a_backup(self):
        self.call_tool("build", {"spec": "CODE: a page", "out_path": "page.html"})
        built = Path(self.workdir) / "builds" / "page.html"
        original = built.read_text()
        self.call_tool("iterate", {"path": "page.html", "changes": "CODE: make it blue"})
        self.assertEqual((built.parent / "page.html.bak").read_text(), original)
        self.assertTrue(built.exists())

    def test_iterate_on_a_missing_file_is_a_tool_error(self):
        response = self.call_tool("iterate", {"path": "nope.html", "changes": "x"})
        self.assertTrue(response["result"]["isError"])
        self.assertIn("No such file", self.text_of(response))

    def test_writes_outside_the_project_are_refused(self):
        response = self.call_tool("build", {"spec": "CODE: x",
                                            "out_path": "/tmp/escaped-isaac.html"})
        self.assertTrue(response["result"]["isError"])
        self.assertIn("Refusing to write outside", self.text_of(response))
        self.assertFalse(Path("/tmp/escaped-isaac.html").exists())

    def test_api_failures_come_back_as_tool_errors_not_crashes(self):
        response = self.call_tool("ask", {"prompt": "BOOM"})
        self.assertTrue(response["result"]["isError"])
        self.assertIn("402", self.text_of(response))
        # The server survives and keeps serving.
        self.assertIn("OK", self.text_of(self.call_tool("ask", {"prompt": "hi"})))


# --------------------------------------------------------------------------
# context window probe
# --------------------------------------------------------------------------

class ProbePromptTests(unittest.TestCase):
    def test_needle_sits_at_the_very_front(self):
        messages = cli._probe_messages("deadbeef", 5000)
        content = messages[0]["content"]
        self.assertTrue(content.startswith("NEEDLE=deadbeef"))
        self.assertIn("What was the NEEDLE value", content)

    def test_prompt_lands_near_the_requested_size(self):
        sent = len(cli._probe_messages("deadbeef", 20000)[0]["content"]) // cli.CHARS_PER_TOKEN
        self.assertGreaterEqual(sent, 20000)
        self.assertLess(sent, 20000 * 1.05)


class ProbeVerdictTests(unittest.TestCase):
    def test_intact_when_needle_returns_and_counts_agree(self):
        ok, note = cli._probe_verdict({"error": None, "recalled": True,
                                       "sent": 10000, "prompt_tokens": 9900})
        self.assertTrue(ok)
        self.assertEqual(note, "intact")

    def test_a_short_prompt_token_count_is_truncation(self):
        ok, note = cli._probe_verdict({"error": None, "recalled": True,
                                       "sent": 100000, "prompt_tokens": 32000})
        self.assertFalse(ok)
        self.assertIn("server read only", note)

    def test_a_lost_needle_is_truncation(self):
        ok, note = cli._probe_verdict({"error": None, "recalled": False,
                                       "sent": 100000, "prompt_tokens": None})
        self.assertFalse(ok)
        self.assertIn("truncated silently", note)

    def test_an_upload_size_cap_is_not_called_a_context_limit(self):
        ok, note = cli._probe_verdict({"error": "Pokee API error 413: request entity too large",
                                       "recalled": False, "sent": 4000000,
                                       "prompt_tokens": None})
        self.assertFalse(ok)
        self.assertIn("size cap, not the context limit", note)

    def test_a_timeout_is_inconclusive(self):
        ok, note = cli._probe_verdict({"error": "Could not reach ...: timed out",
                                       "recalled": False, "sent": 1000000,
                                       "prompt_tokens": None})
        self.assertFalse(ok)
        self.assertIn("inconclusive", note)

    def test_an_api_refusal_is_reported_as_such(self):
        ok, note = cli._probe_verdict({"error": "400 too long", "recalled": False,
                                       "sent": 100000, "prompt_tokens": None})
        self.assertFalse(ok)
        self.assertEqual(note, "rejected by the API")

    def test_a_missing_token_count_falls_back_to_the_needle(self):
        ok, _ = cli._probe_verdict({"error": None, "recalled": True,
                                    "sent": 100000, "prompt_tokens": None})
        self.assertTrue(ok)


class ProbeCliTests(unittest.TestCase):
    """The probe end to end, against a fake with a known, finite window."""

    def _run(self, window_chars, sizes, extra=()):
        server, base = fake_pokee.start(window_chars=window_chars)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        env = os.environ.copy()
        env["POKEE_API_KEY"] = "pk-live-probe12345"
        env["POKEE_API_URL"] = base + "/v1/chat/completions"
        env["POKEE_MODEL"] = "pokee-isaac"
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "pokee_cli.py"), "probe-context",
             "--sizes", sizes, "--yes"] + list(extra),
            capture_output=True, text=True, timeout=120, env=env,
        )

    def test_finds_the_edge_of_a_finite_window(self):
        # 40,000 chars of window ~= 10,000 tokens: 2k fits, 20k does not.
        done = self._run(40000, "2000,20000")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("OK", done.stdout)
        self.assertIn("FAIL", done.stdout)
        self.assertIn("Largest size that survived intact: 2,000", done.stdout)
        self.assertIn("CLAUDE_CODE_MAX_CONTEXT_TOKENS=1800", done.stdout)

    def test_says_so_when_nothing_truncates(self):
        done = self._run(None, "2000,4000")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("at least 4,000", done.stdout)
        self.assertNotIn("FAIL", done.stdout)

    def test_stops_at_the_first_failure(self):
        done = self._run(4000, "2000,20000,40000")
        # 2k already exceeds a 4,000-char window, so nothing survives.
        self.assertEqual(done.returncode, 1)
        self.assertIn("Nothing survived intact", done.stdout)
        self.assertEqual(done.stdout.count("FAIL"), 1)  # no probing past the edge

    def test_requires_confirmation_without_yes(self):
        server, base = fake_pokee.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        env = os.environ.copy()
        env["POKEE_API_KEY"] = "pk-live-probe12345"
        env["POKEE_API_URL"] = base + "/v1/chat/completions"
        done = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "pokee_cli.py"), "probe-context",
             "--sizes", "2000"],
            capture_output=True, text=True, timeout=60, env=env, input="n\n",
        )
        self.assertEqual(done.returncode, 1)
        self.assertIn("Aborted.", done.stdout)
        self.assertIn("bills you", done.stdout)
        self.assertIn("credit", done.stdout)  # the cost is stated up front
        self.assertEqual(server.requests, [])  # nothing was sent

    def test_rejects_nonsense_sizes(self):
        self.assertEqual(self._run(None, "12").returncode, 2)
        self.assertEqual(self._run(None, "not-a-number").returncode, 2)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

class CliTests(FakeUpstreamCase):
    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "pokee_cli.py")] + list(args),
            capture_output=True, text=True, timeout=60, env=os.environ.copy(),
        )

    def test_doctor_reports_a_healthy_endpoint(self):
        done = self._run("doctor")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("OK — Isaac is reachable.", done.stdout)
        self.assertNotIn("testkey1234", done.stdout)

    def test_doctor_fails_loudly_without_a_key(self):
        env = os.environ.copy()
        env.pop("POKEE_API_KEY")
        env["HOME"] = tempfile.mkdtemp()
        done = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "pokee_cli.py"), "doctor"],
            capture_output=True, text=True, timeout=60, env=env,
            cwd=tempfile.mkdtemp(),
        )
        self.assertEqual(done.returncode, 1)
        self.assertIn("FAIL", done.stdout)

    def test_ask_streams_to_stdout(self):
        done = self._run("ask", "hello")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(done.stdout.strip(), "OK")

    def test_ask_without_a_prompt_shows_usage(self):
        self.assertEqual(self._run("ask").returncode, 2)

    def test_help_lists_the_subcommands(self):
        done = self._run("--help")
        self.assertEqual(done.returncode, 0)
        for command in ("isaac", "doctor", "probe-context", "ask", "chat",
                        "proxy", "mcp"):
            self.assertIn(command, done.stdout)


# --------------------------------------------------------------------------

class _patched:
    """Minimal attribute patcher (unittest.mock is fine, this reads better here)."""

    def __init__(self, module, **attrs):
        self.module = module
        self.attrs = attrs
        self.saved = {}

    def __enter__(self):
        for name, value in self.attrs.items():
            self.saved[name] = getattr(self.module, name)
            setattr(self.module, name, value)
        return self.module

    def __exit__(self, *exc):
        for name, value in self.saved.items():
            setattr(self.module, name, value)
        return False


if __name__ == "__main__":
    unittest.main()
