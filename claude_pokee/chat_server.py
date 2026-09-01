"""Local Isaac chat UI — hardened port of the shipped isaac-chat.py.

Changes vs. the original:
  * API key comes from .env / environment, never hardcoded in source
  * ThreadingHTTPServer, so a long generation stops blocking every other request
  * fixed the HTTPError handler that called e.read() twice (second read is empty,
    so real API errors surfaced as a blank message)
  * model/endpoint come from config instead of being pinned in the handler
  * "Save to builds/" writes the last reply's code block into the repo, where
    Claude Code can pick it up
"""

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import client
from .client import IsaacError, PROJECT_ROOT

BUILD_DIR = PROJECT_ROOT / "builds"
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]")

CHAT_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Isaac Chat</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: #0a0a0f;
  color: #c8c8d0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
#header {
  padding: 16px 24px;
  border-bottom: 1px solid #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0d0d14;
}
#header h1 { font-size: 16px; font-weight: 600; color: #e0e0e8; letter-spacing: 1px; }
#header .controls { display: flex; gap: 12px; align-items: center; }
#header .controls button {
  background: #1e1e30;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  padding: 6px 12px;
  color: #a0a0b0;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
#header .controls button:hover { background: #2a2a40; border-color: #3a3a5c; color: #c8c8d0; }
#header .controls button:disabled { opacity: 0.35; cursor: not-allowed; }
#header .status { font-size: 11px; color: #606070; letter-spacing: 1px; }
#header .status.thinking { color: #a78bfa; }
#header .status.error { color: #f87171; }
#header .status.connected { color: #4ade80; }
#chat { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.message { max-width: 800px; width: 100%; margin: 0 auto; }
.message .role {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 8px;
  color: #606070;
}
.message.user .role { color: #60a5fa; }
.message.assistant .role { color: #a78bfa; }
.message .content { font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
#input-area { padding: 16px 24px; border-top: 1px solid #1a1a2e; background: #0d0d14; }
#input-row { max-width: 800px; margin: 0 auto; display: flex; gap: 12px; }
#prompt {
  flex: 1;
  background: #141420;
  border: 1px solid #1e1e30;
  border-radius: 8px;
  padding: 12px 16px;
  color: #c8c8d0;
  font-family: inherit;
  font-size: 14px;
  resize: none;
  outline: none;
  min-height: 48px;
  max-height: 200px;
  line-height: 1.5;
}
#prompt:focus { border-color: #3a3a5c; }
#send {
  background: #1e1e30;
  border: 1px solid #2a2a40;
  border-radius: 8px;
  padding: 0 20px;
  color: #c8c8d0;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
#send:hover { background: #2a2a40; border-color: #3a3a5c; }
#send:disabled { opacity: 0.4; cursor: not-allowed; }
#settings {
  max-width: 800px;
  margin: 0 auto;
  padding: 8px 0;
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 11px;
  color: #505060;
  flex-wrap: wrap;
}
#settings label { display: flex; align-items: center; gap: 6px; }
#settings input, #settings select {
  background: #141420;
  border: 1px solid #1e1e30;
  border-radius: 4px;
  padding: 4px 8px;
  color: #c8c8d0;
  font-family: inherit;
  font-size: 11px;
  outline: none;
}
#settings input:focus { border-color: #3a3a5c; }
#settings input[type="number"] { width: 70px; }
#settings input[type="range"] { width: 80px; }
#settings input[type="text"] { width: 260px; }
#saveNote { font-size: 11px; color: #4ade80; }
#chat::-webkit-scrollbar { width: 6px; }
#chat::-webkit-scrollbar-track { background: transparent; }
#chat::-webkit-scrollbar-thumb { background: #1e1e30; border-radius: 3px; }
#chat::-webkit-scrollbar-thumb:hover { background: #2a2a40; }
</style>
</head>
<body>
<div id="header">
  <h1>ISAAC</h1>
  <div class="controls">
    <button id="saveBtn" disabled>Save to builds/</button>
    <button id="newChat">New Chat</button>
    <span class="status" id="status">ready</span>
  </div>
