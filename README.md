# pi-dsh-minimal

[中文说明](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/pi-dsh-minimal.svg)](https://www.npmjs.com/package/pi-dsh-minimal)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-111111)](https://pi.dev/packages/pi-dsh-minimal)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A [Pi](https://pi.dev) extension that maps DeepSeek V4 models onto the
measured [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
surfaces:

| Model | Profile | What it does |
| --- | --- | --- |
| **V4 Pro** | [anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | First request: official two-tool schema. Later turns: restore Pi's original tools. |
| **V4 Flash** | [router-standard weak](https://github.com/yjh051108/dsh-router-standard) + [mode-boost](https://github.com/yjh051108/dsh-mode-boost) | Weak self-routing persona + near-field classify/converge guidance. Tools stay Pi's. |

> V4 Pro overfits the **first-request tool schema**. Official minimal
> (`bash` + `str_replace_editor`) opens with **We need…** / **I need…**;
> a rich catalog opens with **Let me…**. After that first request the
> trajectory stays put, so later turns can take Pi's full tools back.
>
> V4 Flash is **not** schema-sensitive in the same way. It responds to
> persona + guidance: task classification and deep-but-converge. Two-tool
> anchoring is the wrong knob.

```sh
pi install npm:pi-dsh-minimal
```

This is a community project. It is not an official DeepSeek or Pi preset and is
not affiliated with or endorsed by DeepSeek.

## V4 Pro — anchored-standard

Default trigger: model name/id contains `deepseek-v4-pro`
(`deepseek-v4-flash` does **not** match this profile).

| Phase | When | Surface |
| --- | --- | --- |
| Bootstrap (request #1) | New session, or first request after compaction | System prompt = `You are a helpful software engineer assistant.` Tools = official persistent `bash` + `str_replace_editor`. |
| Promoted (later requests) | First durable **assistant message** or **tool call** (`promoteOn: either`) | Same official persona. **Pi's original tools** are restored. |
| After compaction | `session_compact` | Falls back to bootstrap until a new promotion signal. |

`/dsh promote either|tool-call|assistant-message` changes the signal.
`tool-call` keeps the session on two tools if the first reply is text-only.

## V4 Flash — weak + mode-boost

Default trigger: model name/id contains `deepseek-v4-flash`.

| Piece | Behavior |
| --- | --- |
| Persona | Measured Flash weak text: classify build vs fix, recall/anti-runaway anchors, `Think deeply first, then produce.` |
| Tools | **Unchanged.** Flash does not get the two-tool first-turn clamp. |
| Guidance | Appended to each real user message. Rounds 1–2: classify. Round 3+: "this is a NEW task, classify fresh". Simple tasks get a fast-commit tail; complex tasks get a directed deep tail (no decision-closure suffix on Flash). |
| Chat stand-down | `你好` / `hello` / short non-tasks: no persona swap, no guidance. |
| Routing | Default `weak` (model self-classifies). `/dsh routing auto` uses the keyword classifier; `spec` / `react` force a band. |

## Install

```sh
pi install npm:pi-dsh-minimal
```

From git:

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

Restart Pi (or `/reload`). New session, pick DeepSeek V4 Pro or V4 Flash.

Local checkout:

```sh
pi -e /path/to/pi-dsh-minimal
```

## Settings

`/dsh` opens a settings screen (same idea as `/codex` in
`pi-codex-conversion`):

| Tab | What |
| --- | --- |
| General | Enable, use on all models, Pro promote-on, Flash routing, statusline |
| Models | Pro patterns (default `deepseek-v4-pro`) and Flash patterns (default `deepseek-v4-flash`) |
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
/dsh flash-match <pat>    add a Flash trigger
/dsh flash-unmatch <pat>  remove a Flash trigger
/dsh promote either|tool-call|assistant-message
/dsh routing weak|auto|spec|react
```

Config file: `~/.pi/agent/pi-dsh-minimal.json`.

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro"],
  "flashPatterns": ["deepseek-v4-flash"],
  "promoteOn": "either",
  "flashRouting": "weak"
}
```

Statusline: `dsh anchored` while Pro is bootstrapping, `dsh anchored • promoted`
after the catalog opens, `dsh flash` on Flash.

## Verify

**Pro**

1. Enable the extension and select DeepSeek V4 Pro.
2. Ask a small edit (`main.py` prints hello; change it to world).
3. The first thinking block should open with `We need…` / `I need…`, not `Let me…`.
4. The first request should only expose `bash` and `str_replace_editor`.
5. After the first assistant reply or tool call, later requests see Pi's original tools.

**Flash**

1. Select DeepSeek V4 Flash.
2. A real coding task should get the weak Flash persona plus a `Router: classify this task…` tail.
3. `你好` should leave Pi's prompt and tools alone.

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
- After promotion, only the official persona is still forced. Tools go back to
  whatever Pi had (typically `read` / `bash` / `edit` / `write` / …).
- During bootstrap, `bash` is a persistent process. `cd` and `export` stick
  until promotion, session end, or a 300s timeout reset.
- `str_replace_editor` requires **absolute** paths, matching dsh.
- Flash guidance is injected in the `context` hook (near-field, not a second
  visible user turn).
- The extension performs no network requests and adds no telemetry.

## Related

| Project | Host | Surface |
| --- | --- | --- |
| [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | DeepSeek Harness | Two-phase: minimal bootstrap, then Standard tools |
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) | DeepSeek Harness | Flash weak routing + mode-boost |
| [pi-deepseek-anchor](https://github.com/kxh4892636/pi-deepseek-anchor) | Pi | Port of the two-phase preset |
| [pi-dsh](https://github.com/fatwang2/pi-dsh) | Pi | Runs DSH as a provider inside Pi |
| **pi-dsh-minimal** | Pi | Pro anchored-standard + Flash weak/mode-boost |

## License

MIT. Tool descriptions, schemas, editor result strings, and Flash routing
texts are derived from DeepSeek Harness / dsh-anchored-standard /
dsh-mode-boost (MIT). See [NOTICE](./NOTICE).
