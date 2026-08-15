# Changelog

## 0.1.0

- Initial release of the DeepSeek Harness **minimal** adapter for Pi.
- When the current model is DeepSeek V4 Pro (configurable), replace Pi's prompt and tool surface with the official dsh minimal pair:
  - system prompt: `You are a helpful software engineer assistant.`
  - tools: persistent `bash` + `str_replace_editor` (official names, descriptions, and JSON schemas)
- Settings UI via `/dsh`: enable/disable, use on all models, model trigger patterns, statusline.
- Default trigger is DeepSeek V4 Pro only. `/dsh all` applies the surface to every model.
