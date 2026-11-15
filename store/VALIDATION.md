# Candidate A.14 validation — 15 November 2026

Baseline 27c1a7cc / A.13. Package 1.59.3-a.14 / numeric 1.59.3.14 / display 1.59.3A. No dependency, permissions, model, endpoint or published migration/config/DB schema additions.

- **4,792 unit tests passed / one intentional free-service skip**, 495 passing files / one skipped, SKIP_FREE_API=true. Final source log `.codex/image-overlay-tests.log`; type-aware lint and formatter pass. Coverage includes strict overlay ID parsing/model-coordinate rejection, geometry/fit/color/alpha, separate cache namespace/current source identity, key/config/epoch cancellation, worker-init late cleanup/one lease, and lossless crop/PNG limits.
- Final production Chrome overlay **15 checks**, `.codex/image-overlay-1794754739552`, with actual bundled local Tesseract OCR and synthetic OpenAI responses. Zero paid calls while measuring; one cold vision call on explicit Translate; unchanged/corrected-source/style edits reuse cache; editing/drag/region marking/PNG do not call provider. PNG bytes match the rendered canvas; pixel comparison preserves source dimensions and non-text colored artwork exactly in the fixture. Invalid output does not auto retry; crop change rejects late output; phone fits viewport; zero uncaught errors. This is not a live OpenAI quality claim or proof of perfect inpainting on textured images.
- A.14 regression runs: **22** structured-image checks `.codex/image-structure-1794754530775` and **83** previous PDF/image/fast-cache checks (path in `.codex/image-overlay-pdf.log`). These ran before the final overlay-only status-wording adjustment; final overlay checks and full unit suite reran after it. Earlier source-run artifacts remain for diagnostics, not final pass claims.
- Static runtime/store audits: 471 files, 201 JS, nine locales; known-forbidden endpoint scan empty. Local OCR uses existing fixed packaged assets, selected vision uses existing private OpenAI Responses, no PDF binary upload or remote OCR service. Static scan is complemented by runtime mock request/payload checks, not a universal egress proof.
- ZIP **22,093,189 bytes** (+8,660 versus A.13), SHA-256 `c1aba386dff7d0ceaf271352e0957d2ca7af80bda095ab66c6b278f28f007428`. Vocabulary review HTML unchanged (`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`). CRC/root paths/build inventory and final installed hashes/key/permissions checked via filesystem; assets first, manifest last, fixed old folder, no browser profile touched. User Reload required.
- Limits: fonts/word masking on complex backgrounds/vertical text are approximate; manual selection/style correction is provided. No neural inpainting, live paid API, OS RAM benchmark, 120-minute soak or main Edge UI control. See IMAGE_OVERLAY_A14.md.

## Historical A.13 evidence

# Candidate A.13 validation — 15 November 2026

Baseline 6860ae91 / A.12. Package 1.59.3-a.13, numeric 1.59.3.13, display 1.59.3A.

- Actual screenshot scenario found a production bug: table/code-only structure rendered literal Markdown because the generic heuristic recognized only headings/lists. Baseline artifact `.codex/image-examples-1794751490460` records tables=0 and failed assertion. Fix: pass explicit Markdown rendering for the already validated `imageStructure` path, leaving ordinary selection translations unchanged.
- Two new real React DOM regressions assert table-only and code-only rendering without a heading/list; focused app suite 10 passed. Full suite **4,766 passed / one intentional skip**, 491 passing files / one skipped, SKIP_FREE_API=true, 58.6s. Log `.codex/image-examples-tests.log`.
- Packaged Chrome UI rerun **22 structured image checks**, `.codex/image-structure-1794751604106`, zero page errors; no redundant cache calls, source editing/local no provider and cancellation unchanged. Production demonstrations `.codex/image-examples-1794751567890`: two raw screenshots, actual bitmap upload/structured OCR/text pipelines and DOM assertions; synthetic OpenAI output and Vietnamese examples, no live API cost or OCR quality claim. Screenshots inspected directly, not composited or retouched.
- Type-aware lint/formatter, ZIP and static runtime/store audits pass: 471 files, 201 JS, nine locales, known-forbidden-endpoint scan empty. No new dependency, permissions, endpoints, model, request/cache/prompt or published data schema.
- ZIP **22,084,529 bytes**, SHA-256 `12b8fb35e243c4d584668ec6a07941577a8a2552138d0a31c7552981251ca463`. Same fixed installation path, staged asset-first/manifest-last copy, all file hashes/key/permissions verified through filesystem, no browser-profile data touched; user Reload required. Vocabulary review HTML unchanged.
- Older A.12 PDF/HTML evidence below remains historical, not an A.13 rerun. No live paid API, main Edge UI control, OS RAM benchmark or 120-minute soak.

