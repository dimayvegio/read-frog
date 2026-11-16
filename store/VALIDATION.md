# FlowRead1.60.0A validation — 17 November 2026

Baseline local `ea4d6d5b` / A.19; upstream `v1.60.0` / `0528cfa6b15e49e858786205b7104b7592c20da5`; package `1.60.0-a.1`, numeric `1.60.0.1`, display `1.60.0A`. [Integration decisions](../UPSTREAM_1_60_0_REPORT.md). True merge from the latest fork, preserving ancestry. No dependency or permission changes; account sync remains retired.

## Current evidence

- Full fresh unit suite: **5,002 passed / 1 intentionally skipped, 521 passing files / 1 skipped**. `SKIP_FREE_API=true`, `NX_DAEMON=false`, `NX_SKIP_NX_CACHE=true`; `.codex/review-160/unit-final.log`. Historical external free-translation test excluded intentionally. New CSS/timeout migration tests, diagnostics sender/redaction/oversize tests and stalled-log-write bounds are included.
- **22 production browser suites / 663 final passing checks**, actual Edge-MV3 package in isolated Chrome157 profiles, synthetic pages/audio/PDFs and mocked OpenAI. Local Tesseract en/vi/zh/ja, PDF.js, native DOM/media paths exercised. **Live OpenAI spending $0**. No claim of live model quality, Edge-main-profile UI validation, physical phone, account/DRM or 120-minute soak.
- Actual **A.19 ZIP → 1.60.0A copy-only upgrade**, same QA directory/ID. Key/revision, public settings, feature preferences, notebooks and inert sync DB preserved. Config and existing backups acquire only the documented migration fields (CSS selectors/queue timeout/schema127); backup IDs/metadata remain. Worker restart removes only the retired sync alarm, keeping backup/unrelated alarms. Local JSON export/import uses schema127 and excludes credentials. Retired sync RPCs/entrypoint stay unavailable/inert. App storage.sync and external fetches from these local settings actions: **0**; bundled icon loads are recorded separately.
- New production UI test: both timeout inputs reject999s without saving a prefix, commit45s/60s correctly; all three live previews render without provider calls. Diagnosis opens/closes/outlines existing paragraph verdicts without more AI or source-text mutation. A content frame cannot export the private diagnostics/config report. Explicit Options export data has sanitized logs/schema127 and no fake key/header/response-body sentinels. No new survey/sponsor/feedback launcher.
- Type-aware lint/typecheck and formatting passed. Runtime network audit: **213 scripts / zero forbidden endpoints or retired sync RPC/transport strings**, including new IF API endpoint checks. Store audit with `STORE_REQUIRE_SCREENSHOTS=true` passed. All124 existing migration-file hashes (versions through125) match A.19 byte-for-byte. New steps are fork125→126 and126→127; AppDB8 appends only `logRecord` beside stores1–7. Standalone vocabulary HTML hash unchanged.
- Artifacts/logs: `.codex/review-160/`; final browser ledger `browser-final-summary.json`, upgrade `.codex/sync-removal-1794851393168/evidence.json`, new UI `.codex/upstream-160-1794851778542/evidence.json`.

| Suite                       | Passing checks |
| --------------------------- | -------------: |
| check-upstream-160          |             17 |
| check-settings-sync-removal |             21 |
| check-image-overlay         |             15 |
| check-image-structure       |             22 |
| check-pdf-image-translation |             37 |
| check-pdf-reading           |             81 |
| check-web-bilingual         |             26 |
| check-pdf-study             |             35 |
| check-pdf-workspace         |             23 |
| check-pdf-bilingual         |             33 |
| check-audio-transcription   |             31 |
| check-pronunciation         |             37 |
| check-tts-download          |             11 |
| check-reading-lab           |             20 |
| check-study-flow            |             59 |
| check-vocabulary-scale      |             25 |
| check-anipm-context         |             14 |
| check-html-fixed-pane       |             21 |
| check-generated-image       |             21 |
| check-vocabulary            |             70 |
| check-video-dubbing-youtube |             22 |
| check-video-dubbing-anipm   |             22 |

