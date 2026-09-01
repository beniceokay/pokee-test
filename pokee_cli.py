#!/usr/bin/env python3
"""Checkout/plugin entry point — pip installs get the `claude-pokee` command.

Works without installation: inserts the repo root on sys.path and delegates
to claude_pokee.cli. The Claude Code plugin's MCP config and the project
.mcp.json both launch the MCP server through this file.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from claude_pokee.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
