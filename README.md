# claude-pokee

[Pokee Isaac](https://developer.pokee.ai) inside
[Claude Code](https://claude.com/claude-code), three ways:

1. **In the `/model` picker** — `claude-pokee` launches normal Claude Code
   with **Pokee Isaac** as an extra model next to Opus/Sonnet/Haiku. Switch
   with `/model pokee-isaac` and back, mid-session.
2. **As a tool** — a Claude Code plugin adds `/claude-pokee:isaac` plus MCP
   tools (`ask`, `build`, `iterate`, `health`); Claude stays the driver and
   delegates one-shot generation to Isaac.
3. **As the whole model** — `claude-pokee isaac` runs Claude Code's entire
   agent loop on `pokee-isaac`.

Stdlib Python only, no dependencies. **Unofficial** — not affiliated with
Pokee AI or Anthropic. You need your own Pokee API key
(developer.pokee.ai → API Keys).

> **This repository is a working copy for testing.** The upstream project is
> [TheMarco/claude-pokee](https://github.com/TheMarco/claude-pokee) by Marco
> van Hylckama Vlieg, MIT-licensed; the links and package metadata below still
> point there. Added on top of it here: the offline test suite under `tests/`
> and the `probe-context` command.

## Install

```
pipx install claude-pokee        # or: uv tool install claude-pokee
```

Put your key where every mode can find it:

```
mkdir -p ~/.pokee && echo 'POKEE_API_KEY=pk-live-...' > ~/.pokee/.env
```

`export POKEE_API_KEY=...` or a `.env` in the directory you launch from
also work (that order wins).

## 1. Isaac in the `/model` picker

```
claude-pokee                 # interactive; pick "Pokee Isaac" in /model
claude-pokee -p "question"   # anything that isn't a subcommand goes to claude
```

Claude Code speaks the Anthropic Messages API and allows one base URL per
session; Pokee speaks OpenAI chat/completions. So `claude-pokee` starts a
local router (127.0.0.1, default port 8787) and points Claude Code at it:

| `model` in the request | Goes to |
| --- | --- |
| `claude-*` (or missing) | `api.anthropic.com`, byte-for-byte — auth headers, query string, and SSE stream untouched |
| anything else | translated to Pokee's OpenAI-style API |

The launcher sets **no** `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`, so your
saved claude.ai login remains the active credential for Anthropic models —
routing and billing for those are unchanged. The picker entry comes from
`ANTHROPIC_CUSTOM_MODEL_OPTION`.

**Know before switching** (applies whenever the session is on `pokee-isaac`):

- **Context: measured at 11M+, not 128k.** Pokee's API reference documents
  ~10M tokens, with a 45 MiB body cap that binds first on token-dense text. An
  earlier note here reported truncation nearer 128k; **that does not
  reproduce.** A full `probe-context` ladder on 2026-09-01 held intact at
  every rung up to **11,151,574 server-counted tokens** — past the documented
  ceiling — with the needle returned and `prompt_tokens` matching what was
  sent at each step. See [Measured context window](#measured-context-window).
  Still run `claude-pokee probe-context` against your own key before relying
  on it: over-limit input is dropped quietly rather than erroring, which is
  what makes the number worth checking.
- Claude Code does not recognize `pokee-isaac`, so it auto-compacts against an
  assumed 200k window. Picker mode cannot correct that without also
  constraining the Claude models sharing the session, so switch early in a
  conversation or after `/compact`. All-Isaac mode does pin it — see below.
- **No prompt caching** — every turn resends full context; cost and latency
  grow with conversation length.
- **Text only** — pasted images are dropped with a placeholder.
- Isaac is tuned for one-shot creative generation, not multi-step agentic
  work; it's weaker at long tool-use chains and can latch onto MCP server
  instructions in busy projects.

## 2. Isaac as a tool (plugin)

```
/plugin marketplace add TheMarco/claude-pokee
/plugin install claude-pokee@claude-pokee
```

| Tool | What it does |
| --- | --- |
| `health` | Pings the endpoint, reports model/latency. Run first when things break. |
| `ask` | One-shot prompt → text. `save_to` writes to disk instead of returning inline. |
| `build` | Generates a self-contained artifact **straight to a file**. Returns path + size + preview only. |
| `iterate` | Feeds an existing file back with a change request, rewrites in place (keeps a `.bak`). |

`/claude-pokee:isaac <what to build>` runs the full loop: expand the request
into a proper spec, build to `builds/`, verify the output is a complete
offline-capable document, then suggest refinements.

Design choice: `build` and `iterate` never return the artifact through the
conversation — a 200KB generated game would eat the context window for no
benefit. Claude gets a path and reads only what it needs. Both auto-resume
when Isaac stops on its token limit. Writes are confined to the working
directory. The plugin sets a 15-minute per-tool timeout, so big builds
aren't cut off.

## 3. Everything on Isaac

```
claude-pokee isaac                 # interactive
claude-pokee isaac -p "question"   # print mode
```

Verified working: plain Q&A, tool calls, and the multi-turn tool-result
loop. Expect it to be much weaker than Claude as an agent — see the limits
above. Every request here is Isaac's, so this mode pins
`CLAUDE_CODE_MAX_CONTEXT_TOKENS` (default 8,000,000 — Pokee's 10M with headroom
for the reply) and auto-compact works against that instead of an assumed 200k.
The default sits below the documented ~10M ceiling so a long session stays
clear of the 45 MiB body cap. That default is now backed by measurement rather
than inference: an 8,000,000-token request came back intact (see
[Measured context window](#measured-context-window)). Export the variable
yourself to override it; `probe-context` tells you what to set it to.

## CLI reference

```
claude-pokee [claude args...]    Claude + Isaac in /model (default mode)
claude-pokee isaac [args...]     everything on pokee-isaac
claude-pokee doctor              verify key + endpoint
claude-pokee probe-context       measure the real context window
claude-pokee ask "prompt"        one-shot, streams to stdout
claude-pokee chat [port]         local chat UI (default :8766)
claude-pokee proxy [port]        run the router in the foreground (default :8787)
claude-pokee mcp                 MCP stdio server (what the plugin launches)
```

- `probe-context` sends a needle-in-front prompt at increasing sizes and
  watches two signals: whether the needle comes back, and whether the server's
  reported `prompt_tokens` matches what was sent. Either one dropping means the
  window was exceeded, and a 413 or a timeout is reported as such rather than
  counted as the window. It costs real tokens — the default ladder is ~1.9M
  input across five requests, roughly $0.29 — so it prints the estimated cost
  and asks before sending. `--sizes 32000,128000` keeps it to about a cent, and
  `--yes` skips the prompt.
- Router port: `ISAAC_PROXY_PORT` (default 8787). The router is reused if
  already running; its log is `claude-pokee-proxy-<port>.log` in your temp dir.
- Optional overrides: `POKEE_API_URL`, `POKEE_MODEL`.
- Windows: the pip-installed `claude-pokee` command works everywhere; the
  plugin's MCP server expects `python3` on PATH.

## API limits the client enforces

From Pokee's published API reference. These are enforced locally so a request
fails immediately with a clear message, rather than after uploading megabytes:

| Documented limit | How it is handled |
| --- | --- |
| Output capped at 60,000 tokens (`invalid_max_tokens`); Claude Code asks for 64,000 | Clamped to 60,000 |
| Bodies over 16 MiB must set `stream: true` and `Accept: text/event-stream`, or the gateway rejects them before reserving credits | Streaming is forced above that size, and the empty-stream retry — which would have to be unstreamed — is refused rather than sent |
| Request bodies over 45 MiB are rejected (`payload_too_large`) | Refused locally, before upload |
| ~10M token prompt ceiling; a prompt that large takes ~7 minutes to serve | 15-minute client timeout |
| Errors use one OpenAI-shaped envelope where `error.code` names the cause | `code` becomes advice (`key_revoked`, `insufficient_credits`, `model_not_found`, …), and 429's `Retry-After` is surfaced |

Bytes are a poor proxy for tokens — the same 1 MB of text can be 140k–700k
tokens depending on content — so `probe-context` measures against the server's
reported `usage`, not body size.

Pricing at the time of writing: **$0.15/1M input, $1.00/1M output**, billed in
whole credits of $0.01 each, rounded up per request. New accounts get 300 free
credits. Rate limits are 500 requests and 20M tokens per minute.

## Measured context window

The documented ~10M is a published figure, not a promise about your key, and
over-limit input is dropped silently rather than rejected — so it is worth
measuring. Two `probe-context` ladders run on 2026-09-01 against a `pk-live-`
key. Every rung came back intact: the needle returned, and the server's
reported `prompt_tokens` matched what was sent.

| requested | sent~ | server read | result |
| ---: | ---: | ---: | --- |
| 32,000 | 32,015 | 44,670 | OK intact |
| 128,000 | 128,012 | 178,482 | OK intact |
| 256,000 | 256,003 | 356,895 | OK intact |
| 512,000 | 512,000 | 713,738 | OK intact |
| 1,000,000 | 1,000,004 | 1,393,986 | OK intact |
| 2,000,000 | 2,000,003 | 2,787,926 | OK intact |
| 4,000,000 | 4,000,001 | 5,575,800 | OK intact |
| 8,000,000 | 8,000,014 | 11,151,574 | OK intact |

**The ceiling was not found.** The window is at least 11,151,574 tokens as the
server counts them — above the documented ~10M. Nothing truncated anywhere in
that range, and in particular the previously reported failure near 128k did
not occur.

Two things to carry away:

- **The `sent~` column understates by ~1.39x, consistently.** `probe-context`
  builds prompts at `CHARS_PER_TOKEN = 4`, but Pokee's tokenizer read ~1.394x
  that on this prose corpus, at every single rung. So the printed cost
  estimate understates too — the 8-rung run above quoted $2.39 and actually
  billed about **$3.33** (22,203,071 tokens at $0.15/1M). Budget ~1.4x the
  quote, and treat `sent~` as a floor. A different corpus will shift the
  ratio; that is the point of measuring against reported `usage` rather than
  body size.
- **The 45 MiB body cap is the real constraint, not the token ceiling.** At 4
  chars/token, 8M requested tokens is a ~31 MiB body. The cap is reached
  around 11.8M requested tokens — roughly 16M as Pokee counts them — so on
  prose you will be refused for body size before you find a token limit.

Reproduce with:

```
claude-pokee probe-context --sizes 32000,128000,256000,512000,1000000
claude-pokee probe-context --sizes 2000000,4000000,8000000
```

### Genuine quirks, found by testing

| Quirk | Workaround |
| --- | --- |
| Non-streaming tool calls are broken — `finish_reason: "tool_calls"` with an empty body and no `tool_calls` array | Always call upstream with `stream=true` and aggregate, whatever the client asked for |
| Cloudflare's WAF 403s the default `Python-urllib` User-Agent | Send a real `User-Agent` |

These may change as Pokee updates their API; `claude-pokee doctor` is the
first thing to run when something breaks.

## From a checkout

```
git clone https://github.com/beniceokay/pokee-test
cd pokee-test
./claude-pokee            # picker mode (wraps: python3 pokee_cli.py run)
./claude-isaac            # all-Isaac mode
python3 pokee_cli.py ...  # any subcommand, no install needed
```

Opening the checkout in Claude Code loads the `isaac` MCP server from the
project `.mcp.json` and the `/isaac` command — approve the server when
prompted, then check with `/mcp`. Test the plugin from source with
`claude --plugin-dir .`.

## Tests

```
python3 -m unittest discover -s tests
```

Stdlib only and fully offline: `tests/fake_pokee.py` stands in for
api.pokee.ai — and, in the pass-through tests, for api.anthropic.com — so no
key and no network are needed. Coverage is the parts that are easy to get
wrong: config resolution, SSE aggregation, the empty-stream fallback,
auto-continuation, Anthropic↔OpenAI translation in both directions, router
pass-through vs. translation, the streaming event sequence, the context probe
against a fake with a known finite window, and the MCP server driven over real
stdio as a subprocess (including write confinement).

## Layout

```
claude_pokee/cli.py            entry point + launchers (run | isaac | doctor | ask | chat | proxy | mcp)
claude_pokee/anthropic_proxy.py  router: claude-* pass-through + Anthropic <-> OpenAI translation
claude_pokee/client.py         Pokee API client, auto-continue, code extraction
claude_pokee/mcp_server.py     JSON-RPC stdio server + tools
claude_pokee/chat_server.py    local chat UI
pokee_cli.py                   no-install entry point (checkout + plugin use this)
tests/                         offline test suite + the fake Pokee endpoint
.claude-plugin/                Claude Code plugin + marketplace manifests
commands/isaac.md              the /claude-pokee:isaac command
```

## License

MIT. "Pokee" and "Isaac" are Pokee AI's names for their product; "Claude" is
Anthropic's. This project is an independent integration and claims no
affiliation with or endorsement by either.