## Failed candidates and harness corrections

Early merge validation failures were retained rather than counted as passes: missing new migration fixtures; upstream tests assuming hosted/Google providers and jsdom31 despite the fork retaining OpenAI-only dependencies; static logger tests naming an empty legacy entrypoint directory; merge-conflict omissions in diagnosis/cache typing. Applicable tests were adapted to the actual fork contracts, retaining existing native DOM/style assertions and adding independent expected snapshots126/127. Timeout integration tests now include batch-size allowance, wait for real batch admission and cancel their hanging fixture requests between cases.

New browser harness setup failures are also retained (`browser-new-features*.log`, initial `check-upstream-160.log`): wrong subtitle input selector, a filter fixture written to the wrong config nesting, closure state not passed to CDP, and waiting on background-tab rAF during Help navigation. Corrected selectors/config/serialization and foreground/reload/polling; all17 new production checks then passed on the unchanged final runtime. Upgrade expectations explicitly model the existing backup-cleanup migration; no actual user fields were discarded to make an equality check pass. Final reruns are in `new-features-final.log` and `check-settings-sync-removal.log`; the initial failing ledger stays in `browser-initial-summary.json`.

## Package and installation

One ZIP: `FlowRead-Edge-1.60.0A.zip`, **21,584,739 bytes**, SHA256 `7fede1a2439e6ff56831191cfd3640d0ccab6a209b200830e866d0fa6f5242c5`. Root manifest/CRC/safe paths and final build bytes are checked by the installer. Copy-only staging targets the fixed `C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A`, assets/entrypoints before manifest; **482 hashes**, identity and permissions must match. No main browser-profile data or destination cleanup/reinstall. User Reload pending at numeric1.60.0.1/display1.60.0A. Installation report is linked by `.codex/latest-local-extension-update.json`.

Standalone vocabulary HTML SHA256 remains `39fccc0d40d091efa55731358b0ee0066f7824731375720cf1ab9c1902433f9a`. GitHub release asset is uploaded only after the merge commit/tag is pushed, then verified against the tested ZIP digest; GitHub publication is not store approval.

---

## Historical A.19 evidence (not a 1.60.0A rerun)

# A.19 validation — 16 November 2026

Baseline `27fefff3` / A.18; package `1.59.3-a.19`, numeric `1.59.3.19`, display `1.59.3A`. Review and removal contract: [EDGE_SYNC_REMOVAL_A19.md](../EDGE_SYNC_REMOVAL_A19.md). User-requested removal of Edge account settings sync; no dependency, permission, config125 migration or other published data-format changes.

## Current evidence

