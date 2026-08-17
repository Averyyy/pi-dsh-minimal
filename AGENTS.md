# AGENTS.md

This file is for agents working on **this repo**. Do not load the whole
`ref/` tree. Start here, then open only the path listed for the task.

Human-facing docs stay in `README.md` / `README.zh-CN.md`. This file is
the project memory: why the Pro profile exists, why the Flash profile
was removed, where the measured sources live, and what not to break.

## What this package is

A [Pi](https://pi.dev) extension. It remaps Pi's prompt/tool surface
when the current model is DeepSeek V4 Pro, the same way
`pi-codex-conversion` remaps Pi onto Codex tools when the model is GPT.

| Model | Profile in this repo | Intent |
| --- | --- | --- |
| **V4 Pro** | anchored-standard | Do not let Standard's rich tool catalog derail request #1. |
| **V4 Flash** | anchored-standard (v0.3.1 default) | Same bootstrap; DeepSWE A/B measured 9/10 vs 6/10 over Pi's stock surface. |

The npm name `pi-dsh-minimal` is historical (v0.1.0 was permanent
official-minimal). v0.2.0 added a Flash weak-routing profile; v0.3.0
removed it after a controlled A/B found no lift; v0.3.1 put flash on
the Pro anchored-standard path by default (`DEFAULT_MODEL_PATTERNS`
contains both models) after that path measured +30pp on flash.

Default triggers: `deepseek-v4-pro` and `deepseek-v4-flash` → Pro
profile. `useOnAllModels` sends unknown models through Pro. Everything
else is inactive — untouched Pi surface.

## Background

DeepSeek V4 Pro's model card evaluates code-agent tasks on DeepSeek
Harness **minimal** (极简模式). Community measurements show V4 Pro
overfits the **API-visible first-request surface**:

- complete system prompt = `You are a helpful software engineer assistant.`
- tool catalog = persistent `bash` + `str_replace_editor` (official schemas)

On that surface the first thinking line is typically **We need…** /
**I need…**. On a Standard-family catalog it falls into **Let me…**.
Once request #1 has committed, later catalog expansion does not flip
the trajectory. So Pro's job is: **don't let the first step go down
the wrong track**.

V4 Flash was a different hypothesis, and it failed score-level
validation. Flash is much less sensitive to tool schema (even Minimal
persona + full Standard tools stays minimal-like) and upstream probes
showed persona/guidance sensitivity (routing %, reasoning depth,
convergence) — but those were micro-task probes with fixture tools.
Two findings killed the Flash path (v0.3.0 removal):

1. **Our controlled DeepSWE A/B** (2026-08-16; scripts under
   `scripts/deepswe/`, data in `runs/deepswe/RESULTS.md`): 10 official
   tasks × extension on/off, same pi agent + opencode-go flash,
   official verifier. 4/11 vs 5/10 solved, p=1.0. Activation verified
   per run; failures were ordinary wrong-implementations. No signal.
2. **Upstream P21**: near-field guidance is *negative* on related-task
   chains (46% vs 63% route) — real SWE sessions are related chains.
   Upstream's own P2/P9 note simple tasks saturate; hard-task
   score-level validation was never done anywhere.

Baseline sanity from the same A/B: pi + flash without the extension
solved 50% of the subset vs the official DeepSWE v1.1 leaderboard's
53% — so the harness was measuring at the right absolute level.

**2026-08-16 addendum — the Pro minimal path DOES lift Flash.**
A follow-up A/B (same harness; `runs/deepswe/RESULTS-flash-propath.md`)
forced flash through the Pro anchored-standard profile
(`useOnAllModels: true`): **9/10 solved (mean partial 1.000) vs 6/10
baseline** (+30pp, discordant pairs 3-0, McNemar p=0.25; every plugin
solve was full-score). etree / fd / ts-pattern were first-ever flash
solves. Unlike the removed weak-routing path, the Pro bootstrap has no
near-field guidance text — the P21 negative mechanism does not apply.
Open caveat: single sample, 10 tasks; replicate before hard claims.
This contradicts the older "anchored Standard does not raise Flash
score" row below (that came from Project2-style measurements).

Remember:

| | **V4 Pro** | **V4 Flash** |
| --- | --- | --- |
| First-turn tool-schema anchor | Decisive | Positive signal on DeepSWE (9/10 vs 6/10, see addendum above; replicate before trusting) |
| Anchored Standard | Strongest evidence (Project2 ~91 → 98/99) | DeepSWE: +30pp single-run signal (2026-08-16); older Project2-style data said no |
| Persona / weak self-routing | Useful but unstable | Removed in v0.3.0 — no DeepSWE lift, negative on related chains |
| Proven task lift | 91 → 98/99 | Pro path on flash: 9/10 vs 6/10 (unreplicated); weak routing: none |

**Do not re-add a Flash persona/guidance path without new score-level
evidence on a real benchmark** (probe-level route % / convergence is
not enough — that is exactly the mistake v0.2.0 made).

## Progressive disclosure — refs

`ref/` is a **local, gitignored** checkout. It is not published. If a
path is missing, clone it; do not vendor the monorepo into git.

Open **one** row. Do not browse `ref/deepseek-harness` unless the
task is official schema/string identity.

| When you are changing… | Open first | Then, only if needed |
| --- | --- | --- |
| Anything | this file + `README.md` | `CHANGELOG.md`, `NOTICE` |
| Official minimal prompt / bash / editor schema or result strings | `src/dsh/official.ts` | `ref/deepseek-harness/apps/cli/config/agent-presets/minimal/` (pinned `47f9438`) |
| Pro bootstrap → promote / what lands in the system prompt | `src/adapter/promotion.ts`, `src/adapter/prompt.ts`, `src/adapter/activation.ts` | official minimal: `ref/deepseek-harness/apps/cli/config/agent-presets/minimal/agent.cordis.yml` (`complete: true`, no `dsh-agent-instructions` / `dsh-tool-skill`). Do not treat `ref/dsh-anchored-standard` as official minimal. |
| Flash removal evidence / re-adding a Flash path | `runs/deepswe/RESULTS.md` (local), `CHANGELOG.md` v0.3.0 | `ref/dsh-routing-suite/preset/docs/experiments.md` (P21/P2/P9/P8-Flash) |
| Settings TUI / `/dsh` | `src/settings/ui.ts`, `src/settings/command.ts` | `ref/pi-codex-conversion/src/codex-settings/` (interaction pattern only) |
| Provider payload rewrite | `src/adapter/payload-rewrite.ts` | Pi `before_provider_request` types under `node_modules/@earendil-works/pi-coding-agent` |
| Live trajectory / promote checks | `scripts/live-*.mjs` | isolated `PI_CODING_AGENT_DIR` dumps |
| DeepSWE A/B harness (local) | `scripts/deepswe/` | `ref/deep-swe/tasks/` + verifier per task |

Remote counterparts (same content as `ref/` when cloned):

- DeepSeek Harness (official minimal source): https://github.com/deepseek-ai/deepseek-harness @ `47f9438`
- Pro two-phase: https://github.com/xiaobright/dsh-anchored-standard
- Flash suite (injector + router + mode-boost): https://github.com/yjh051108/dsh-routing-suite
  - https://github.com/yjh051108/dsh-router-standard
  - https://github.com/yjh051108/dsh-mode-boost
- Settings UI analogue: https://github.com (local) `ref/pi-codex-conversion`
- HF card (why minimal is the Pro eval surface): https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813

`dsh-routing-suite` uses git submodules. Empty `ref/dsh-routing-suite/{preset,mode-boost,injector}` means they were not inited:

```sh
git -C ref/dsh-routing-suite submodule update --init --recursive
```

## Layout (this repo)

```
src/index.ts                 hooks + dump
src/adapter/                 profile, promotion, payload, prompt compose, config
src/dsh/official.ts          official minimal strings/schemas (byte-stable)
src/tools/                   persistent bash + str_replace_editor
src/settings/                /dsh TUI
tests/                       unit tests (no live model)
scripts/live-*.mjs           isolated live checks
scripts/deepswe/             local DeepSWE A/B harness (not published)
```

Config file at runtime: `~/.pi/agent/pi-dsh-minimal.json`.

## Notes and cautions

- **Official strings are the product.** `MINIMAL_PROMPT`, official bash /
  `str_replace_editor` descriptions and JSON schemas, and editor result
  strings were measured as written. Do not “improve” the wording. No
  `strict`, no `additionalProperties` on the official two-tool wire schemas.
- **Pro request #1 must stay official minimal.** Wire surface =
  `MINIMAL_PROMPT` + persistent `bash` + `str_replace_editor`. Official
  DSH minimal (`complete: true`, `includeRuntimeContext: false`) does
  **not** mount AGENTS.md or the skill catalog — do not put those on
  request #1. Restoring Pi tools (`read` / `edit` / `write` / …) or Pi
  identity (`You are an expert coding assistant operating inside pi…`)
  too early is the failure mode this package exists to prevent.
- **Request #1 blocking other extensions is the intended tradeoff.**
  The *model* must not see hermes / hypa / MCP / skill-catalog additions
  on the first provider request. That cannot be fixed without breaking
  the measured anchor. Compensation is the promote step, not leaking
  context into request #1. Bootstrap wipe is **wire-only**
  (`before_provider_request`): do not `return { systemPrompt: MINIMAL_PROMPT }`
  from `before_agent_start`, or later extensions' chained appends are
  discarded before promote can reanchor them.
- **Promote on `either` (default):** first durable assistant message
  **or** first tool call. Compaction starts a new bootstrap epoch.
  There is no extra notify message — the next provider request is the
  notify (new tools + reanchored system).
- **On the same request that opens Pi tools:** keep the official
  persona as the first sentence. Reanchor Pi's already-assembled
  prompt (do not rebuild a private one and drop other extensions).
  Restore tools-guide, Pi docs paths, `<project_context>` (global +
  project AGENTS.md / CLAUDE.md), and `<available_skills>`. Leave
  later-extension appends (pi-hypa, pi-hermes-memory, …) in place.
  Do **not** restore Pi's identity paragraph.
- **Compaction does not eat the promote injections.** Those live in
  the per-request system prompt, not in conversation messages. Pi
  summarizes the dialogue only. After `session_compact` we bootstrap
  again; the next promote re-injects workspace / docs / extension
  appends from a fresh `before_agent_start` chain. Same-turn promote
  (first reply already has a tool call) reanchors whatever was chained
  this turn and fills AGENTS.md / skills / tools-guide if missing.
- **Given the request-#1 constraint, this is the practice to keep.**
  Do not stuff AGENTS.md / skills into the official persona on
  request #1. Do not leave the session on the one-liner after
  promote. Do not invent a Flash persona/guidance path. Do not move
  the bootstrap wipe back into `before_agent_start`.
- **The promoted tools-guide must be rebuilt from the live catalog.**
  `before_agent_start` captures `promptResources` at bootstrap time, when
  `toolSnippets` are sparse/empty; reusing that snapshot on the promote
  request made `formatToolsGuide` render `(none)` for the rest of the
  current task (0.4.1 regression, fixed by `toolResourcesFromLiveTools` + a
  `pi.getAllTools()` refresh inside `composeCurrentPrompt`). Until the next
  fresh agent start, the only re-anchor happens per provider request, so the
  promote path must source toolSnippets/promptGuidelines live — not from the
  bootstrap snapshot.
- **Flash runs the Pro bootstrap (v0.3.1 default).** The v0.2.x weak
  persona + near-field guidance was removed in v0.3.0 (no DeepSWE lift;
  negative on related chains — see Background). Flash now matches
  `modelPatterns` by default; opt out per user via
  `/dsh unmatch deepseek-v4-flash`. Do not re-add a persona/guidance
  path without score-level evidence on a real benchmark.
- **Prompt-surface vs internals.** Tool names, descriptions, and
  schemas are model-facing. Treat edits as prompt changes, not
  refactors.
- **`str_replace_editor` needs absolute paths.** Match dsh. Bootstrap
  `bash` is persistent (`cd` / `export` survive until promote, reset,
  or 300s timeout).
- **Live thinking style is variance-prone** on unofficial transports
  (e.g. opencode-go). A single `Let me…` first line is not enough to
  declare the surface broken if the dump still shows official persona +
  two tools. Re-run `npm run live:trajectory`. Prefer an edit-existing-
  file task over “create a file”.
- **`ref/` and `.env` are not in git.** Do not commit harness clones or
  tokens. `.env` may hold `NPM_TOKEN`; never print it.
- **Publish** is npm public `pi-dsh-minimal` plus GitHub
  `Averyyy/pi-dsh-minimal` and the pi.dev catalog (indexes npm). Only
  publish when the user asks. `prepack` runs `npm run check`.
- Community project. Not affiliated with DeepSeek or Pi.

## Commands

```sh
npm test
npm run typecheck
npm run check                 # typecheck + test; also runs as prepack
npm run live:trajectory       # Pro first-turn We/I need
npm run live:promote          # Pro request #1 two tools, later Pi tools
```

`PI_DSH_MINIMAL_DUMP` appends one JSON line per provider request
(`profile`, `promoted`, `toolNames`, `system`, `lastUser`).