</div>
<div id="chat"></div>
<div id="input-area">
  <div id="settings">
    <label>Max tokens <input type="number" id="maxTokens" value="8192" min="256" max="200000" step="256"></label>
    <label>Temperature <input type="range" id="temperature" min="0" max="2" step="0.1" value="0.7"><span id="tempVal">0.7</span></label>
    <label>System prompt <input type="text" id="systemPrompt" value="You are a helpful assistant."></label>
    <span id="saveNote"></span>
  </div>
  <div id="input-row">
    <textarea id="prompt" placeholder="Ask Isaac anything..." rows="1"></textarea>
    <button id="send">Send</button>
  </div>
</div>

<script>
const chat = document.getElementById('chat');
const promptInput = document.getElementById('prompt');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
const maxTokensInput = document.getElementById('maxTokens');
const temperatureInput = document.getElementById('temperature');
const tempVal = document.getElementById('tempVal');
const systemPromptInput = document.getElementById('systemPrompt');
const newChatBtn = document.getElementById('newChat');
const saveBtn = document.getElementById('saveBtn');
const saveNote = document.getElementById('saveNote');

let conversationHistory = [];
let isGenerating = false;
let lastResponse = '';

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
});

temperatureInput.addEventListener('input', () => {
  tempVal.textContent = temperatureInput.value;
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

newChatBtn.addEventListener('click', () => {
  if (isGenerating) return;
  conversationHistory = [];
  lastResponse = '';
  saveBtn.disabled = true;
  saveNote.textContent = '';
  chat.innerHTML = '';
  promptInput.value = '';
  promptInput.style.height = 'auto';
  promptInput.focus();
  setStatus('ready', '');
});

// Pull the biggest fenced code block out of a reply, else use the whole thing.
function extractCode(text) {
  const blocks = [...text.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)].map(m => m[1]);
  if (!blocks.length) return { code: text, ext: 'txt' };
  const code = blocks.reduce((a, b) => (b.length > a.length ? b : a));
  const head = code.trim().slice(0, 200).toLowerCase();
  const ext = (head.startsWith('<!doctype') || head.startsWith('<html')) ? 'html' : 'txt';
  return { code, ext };
}

saveBtn.addEventListener('click', async () => {
  if (!lastResponse) return;
  const { code, ext } = extractCode(lastResponse);
  const suggested = 'isaac-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.' + ext;
  const filename = window.prompt('Save as (inside builds/):', suggested);
  if (!filename) return;
  saveBtn.disabled = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    saveNote.textContent = 'saved -> ' + data.path + ' (' + data.bytes.toLocaleString() + ' bytes)';
  } catch (err) {
    saveNote.textContent = 'save failed: ' + err.message;
  }
  saveBtn.disabled = false;
});

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + cls;
}

function addMessage(role, content) {
  const msg = document.createElement('div');
  msg.className = 'message ' + role;
  msg.innerHTML = '<div class="role">' + role + '</div><div class="content"></div>';
  msg.querySelector('.content').textContent = content;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  return msg;
}

function addStreamingMessage(role) {
  const msg = addMessage(role, '');
  return msg.querySelector('.content');
}

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || isGenerating) return;

  isGenerating = true;
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  saveBtn.disabled = true;
  saveNote.textContent = '';
  promptInput.value = '';
  promptInput.style.height = 'auto';

  addMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  const contentEl = addStreamingMessage('assistant');
  setStatus('thinking...', 'thinking');

  let fullContent = '';

  try {
    const messages = [
      { role: 'system', content: systemPromptInput.value },
      ...conversationHistory
    ];

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages,
        max_tokens: parseInt(maxTokensInput.value),
        temperature: parseFloat(temperatureInput.value)
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('API error ' + response.status + ': ' + err);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const choice = json.choices && json.choices[0];
          const delta = choice && choice.delta ? choice.delta.content : null;
          if (delta) {
            fullContent += delta;
            contentEl.textContent = fullContent;
            chat.scrollTop = chat.scrollHeight;
          }
        } catch (e) {
          // keep-alive or partial frame
        }
      }
    }

    if (!fullContent) {
      fullContent = 'No response received.';
      contentEl.textContent = fullContent;
    } else {
      lastResponse = fullContent;
      saveBtn.disabled = false;
    }

    conversationHistory.push({ role: 'assistant', content: fullContent });
    setStatus('ready', 'connected');

  } catch (err) {
    contentEl.textContent = 'Error: ' + err.message;
    setStatus('error', 'error');
  }

  isGenerating = false;
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send';
  promptInput.focus();
}

