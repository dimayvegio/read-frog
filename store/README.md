# FlowRead — store handoff

Candidate: package `1.59.3-a.9`, numeric `1.59.3.9`, display `1.59.3A`. Public name **FlowRead**, contact **admin@4dv.top**. Do not invent a company/legal name. Independent GPL-3.0 fork of Read Frog.

1. Use the verified root-manifest extension ZIP in the GitHub release. Chromium MV3 package tested in isolated Chrome; fresh Edge launch failed before loading the extension on this machine, so Edge runtime validation remains pending. Do not upload source archives or browser profiles as the extension.
2. Register your own [Edge Partner Center](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) / [Chrome developer account](https://developer.chrome.com/docs/webstore/publish), complete identity/contact verification and applicable registration/payment. The owner must accept terms and attest data disclosures. **Nothing has been submitted or approved.**
3. Copy `listings/en.md` or `vi.md`; `listings/localized.json` covers other manifest locales. Choose an appropriate Education/Productivity category. Single purpose: **help users read, listen to and learn from content across languages using their own OpenAI key**. OpenAI usage is separately billed; no FlowRead subscription/account.
4. Upload `media/icon-128.png` (Chrome), `icon-300.png` (Edge), `promo-small.png` (440×280), optional `promo-marquee.png` (1400×560), and actual 1280×800 screenshots. Screenshot content is synthetic and AI replies controlled, not live quality evidence.
5. Public privacy URL once tagged: https://github.com/dimayvegio/read-frog/blob/v1.59.3A.9/PRIVACY_POLICY.md . Bundled `privacy.html` also works offline. Do not enter an unconfigured/404 Pages URL. The policy can later be hosted on your own HTTPS site.
6. Complete `DATA_DISCLOSURES.md` and `PERMISSIONS.md` against the final ZIP. Remote code: **No** for this package: executable JS/WASM, models and rules are local. OpenAI responses are data, not executable code.
7. Paste `REVIEWER_INSTRUCTIONS.md` into private review notes. Supply any temporary budgeted API review key through the store's **private** channel only, never ZIP/repo/screenshots/public listing. No dummy key is claimed to work live.
8. Request review, preferably defer publication until reviewed. Record assigned **own** IDs in `src/utils/constants/flowread.ts` for a tested follow-up. Never use upstream IDs. Store/unpacked IDs have separate data; read `INSTALL_AND_DATA.md` before moving.

Requirements checked against [Chrome images](https://developer.chrome.com/docs/webstore/images), [Chrome privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [local-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [remote-code rules](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code), [Edge submission](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) and [Edge policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies), 15 November 2026. Checks do not guarantee store approval.

See `SOURCE_AND_LICENSES.md` and `VALIDATION.md` for source/build, tests and limits.
