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
