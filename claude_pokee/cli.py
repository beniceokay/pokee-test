"""claude-pokee — Pokee Isaac for Claude Code.

  claude-pokee [claude args...]    launch Claude Code with pokee-isaac as an
                                   extra /model entry (args pass to claude)
  claude-pokee isaac [args...]     launch Claude Code entirely on pokee-isaac
  claude-pokee doctor              verify key + endpoint
  claude-pokee probe-context       measure the real context window
  claude-pokee ask "prompt"        one-shot prompt, streams to stdout
  claude-pokee chat [port]         local chat UI (default :8766)
  claude-pokee proxy [port]        run the router in the foreground (default :8787)
  claude-pokee mcp                 MCP stdio server (Isaac as a tool)

Anything that is not a subcommand is passed straight through to `claude`,
so `claude-pokee -p "question"` and `claude-pokee --resume` work as expected.
"""

import json
import math
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import uuid
import urllib.request
from pathlib import Path

from . import client
from .client import IsaacError

DEFAULT_PORT = 8787
PICKER_MODEL = "pokee-isaac"

# Isaac's usable context, for all-Isaac mode only. Sources disagree: Pokee
# describes a 10M window (total, so the reply comes out of it), while this
# project's earlier live testing saw truncation around 128k. Over-limit input
# is dropped silently rather than erroring, so guessing high loses context with
# no error to notice. 8M keeps Pokee's figure with headroom for the reply;
# `claude-pokee probe-context` measures the real number, and
# CLAUDE_CODE_MAX_CONTEXT_TOKENS overrides this without touching the code.
ISAAC_CONTEXT_TOKENS = 8000000


# --------------------------------------------------------------------------
# router lifecycle
# --------------------------------------------------------------------------

def _proxy_port():
    return int(os.environ.get("ISAAC_PROXY_PORT") or DEFAULT_PORT)


def _port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _router_ok(port):
    try:
        url = "http://127.0.0.1:{}/router".format(port)
        with urllib.request.urlopen(url, timeout=3) as resp:
            return bool(json.load(resp).get("router"))
    except Exception:
        return False


def _ensure_proxy(port):
    """Start the router in the background unless one is already listening."""
    if _port_open(port):
        if _router_ok(port):
            print("Using router already running on :{}".format(port))
            return
        print(
            "Something that is not the claude-pokee router is listening on "
            ":{} (an old proxy?). Stop it, or pick another port with "
            "ISAAC_PROXY_PORT.".format(port),
            file=sys.stderr,
        )
        sys.exit(1)

    log_path = Path(tempfile.gettempdir()) / "claude-pokee-proxy-{}.log".format(port)
    print("Starting Anthropic router on :{} (log: {})".format(port, log_path))

    # The child must be able to import this package whether we're running
    # pip-installed or straight from a checkout via pokee_cli.py.
    env = os.environ.copy()
    pkg_parent = str(Path(__file__).resolve().parent.parent)
    env["PYTHONPATH"] = pkg_parent + os.pathsep + env.get("PYTHONPATH", "")

    kwargs = {}
    if os.name == "posix":
        kwargs["start_new_session"] = True
    else:  # Windows: DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        kwargs["creationflags"] = 0x00000008 | 0x00000200

    with open(log_path, "ab") as log_file:
        subprocess.Popen(
            [sys.executable, "-m", "claude_pokee", "proxy", str(port)],
            stdout=log_file,
            stderr=log_file,
            stdin=subprocess.DEVNULL,
            env=env,
            **kwargs
        )

    for _ in range(60):
        if _port_open(port):
            return
        time.sleep(0.2)

    print("Proxy failed to start. Last lines of {}:".format(log_path), file=sys.stderr)
    try:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-20:]
        print("\n".join(tail), file=sys.stderr)
    except OSError:
        pass
    sys.exit(1)


def _exec_claude(argv, env):
    claude = shutil.which("claude", path=env.get("PATH"))
    if not claude:
        print("Could not find the `claude` CLI on PATH.", file=sys.stderr)
        print("Install Claude Code first: https://claude.com/claude-code", file=sys.stderr)
        return 127
    if os.name == "posix":
        sys.stdout.flush()  # exec discards unflushed stdio buffers
        sys.stderr.flush()
        os.execve(claude, [claude] + argv, env)  # replaces this process
    return subprocess.call([claude] + argv, env=env)


