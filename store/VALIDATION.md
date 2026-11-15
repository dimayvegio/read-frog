# Candidate validation — 15 November 2026

Baseline compared before edits: `0752ee8c` / 1.59.3-a.7. Candidate package 1.59.3-a.8, numeric 1.59.3.8, display 1.59.3A. No upstream merge, new permissions or published data/migration changes.

## Passed

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

ZIP SHA-256: `5f6fbb7037d6db2ecbea5875a15fca9432b8ded8ea2e5f0ac339f4f05017908f`.
