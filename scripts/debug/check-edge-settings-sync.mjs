import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/edge-settings-sync-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  liveMicrosoftSync: false,
  cloudRelaySimulated: true,
  liveOpenAI: false,
  screenshots: [],
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const profiles = []
async function launch(name) {
  const browser = await puppeteer.launch({
    executablePath:
      process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    userDataDir: path.join(scratch, "profile-" + name),
    headless: false,
    pipe: true,
    enableExtensions: true,
    defaultViewport: { width: 1280, height: 940 },
    args: ["--no-first-run", "--no-default-browser-check"],
  })
  const result = { name, browser }
  profiles.push(result)
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async (label) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("edge-openai-credentials")
      request.onsuccess = () => resolve(request.result)
      request.onerror = reject
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction("credentialState", "readwrite"),
        store = tx.objectStore("credentialState"),
        request = store.get("openai")
      request.onsuccess = () =>
        store.put({ ...request.result, apiKey: `sync-profile-${label}-private-sentinel` })
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    db.close()
  }, name)
  const page = await browser.newPage()
  page.on("pageerror", (error) => (evidence.errors ??= []).push(error.message))
  await page.goto(base + "settings-sync.html")
  await page.waitForSelector('input[aria-label="Bật đồng bộ cấu hình Edge"]')
  Object.assign(result, { id, base, worker, page })
  return result
}
const rpc = async (profile, type, data) => {
  const reply = await profile.page.evaluate(
    async ({ messageType, payload }) =>
      chrome.runtime.sendMessage({
        id: Date.now(),
        type: messageType,
        data: payload,
        timestamp: Date.now(),
      }),
    { messageType: type, payload: data },
  )
  assert.ok(!reply?.err, JSON.stringify(reply?.err))
  return reply?.res
}
const click = (profile, label) =>
  profile.page.$$eval(
    "button",
    (nodes, text) => {
      const node = nodes.find((button) => button.textContent.trim() === text)
      if (!node) throw new Error("Missing button " + text)
      node.click()
    },
    label,
  )
const status = (profile) => rpc(profile, "getEdgeSettingsSync")
const synced = (profile) =>
  profile.page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="sync-status"]')
        .textContent.includes("Đã cập nhật kho cấu hình Edge") &&
      !document.querySelector('input[type="checkbox"]').disabled,
  )
const cloud = (profile) => profile.worker.evaluate(() => chrome.storage.sync.get(null))
const change = (profile, values) =>
  profile.worker.evaluate(async (patch) => {
    const { config } = await chrome.storage.local.get("config")
    if (patch.target) config.language.targetCode = patch.target
    if (patch.model) config.providersConfig[0].model.model = patch.model
    if (patch.ui) config.uiLanguage = patch.ui
    await chrome.storage.local.set({
      config,
      ...(patch.highlight === undefined ? {} : { studyHighlightsEnabled: patch.highlight }),
    })
  }, values)