- Fresh uncached Nx: **4,844 passed / 1 intentionally skipped; 502 passing files / 1 skipped**, 52.27s Vitest / 53.7s Nx. `SKIP_FREE_API=true`, `NX_DAEMON=false`, `NX_SKIP_NX_CACHE=true`; `pnpm exec nx test --output-style=static -- --exclude="**/free-api.test.ts"`. `.codex/review-a19/unit-final.log`. The removed sync implementation's 19 tests/two files are no longer applicable; they were replaced by an actual upgrade/removal browser regression.
- **21 browser suites / 646 final passing checks**, Chrome157.0.8103.51, isolated profiles/synthetic fixtures. Twenty broad suites cover PDF.js/local OCR, translation caches, annotations, audio, dubbing, vocabulary and study. After those passed, only locale labels were updated; the final rebuild passed fresh units, the 21-check upgrade regression, lint/typecheck and both audits. No paid API calls; **OpenAI spending $0**. No main Edge UI/profile control, live model-quality, cloud-account-delivery, physical-phone, DRM or 120-minute soak claim.
- Type-aware `oxlint --type-check` passed. Final runtime audit: **201 scripts, zero forbidden endpoint/retired RPC/transport strings**; store audit with `STORE_REQUIRE_SCREENSHOTS=true` passed. Generic vendor API namespaces are not app sync calls. Formatting and diff checks passed before commit.
- Actual **A.18 ZIP → A.19 copy-only update in one isolated installation path/ID**: private key/revision, public config125, feature preferences, backup and notebook records retained; old cloud fixture and sync DB untouched. Local JSON settings export/import works and excludes keys. Old bookmarked HTML has zero scripts/inputs/forms even with orphan chunks still on disk. All seven old RPCs are unavailable. Worker-only restart removes the deliberately seeded sync alarm while preserving backup/unrelated alarms. App sync APIs and external fetches during local settings actions: **0**; bundled icon fetches are separately recorded.
- Final summary: `.codex/review-a19/final-summary.json`; upgrade evidence: `.codex/sync-removal-1794845112812/evidence.json`; final upgrade log: `.codex/review-a19/upgrade-release4.log`. Fake keys only. Bootstrap journal digest refresh is expected; actual credential state and revision stay unchanged.

| Suite                       | Passing checks |
| --------------------------- | -------------: |
| check-image-overlay         |             15 |
| check-image-structure       |             22 |
| check-pdf-image-translation |             37 |
| check-pdf-reading           |             81 |
| check-web-bilingual         |             26 |
| check-pdf-study             |             35 |
| check-pdf-workspace         |             23 |
| check-pdf-bilingual         |             33 |
| check-audio-transcription   |             31 |
| check-pronunciation         |             37 |
| check-tts-download          |             11 |
| check-reading-lab           |             20 |
| check-study-flow            |             59 |
| check-vocabulary-scale      |             25 |
| check-anipm-context         |             14 |
| check-html-fixed-pane       |             21 |
| check-generated-image       |             21 |
| check-vocabulary            |             70 |
| check-video-dubbing-youtube |             22 |
| check-video-dubbing-anipm   |             22 |
| check-settings-sync-removal |             21 |

## Harness corrections and limits

Earlier setup failures are retained in `.codex/review-a19/upgrade*.log` and their evidence directories; they are not counted as passes. Corrections: foreground/poll a hidden baseline backup page instead of waiting on background rAF; distinguish bootstrap journal housekeeping from actual key changes; account for DevTools extension reload resetting alarm/page targets; detach/close only the worker and exclude **all** pre-existing DevTools targets before attaching to the restarted worker. A known active RPC must respond before removed-RPC assertions. Local bundled icon fetches must not be mislabeled as provider/network calls. No production workaround was added for these harness issues and no assertion was dropped. A separate worker restart now demonstrates the selective alarm cleanup itself.

Old synchronized data may remain on the browser/account; the release neither reads nor erases it. The static runtime audit targets the clean build/ZIP. Copy-only installed folders deliberately retain orphan assets; the new static `settings-sync.html` references none of their scripts. Normal browser/website traffic is not measured as application API traffic.

## ZIP and local install

- Delivered ZIP: `C:\Users\TIEN\Downloads\FlowRead-Edge-1.59.3A.zip`, **22,136,134 bytes**.
- SHA256: `a4965cb2cc5a5c1cca40b74de5afd67a7fb5d611d5bb0b9491aad7aa414092e4`.
- Root manifest/CRC/safe relative paths validated, extracted into separate staging and matched against the tested final build. **470 installed files hash-verified**, assets/entrypoints first and manifest last at the fixed `C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A` path. Identity/permissions unchanged; browser profile/data untouched; no destination cleanup or reinstall.
- Filesystem installed numeric **1.59.3.19**, display **1.59.3A**; **user Reload pending**. Main Edge UI was not inspected. File copying is not a profile backup. Standalone vocabulary HTML remains SHA256 `39fccc0d40d091efa55731358b0ee0066f7824731375720cf1ab9c1902433f9a`.
- Installation evidence: `.codex/extension-update/20261116T160546Z-f13fdb97/update-report.json`.

