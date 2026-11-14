# FlowRead 1.59.3A.2 — fixes after c3cada73 review

Baseline reviewed: c3cada73. Upstream baseline remains v1.59.1 (56d05e33); the 1.59.3 label is local release metadata, not an upstream merge claim.

## Changes

- Opening a file clears summary/dictionary ownership and aborts old components. A new file never inherits a paid task. Dictionary context reads native/OCR source text only, without annotation decorators.
- Selection translations use the existing private translation/history/image cache, with target/model/prompt/glossary/credential/text-option guards. The duplicate session and persistent translation caches are removed.
- Explain, summary and dictionary use completed-only prompt-versioned cache keys with public output settings, credential revision, source scope and document-history epoch. Streams never cache partial/canceled output. Current state is rechecked before provider execution and after completion. Public configuration/focus and bounded visible-page checks invalidate old results without provider retries.
- AI cache DB v1 completion records remain unchanged. DB v2 adds only metadata for clear epochs and scoped key inventory. Budget: 500 entries / 16 MiB encoded records, TTL 30 days, persistent LRU access updates. No second RAM completion cache. Clear-cache and PDF-history clear delete the corresponding AI cache and reject late saves. This DB stays outside config sync/export, vocabulary and PDF sidecar formats.
- Quick dictionary is scoped by document/word/context/settings, validates bounded JSON and cancels saves on unmount. Word audio uses the shared configured TTS path, not uncontrolled Web Speech voices. Lookup never retries a paid malformed response automatically.
- Page summaries may read existing local OCR (legacy Study DB1 or bounded OCR cache), without starting OCR. The UI discloses the 8,000-character input limit.
- Recent PDFs without a persisted handle offer the existing picker. Handle reopen checks read permission, offers a user-gesture fallback, and rejects late file reads. Cancel does not open another picker. Only metadata/handles are stored, not PDF bytes.
- Rendering respects original per-page rotation plus view rotation. Canonical annotation/OCR/text-note/paragraph coordinates stay unchanged in published stores. View matrices and inverse pointer/keyboard geometry keep drawing, editing, highlighting, paragraph picking and exports aligned. Shape properties use an untransformed reader-root portal; page pan no longer creates a containing block for fixed popups. Reading canvas leases remain three.
- Outline inventory is bounded to 500 total nodes / depth 10. Page destinations resolve sequentially for expanded visible branches only, with batched state updates and cancellation on close.
- Splitters preview with rAF/CSS, persist once per completed primary-pointer gesture, and clean up capture/listeners on cancel, blur, resize and unmount. Pan previews clean pending frames. Window size settings reject NaN.
- Study export uses the history document ID and vocabulary encounters for this document in the active notebook, including IPA. Bilingual exports use completed rows only. No provider is called from export/edit/view/search controls.
- Existing tests/harnesses use the updated labels, outline selectors and explicit post-layout readiness. Regression cases cover the failures found in review. ani.pm name/episode detection recognizes /ani/ and ?ep=eN. Only explicit Apply changes context; no new provider call, persistence, permissions or schemas for anime.

## Data and upgrade constraints

Config125/migrations1–125, PDF DB2, Study DB1, workspace DB2 and all vocabulary/ZIP/report formats remain frozen. New cache metadata is additive and isolated. No PDF binary upload or automatic OCR/paid fallback. Fixed OpenAI content-processing endpoints and bundled OCR/rules/icons remain. Existing extension identity, installation path and browser data are unchanged.

## Validation

Validation results are recorded after the final production build below. Live paid API/model-quality, real file-picker OS permission dialogs and third-party live video sessions are not implied by mocked/provider-fixture regressions.

- Full suite: 474 files passed, one skipped; 4,602 tests passed and one intentionally skipped with SKIP_FREE_API=true. Fake IndexedDB is initialized before Dexie imports in the new tests.
- Production browser regressions: controls 24, bilingual 33, workspace 23, real local OCR/annotations 32, review-fix scenarios 8: 120 assertions passed in isolated Chrome profiles. Provider fixtures are mocked; English/Vietnamese/Chinese/Japanese Tesseract workers/assets are real and offline.
- New scenarios verify the toolbar's actual viewport coordinates, rotated stored ink/physical keyboard movement/new drawing, recent-file picker fallback, intrinsic rotation and no inherited AI call when switching documents. Unit regressions cover language change, aborted partial results, word ownership, malformed JSON, v1-to-v2 additive cache compatibility, TTL/count/encoded-byte budgets and stale/scoped clears.
- Type-aware lint, formatting and production Edge build pass. Compiled runtime endpoint audit passes. PDF fixtures retain unchanged source binary and at most three reading canvases; standalone vocabulary-review HTML is byte-identical to the prior release.
- No measured live-model speed or OS RAM improvement is claimed. New fixes bound cache inventory and outline work structurally. Real Windows persistent-file permission expiry/regrant dialogs, live paid OpenAI calls and live video sites still require user acceptance testing.
- ZIP installation uses a separate safe staging folder and manifest-last copy into C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A, then filesystem manifest/hash verification. Browser credentials/settings/history are not copied or modified. User Reload remains pending after installation.