## Historical A.12 evidence

# Candidate A.12 validation — 15 November 2026

Baseline 1da3aa02. Package 1.59.3-a.12 / manifest 1.59.3.12 / display 1.59.3A. No new permission, dependency, model, endpoint or published config/DB/ZIP schema. New versioned image structure payload in existing text cache columns is documented in IMAGE_STRUCTURE_A12.md.

- **4,764 unit tests passed / one intentional free-service skip**, 491 passing files / one skipped; SKIP_FREE_API=true. Fresh full run 54.6s, log `.codex/image-structure-tests.log`.
- Production Chrome 157, final edge-mv3 build: **22 structured-image checks**, `.codex/image-structure-1794751061975`. Typed block/table/code rendering, original numbering, two cold calls, zero warm/reload calls, force OCR only, edit one text call/no image, local merge/split/delete, invalid result rejection/no automatic retry/cache, excluded source absent from request, actual in-flight stop, phone viewport/reading height, zero uncaught errors. API mocked; no live OCR quality claim.
- Production Chrome regression: **83 PDF/old image/fast cache checks**, `.codex/pdf-reading-1794751067697`; existing native-reader/sidepanel/crop/cancellation/target/prompt/warm-cache paths. OS context menu/snipping shortcut not driven. Separate Edge launch failed with TargetCloseError before test startup; not an Edge UI pass.
- Production Chrome HTML pane: **18 checks**, see `.codex/image-structure-html.log` for exact evidence directory. No duplicate calls or source DOM mutation; existing GFM rendering and pane controls.
- Type-aware lint, formatter, production ZIP, runtime/store static audits pass. 471 files /201 JS /9 locales. Static endpoint scan is complemented by the mock runtime request/payload checks; not a universal network proof.
- ZIP 22,084,544 bytes, SHA-256 `eb5ab74f6587230a0580ce817088b984cb9ecdaac1c4a076ab022f83e4680d05`. +5,411 bytes versus A.11. Vocabulary review HTML unchanged: `a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.
- No paid API, OS RAM benchmark, live site-account/quality test or 120-minute mixed soak. Local install is filesystem-only using a validated staging ZIP, asset-first/manifest-last, same key and permissions, no profile/DB edits. User Reload remains required.

## Historical A.11 evidence

# Candidate A.11 validation — 15 November 2026

Baseline 1216a049. Package 1.59.3-a.11 / manifest 1.59.3.11 / display 1.59.3A. No schema/permission/model/endpoint or Node/CI changes.

## Current A.11

- **4,725 tests passed / one intentional free-service skip**, 489 passing files / one skipped, SKIP_FREE_API=true. Log `.codex/three-fixes-full-tests.log`.
- Chrome production HTML: **18 checks**, `.codex/html-fixed-pane-1794743322810`; cache/mode/reselection/DOM/highlight plus GFM table and long code horizontal scrolling/image suppression. Mocked OpenAI.
- Chrome production PDF study: **35 checks**, `.codex/pdf-study-1794743037653`; real four-language offline OCR and existing search/drawing/notes/export/cancellation. New committed panel sizing, correct reserved PDF space and reload persistence; zero provider calls from controls. No runtime page errors.
- Native OS context menu is not CDP-driven: unit tests exercise fallback MIME/route/document ID/legacy/denial/timeout paths; existing real selection cache UI tests exercise the reusable result path.
- Type-aware lint, formatting, production ZIP build and static runtime/store audits passed: 471 packaged files, 201 JS, nine locales; no known forbidden endpoints. GFM/parser MIT notices included, vocabulary review HTML hash unchanged. Final HTML rerun evidence `.codex/html-fixed-pane-1794743322810` includes technical-markdown.png.
- SHA-256 ZIP: `33e1ed05e43fa08be81ecd332e75d07e8c672cb59a89331c585c373d20afc754`.
- Unverified: live provider quality/cost, new real-site account/Edge UI run, mixed-use 120-minute soak, OS RAM benchmark. Earlier evidence below is historical, not an A.11 rerun.

## Historical A.10 evidence

# Candidate A.10 validation — 15 November 2026

Baseline 310c785e / A.9, package 1.59.3-a.10, manifest 1.59.3.10, display 1.59.3A. No schema/permission/model/endpoint changes.

## Current A.10

- 27 focused tests passed, including 10 new HTTP/network/privacy/timeout/invalid-SRT diagnostic cases.
- Full Vitest: **4,711 passed / one intentional skip**, 488 passing files / one skipped, SKIP_FREE_API=true. Current full run 88.89s; pre-push repeats/checks current source through Nx. Type-aware lint passed. Build and static audits passed: 470 packaged files / 201 JS / nine manifest locales.
- Production Chrome 157 probe `.codex/srt-18mb-1794738967754`: real synthetic 18,001,772-byte MP3 transferred intact once, SRT download with API-mock segment timestamps; eight UI error cases (400/413/415/429/404/500/network/invalid timing) show safe codes, no provider detail leakage and no automatic re-upload. Unit tests cover auth and timeout too.
- Original user file/live OpenAI acceptance/failure are unverified; no live paid requests. Current change improves diagnosis, not a proven root-cause fix.
- SHA-256 ZIP: `319a8b339165361c3f780dc323ff3e55650314b6e9ee1e34c4a46cf613430eee`.
- Production Audio/PiP/SRT regression on candidate: 31 checks passed in `.codex/audio-1794739084123-0c29165d`, controlled API/WebRTC peer.
- Fixed installation update verified all 470 file hashes, manifest last, numeric 1.59.3.10/display 1.59.3A; same identity/permissions and no profile writes. User Reload required.

## Historical A.9 validation (not a new A.10 run)

# Candidate validation — 15 November 2026

Baseline `901a488e` / 1.59.3-a.8. Candidate 1.59.3-a.9, numeric 1.59.3.9, display 1.59.3A. No upstream merge, permission or published schema changes.

## Current a.9 validation

- 35 focused selection tests passed; 11 new completed-cache tests including explicit regenerate, identity invalidation, aborted partials and late-output races.
- 16 production Chrome assertions, actual built extension + real sidepanel/toolbar/native highlights. Repeated active Translate, Explain/Summary-to-Translate and same-passage reselection measured no extra provider call on cache hits. First Explain/Summary remain explicit separate calls. No page errors.
- Evidence: `.codex/html-fixed-pane-1794732226874/evidence.json`. OpenAI mocked; no live paid request. Native OS menu is covered by existing unit/bridge tests, not driven directly.
- Full Vitest suite: **4,701 passed / one intentional free-service skip**, 488 passing test files / one skipped (SKIP_FREE_API=true); result in `.codex/html-cache-full-tests-static.log`, 58.16s. Format, lint/type-check, edge ZIP build, runtime and store audits passed: 201 JS / 470 packaged files / nine manifest locales.
- SHA-256 ZIP: `87fb8c738a1380c5dde0612f001803e6137ec5e930cbbde558050c4918c3341f`. Corresponding source at v1.59.3A.9.
- User Edge UI not controlled; same fixed installation receives manifest-last verified file copy, Reload required. Edge runtime/live API not newly verified. Historical video/PDF checks below are clearly distinguished.

## Historical a.8 evidence (not rerun for the narrow a.9 cache fix)

- New HTML fixed-pane regression: 10 production Chrome assertions, real sidepanel/toolbar/source highlight, no PDF controls, one translation request per action, no DOM rewriting, highlight retained after native selection clears, cleanup on close and normal popover fallback.
- Selectable 15/30/60/120/300/600s analysis for both passive and explicit prepared ranges; unit capture/restore and long-video interval checks. Queued setup pause events are ignored after playback has resumed.

- Full local Vitest: **4,690 passed, 1 intentionally skipped**, 487 passing files/one skipped. SKIP_FREE_API=true; external free-service test intentionally excluded. Final run ~54s. Mocked provider tests do not measure live model quality.
- Format, lint/type-check, production WXT edge build and root-manifest ZIP.
- 44 production Chrome checks (22 each YouTube/ani.pm fixture), real rendered synthetic video/audio and native captions, real capture/MP3/browser playback, controlled OpenAI responses. Original/translated speech, ducking/live mix/offset, prepared two-speaker routing, passive automatic analysis, context/no source-URL payloads, no duplicate same-part analysis, navigation/key/config cancellation. No uncaught page errors.
- Production local PDF/OCR regression: native wildcard search/results, notes/hover/date/edit/delete/undo, colored drawing, annotated PDF export/original immutability, reload/rename restore, outline, scan words and search, three-canvas bound, cancellation and phone layout. Real English/Vietnamese/Chinese/Japanese Tesseract models work with external DNS blocked. Local view/edit/OCR controls trigger no provider request.
- Unit coverage includes paused-frame exclusion, passive player state, seek/rate aborts, unresolved-context cancellation, timeline-part deduplication, no paid retries and stale synthesis rejection while retaining controller/player/manual pause.
- Compiled runtime audit: **201 JS files**, no known forbidden provider/telemetry/icon/rule endpoints; store audit rejects eval/new Function, OCR CDN fallback, key-like literals, unexpected permission/CSP/locale. Four OCR languages are packaged locally. CSP retains bundled WASM support.
- Store assets: horse master/provenance, icon sizes 16/32/48/96/128/300, 440×280/1400×560 promos, three actual 1280×800 PDF reader/search/bilingual screenshots. Synthetic content and mock translation are disclosed. Nine manifest locale listings; runtime Azerbaijani retained without unsupported manifest locale.
- Root ZIP CRC/safe relative paths, installed key/permissions, standalone review HTML hash, manifest-last staging copy and installed file hashes are checked by the safe installer. Same local directory/identity, no browser profile/data changes. User Reload remains pending.

## Not tested / limited

No live paid OpenAI request or real-video speaker accuracy/subjective translation quality/cost measurement in this release. No full-video diarization claim; unknown/unheard speakers use baseline. No Netflix DRM audio capture claim. No OS RAM/performance benchmark claimed for a.7; a.6 measurements are historical.

Fresh isolated **Edge 157.0.4341.46 exits before loading the extension** (headed/headless, pipe/port tried). Chrome 157.0.8103.51 production checks passed. Edge runtime test is pending; the existing user Edge installation/UI was not controlled. This is a test-environment block, not evidence of an extension crash.

No developer account, store-assigned IDs, legal identity attestation, private review key, store submission/review or approval completed. Owner completes account/reviewer requirements in README. Cross-ID automatic data migration is not implemented/claimed. Public policy and exact source tag must be reachable after push before store submission.

## Reproduce / evidence

Use scripts/debug/check-video-dubbing.mjs with DUBBING_PLATFORM=youtube (unset for ani.pm), DUBBING_CAPTURE=1, DUBBING_AUTOMATIC=1; scripts/debug/check-pdf-study.mjs; scripts/debug/capture-store.mjs; audit-runtime-network.mjs and audit-store.mjs with STORE_REQUIRE_SCREENSHOTS=true. Use an isolated profile only and do not rebuild output while a production regression is reading it.

Local current evidence: .codex/html-fixed-pane-1794726097883 (10 checks), .codex/video-dubbing-youtube-1794725698839 (30s sample), .codex/video-dubbing-anipm-1794725773536 (15s), .codex/pdf-study-1794725698960 (32 checks). Logs: .codex/html-pane-tests.log and .codex/html-pane-zip.log plus installer update-report.json. Native OS menu classification is unit/bridge tested; production toolbar/sidepanel is driven directly. Profiles/private scratch are not published.

Historical a.8 ZIP SHA-256: `5f6fbb7037d6db2ecbea5875a15fca9432b8ded8ea2e5f0ac339f4f05017908f`.