# --------------------------------------------------------------------------
# launcher subcommands
# --------------------------------------------------------------------------

def cmd_run(argv):
    """Normal Claude Code — your models, your login — plus pokee-isaac in /model."""
    port = _proxy_port()
    _ensure_proxy(port)
    env = os.environ.copy()
    env["ANTHROPIC_BASE_URL"] = "http://127.0.0.1:{}".format(port)
    env["ANTHROPIC_CUSTOM_MODEL_OPTION"] = PICKER_MODEL
    env["ANTHROPIC_CUSTOM_MODEL_OPTION_NAME"] = "Pokee Isaac"
    env["ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION"] = (
        "Pokee Isaac via local router — text-only, ~128k context, no caching"
    )
    # Deliberately no ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY: the saved
    # claude.ai login stays the active credential for Anthropic models.
    return _exec_claude(argv, env)


def cmd_isaac(argv):
    """Claude Code with the whole agent loop on pokee-isaac."""
    port = _proxy_port()
    _ensure_proxy(port)
    env = os.environ.copy()
    # A real key would outrank the dummy token and break the session.
    env.pop("ANTHROPIC_API_KEY", None)
    env["ANTHROPIC_BASE_URL"] = "http://127.0.0.1:{}".format(port)
    env["ANTHROPIC_AUTH_TOKEN"] = "isaac-proxy"
    env["ANTHROPIC_MODEL"] = PICKER_MODEL
    for tier in ("HAIKU", "SONNET", "OPUS"):
        env["ANTHROPIC_DEFAULT_{}_MODEL".format(tier)] = PICKER_MODEL
    env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
    # Claude Code does not know pokee-isaac, so it assumes a 200k window and
    # auto-compacts against that. Isaac truncates over-limit input silently
    # instead of erroring, so the wrong number is lost context, not an error.
    # Only safe here: in picker mode the session may be on a Claude model.
    env.setdefault("CLAUDE_CODE_MAX_CONTEXT_TOKENS", str(ISAAC_CONTEXT_TOKENS))
    return _exec_claude(argv, env)


# --------------------------------------------------------------------------
# utility subcommands (unchanged behavior from the pre-package CLI)
# --------------------------------------------------------------------------

def cmd_doctor():
    try:
        config = client.load_config()
    except IsaacError as exc:
        print("FAIL: {}".format(exc))
        return 1

    masked = config["api_key"][:8] + "..." + config["api_key"][-4:]
    print("key:      {}".format(masked))
    print("endpoint: {}".format(config["api_url"]))
    print("model:    {}".format(config["model"]))
    print("pinging...")
    try:
        result = client.chat(
            [{"role": "user", "content": "Reply with exactly: OK"}],
            max_tokens=16,
            temperature=0,
            config=config,
        )
    except IsaacError as exc:
        print("FAIL: {}".format(exc))
        return 1
    print("reply:    {!r}".format(result["text"].strip()[:120]))
    print("OK — Isaac is reachable.")
    return 0


# Good enough to land near a target size; the server's reported prompt_tokens
# is what the measurement actually rests on.
CHARS_PER_TOKEN = 4

DEFAULT_PROBE_SIZES = (32000, 128000, 256000, 512000, 1000000)


def _estimate_cost(sizes):
    """(dollars, credits) for a probe ladder, on Pokee's published input rate.

    Credits are $0.01 and every request bills at least one, rounded up.
    """
    dollars = sum(sizes) * client.USD_PER_1M_INPUT / 1e6
    credits = sum(max(1, int(math.ceil(size * client.USD_PER_1M_INPUT / 1e6 / 0.01)))
                  for size in sizes)
    return dollars, credits


