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

- **Over-limit input is truncated silently** — it degrades quietly instead of
  erroring, so the window matters more than usual. Pokee describes a 10M
  window (total, so the reply comes out of it); this project's earlier live
  testing saw truncation nearer 128k. Run `claude-pokee probe-context` to
  measure yours rather than trusting either number.
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
Export the variable yourself to override it; `probe-context` tells you what to
set it to.

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
  window was exceeded. It costs real tokens (the default ladder is ~1.9M input
  across five requests) so it asks before sending; `--sizes 32000,128000` keeps
  it cheap and `--yes` skips the prompt.
- Router port: `ISAAC_PROXY_PORT` (default 8787). The router is reused if
  already running; its log is `claude-pokee-proxy-<port>.log` in your temp dir.
- Optional overrides: `POKEE_API_URL`, `POKEE_MODEL`.
- Windows: the pip-installed `claude-pokee` command works everywhere; the
  plugin's MCP server expects `python3` on PATH.

## Upstream quirks the router works around

Found by testing against the live API:

| Quirk | Workaround |
| --- | --- |
| Non-streaming tool calls are broken — `finish_reason: "tool_calls"` with an empty body and no `tool_calls` array | Always call upstream with `stream=true` and aggregate, whatever the client asked for |
| `max_tokens` above 60000 is rejected (`invalid_max_tokens`); Claude Code asks for 64000 | Clamp to 60000 |
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
