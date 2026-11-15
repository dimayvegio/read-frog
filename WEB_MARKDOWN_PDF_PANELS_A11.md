# FlowRead 1.59.3A.11 — HTML fallback cache, technical Markdown and PDF panels

Baseline `1216a049` checked before edits. Package 1.59.3-a.11, manifest 1.59.3.11, display 1.59.3A. No new permission, provider/model, migration or published DB/config/sync/ZIP format changes. Node/CI versions remain unchanged.

## HTML selection fallback

Normal in-page and fixed-pane routes remain first. When the page receiver is absent, the context-menu popup fallback now supplies web metadata only after a read-only MIME probe of the exact original frame. It checks trusted context URL, before/after browser frame URL, injected frame URL and matching document IDs when available; legacy frames without IDs still need exact URLs. The entire probe is bounded to two seconds. Unknown/PDF/protected/denied/stale sources retain their previous generic fallback, never automatically become HTML. Guest PDF tabs are never used to inject into an unrelated active tab.

Confirmed HTML enters the existing A.9 completed-only local cache and avoids PDF text cleanup/history. Source title is bounded UI metadata, not provider context. No second translator/cache/queue or automatic retry was added. Cache reuse still depends on completion, identity and eviction/expiry; this does not promise every context-menu action on every protected document is cacheable.

## Technical Markdown

Pinned bundled remark-gfm 4.0.1 enables tables. Tables and fenced code have keyboard-reachable horizontal scroll containers, light/dark styles and monospace code; ordered list numbering is retained. Existing image suppression and ReactMarkdown's inert raw HTML/safe URL processing remain. No raw-HTML execution, external images/fonts/highlighter, CDN or provider work. Dependency licenses ship in licenses/remark-gfm-notices.txt; standalone vocabulary HTML remains unchanged.

## PDF panel preferences/layout

Search/outline/pages/bookmark/etc. share a view-only rf-study-panel-rect-v1 localStorage preference with version, bounded finite geometry, safe reads/writes and viewport clamping. Save on committed pointer gestures, keyboard adjustments and Reset; no writes during pointer previews/canceled gestures and no mandatory storage for the view to work. Reset saves defaults. Existing schemas, source extraction and document sidecars are untouched; this preference is outside settings sync/export.

On desktop, original PDF column space follows the panel's actual committed right edge plus an eight-pixel gap; mobile keeps the existing overlay rule. Update the reservation once at gesture completion to avoid continuously relaying out PDF pages while dragging. Initialize/viewport resize/reset update it too; closing/unmount removes the owned CSS property. Dragging/canceling preserves pointer capture, rAF/listener cleanup and no-provider behavior. Very wide panels still consume reading space chosen by the user; no claim that two full-width views can fit simultaneously.

## Evidence and limits

4,725 unit tests passed / one intentional free-service skip, 489 passing test files. New tests cover MIME/frame/document/legacy/timeout fallback decisions, GFM code/table safety and numbering, geometry persistence/storage failure, pointer-cancel/no-preview-write, cleanup and small-viewport clamping. Focused baseline run was 41 tests before three extra edge cases.

Production Chrome checks use the actual edge-mv3 build and controlled OpenAI responses: HTML pane 18 assertions, including a real GFM table and long code horizontal overflow with no model image; PDF study 35 assertions with real four-language local OCR, panel sizing/reload/reserved space, existing drawing/export/native text and zero provider calls from controls. Native OS menu is unit/bridge covered, not driven by CDP. Source extraction/annotation checks wait for leased canvases after a layout change, rather than assuming synchronous rendering.

No live paid API, site-account session, OS RAM benchmark, full mixed-use 120-minute soak or new Edge UI run is claimed. API/network audits and final ZIP hash/install checks are recorded in store/VALIDATION.md. Routine installation update is filesystem-only; user Reload required.