---

## Historical A.18 evidence (not an A.19 rerun)

# A.18 validation — 16 November 2026

Baseline `24277883`; package `1.59.3-a.18`, numeric `1.59.3.18`, display `1.59.3A`. Review/fixes: [FEATURE_MODELS_REVIEW_A18.md](../FEATURE_MODELS_REVIEW_A18.md). All current feature changes, including the previously uncommitted overlay work, are included after review. No dependency, permission or published config/DB/report/ZIP/migration changes.

## Current evidence

- Full uncached Nx suite: **4,863 passed, 1 skipped; 504 passing files, 1 skipped**, 50.77s Vitest / 51.8s Nx. `SKIP_FREE_API=true`, `NX_DAEMON=false`; `pnpm exec nx test --output-style=static -- --exclude="**/free-api.test.ts"`. Log `.codex/review-a18/full-tests-final2.log`.
- **21 production browser suites / 649 final passing checks**, Chrome157.0.8103.51, fresh isolated profiles and synthetic fixtures. Actual PDF.js, bundled Tesseract and browser media paths; OpenAI replies mocked, **live API spending $0**. No live model quality, invoice, physical-phone, DRM/account or 120-minute soak claim.
- Type-aware lint/typecheck passed (`lint-final.log`). Formatting/diff checks are required before commit. Runtime audit: **202 scripts, zero forbidden endpoints**; store audit with `STORE_REQUIRE_SCREENSHOTS=true` passed. Static scan is complemented by runtime/payload tests; it does not prove store approval.
- New form regression test plus schema/cache/model/credential-race tests. HTML model settings saved through actual UI, selection/explanation use distinct models in provider payloads, repeated mode switches reuse completed caches. Image UI checks actual computed hidden state and reachable zoom origins.

| Suite                            | Final checks |
| -------------------------------- | -----------: |
| check-image-overlay              |           15 |
| check-image-structure            |           22 |
| check-pdf-image-translation      |           37 |
| check-pdf-reading                |           81 |
| check-web-bilingual              |           26 |
| check-pdf-study                  |           35 |
| check-pdf-workspace              |           23 |
| check-pdf-bilingual              |           33 |
| check-audio-transcription        |           31 |
| check-pronunciation              |           37 |
| check-tts-download               |           11 |
| check-reading-lab                |           20 |
| check-study-flow                 |           59 |
| check-vocabulary-scale           |           25 |
| check-edge-settings-sync         |           24 |
| check-anipm-context              |           14 |
| HTML feature settings/fixed pane |           21 |
| Standalone generated image       |           21 |
| YouTube dubbing                  |           22 |
| ani.pm dubbing                   |           22 |
| check-vocabulary                 |           70 |

## Failed runs retained

- Initial review candidate exposed a form-render typo introduced while rewriting the settings form; corrected, then covered by the new UI unit and successful production form tests. Initial async selection test assumed glossary loading began synchronously; it now waits for the actual pending glossary before canceling.
- The first batched YouTube dubbing run timed out waiting for ducking after three checks (`check-video-dubbing.log`, `.codex/video-dubbing-youtube-1794832873879`). **Not declared fixed by a production change:** the unchanged runtime passed two independent fresh YouTube reruns, 22/22 each, plus ani.pm 22/22 including real capture/preparation/automatic sampling. Root cause of the one timing failure was not reproduced; the harness now retains media state on future failures. Both failure and rerun evidence remain local.
- Earlier failed candidates are not counted as passing suites. Final summary: `.codex/review-a18/final-summary.json`; individual logs contain artifact paths. Native OS context-menu selection is unit/bridge-tested, not claimed to be OS-menu driven.

## ZIP/local install

