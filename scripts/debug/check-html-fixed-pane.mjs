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
const scratch = path.resolve(`.codex/html-fixed-pane-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  protocolTimeout: 20000,
  defaultViewport: { width: 1400, height: 950 },
  args: ["--no-first-run", "--disable-background-networking"],
})
const evidence = { checks: [], errors: [], liveOpenAI: false, nativeOsMenuDriven: false }
const check = (name, result) => {
  assert.ok(result, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
let source, panel
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  console.log("READY options")
  await worker.evaluate(preparePdfWorker)
  console.log("READY provider fixture")
  source = await browser.newPage()
  source.on("pageerror", (e) => evidence.errors.push(e.message))
  await source.setRequestInterception(true)
  source.on("request", (r) => {
    if (r.isNavigationRequest())
      return r.respond({
        contentType: "text/html",
        body: '<!doctype html><title>Local HTML article fixture</title><style>body{font:22px/1.7 Georgia;padding:50px;max-width:780px}p{margin:40px 0}</style><main id="article"><h1>Read an article, one passage at a time.</h1><p id="first">Learning a little every day is more effective than studying once a week.</p><p id="second">Regular <a href="#practice">practice</a> helps us remember new words.</p><p id="third">Small steps can make a lasting difference.</p><button id="count" onclick="this.textContent=Number(this.textContent)+1">0</button></main>',
      })
    if (/^chrome-extension:|^blob:|^data:/.test(r.url())) return r.continue()
    return r.abort()
  })
  const url = "https://example.com/fixed-pane-fixture"
  await source.goto(url)
  await source.waitForSelector("read-frog-selection")
  console.log("READY source")
  const tab = await worker.evaluate(
    async (u) => (await chrome.tabs.query({})).find((t) => t.url === u),
    url,
  )
  const original = await source.$eval("#article", (n) => n.innerHTML)
  // Native OS context menus cannot be synthesized by CDP. Seed their private
  // validated bridge output; actual menu classification/routing has unit tests.
  await worker.evaluate(
    async ({ tab: sourceInfo }) => {
      const channel = crypto.randomUUID(),
        digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceInfo.url)),
        )
      const routeHash = [...digest].map((x) => x.toString(16).padStart(2, "0")).join("")
      await chrome.storage.session.set({
        ["native-panel:" + sourceInfo.windowId]: channel,
        ["native-selection:" + channel]: {
          id: crypto.randomUUID(),
          text: "Initial selected HTML passage.",
          createdAt: Date.now(),
          tooLong: false,
          panelWindowId: sourceInfo.windowId,
          sourceTabId: sourceInfo.id,
          sourceFrameId: 0,
          sourceRouteHash: routeHash,
          source: { kind: "web" },
          sourceTitle: sourceInfo.title,
        },
      })
    },
    { tab },
  )
  await options.evaluate((windowId) => {
    const b = document.createElement("button")
    b.id = "test-panel-toggle"
    b.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:2147483647;padding:12px;background:white;color:black"
    b.textContent = "Open test panel"
    b.onclick = () => chrome.sidePanel.open({ windowId })
    document.body.append(b)
  }, tab.windowId)
  await options.bringToFront()
  await options.click("#test-panel-toggle")
  console.log("READY open clicked")
  panel = await (await browser.waitForTarget((t) => t.url() === base + "sidepanel.html")).asPage()
  panel.on("pageerror", (e) => evidence.errors.push(e.message))
  await panel.waitForSelector('[data-testid="native-selection-output"][aria-busy="false"]')
  check(
    "HTML uses generic source controls without PDF history/cleanup/reader",
    await panel.evaluate(
      () =>
        !document.body.innerText.includes("Văn bản PDF") &&
        !document.body.innerText.includes("Lịch sử tài liệu") &&
        !document.body.innerText.includes("Đọc PDF và tự lưu"),
    ),
  )
  const calls = () => worker.evaluate(() => __pdfCalls.length)
  const select = async (selector) => {
    await source.bringToFront()
    await source.$eval(selector, (node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      document.dispatchEvent(new Event("selectionchange"))
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    })
    await source.waitForSelector('pierce/[aria-label="Translation"]', { visible: true })
    await source.click('pierce/[aria-label="Translation"]')
  }
  const expectPanel = async (text) => {
    await panel.waitForFunction(
      (s) =>
        document.querySelector('[data-testid="native-selection-output"]')?.textContent.includes(s),
      {},
      text,
    )
    await panel.waitForSelector('[data-testid="native-selection-output"][aria-busy="false"]')
  }
  let count = await calls()
  await select("#first")
  await expectPanel("Learning a little")
  check(
    "toolbar Translate updates the same fixed HTML pane with one provider request",
    (await calls()) === count + 1,
  )
  await source.waitForFunction(() => CSS.highlights.has("flowread-fixed-selection-v1"))
  check(
    "fixed source highlight is native paint, without changing source DOM",
    (await source.$eval("#article", (n) => n.innerHTML)) === original,
  )
  count = await calls()
  await select("#second")
  await expectPanel("Regular practice")
  check(
    "a new selection replaces the pane and previous highlight instead of opening another translator",
    (await calls()) === count + 1 &&
      (await source.evaluate(() => CSS.highlights.get("flowread-fixed-selection-v1").size === 1)),
  )
  check(
    "HTML text stays outside PDF provider usage/structured row prompts",
    await worker.evaluate(() =>
      __pdfCalls.every((c) => !JSON.stringify(c.body).includes("pdf-layout-cells-v1")),
    ),
  )
  const clickMode = async (mode) => {
    await panel.evaluate((value) => {
      const labels = {
        translate: /^(Dịch|Translate|Translation)$/i,
        explain: /^(Giải thích kỹ thuật|Technical explanation)$/i,
        summary: /^(Tóm tắt đoạn|Section summary)$/i,
      }
      const button = [...document.querySelectorAll("button")].find((n) =>
        labels[value].test(n.textContent.trim()),
      )
      if (!button) throw new Error("Missing mode " + value)
      button.click()
    }, mode)
    await panel.waitForSelector('[data-testid="native-selection-output"][aria-busy="false"]')
  }
  count = await calls()
  await clickMode("translate")
  await clickMode("translate")
  check("repeated active Translate clicks do not call the provider", (await calls()) === count)
  await clickMode("explain")
  await panel.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="native-selection-output"]')
        ?.getAttribute("aria-busy")
        ?.includes("true"),
  )
  for (let i = 0; i < 50 && (await calls()) === count; i++)
    await new Promise((r) => setTimeout(r, 100))
  await panel.waitForSelector('[data-testid="native-selection-output"][aria-busy="false"]')
  const afterExplain = await calls()
  check("first explanation is an explicit separate request", afterExplain === count + 1)
  await clickMode("translate")
  await panel.waitForFunction(() =>
    document.body.textContent.includes("Dùng bản dịch trang web đã lưu"),
  )
  check(
    "returning from Explain to Translate reuses the completed web cache",
    (await calls()) === afterExplain,
  )
  await clickMode("summary")
  for (let i = 0; i < 50 && (await calls()) === afterExplain; i++)
    await new Promise((r) => setTimeout(r, 100))
  await panel.waitForSelector('[data-testid="native-selection-output"][aria-busy="false"]')
  const afterSummary = await calls()
  check("first summary is an explicit separate request", afterSummary === afterExplain + 1)
  await clickMode("translate")
  await panel.waitForFunction(() =>
    document.body.textContent.includes("Dùng bản dịch trang web đã lưu"),
  )
  check("returning from Summary to Translate also reuses cache", (await calls()) === afterSummary)
  await select("#second")
  await expectPanel("Regular practice")
  check(
    "selecting the same completed passage again uses cache across request IDs",
    (await calls()) === afterSummary,
  )
  await source.evaluate(() => getSelection().removeAllRanges())
  check(
    "source highlight remains after native selection loses focus",
    await source.evaluate(() => CSS.highlights.has("flowread-fixed-selection-v1")),
  )
  await source.screenshot({ path: path.join(scratch, "source-highlight.png") })
  await panel.screenshot({ path: path.join(scratch, "fixed-pane.png") })
  await options.evaluate((windowId) => {
    document.getElementById("test-panel-toggle").onclick = () =>
      chrome.sidePanel.close({ windowId })
  }, tab.windowId)
  await options.bringToFront()
  await options.click("#test-panel-toggle")
  await source.bringToFront()
  await source.waitForFunction(() => !CSS.highlights.has("flowread-fixed-selection-v1"))
  check("closing the pane removes its highlight", true)
  count = await calls()
  await select("#third")
  await source.waitForFunction(() =>
    [...document.querySelectorAll("*")].some((n) =>
      n.shadowRoot?.textContent.includes("Bản dịch PDF số"),
    ),
  )
  check(
    "after closing, normal web selection translation falls back to its existing popover",
    (await calls()) === count + 1,
  )
  await source.click("#count")
  check(
    "source links, event handlers and text remain intact",
    (await source.$eval("#count", (n) => n.textContent)) === "1",
  )
  check("no uncaught production errors", evidence.errors.length === 0)
  evidence.browser = await browser.version()
} catch (error) {
  evidence.failure = String(error)
  if (panel && !panel.isClosed())
    evidence.panel = await panel.evaluate(() => document.body.innerText).catch(() => "")
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log("Evidence:", scratch)
}
