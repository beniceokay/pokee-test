---
description: Delegate a single-file build to Pokee Isaac, then verify the result
argument-hint: [what to build]
allowed-tools: mcp__isaac__build, mcp__isaac__iterate, mcp__isaac__ask, mcp__isaac__health, Read, Bash(open:*), Bash(ls:*), Bash(wc:*)
---

Build this with Pokee Isaac: **$ARGUMENTS**

You are the director; Isaac is the generator. Do not write the artifact
yourself — your job is to write a spec good enough that Isaac gets it right,
then check the result and drive the iterations.

## 1. Write the spec

Expand the request above into a detailed spec before calling anything. Isaac's
output quality tracks directly with spec quality, so include all four:

- **A role.** Open with a persona: "You are a senior game developer with 20
  years of experience shipping award-winning indie games."
- **Explicit mechanics.** Name every system: movement, combat, progression,
  UI, win/lose states. Vague specs produce vague artifacts.
- **A quality bar.** "Make it gorgeous — polished animations, cohesive
  palette, professional-grade feel."
- **"Think step by step about the architecture, then implement it."**

The single-file/offline-first constraint is already in the tool's default
system prompt — do not repeat it unless you are overriding `system`.

## 2. Build

Call `mcp__isaac__build` with that spec and an `out_path` like
`builds/<short-name>.html`. It writes straight to disk and returns only a path,
size and preview — never paste the file contents into the conversation.

If the tool reports the result was truncated, call `mcp__isaac__iterate` with
"finish the incomplete sections" rather than rebuilding from scratch.

## 3. Verify

Read the first ~60 lines of the output file and confirm:
- it opens with `<!DOCTYPE html>` and is a complete document
- no CDN `<script src="http...">` or `<link href="http...">` — grep for `src="http` and `href="http`
- no placeholder comments like `// rest of the code` or `TODO`

Report the file path, size, and anything that looks off. Offer to open it with
`open <path>`; do not open it unless asked.

## 4. Iterate

Isaac's first draft is a starting point — the guide is explicit that quality
jumps at 2-3 iterations. After reporting, suggest two or three concrete
refinements ("turn-based combat with status effects", "add a skill tree with
three branches") and run them through `mcp__isaac__iterate` if the user agrees.