- One delivered ZIP: `C:\Users\TIEN\Downloads\FlowRead-Edge-1.59.3A.zip`, **22,143,947 bytes**.
- SHA256: `0215bfd24128ff6847c0837a736259240f7ac36cf2671d9d26ef0fc42da4efee`.
- Root manifest/CRC/relative paths verified; separate staging compared byte-for-byte with tested build; **472 installed files hash-verified**, assets/entrypoints first and manifest last into the fixed `ReadFrog-Edge-1.58.0A` folder. Identity/permissions unchanged; browser profile/data untouched. This is code replacement, not a browser-data backup or migration test. User Reload remains pending; main Edge UI was not controlled.
- Standalone HTML SHA256: `39fccc0d40d091efa55731358b0ee0066f7824731375720cf1ab9c1902433f9a`. Its title/UI/report filenames now use FlowRead; data formats/import compatibility and progress are protected by the 70-case vocabulary and 1,000-word scale runs.

## Historical A.17 evidence (not an A.18 rerun)

# Candidate A.17 validation — 16 November 2026

Runtime/package commit `2b869f95`, baseline A.16. Package 1.59.3-a.17 / numeric 1.59.3.17 / display 1.59.3A. Isolated build/test checkout `.codex/release-a17-2b869f95`; three pre-existing local-overlay edits remain untouched/uncommitted in the main workspace and are not part of this release. No new dependencies/permissions/published schemas/migrations.

- **4,841 unit tests passed / one intentional free-service skip**, 501 passing files / one skipped, SKIP_FREE_API=true, fresh67.36s run (`.codex/release-a17-2b869f95/.codex/tests.log`). Lint/type-check/formatter pass. New tests cover bounded custom prompt forwarding, target/image-only guard wording, normalized-prompt/resolution cache separation, max quality, raster bounds including 3:1 rounding, raw response retention, output-cost official823-token example, four-page subtotal and unknown Auto/excluded input fees. Price estimates never enter actual usage logs.
- **37 production PDF image checks**, `.codex/release-a17-2b869f95/.codex/pdf-image-1794762470744`: real PDF.js raster/private image-edit port/PDF+ZIP export with synthetic OpenAI PNGs. Four cold pages each get the same explicit instructions; repeated creation/reopening/outer-whitespace edits incur no calls; changed instructions clear stale images and only explicit Create makes four new calls. 4K/max/300DPI preset sends bounded explicit dimensions and leaves the returned bitmap unchanged. Estimates update locally, include the selected range, disclose input exclusions and do not call a provider; Auto is unknown, not zero. Cancellation/resume/target/file and private-instruction reset remain guarded, phone fits, no uncaught errors.
- **19 direct-image production checks**, `.codex/release-a17-2b869f95/.codex/generated-image-1794762470588`: existing A.15 behavior plus standalone image-page 4K/max forwarding; raw PNG/cache/cancel/error behavior retained. **81 PDF/old-image/fast-cache checks**, `.codex/release-a17-2b869f95/.codex/pdf-reading.log`, PDF_IMAGE_SKIP_BENCHMARK=1; historical A.12 latency benchmark deliberately skipped. Earlier A.16 OCR/annotation evidence remains historical, not an A.17 rerun. No live paid API, model readability or invoice validation claim.
- Pricing snapshot verified15/11/2026 against the official OpenAI image calculator and pricing pages. Uses output-token formula only, separate model2.6 low/medium factors, half-even ties and30USD/million output tokens. Input image/text rates are disclosed but input token counts remain unknown. Not an all-in quote or actual billed usage; no remote updater/price API. Output-size limits and high-resolution experimental status follow the linked docs; larger output does not guarantee text correctness.
- Final static runtime/store audits: **472 files /202 JS /nine locales**, known-forbidden endpoint scan empty; fixed existing OpenAI image-edit endpoint only, no PDF binary or prompt in numeric usage, no provider work from estimating/view/editing. Static scan complements runtime mock payload assertions, not a universal egress proof or store approval.
- ZIP **22,106,855 bytes** (+3,461 versus A.16), SHA-256 `61f78c4ab7afa593fcd0c69cf50deda4522604f77b92340d0a537d77495c1625`; vocabulary review HTML unchanged (`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`). CRC/root paths/inventory/key/permissions and installed file hashes checked via filesystem after separate staging, asset-first/manifest-last copy to the fixed folder; no browser-profile data touched. User Reload pending.
- No actual paid OpenAI request, perfect-text/fidelity claim, OS RAM benchmark, long soak, store submission or main Edge UI control. Private instructions and generated images are RAM-only; save needed images before reloading/closing. See PDF_IMAGE_PROMPT_A17.md for date/source/limits.