promptInput.focus();
</script>
</body>
</html>
"""


class ChatHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "IsaacChat/1.0"

    # -- helpers ----------------------------------------------------------
    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    # -- routes -----------------------------------------------------------
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = CHAT_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/health":
            try:
                config = client.load_config()
                self._json(200, {"ok": True, "model": config["model"], "endpoint": config["api_url"]})
            except IsaacError as exc:
                self._json(500, {"ok": False, "error": str(exc)})
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/chat":
            self._handle_chat()
        elif self.path == "/api/save":
            self._handle_save()
        else:
            self.send_error(404)

    def _handle_save(self):
        try:
            data = self._read_json()
        except ValueError:
            self._json(400, {"error": "Invalid JSON"})
            return

        raw_name = (data.get("filename") or "").strip()
        content = data.get("content") or ""
        name = SAFE_NAME.sub("_", raw_name.replace("/", "_")).lstrip(".")
        if not name:
            self._json(400, {"error": "Invalid filename"})
            return

        BUILD_DIR.mkdir(parents=True, exist_ok=True)
        path = BUILD_DIR / name
        path.write_text(content, encoding="utf-8")
        client.log("[chat] saved {} ({} bytes)".format(path, len(content.encode("utf-8"))))
        self._json(200, {"path": str(path), "bytes": len(content.encode("utf-8"))})

    def _handle_chat(self):
        try:
            data = self._read_json()
        except ValueError as exc:
            self._json(400, {"error": "Invalid JSON: {}".format(exc)})
            return

        messages = data.get("messages") or []
        max_tokens = data.get("max_tokens", 8192)
        temperature = data.get("temperature", 0.7)

        try:
            config = client.load_config()
        except IsaacError as exc:
            self._json(500, {"error": str(exc)})
            return

        client.log(
            "[chat] {} messages, max_tokens={}, temp={}".format(len(messages), max_tokens, temperature)
        )

        # Stream Isaac's SSE frames straight through to the browser.
        headers_sent = False
        try:
            payload = {
                "model": config["model"],
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": True,
            }
            with client._request(config, payload, client.DEFAULT_TIMEOUT) as resp:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()
                headers_sent = True
                self.close_connection = True

                total = 0
                while True:
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    total += len(chunk)
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                client.log("[chat] streamed {} bytes".format(total))
        except (BrokenPipeError, ConnectionResetError):
            client.log("[chat] client disconnected")
        except IsaacError as exc:
            client.log("[chat] {}".format(exc))
            if headers_sent:
                # Mid-stream: surface the failure as an SSE frame the UI can show.
                try:
                    self.wfile.write(
                        ("data: " + json.dumps({
                            "choices": [{"delta": {"content": "\n\n[error] {}".format(exc)}}]
                        }) + "\n\n").encode("utf-8")
                    )
                    self.wfile.flush()
                except Exception:
                    pass
            else:
                self._json(502, {"error": {"message": str(exc), "type": "proxy_error"}})

    def log_message(self, fmt, *args):
        pass  # suppress default access logs; we log what matters ourselves


def serve(port=8766, host="127.0.0.1"):
    try:
        config = client.load_config()
        client.log("[chat] model={} endpoint={}".format(config["model"], config["api_url"]))
    except IsaacError as exc:
        client.log("[chat] WARNING: {}".format(exc))

    server = ThreadingHTTPServer((host, port), ChatHandler)
    server.daemon_threads = True
    print("Isaac Chat running on http://{}:{}".format(host, port))
    print("Saved files land in {}".format(BUILD_DIR))
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()
