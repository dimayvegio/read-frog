# AGENTS.md

## Local Fork Upgrades

- Before integrating an upstream release, read [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).
- Preserve the local OpenAI-only runtime, private credentials, PDF selection, Microsoft/OpenAI TTS, Vietnamese typography, and two-minute subtitle buffer.
- Preserve the fixed PDF panel, conservative text cleanup and document-local history/cache in [PDF_LOCAL_READING.md](PDF_LOCAL_READING.md). Keep user-gesture-safe sidebar opening with popup fallback, path-free provider payloads, configuration/credential-aware cache identities and clear-epoch cancellation; PDF history DB v1 remains separate from credentials and vocabulary.
- Preserve the extension-owned PDF.js reader and automatic content-hash page/scroll/zoom resume (PDF DB2 additive stores). Native Edge PDF position is not tracked. Keep local worker/assets, file-picker fallback, no document scripting/upload, three nearby canvases, timestamp/epoch guarded saves and the production PDF regression. Published DB1/DB2 schemas remain frozen.
- Preserve image capture/crop/paste and OpenAI OCR feeding the existing translation/TTS/vocabulary UI in [IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md). Keep memory-only one-use capture channels, sender guards, crop-only inline provider images, cancellation/length checks and the private credential runtime; screenshots never enter settings, PDF history or notebook exports.
- Preserve image cache DB1 (text and hashes only), bounded LRU/TTL and clear epochs, separate OCR/fast/text identities and credential/prompt/model invalidation. Keep one-call structured image translation with current-configuration result validation, two-step fallback for glossary/custom prompts, force-read/regenerate bypass and the configurable capture command. Never edit published schemas; benchmark claims must distinguish mocked API latency from live model speed.
- Preserve the ani.pm subtitle adapter and its passive player/iframe constraints documented in [ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md).
- Preserve restored X/Twitter and Netflix native captions, the Netflix MAIN-world bridge and track restoration documented in [X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md), without reintroducing hosted services.
- Preserve named vocabulary notebooks, the frozen IndexedDB v1-to-v2 migration, ZIP v1/v2 compatibility and the standalone mobile review page documented in [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md). Each notebook keeps its own content/progress and export; vocabulary audio generation has independent cancellation from TTS playback.
- Preserve portable ZIP v3 MP3/WAV compression, legacy ZIP v1/v2 readers, and the self-contained HTML working on file URLs and HTTP(S). Compression must not change card/notebook identity, review histories or the independent TTS playback path. Published migrations remain frozen.
- Preserve per-notebook review events, database v3 and ZIP v4/report v1-v2 documented in [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md). Record first checked answers before grading, separate objective accuracy from flashcard self-ratings, and merge stable event IDs without double counting. Never invent historical answer logs from legacy schedule counters.
- Preserve the readable ChatGPT report, explicit practice reasons and separate unassessed words. Practice flags use all recorded history for the current inventory; one correct answer or flashcard self-rating must not imply confirmed recall.
- Preserve guided typing/correction/hints/dictation/cloze, resumable daily lessons (DB4), dictionary capture, ZIP5/report3 and compact per-word reports for large notebooks. Assisted answers and correction drills never inflate unassisted accuracy; preserve the first answer and update SRS at most once per word/run. Keep the published ZIP4 event schema frozen and retain the 1,000-word browser regression.
- Mark upstream-based local releases with the `A` suffix in `manifest.version_name` (for example `1.58.0A`), while keeping package and manifest numeric versions valid.
- Preserve additive vocabulary DB5 source passages and ZIP6 while reading ZIP1-5. Source IDs deduplicate passages independently of review events; adding encounters never updates SRS or answer counts. Keep active-notebook highlights bounded and DOM-preserving on web/PDF.js, saved-word lookups local and YouTube sentence practice explicitly opt-in with ad/navigation/input guards. Keep separate usage DB1 numeric-only, actual SDK usage, unknown costs honest and clear epochs; no prompts, URLs or credentials in usage logs. See [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md).
- Published fork migrations are frozen; upstream migration numbers may conflict and must be adapted as a new fork schema step.
- Preserve opt-in Edge account configuration sync in [EDGE_SETTINGS_SYNC.md](EDGE_SETTINGS_SYNC.md): native storage.sync, trusted-page RPC, gzip/chunk limits, head-last commit, checksum validation, vector-clock conflicts, stale-choice guards and persistent local recovery/undo. Sync format v1 is frozen for fork config124; do not project away newer fields. Keep OpenAI credentials, glossary rows, vocabulary/audio/progress/logs, PDF/image/usage databases outside this transport. Do not claim storage.sync writes prove Microsoft cloud delivery or change the existing extension ID silently. Keep the legacy Send feedback action removed.

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.