## Historical A.16 evidence

# Candidate A.16 validation — 15 November 2026

Runtime/package commit `40f1406b`, baseline A.15. Package 1.59.3-a.16 / numeric 1.59.3.16 / display 1.59.3A. Built/tested in isolated `.codex/release-a16-40f1406b`; the same three pre-existing uncommitted local-overlay source edits remain unchanged in the main workspace and are not included in this release. No new dependency/permission or published schema/migration.

- **4,829 unit tests passed / one intentional free-service skip**, 499 passing files / one skipped, SKIP_FREE_API=true, fresh full rerun 74.66s (`.codex/release-a16-40f1406b/.codex/tests-final.log`). Initial concurrent full run had a five-second timeout in one v121 configuration-bootstrap case while browsers were also running; isolated config suite then passed9/9 in979ms and the unchanged full suite passed when rerun after browsers finished. Resource contention is the likely explanation, not a proven production configuration defect; no production fix, timeout increase or hidden retry added. Initial log retained as `tests.log` and focused rerun as `config-rerun.log`. Type-aware lint/formatter pass.
- **23 production PDF image checks**, `.codex/release-a16-40f1406b/.codex/pdf-image-1794760244699`: actual local PDF.js rasterization of four different pages, including landscape/intrinsic rotation/square sizes, and synthetic SSE image-edit output through the real private port. Exactly four cold PNG requests, no PDF binary/path metadata; one in flight; zero local OCR requests. Raw view/PNG/ZIP bytes validated; actual exported PDF has four pages with correct physical sizes. Repeated creation/reopening/zoom/export incur zero additional calls. Stop retains page1/discards late page2; explicit resume sends three missing pages. Target/file changes cancel ownership; phone/modal and zero uncaught errors checked. Raw screenshot inspected.
- Production regression on final build: **17 A.15 direct-image checks**, `.codex/release-a16-40f1406b/.codex/generated-image-1794760243695`; **81 PDF/old-image/fast-cache checks**, `.codex/release-a16-40f1406b/.codex/pdf-reading.log`, `PDF_IMAGE_SKIP_BENCHMARK=1` (historical A.12 ZIP latency comparison intentionally not run); **35 PDF study/OCR/annotation checks**, `.codex/release-a16-40f1406b/.codex/pdf-study-1794760317002`, real bundled OCR in en/vi/zh/ja, three reading canvases and no provider calls for editing/local OCR/export. Synthetic OpenAI only; OS context-menu/clipboard clicks not driven.
- Final static runtime/store audits pass: **472 files / 202 JS / nine locales**, known-forbidden endpoint scan empty. Uses the same fixed OpenAI image-edit endpoint; only exact trusted top-frame PDF reader is added to the port allowlist. No PDF binary upload, extra service, remote OCR/assets or automatic paid retries. Static audits complement runtime payload assertions and do not prove universal egress safety or store approval.
- ZIP **22,103,394 bytes** (+5,942 versus A.15), SHA-256 `dc554035f0feeee28f59355ebe1f8780c8ce410a9e3147da001e2fb036af2042`. Standalone vocabulary HTML remains `a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`. Root/path/CRC/build inventory and installed manifest/key/permissions/file hashes checked via filesystem, staged assets first/manifest last to the same folder, no browser-profile data touched. User Reload pending.
- Limits: no paid live model quality test, precise layout/font guarantee, searchable-PDF generation, OS memory benchmark, long soak, store submission or main Edge UI control. PDF/ZIP contains completed pages only; original page IDs/order remain visible. Results are RAM-only and must be downloaded before clearing/changing document/closing tab. See PDF_IMAGE_TRANSLATION_A16.md for full-page disclosure, bounds and billing/cancellation limits.

