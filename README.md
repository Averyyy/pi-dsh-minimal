# pi-dsh-minimal

[中文说明](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/pi-dsh-minimal.svg)](https://www.npmjs.com/package/pi-dsh-minimal)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-111111)](https://pi.dev/packages/pi-dsh-minimal)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Measured on DeepSWE (2026-08-16)

Full 113-task [DeepSWE v1.1](https://deepswe.datacurve.ai/) run: pi agent in
the official task containers, `opencode-go/deepseek-v4-flash:max`, v0.3.1
defaults, official task verifiers.

| Configuration | Solved | Note |
| --- | --- | --- |
| **V4 Flash + this extension — all 113 tasks** | **69/113 = 61.1%** | median 24 min/task |
| Official leaderboard `deepseek-v4-flash [max]` | 53% | mini-swe-agent harness |
| Official leaderboard `deepseek-v4-pro [max]` | 63% | ~2.4× the cost |
| pi stock Flash, no extension (pooled, n=26) | 15/26 = 57.7% | internal reference |

Reading: **+8pp over the official Flash leaderboard number**, within 2pp of
V4 Pro (69/112 = 61.6% excluding the single 90-min timeout task). Against pi's own stock surface the aggregate lift is smaller
(~+3pp, noise-level at n=26; the initial 10-task paired A/B measured 9/10
vs 6/10 but did not scale up — treat it as an optimistic sample). Failure
profile: 32 of 44 misses are within 1-5 tests of passing; only 4 total
collapses and 1 timeout. Caveats: single sample; the agent container had
network access (7/113 runs fetched upstream repos — excluding them all:
61.3%; worst-case treating their 4 solves as tainted: 57.5%, still above
53%). Full data: `runs/deepswe/RESULTS-full.md`.

## What it is

A [Pi](https://pi.dev) extension that maps DeepSeek V4 models onto the
measured [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
surface:

| Model | Profile | What it does |
| --- | --- | --- |
| **V4 Pro** | [anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | First request: official two-tool schema. Later turns: restore Pi's original tools. |
| **V4 Flash** | anchored-standard (since v0.3.1) | Same bootstrap — 61.1% on the full DeepSWE v1.1 set vs the official Flash leaderboard's 53%. |

> V4 Pro overfits the **first-request tool schema**. Official minimal
> (`bash` + `str_replace_editor`) opens with **We need…** / **I need…**;
> a rich catalog opens with **Let me…**. After that first request the
> trajectory stays put, so later turns can take Pi's full tools back.
>
> **The v0.2.x Flash weak-routing profile was removed in v0.3.0** — it
> measured no lift on the same harness (table above), and upstream's own
> P21 data shows its near-field guidance is negative on related-task
> chains. The anchored-standard bootstrap has no guidance text, so that
> failure mode does not apply; v0.3.1 turned it on for Flash by default.

```sh
pi install npm:pi-dsh-minimal
```

This is a community project. It is not an official DeepSeek or Pi preset and is
not affiliated with or endorsed by DeepSeek.

## V4 Pro / V4 Flash — anchored-standard

Default trigger: model name/id contains `deepseek-v4-pro` or
`deepseek-v4-flash` (both since v0.3.1). All other models are untouched
unless `useOnAllModels` is on. Opt Flash out with
`/dsh unmatch deepseek-v4-flash`.

| Phase | When | Surface |
| --- | --- | --- |
| Bootstrap (request #1) | New session, or first request after compaction | System prompt = `You are a helpful software engineer assistant.` Tools = official persistent `bash` + `str_replace_editor`. No AGENTS.md, no skill catalog. |
| Promoted (later requests) | First durable **assistant message** or **tool call** (`promoteOn: either`) | Official first sentence only — Pi identity stays out. Same request restores Pi tools, tools-guide, docs paths, `<project_context>`, `<available_skills>`, and other extensions' prompt additions. |
| After compaction | `session_compact` | Falls back to bootstrap until a new promotion signal. |

`/dsh promote either|tool-call|assistant-message` changes the signal.
`tool-call` keeps the session on two tools if the first reply is text-only.

## Why the v0.2.x Flash profile was removed

v0.2.0 ported dsh-routing-suite's weak routing + mode-boost (persona swap +
`Router: classify this task…` guidance). Removal evidence, in order of
weight:

1. **Controlled DeepSWE A/B** (2026-08-16): 10 official DeepSWE v1.1 tasks ×
   extension on/off, same pi agent + `opencode-go/deepseek-v4-flash:max`,
   official verifier grading. Solved 4/11 (on) vs 5/10 (off), mean partial
   0.810 vs 0.901, McNemar p=1.0. Plugin activation was verified per run;
   failure autopsies showed ordinary wrong-implementations, not guidance
   pathology — i.e. no signal, not a broken port.
2. **Upstream's own related-chain data** (dsh-routing-suite P21): near-field
   guidance is *negative* on same-file evolution chains (deep 46% vs baseline
   63%) because it steers toward classification instead of reading existing
   code. Real SWE sessions are exactly that shape.
3. **Probe-vs-score gap**: all published Flash "lifts" (route %, reasoning
   depth, convergence) are micro-task probes with fixture tools; upstream's
   own P2/P9 note simple tasks saturate and score-level validation on hard
   tasks was never done.

Baseline sanity: pi without the extension solved 50% of the subset vs the
official DeepSWE v1.1 leaderboard's 53% for `deepseek-v4-flash [max]`
(mini-swe-agent harness) — so the no-lift reading is not a harness artifact.

## Install

```sh
pi install npm:pi-dsh-minimal
```

From git:

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

Restart Pi (or `/reload`). New session, pick DeepSeek V4 Pro.

Local checkout:

```sh
pi -e /path/to/pi-dsh-minimal
```

## Settings

`/dsh` opens a settings screen (same idea as `/codex` in
`pi-codex-conversion`):

| Tab | What |
| --- | --- |
| General | Enable, use on all models, Pro promote-on, statusline |
| Models | Pro patterns (default `deepseek-v4-pro`) |
| About | GitHub / changelog / model card / issues |

Commands:

```
/dsh                      open settings
/dsh on|off               master switch
/dsh all                  toggle "use on all models" (unknown models → Pro profile)
/dsh status               toggle statusline
/dsh models               open the Models tab
/dsh match <pat>          add a Pro trigger
/dsh unmatch <pat>        remove a Pro trigger
/dsh promote either|tool-call|assistant-message
```

Config file: `~/.pi/agent/pi-dsh-minimal.json`.

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro", "deepseek-v4-flash"],
  "promoteOn": "either"
}
```

(`flashPatterns` / `flashRouting` from v0.2.x configs are ignored.)

Statusline: `dsh anchored` while Pro is bootstrapping, `dsh anchored • promoted`
after the catalog opens.

## Verify

**Pro**

1. Enable the extension and select DeepSeek V4 Pro.
2. Ask a small edit (`main.py` prints hello; change it to world).
3. The first thinking block should open with `We need…` / `I need…`, not `Let me…`.
4. The first request should only expose `bash` and `str_replace_editor`. The system prompt should be exactly the official one-liner.
5. After the first assistant reply or tool call, later requests see Pi's original tools, and the skill catalog if `read` is on.

**Flash**

Identical bootstrap to Pro (first request: two tools + official persona;
promotion after the first assistant message/tool call). `/dsh unmatch
deepseek-v4-flash` opts Flash out entirely.

Set `PI_DSH_MINIMAL_DUMP=/tmp/dsh-minimal-request.json` to write the rewritten
surface (includes `profile` and `promoted`).

```sh
npm test
npm run live:trajectory   # needs a configured DeepSeek V4 Pro model
```

## Important behavior

- Pro's **first request** is what selects the trajectory. Tool **schema identity**
  is the decisive variable; this package rewrites the provider payload so the
  model sees the official two-tool catalog even if TypeBox would have added
  `strict` or `additionalProperties`.
- After promotion, the official persona stays the **first sentence**. The
  same request restores Pi tools, tools-guide, docs paths, AGENTS.md, and
  the skill catalog, and keeps other extensions' system-prompt additions.
  Pi identity is not restored.
- During bootstrap, `bash` is a persistent process. `cd` and `export` stick
  until promotion, session end, or a 300s timeout reset.
- `str_replace_editor` requires **absolute** paths, matching dsh.
- The extension performs no network requests and adds no telemetry.

## Related

| Project | Host | Surface |
| --- | --- | --- |
| [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | DeepSeek Harness | Two-phase: minimal bootstrap, then Standard tools |
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) | DeepSeek Harness | Flash weak routing + mode-boost (source of the removed v0.2.0 Flash profile) |
| [pi-deepseek-anchor](https://github.com/kxh4892636/pi-deepseek-anchor) | Pi | Port of the two-phase preset |
| [pi-dsh](https://github.com/fatwang2/pi-dsh) | Pi | Runs DSH as a provider inside Pi |
| **pi-dsh-minimal** | Pi | Pro anchored-standard |

## License

MIT. Tool descriptions, schemas, and editor result strings are derived from
DeepSeek Harness / dsh-anchored-standard (MIT). See [NOTICE](./NOTICE).