def _probe_messages(needle, target_tokens):
    """A prompt of roughly target_tokens with a needle pinned to the very front.

    Truncation drops the oldest tokens first, so the needle is the first thing
    to go — which is precisely what makes it a detector.
    """
    head = "NEEDLE={}\nRemember the NEEDLE value above.\n\n".format(needle)
    tail = ("\n\nWhat was the NEEDLE value at the very top of this message? "
            "Reply with only that value and nothing else.")
    line = "Filler line {:07d}: the quick brown fox jumps over the lazy dog.\n"

    budget = target_tokens * CHARS_PER_TOKEN - len(head) - len(tail)
    filler = []
    used = 0
    index = 0
    while used < budget:
        chunk = line.format(index)
        filler.append(chunk)
        used += len(chunk)
        index += 1
    return [{"role": "user", "content": head + "".join(filler) + tail}]


def _probe_once(target_tokens, config):
    needle = uuid.uuid4().hex[:8]
    messages = _probe_messages(needle, target_tokens)
    sent = len(messages[0]["content"]) // CHARS_PER_TOKEN

    row = {"target": target_tokens, "sent": sent, "recalled": False,
           "prompt_tokens": None, "error": None,
           "bytes": len(messages[0]["content"])}
    try:
        result = client.chat(messages, max_tokens=32, temperature=0, config=config)
    except IsaacError as exc:
        row["error"] = str(exc)
        return row

    row["recalled"] = needle in result["text"]
    row["prompt_tokens"] = (result.get("usage") or {}).get("prompt_tokens")
    return row


def _probe_verdict(row):
    """Two independent signals: did the needle survive, and how much did the
    server say it actually read?"""
    if row["error"]:
        blob = row["error"].lower()
        if "413" in blob or "too large" in blob or "request entity" in blob:
            # A gateway size cap, hit before the model's context ever mattered.
            # Reporting it as a context limit would understate the real window.
            return False, "request too large to upload — a size cap, not the context limit"
        if "timed out" in blob or "timeout" in blob:
            return False, "timed out — inconclusive, not evidence of a limit"
        # An explicit refusal is the honest failure mode: the limit is real,
        # but at least it is visible rather than silent.
        return False, "rejected by the API"

    counted = row["prompt_tokens"]
    if counted is not None and counted < row["sent"] * 0.7:
        return False, "server read only ~{:,} of ~{:,} tokens".format(counted, row["sent"])
    if not row["recalled"]:
        return False, "needle lost — input truncated silently"
    return True, "intact"