## Historical A.15 evidence

# Candidate A.15 validation — 15 November 2026

Runtime feature commit `4c478500`, packaged build `5c1d5287`: package 1.59.3-a.15 / numeric 1.59.3.15 / display 1.59.3A. Built in isolated `.codex/release-a15-4c478500`; three existing uncommitted local-overlay source edits remain untouched in the main working tree and are not included in this release. Existing A.14 shipped local-overlay behavior is retained. The build-only follow-up pins the already-published standalone LICENSE footer line endings, leaving vocabulary HTML bytes unchanged.

- **4,814 unit tests passed / one intentional free-service skip**, 497 passing files / one skipped, SKIP_FREE_API=true. Fresh full run: `.codex/release-a15-4c478500/.codex/tests.log`, 68.86s at runtime feature commit before the footer-only build fix. Type-aware lint and formatter pass in the isolated checkout. New image-edit/client tests: 22, covering fixed endpoint/private key/sender, exact payload, streamed final PNG/partial rejection, two-job bounds, safe HTTP errors/no retry, stop/stale target/key, RAM cache/TTL/clear epochs and corrupt bitmap rejection.
- Production Chrome, packaged edge-mv3: **17 direct image checks**, `.codex/release-a15-4c478500/.codex/generated-image-1794758482147`. Synthetic OpenAI SSE PNG through the real private background port; no local OCR asset requests. Zero requests for load/crop/view/zoom/download; one cold create, zero warm create, explicit regenerate only bypasses; downloaded bytes exactly equal mocked provider PNG. HTTP errors/URL-only output rejected, stop discards late image, clear/reload invalidate RAM cache, phone has no page overflow, zero uncaught errors. No live model-quality claim.
- Production regression: **22 structured-image checks**, `.codex/release-a15-4c478500/.codex/image-structure-1794758482186`; **81 PDF/old-image/fast-cache checks**, `.codex/release-a15-4c478500/.codex/pdf.log`. `PDF_IMAGE_SKIP_BENCHMARK=1` explicitly skips the historical A.12 latency comparison (baseline ZIP absent); no performance gain claim. OS clipboard/context-menu clicks are not driven. These browser runs precede the footer-only build fix; runtime source is identical.
- Final static runtime/store audits: **472 files / 202 JS / nine locales**, known-forbidden endpoints absent, fixed OpenAI image-edit endpoint added alongside existing OpenAI paths. No new dependency/permission/config/DB/migration or PDF binary upload. Static audits complement mocked network payload assertions; they do not prove universal egress safety or store acceptance.
- Final ZIP **22,097,452 bytes** (+4,263 versus A.14), SHA-256 `b7e8bd587d148f889b06bd8d5d90b1a289d13b93f1dadc61743c39365612db7a`. Standalone vocabulary HTML remains `a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`. Staged root/path/CRC/inventory and installed file hash/key/permissions verification is filesystem-only, assets first/manifest last, same installation directory, no profile data touched. User Reload pending.
- Limits: no live paid OpenAI request, exact-layout/font guarantee, OS RAM benchmark, two-hour soak, store submission or main Edge UI inspection. Generated PNG remains RAM-only (two entries, 48 MiB encoded chars, TTL30m); reload loses it unless downloaded. Stop cannot retract a request/billing already accepted by OpenAI. See OPENAI_IMAGE_EDIT_A15.md.

## Historical A.14 evidence

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
