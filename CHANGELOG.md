# Changelog

## 0.2.0

- **V4 Pro is now anchored-standard, not permanent minimal.** Request #1 keeps the official two-tool surface (`bash` + `str_replace_editor`) and official persona. After the first durable assistant message or tool call (`promoteOn: either`, configurable), Pi's original tools are restored. The official persona stays. After compaction the session falls back to the two-tool bootstrap until a new promotion signal.
- **V4 Flash gets weak routing + mode-boost.** Default trigger `deepseek-v4-flash`. Persona is the measured Flash weak text (`Think deeply first, then produce.`). Near-field classify/converge guidance is appended to each real user message (rounds 1–2 base, 3+ boost; simple vs complex tails). Chat/greetings stand down. Tool schema is **not** narrowed — Flash is persona/guidance sensitive, not first-turn catalog sensitive.
- Settings: `/dsh promote`, `/dsh routing`, `/dsh flash-match` / `flash-unmatch`. Models tab lists Pro and Flash patterns separately.
- Config file gains `flashPatterns`, `promoteOn`, and `flashRouting`. Old files migrate with Flash defaults.

## 0.1.0

- Initial release of the DeepSeek Harness **minimal** adapter for Pi.
- When the current model is DeepSeek V4 Pro (configurable), replace Pi's prompt and tool surface with the official dsh minimal pair:
  - system prompt: `You are a helpful software engineer assistant.`
  - tools: persistent `bash` + `str_replace_editor` (official names, descriptions, and JSON schemas)
- Settings UI via `/dsh`: enable/disable, use on all models, model trigger patterns, statusline.
- Default trigger is DeepSeek V4 Pro only. `/dsh all` applies the surface to every model.
