# AGENTS.md

## Local Fork Upgrades

- Before integrating an upstream release, read [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).
- Preserve the local OpenAI-only runtime, private credentials, PDF selection, Microsoft/OpenAI TTS, Vietnamese typography, and two-minute subtitle buffer.
- Preserve the ani.pm subtitle adapter and its passive player/iframe constraints documented in [ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md).
- Preserve restored X/Twitter and Netflix native captions, the Netflix MAIN-world bridge and track restoration documented in [X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md), without reintroducing hosted services.
- Preserve the vocabulary database, portable ZIP v1 and standalone mobile review page documented in [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md). Vocabulary audio generation has an independent cancellation scope from TTS playback.
- Mark upstream-based local releases with the `A` suffix in `manifest.version_name` (for example `1.58.0A`), while keeping package and manifest numeric versions valid.
- Published fork migrations are frozen; upstream migration numbers may conflict and must be adapted as a new fork schema step.

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.
