import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/upstream-160-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  protocolTimeout: 20000,
  defaultViewport: { width: 1400, height: 950 },
  args: ["--no-first-run", "--disable-background-networking"],
})
const evidence = { checks: [], errors: [], liveOpenAI: false, mainEdgeControlled: false }
const check = (name, passed) => {
  assert.ok(passed, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const poll = async (operation) => {
  for (let i = 0; i < 150; i++) {
    if (await operation()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("Fixture condition timed out")
}
const rpc = (page, type, data) =>
  page.evaluate(
    async ({ name, payload }) => {
      const response = await new Promise((resolve, reject) =>
        chrome.runtime.sendMessage(
          { id: Date.now(), type: name, data: payload, timestamp: Date.now() },
          (reply) =>
            chrome.runtime.lastError
              ? reject(new Error("Fixture RPC unavailable"))
              : resolve(reply),
        ),
      )
      if (response?.err) throw new Error("Fixture RPC rejected")
      return response?.res
    },
    { name: type, payload: data },
  )
let options, source
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url() === base + "background.js",
    )
  ).worker()
  options = await browser.newPage()
  options.on("pageerror", (error) => evidence.errors.push(error.message))
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.pageTranslation.enableAIContentAware = false
    config.pageTranslation.page.minWordsPerNode = 5
    await chrome.storage.local.set({ config })
  })
  check(
    "fresh fork config is schema127 with only OpenAI and default timeouts",
    await worker.evaluate(async () => {
      const { config, config$: meta } = await chrome.storage.local.get(["config", "config$"])
      return (
        meta.schemaVersion === 127 &&
        config.providersConfig.every((p) => p.provider === "openai") &&
        config.pageTranslation.requestQueueConfig.timeoutMs === 20000 &&
        config.videoSubtitles.requestQueueConfig.timeoutMs === 20000
      )
    }),
  )
  for (const [route, property, value] of [
    ["page-translation/translation-queue", "pageTranslation", "45"],
    ["video-subtitles/subtitles-queue", "videoSubtitles", "60"],
  ]) {
    await options.goto(base + "options.html#/" + route)
    await options.reload()
    await options.bringToFront()
    await options.waitForSelector("[id$=request-timeout] input", { visible: true })
    const input = await options.$("[id$=request-timeout] input")
    await input.click({ clickCount: 3 })
    await input.type("999")
    await input.press("Enter")
    await poll(() => options.$eval("[id$=request-timeout] input", (node) => node.value === "20"))
    check(
      `${property} rejects an invalid draft without saving its valid prefix`,
      await worker.evaluate(
        async (key) =>
          (await chrome.storage.local.get("config")).config[key].requestQueueConfig.timeoutMs ===
          20000,
        property,
      ),
    )
    await input.click({ clickCount: 3 })
    await input.type(value)
    await input.press("Enter")
    await poll(() =>
      worker.evaluate(
        async ({ key, seconds }) =>
          (await chrome.storage.local.get("config")).config[key].requestQueueConfig.timeoutMs ===
          Number(seconds) * 1000,
        { key: property, seconds: value },
      ),
    )
    check(`${property} commits the explicit timeout in milliseconds`, true)
  }
  for (const route of ["context-menu", "floating-button", "selection-toolbar"]) {
    await options.goto(base + "options.html#/" + route)
    await options.reload()
    await options.waitForSelector("[role=img][aria-label]")
    check(
      `${route} renders a local live preview`,
      await options.$eval(
        "[role=img][aria-label]",
        (node) =>
          node.getBoundingClientRect().width > 100 && node.getBoundingClientRect().height > 100,
      ),
    )
  }
  await options.screenshot({ path: path.join(scratch, "settings-preview.png") })
  check(
    "settings and previews perform no provider work",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  source = await browser.newPage()
  source.on("pageerror", (error) => evidence.errors.push(error.message))
  const url = "https://example.com/flowread-160-diagnosis"
  await source.setRequestInterception(true)
  source.on("request", (request) =>
    request.url() === url
      ? request.respond({
          contentType: "text/html",
          body: '<!doctype html><html lang="en"><meta charset="utf-8"><title>QA local diagnosis</title><style>body{font:22px/1.7 Arial;padding:60px;max-width:800px}p{margin:40px 0}</style><article id="article"><p id="long">Learning a little every day helps us remember new words and understand the world more clearly.</p><p id="short">Hi.</p><p>12345</p></article></html>',
        })
      : /^(?:chrome-extension:|blob:|data:)/u.test(request.url())
        ? request.continue()
        : request.abort(),
  )
  await source.goto(url)
  await source.waitForSelector("read-frog-selection")
  const tab = await worker.evaluate(
    async (address) => (await chrome.tabs.query({})).find((item) => item.url === address),
    url,
  )
  const toggle = () =>
    worker.evaluate(
      async (tabId) =>
        chrome.tabs.sendMessage(tabId, {
          id: Date.now(),
          type: "togglePageTranslationDiagnostics",
          data: undefined,
          timestamp: Date.now(),
        }),
      tab.id,
    )
  const hasPanel = () =>
    source.evaluate(() =>
      [...document.querySelectorAll("*")].some((node) =>
        node.shadowRoot?.querySelector('aside[aria-label="Page diagnosis"]'),
      ),
    )
  const original = await source.$eval("#article", (node) => node.innerHTML)
  await toggle()
  await poll(hasPanel)
  check(
    "diagnosis opens before translation without changing article DOM or calling a provider",
    (await source.$eval("#article", (node) => node.innerHTML)) === original &&
      (await worker.evaluate(() => __pdfCalls.length === 0)),
  )
  await toggle()
  await poll(async () => !(await hasPanel()))
  await worker.evaluate(
    async (tabId) =>
      chrome.tabs.sendMessage(tabId, {
        id: Date.now(),
        type: "askManagerToTogglePageTranslation",
        data: { enabled: true },
        timestamp: Date.now(),
      }),
    tab.id,
  )
  await source.waitForSelector(".read-frog-translated-content-wrapper")
  await poll(() => worker.evaluate(() => __pdfCalls.length > 0))
  const calls = await worker.evaluate(() => __pdfCalls.length)
  await toggle()
  await poll(hasPanel)
  await poll(() =>
    source.evaluate(() =>
      [...document.querySelectorAll("*")].some((node) =>
        node.shadowRoot
          ?.querySelector('aside[aria-label="Page diagnosis"]')
          ?.textContent.includes("Too short to translate"),
      ),
    ),
  )
  check("diagnosis reports the actual translation/filter outcomes", true)
  await source.evaluate(() => {
    const panel = [...document.querySelectorAll("*")]
      .map((node) => node.shadowRoot?.querySelector('aside[aria-label="Page diagnosis"]'))
      .find(Boolean)
    ;[...panel.querySelectorAll("button")]
      .find((button) => button.textContent.includes("Too short to translate"))
      .click()
  })
  check(
    "viewing and outlining diagnosis reuses existing results",
    await worker.evaluate((expected) => __pdfCalls.length === expected, calls),
  )
  await source.screenshot({ path: path.join(scratch, "page-diagnosis.png") })
  const rejected = await worker.evaluate(async (tabId) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () =>
        chrome.runtime.sendMessage({
          id: Date.now(),
          type: "getDiagnosticsReport",
          timestamp: Date.now(),
        }),
    })
    return !!result.result?.err
  }, tab.id)
  check("a content frame cannot export the private diagnostics/config report", rejected)
  await rpc(options, "storeLogRecords", {
    context: "options",
    records: [
      {
        time: Date.now(),
        level: "warn",
        scope: "QA-160",
        message: "QA diagnostic sentinel",
        fields: {
          apiKey: "diag-key-sentinel",
          responseBody: "diag-body-sentinel",
          requestHeaders: { "X-Key": "diag-header-sentinel" },
        },
      },
    ],
  })
  const report = await rpc(options, "getDiagnosticsReport")
  const encoded = JSON.stringify(report)
  check(
    "explicit local report includes sanitized logs and schema127 without credentials/bodies",
    report.format === 1 &&
      report.config.schemaVersion === 127 &&
      report.logs.some((record) => record.scope === "QA-160") &&
      ![
        "diag-key-sentinel",
        "diag-body-sentinel",
        "diag-header-sentinel",
        "pdf-reading-test-sentinel",
      ].some((secret) => encoded.includes(secret)),
  )
  check(
    "report generation makes no additional provider request",
    await worker.evaluate((expected) => __pdfCalls.length === expected, calls),
  )
  await options.bringToFront()
  await options.goto(base + "options.html#/help-and-community")
  await options.reload()
  await options.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((button) =>
        button.textContent.includes("Export diagnostics"),
      ),
    { polling: 100 },
  )
  check(
    "fork help exposes explicit diagnostics without upstream survey/feedback launchers",
    await options.evaluate(
      () => !document.querySelector('a[href*="ifapi"],a[href*="survey"],a[href*="featurebase"]'),
    ),
  )
  check("no uncaught production errors", evidence.errors.length === 0)
} catch (error) {
  evidence.failure = String(error)
  for (const [index, page] of (await browser.pages()).entries())
    await page
      .screenshot({ path: path.join(scratch, `failure-${index}.png`), timeout: 5000 })
      .catch(() => {})
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log("Evidence:", scratch)
}
