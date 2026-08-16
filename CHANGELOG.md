# Changelog

## 0.3.1

- **V4 Flash now runs the Pro anchored-standard profile by default.**
  `DEFAULT_MODEL_PATTERNS` is `["deepseek-v4-pro", "deepseek-v4-flash"]`.
  Measured basis (controlled DeepSWE v1.1 A/B, same pi agent +
  `opencode-go/deepseek-v4-flash:max`, official verifier, 10 tasks):
  flash through the Pro bootstrap solved **9/10 (mean partial 1.000) vs
  6/10 (0.989)** without it — discordant pairs 3-0, first-ever flash
  solves on etree / fd / ts-pattern. Opt out with
  `/dsh unmatch deepseek-v4-flash`. Existing v0.3.0 config files keep
  their patterns; add the flash pattern (or `/dsh all`) to opt in.
- **Full 113-task run** (v0.3.1 defaults): **69/113 = 61.1%** — +8pp over
  the official `deepseek-v4-flash [max]` leaderboard number (53%), within
  2pp of `deepseek-v4-pro` (63%) at ~40% of its cost; 69/112 = 61.6%
  excluding the single 90-min timeout. Badcase profile: 32/44 misses
  within 1-5 tests of passing. Caveats: single sample; agent container had
  network (7/113 runs fetched upstream — excluding them all: 61.3%).
  Harness scripts: `scripts/deepswe/`; data: `runs/deepswe/` (local).
- The v0.2.x weak-routing Flash profile stays removed (0.3.0): the same
  harness measured no lift for it (4/11 vs 5/10) and upstream P21 shows
  its near-field guidance is negative on related-task chains. The Pro
  bootstrap has no guidance text, so that mechanism does not apply.

## 0.3.0

- **Removed the V4 Flash weak-routing + mode-boost profile.** `deepseek-v4-flash`
  (and every model not matching the Pro patterns) now resolves to `inactive`:
  no persona swap, no guidance, Pi's stock surface. Rationale, in order of weight:
  - **Controlled DeepSWE A/B** (2026-08-16): 10 official DeepSWE v1.1 tasks ×
    extension on/off; same pi agent + `opencode-go/deepseek-v4-flash:max`;
    official verifier grading. On: 4/11 solved, mean partial 0.810. Off: 5/10
    solved, mean partial 0.901. McNemar p=1.0. Activation was verified in every
    plugin run (flash profile, Pi tools, guidance present); failure autopsies
    showed ordinary wrong-implementations, not guidance pathology. No signal,
    not a broken port. Baseline sanity: pi without the extension solved 50% of
    the subset vs the official leaderboard's 53% for `deepseek-v4-flash [max]`.
  - **Upstream P21** (dsh-routing-suite): near-field guidance is negative on
    related-task chains (deep 46% vs baseline 63% route); real SWE sessions are
    related chains.
  - **Probe-vs-score gap**: published Flash lifts (route %, reasoning depth,
    convergence) are micro-task probes with fixture tools; upstream's own P2/P9
    note simple tasks saturate and score-level validation on hard tasks was
    never done.
- Removed: `src/routing/`, `src/adapter/guidance.ts`, `flashPatterns` /
  `flashRouting` config keys (ignored on read), `/dsh flash-match` /
  `flash-unmatch` / `routing` commands, Flash persona/guidance settings rows,
  `scripts/live-flash.mjs`, `npm run live:flash`.
- Config files from v0.2.x load fine; the removed keys are dropped on next save.

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
