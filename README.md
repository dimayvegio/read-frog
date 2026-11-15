# FlowRead

Independent GPL-3.0 fork of Read Frog for bilingual web/PDF/video reading and language learning. Current local release: **1.59.3A** (numeric 1.59.3.11). Support: **admin@4dv.top**.

Bring your own OpenAI API key; AI usage is billed separately. Fixed OpenAI processing endpoints, local PDF/OCR, private credentials/notebooks and optional Edge config sync. Original PDF binaries never upload. See [privacy](PRIVACY_POLICY.md), [fork differences](FORK_DIFFERENCES.md), [upgrade guide](UPSTREAM_UPGRADE_GUIDE.md), [store handoff](store/README.md) and [source/licenses](store/SOURCE_AND_LICENSES.md).

Build: Node 26, pinned pnpm, pnpm install --frozen-lockfile, pnpm zip:edge. Set SKIP_FREE_API=true for local tests. Existing unpacked installations keep the fixed directory/Reload workflow in AGENTS.md.

Upstream: [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog). This is not its official store item. Copyright/license notices retained. Historical upstream docs do not imply removed services/providers are active here.