def cmd_probe_context(argv):
    """Measure the usable window instead of trusting a documented number."""
    sizes = list(DEFAULT_PROBE_SIZES)
    assume_yes = False
    rest = list(argv)
    while rest:
        flag = rest.pop(0)
        if flag == "--sizes" and rest:
            try:
                sizes = sorted({int(part.strip().replace("_", ""))
                                for part in rest.pop(0).split(",") if part.strip()})
            except ValueError:
                print("--sizes takes a comma-separated list of token counts")
                return 2
        elif flag in ("-y", "--yes"):
            assume_yes = True
        else:
            print("usage: claude-pokee probe-context [--sizes N,N,N] [--yes]")
            return 2

    if not sizes or min(sizes) < 1000:
        print("Sizes must be at least 1000 tokens.")
        return 2

    try:
        config = client.load_config()
    except IsaacError as exc:
        print("FAIL: {}".format(exc))
        return 1

    print("Probing {} with a needle-in-front prompt at {} size{}.".format(
        config["model"], len(sizes), "" if len(sizes) == 1 else "s"))
    dollars, credits = _estimate_cost(sizes)
    print("This sends ~{:,} input tokens upstream in total (~{:.1f} MB), "
          "costing roughly ${:.2f} — about {} credit{} at Pokee's published "
          "${:.2f}/1M input rate, which Pokee bills you for.".format(
              sum(sizes), sum(sizes) * CHARS_PER_TOKEN / 1e6, dollars, credits,
              "" if credits == 1 else "s", client.USD_PER_1M_INPUT))
    biggest_mb = max(sizes) * CHARS_PER_TOKEN / (1024 * 1024)
    if biggest_mb > 16:
        print("The largest request is ~{:.0f} MiB. Pokee requires streaming "
              "above 16 MiB (handled automatically) and refuses bodies over "
              "{} MiB outright; a 10M-token prompt can take ~7 minutes to "
              "serve.".format(biggest_mb, client.MAX_REQUEST_BYTES // (1024 * 1024)))
    if not assume_yes:
        try:
            answer = input("Continue? [y/N] ")
        except EOFError:
            answer = ""
        if answer.strip().lower() not in ("y", "yes"):
            print("Aborted.")
            return 1
    print()

    print("{:>12}  {:>12}  {:>12}  {}".format("requested", "sent~", "server read", "result"))
    largest_ok = None
    for size in sizes:
        row = _probe_once(size, config)
        ok, note = _probe_verdict(row)
        counted = row["prompt_tokens"]
        print("{:>12,}  {:>12,}  {:>12}  {} {}".format(
            size, row["sent"],
            "{:,}".format(counted) if counted is not None else "not reported",
            "OK  " if ok else "FAIL", note))
        if ok:
            largest_ok = size
        else:
            break  # windows do not come back once exceeded

    print()
    if largest_ok is None:
        print("Nothing survived intact — not even {:,} tokens. Check "
              "`claude-pokee doctor` first.".format(sizes[0]))
        return 1

    recommended = int(largest_ok * 0.9)
    if largest_ok == sizes[-1]:
        print("Every size held, so the real window is at least {:,} tokens — "
              "probe higher with --sizes to find the edge.".format(largest_ok))
    else:
        print("Largest size that survived intact: {:,} tokens.".format(largest_ok))
    print()
    print("Pin Claude Code to it, leaving headroom for the reply:")
    print("  export CLAUDE_CODE_MAX_CONTEXT_TOKENS={}".format(recommended))
    print()
    print("(all-Isaac mode currently defaults to {:,})".format(ISAAC_CONTEXT_TOKENS))
    return 0


def cmd_ask(argv):
    if not argv:
        print('usage: claude-pokee ask "your prompt" [--system S] [--max-tokens N]')
        return 2
    prompt = argv[0]
    system = None
    max_tokens = 8192
    rest = argv[1:]
    while rest:
        flag = rest.pop(0)
        if flag == "--system" and rest:
            system = rest.pop(0)
        elif flag == "--max-tokens" and rest:
            max_tokens = int(rest.pop(0))
        else:
            print("unknown option: {}".format(flag))
            return 2

    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    try:
        client.chat(
            messages,
            max_tokens=max_tokens,
            on_delta=lambda piece: (sys.stdout.write(piece), sys.stdout.flush()),
        )
    except IsaacError as exc:
        print("\nFAIL: {}".format(exc), file=sys.stderr)
        return 1
    print()
    return 0


def cmd_chat(argv):
    from . import chat_server

    chat_server.serve(port=int(argv[0]) if argv else 8766)
    return 0


def cmd_proxy(argv):
    from . import anthropic_proxy

    anthropic_proxy.serve(port=int(argv[0]) if argv else DEFAULT_PORT)
    return 0


def cmd_mcp():
    from . import mcp_server

    mcp_server.main()
    return 0


# --------------------------------------------------------------------------
# dispatch
# --------------------------------------------------------------------------

def main():
    argv = sys.argv[1:]

    if argv and argv[0] in ("help", "-h", "--help"):
        print(__doc__.strip())
        return 0
    if not argv:
        return cmd_run([])

    command, rest = argv[0], argv[1:]
    if command == "run":
        return cmd_run(rest)
    if command == "isaac":
        return cmd_isaac(rest)
    if command == "doctor":
        return cmd_doctor()
    if command == "probe-context":
        return cmd_probe_context(rest)
    if command == "ask":
        return cmd_ask(rest)
    if command == "chat":
        return cmd_chat(rest)
    if command == "proxy":
        return cmd_proxy(rest)
    if command == "mcp":
        return cmd_mcp()

    # Not one of ours — hand everything to claude (run mode), so flags like
    # -p / --resume / --model behave exactly as they do on plain `claude`.
    return cmd_run(argv)


if __name__ == "__main__":
    sys.exit(main())
