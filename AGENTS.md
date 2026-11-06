# AGENTS.md

## Local Fork Upgrades

- Before integrating an upstream release, read [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).
- Preserve the local OpenAI-only runtime, private credentials, PDF selection, Microsoft/OpenAI TTS, Vietnamese typography, and two-minute subtitle buffer.
- Preserve the ani.pm subtitle adapter and its passive player/iframe constraints documented in [ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md).
- Preserve restored X/Twitter and Netflix native captions, the Netflix MAIN-world bridge and track restoration documented in [X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md), without reintroducing hosted services.
- Preserve named vocabulary notebooks, the frozen IndexedDB v1-to-v2 migration, ZIP v1/v2 compatibility and the standalone mobile review page documented in [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md). Each notebook keeps its own content/progress and export; vocabulary audio generation has independent cancellation from TTS playback.
- Preserve portable ZIP v3 MP3/WAV compression, legacy ZIP v1/v2 readers, and the self-contained HTML working on file URLs and HTTP(S). Compression must not change card/notebook identity, review histories or the independent TTS playback path. Published migrations remain frozen.
- Preserve per-notebook review events, database v3 and ZIP v4/report v1-v2 documented in [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md). Record first checked answers before grading, separate objective accuracy from flashcard self-ratings, and merge stable event IDs without double counting. Never invent historical answer logs from legacy schedule counters.
- Preserve the readable ChatGPT report, explicit practice reasons and separate unassessed words. Practice flags use all recorded history for the current inventory; one correct answer or flashcard self-rating must not imply confirmed recall.
- Preserve guided typing/correction/hints/dictation/cloze, resumable daily lessons (DB4), dictionary capture, ZIP5/report3 and compact per-word reports for large notebooks. Assisted answers and correction drills never inflate unassisted accuracy; preserve the first answer and update SRS at most once per word/run. Keep the published ZIP4 event schema frozen and retain the 1,000-word browser regression.
- Mark upstream-based local releases with the `A` suffix in `manifest.version_name` (for example `1.58.0A`), while keeping package and manifest numeric versions valid.
- Published fork migrations are frozen; upstream migration numbers may conflict and must be adapted as a new fork schema step.

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.
