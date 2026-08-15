# pi-dsh-minimal

[中文说明](./README.zh-CN.md)

A [Pi](https://pi.dev) extension that maps Pi onto the official
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **minimal**
agent preset (极简模式).

This is a community project. It is not an official DeepSeek or Pi preset and is
not affiliated with or endorsed by DeepSeek.

## Why

The DeepSeek V4 Pro model card evaluates code-agent tasks with DeepSeek
Harness **minimal mode**. Community measurements (see
[`dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard))
show V4 Pro overfits the API-visible surface:

- complete system prompt = `You are a helpful software engineer assistant.`
- tool catalog = persistent `bash` + `str_replace_editor` with the official
  schemas

On that surface the first reasoning line is typically `We need…` / `I need…`.
On a standard-family tool catalog it falls into `Let me…`.

`pi-codex-conversion` remaps Pi's tools to Codex tools when the model is GPT.
This package does the same kind of remapping for DeepSeek: when the model is
DeepSeek V4 Pro, Pi's prompt and tools become the official dsh minimal
surface.

This is **permanent** minimal mode (the HF eval setup), not the two-phase
"anchor then promote to Standard" preset.

## What it changes

When the adapter is active:

| Surface | Official minimal |
| --- | --- |
| System prompt | Exactly `You are a helpful software engineer assistant.` (`complete: true`). Pi's identity, tools guide, AGENTS.md digest, skills reminder, and date/runtime context are stripped. |
| Tools | Exactly `bash` + `str_replace_editor`. Wire schemas match dsh (no `strict`, no `additionalProperties`). |
| `bash` | Persistent shell. cwd and exported environment survive across calls. |
| `str_replace_editor` | Official `view` / `create` / `str_replace` / `insert` over absolute paths. |
| Compaction | Pi's host compaction is left alone. The preset itself mounts no compaction plugin. |

When the adapter is inactive, Pi's original tools and prompt are restored.

## Default trigger

The adapter is **on** by default, but only when the current model name/id
matches **DeepSeek V4 Pro** (`deepseek-v4-pro`, `DeepSeek V4 Pro`,
`deepseek-v4-pro-0813`, …). `deepseek-v4-flash` does not match.

Change this in the TUI or with `/dsh`.

## Install

```sh
pi install npm:pi-dsh-minimal
```

From git:

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

Restart Pi (or `/reload`). Create a new session and select DeepSeek V4 Pro.

Local checkout:

```sh
pi -e /path/to/pi-dsh-minimal
```

## Settings

`/dsh` opens a settings screen (same idea as `/codex` in
`pi-codex-conversion`):

| Tab | What |
| --- | --- |
| General | Enable, **use on all models**, statusline |
| Models | Trigger patterns. Default: `deepseek-v4-pro`. Add the current model, or remove a pattern. |
| About | GitHub / changelog / model card / issues |

Commands:

```
/dsh                 open settings
/dsh on|off          master switch
/dsh all             toggle "use on all models"
/dsh status          toggle statusline
/dsh models          open the Models tab
/dsh match <pat>     add a trigger pattern
/dsh unmatch <pat>   remove a trigger pattern
```

Config file: `~/.pi/agent/pi-dsh-minimal.json`.

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro"]
}
```

## Verify

1. Enable the extension and select DeepSeek V4 Pro.
2. Ask a small coding task (`Create /tmp/dsh-min.txt containing hello`).
3. The thinking block should open with `We need…` / `I need…`, not `Let me…`.
4. The model should only call `bash` and `str_replace_editor`.

Set `PI_DSH_MINIMAL_DUMP=/tmp/dsh-minimal-request.json` to write the rewritten
system prompt and tool names from the first provider request.

```sh
npm test
npm run live:trajectory   # needs a configured DeepSeek V4 Pro model
```

## Important behavior

- The first request is what selects the trajectory. Tool **schema identity**
  is the decisive variable; this package rewrites the provider payload so the
  model sees the official two-tool catalog even if TypeBox would have added
  `strict` or `additionalProperties`.
- `bash` is a persistent process, not Pi's one-shot bash. `cd` and `export`
  stick until the session ends or a command times out (300s) and the shell is
  reset.
- `str_replace_editor` requires **absolute** paths, matching dsh.
- Other prompt-rewriting extensions can still fight over `before_agent_start`.
  The payload rewrite is the last line of defense for the wire request.
- The extension performs no network requests and adds no telemetry.
- Review the files before installing. Persistent bash has the same trust
  level as Pi's built-in shell.

## License

MIT. Tool descriptions, schemas, and editor result strings are derived from
DeepSeek Harness (MIT). See [NOTICE](./NOTICE).