async function relay(from, to) {
  const values = await cloud(from)
  await to.worker.evaluate(async (remote) => {
    const current = await chrome.storage.sync.get(null)
    await chrome.storage.sync.set(remote)
    const removed = Object.keys(current).filter(
      (key) => key.startsWith("rf-config:") && !(key in remote),
    )
    if (removed.length) await chrome.storage.sync.remove(removed)
  }, values)
}
async function credentials(profile) {
  return profile.worker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("edge-openai-credentials")
      request.onsuccess = () => resolve(request.result)
      request.onerror = reject
    })
    const key = await new Promise((resolve, reject) => {
      const request = db.transaction("credentialState").objectStore("credentialState").get("openai")
      request.onsuccess = () => resolve(request.result.apiKey)
      request.onerror = reject
    })
    db.close()
    return key
  })
}
try {
  const a = await launch("A"),
    b = await launch("B")
  evidence.browser = await a.browser.version()
  check(
    "Two isolated Edge profiles load the same extension ID from the same unpacked build",
    a.id === b.id,
  )
  check(
    "Settings sync starts disabled in both profiles",
    !(await status(a)).enabled && !(await status(b)).enabled,
  )
  await a.page.$eval('input[type="checkbox"]', (node) => node.click())
  await synced(a)
  const initial = await cloud(a),
    headers = Object.entries(initial).filter(([key]) => key.startsWith("rf-config:head:"))
  check(
    "Real storage.sync accepts the compressed snapshot and its commit marker",
    headers.length === 1,
  )
  const header = headers[0][1],
    encoded = Array.from(
      { length: header.chunks },
      (_, n) => initial[`rf-config:data:${header.device}:${header.id}:${n}`],
    ).join(""),
    decoded = gunzipSync(Buffer.from(encoded, "base64")).toString()
  check(
    "The portable sync payload excludes credentials, glossary, notebooks, audio and logs",
    !decoded.match(/private-sentinel|apiKey|glossaries|reviewEvents|audioBase64|credentialState/),
  )
  check(
    "Every sync item stays below Edge's 8 KB item quota",
    Object.entries(initial).every(
      ([key, value]) => Buffer.byteLength(key + JSON.stringify(value)) < 8192,
    ),
  )
  evidence.initialSyncBytes = Object.entries(initial).reduce(
    (sum, [key, value]) => sum + Buffer.byteLength(key + JSON.stringify(value)),
    0,
  )
  await change(b, { target: "eng", highlight: false })
  await relay(a, b)
  await b.page.$eval('input[type="checkbox"]', (node) => node.click())
  await b.page.waitForSelector('[data-testid="sync-conflict"]')
  check(
    "First connection previews a differing cloud configuration before overwriting local settings",
    (await status(b)).status === "conflict" &&
      (await b.worker.evaluate(
        async () => (await chrome.storage.local.get("config")).config.language.targetCode,
      )) === "eng",
  )
  await click(b, "Dùng bản này")
  await synced(b)
  check(
    "Choosing the remote configuration applies language and the highlight preference",
    await b.worker.evaluate(async () => {
      const data = await chrome.storage.local.get(["config", "studyHighlightsEnabled"])
      return data.config.language.targetCode === "vie" && data.studyHighlightsEnabled !== false
    }),
  )
  check(
    "Receiving settings creates a local backup and undo point",
    (await status(b)).canUndo &&
      (await b.worker.evaluate(
        async () => ((await chrome.storage.local.get("backup_ids")).backup_ids?.length ?? 0) > 0,
      )),
  )
  check(
    "Both profiles retain their original private OpenAI credential",
    (await credentials(a)) === "sync-profile-A-private-sentinel" &&
      (await credentials(b)) === "sync-profile-B-private-sentinel",
  )
  // Respect the production write coalescing interval; no test-only clock hook.
  await new Promise((resolve) => setTimeout(resolve, 16000))
  await change(b, { target: "eng" })
  await click(b, "Đồng bộ ngay")
  await synced(b)
  const afterB = await cloud(b),
    headB = Object.entries(afterB).find(
      ([key, row]) => key.startsWith("rf-config:head:") && row.device !== header.device,
    )[1]
  check(
    "Committing a new snapshot removes only obsolete chunks belonging to that profile",
    Object.keys(afterB)
      .filter((key) => key.startsWith(`rf-config:data:${headB.device}:`))
      .every((key) => key.includes(headB.id)),
  )
  check(
    "A local edit publishes a new configuration without deleting another profile's head",
    Object.keys(afterB).filter((key) => key.startsWith("rf-config:head:")).length === 2,
  )
  await relay(b, a)
  await click(a, "Đồng bộ ngay")
  await synced(a)
  check(
    "A causal incoming change updates the other profile through the production receiver",
    await a.worker.evaluate(
      async () => (await chrome.storage.local.get("config")).config.language.targetCode === "eng",
    ),
  )
  await change(a, { model: "gpt-6-luna" })
  await click(a, "Đồng bộ ngay")
  await synced(a)
  await change(b, { ui: "vi" })
  await relay(a, b)
  await click(b, "Đồng bộ ngay")
  await b.page.waitForSelector('[data-testid="sync-conflict"]')
  check(
    "Concurrent local and remote edits require a choice rather than a clock-based overwrite",
    (await status(b)).status === "conflict",
  )
  check(
    "The conflict screen provides the complete public configuration for review",
    await b.page.$eval(
      '[data-testid="sync-conflict"]',
      (node) => node.querySelectorAll("details pre").length === 2,
    ),
  )
  await b.page.bringToFront()
  await b.page.screenshot({ path: path.join(scratch, "sync-conflict.png"), fullPage: true })
  evidence.screenshots.push("sync-conflict.png")
  await click(b, "Dùng cấu hình máy này")
  await synced(b)
  check(
    "Explicit local resolution preserves the user's chosen settings",
    await b.worker.evaluate(
      async () => (await chrome.storage.local.get("config")).config.uiLanguage === "vi",
    ),
  )
  for (const width of [390, 760, 1280]) {
    await b.page.setViewport({ width, height: 940 })
    check(
      `Sync configuration screen fits ${width}px`,
      await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await b.page.setViewport({ width: 390, height: 940 })
  await b.page.screenshot({ path: path.join(scratch, "sync-390.png"), fullPage: true })
  evidence.screenshots.push("sync-390.png")
  b.page.once("dialog", (dialog) => dialog.accept())
  await click(b, "Khôi phục cấu hình trước lần nhận")
  await b.page.waitForFunction(() => !document.querySelector('input[type="checkbox"]').checked)
  check(
    "Undo restores previous local settings and disables automatic resending",
    (await status(b)).enabled === false &&
      (await b.worker.evaluate(
        async () =>
          (await chrome.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled ===
          false,
      )),
  )
  check(
    "Undo preserves the private credential and remote revision history",
    (await credentials(b)) === "sync-profile-B-private-sentinel" &&
      Object.keys(await cloud(b)).some((key) => key.startsWith("rf-config:head:")),
  )
  const web = await a.browser.newPage()
  await web.setRequestInterception(true)
  web.on("request", (request) =>
    request.isNavigationRequest()
      ? void request.respond({
          status: 200,
          contentType: "text/html",
          body: '<!doctype html><html lang="en"><title>Feedback removal fixture</title><p>Read Frog feedback fixture.</p></html>',
        })
      : void request.continue(),
  )
  await web.goto("https://example.com/read-frog-feedback")
  await web.waitForSelector('pierce/[data-testid="floating-button-container"]')
  check(
    "The production floating control retains Settings and removes Send feedback",
    await web.$eval(
      'pierce/[data-testid="floating-button-container"]',
      (node) =>
        !node.querySelector('[aria-label="Send feedback"]') &&
        !!node.querySelector('[aria-label="Settings"]'),
    ),
  )
  const denied = await a.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://example.com/read-frog-feedback" })
    const [reply] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () =>
        chrome.runtime.sendMessage({
          id: Date.now(),
          type: "getEdgeSettingsSync",
          timestamp: Date.now(),
        }),
    })
    return reply.result
  })
  check(
    "A website content context cannot read the privileged sync payload",
    denied?.err?.message === "Open settings sync",
  )
  check(
    "Sync and feedback actions make no paid OpenAI request",
    (await a.worker.evaluate(() => __pdfCalls.length)) === 0 &&
      (await b.worker.evaluate(() => __pdfCalls.length)) === 0,
  )
  check("Production sync pages have no JavaScript errors", !evidence.errors?.length)
  evidence.checkCount = evidence.checks.length
} catch (error) {
  evidence.failure = String(error)
  for (const profile of profiles)
    if (profile.page) {
      await profile.page.bringToFront().catch(() => {})
      await profile.page
        .screenshot({ path: path.join(scratch, `failure-${profile.name}.png`) })
        .catch(() => {})
      evidence[`failure-${profile.name}`] = await profile.page
        .evaluate(() => document.body.innerText)
        .catch(() => "")
    }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  for (const profile of profiles) await profile.browser.close()
  console.log(JSON.stringify({ scratch, ...evidence }, null, 2))
}
