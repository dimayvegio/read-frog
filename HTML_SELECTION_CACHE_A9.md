# FlowRead 1.59.3A.9 — reuse completed HTML selection translations

Baseline `901a488e` / v1.59.3A.8 checked before edits. Package 1.59.3-a.9, numeric 1.59.3.9, display 1.59.3A. No new provider, permission, migration or published data format.

## Fixed

HTML fixed-pane translation previously had no completed-result cache, unlike Explain/Summary and document-scoped PDF translation. Returning to Translate after another mode or requesting the same selected passage could create another paid request. Clicking an already-active mode was already guarded; retain that guard.

Reuse existing local AiCache DB2, kind translate, complete-only rows: at most 500 entries / 16 MiB / 30 days shared with other AI caches. Identity includes normalized source text, resolved system/user prompts (including matched glossary terms), selected output configuration/language, provider/model settings and credential revision. No source-page URL, local PDF path or credential secret is added to the cache identity; selected source text is user content. No shared page-engine cache or PDF history is substituted.

Returning from Explain/Summary or selecting the same completed text again reuses a matching local result. Cache survives pane remount/browser restart in the same extension profile until expiry, eviction, clear or an identity change. Existing pre-update translations are not retroactively available. Report actual saved/cache-hit state; failed storage is not advertised as saved. Cache hits record numeric-only local usage, never a provider call.

Explicit regenerate bypasses once and replaces the reusable result. Different text/language/model/prompt/matched glossary/key revision obtains an independent result. Config/key/cache changes invalidate pending work; late results after a changed custom prompt/clear and partial/aborted results are not saved. Interrupted incomplete work can require another request. No automatic paid retries. PDF/image caches and normal web popover translation paths remain independent.

## Validation

- 35 focused selection tests passed, including 11 new cache tests: complete reuse/cache-only, explicit regenerate replacement, six identity/clear cases, canceled fragment and two late-output races.
- 16 assertions against the actual compiled extension in isolated Chrome: repeated active clicks, first Explain/Summary requests, return-to-Translate zero new provider requests, same passage across request IDs, real sidepanel/toolbar, source highlight/DOM, close cleanup/popover fallback. Controlled OpenAI responses, no live paid API. Native OS menu covered by existing unit/bridge tests, not driven by CDP.
- Full-suite/build/audit/ZIP results are recorded in store/VALIDATION.md. Video/PDF/OCR production evidence from a.8 is historical, not rerun for this narrow cache change.
- User Edge UI is not controlled. Routine update copies extension files with manifest last into the fixed installation, preserves identity/browser data, verifies hashes; user Reload required. Actual Edge and live model quality/cost are not newly verified.
