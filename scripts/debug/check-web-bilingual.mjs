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
const scratch = path.resolve(`.codex/web-bilingual-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = { checks: [], screenshots: [], liveOpenAI: false },
  errors = [],
  consoles = []
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const url = "https://rf-reading.example/news/daily-learning"
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Learning a little every day</title><style>
body{margin:0;background:#f4f5f1;color:#243348;font:18px/1.75 Arial}nav{padding:14px 28px;background:#153d30;color:#fff;font-size:14px}main{max-width:740px;margin:40px auto;padding:0 24px 140px}h1{font:700 40px/1.2 Georgia;margin:18px 0}h2{font-size:24px}p{margin:24px 0}a{color:#226c9d}figure{margin:28px 0}figcaption{font-size:13px;color:#68776d}img{display:block;width:100%;height:120px;object-fit:cover;border-radius:8px}pre{white-space:pre-wrap;font:inherit;padding:16px;background:#fff}button{padding:8px}li{margin-bottom:20px}
</style><nav>READING JOURNAL · Article fixture</nav><main><article id="article"><h1>Learning a little every day</h1>
<p id="first">Small daily steps can make a lasting difference. <strong>Regular practice helps us remember new words.</strong> Read the <a id="original-link" href="#next">original paragraph</a>, then compare it with the translation.</p>
<figure><img id="article-image" alt="A green learning landscape" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='120'%3E%3Crect width='800' height='120' fill='%23cee3d4'/%3E%3Cpath d='M0 120 L180 35 L330 90 L510 20 L800 120' fill='%2384b49b'/%3E%3C/svg%3E"><figcaption>Learning is a journey, one paragraph at a time.</figcaption></figure>
<p id="second">Learning a little every day is more effective than studying a lot once a week. Listen and repeat aloud. Use the words in a sentence of your own.</p>
<h2 id="next">Practice with a clear goal</h2><p id="third">Read the original paragraph, then compare it with the translation. Small daily steps can make a lasting difference. Take a break and return tomorrow.</p>
<div id="virtual" style="white-space:pre-wrap;padding:16px;background:white">Practice one short sentence every day. Read slowly and listen carefully.

Take a break and return tomorrow. Regular practice helps us remember new words.</div>
<ol><li>Use the words in a sentence of your own. Share the story with a friend.</li><li>Listen and repeat aloud. Take a break and return tomorrow.</li></ol>
<p id="tail">A long story continues below. Learning a little every day is more effective than studying a lot once a week.</p>
<button id="counter">Counter: 0</button></article></main><script>window.clicks=0;document.querySelector('#counter').onclick=()=>{document.querySelector('#counter').textContent='Counter: '+(++window.clicks)};window.originalFirst=document.querySelector('#first');window.originalLink=document.querySelector('#original-link');window.linkClicks=0;window.originalLink.addEventListener('click',()=>window.linkClicks++);</script></html>`
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1440, height: 960 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
let source
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  evidence.browser = await browser.version()
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.language.sourceCode = "eng"
    config.language.targetCode = "vie"
    // Establish the speech provider before mounting content UI. A raw fixture
    // storage write later can race automatic page-language configuration writes.
    config.tts.provider = "openai"
    config.tts.openai.model = "gpt-4o-mini-tts"
    config.pageTranslation.mode = "bilingual"
    config.pageTranslation.page.range = "all"
    config.pageTranslation.enableAIContentAware = false
    config.pageTranslation.page.translateTitle = false
    config.pageTranslation.customPromptsConfig = {
      promptId: "web-fixture",
      patterns: [
        {
          id: "web-fixture",
          name: "Fixture",
          systemPrompt: "Translate to Vietnamese. Preserve every HTML tag and marker.",
          prompt: "{{input}}",
        },
      ],
    }
    await chrome.storage.local.set({ config })
    globalThis.__pdfTextOutput = (body) => {
      const text =
        typeof body.input === "string"
          ? body.input
          : body.input
              .filter((item) => item.role === "user")
              .flatMap((item) => item.content ?? [])
              .map((part) => part.text ?? "")
              .join("")
      return text
        .replaceAll("Learning a little every day", "Học một chút mỗi ngày")
        .replaceAll(
          "Small daily steps can make a lasting difference.",
          "Những bước nhỏ mỗi ngày có thể tạo nên thay đổi lâu dài.",
        )
        .replaceAll(
          "Regular practice helps us remember new words.",
          "Luyện tập thường xuyên giúp chúng ta ghi nhớ từ mới.",
        )
        .replaceAll("Read the", "Đọc")
        .replaceAll("original paragraph", "đoạn gốc")
        .replaceAll(", then compare it with the translation.", ", sau đó đối chiếu với bản dịch.")
        .replaceAll(
          "is more effective than studying a lot once a week.",
          "hiệu quả hơn học thật nhiều một lần mỗi tuần.",
        )
        .replaceAll("Listen and repeat aloud.", "Nghe và đọc lại thành tiếng.")
        .replaceAll(
          "Use the words in a sentence of your own.",
          "Dùng từ trong một câu do chính bạn viết.",
        )
        .replaceAll("Practice with a clear goal", "Luyện tập với mục tiêu rõ ràng")
        .replaceAll("Take a break and return tomorrow.", "Nghỉ ngơi và quay lại vào ngày mai.")
        .replaceAll("Practice one short sentence every day.", "Luyện một câu ngắn mỗi ngày.")
        .replaceAll("Read slowly and listen carefully.", "Đọc chậm và lắng nghe cẩn thận.")
        .replaceAll("Share the story with a friend.", "Chia sẻ câu chuyện với một người bạn.")
        .replaceAll("A long story continues below.", "Câu chuyện còn tiếp ở phía dưới.")
        .replaceAll(
          "Learning is a journey, one paragraph at a time.",
          "Học là một hành trình, từng đoạn một.",
        )
    }
  })
  const calls = () => worker.evaluate(() => __pdfCalls.length)
  source = await browser.newPage()
  source.on("pageerror", (e) => errors.push(e.message))
  source.on("console", (msg) => {
    if (msg.type() === "error") consoles.push(msg.text())
  })
  await source.setRequestInterception(true)
  source.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === source.mainFrame())
      void request.respond({ status: 200, contentType: "text/html", body: html })
    else if (/^https?:/.test(request.url())) void request.abort()
    else void request.continue()
  })
  await source.goto(url)
  await source.waitForSelector("read-frog")
  const tab = await worker.evaluate(
    async (targetURL) => (await chrome.tabs.query({})).find((item) => item.url === targetURL),
    url,
  )
  const message = (messageType, messageData) =>
    worker.evaluate(
      async ({ tabId, type, data }) =>
        chrome.tabs.sendMessage(tabId, { id: Date.now(), type, data, timestamp: Date.now() }),
      { tabId: tab.id, type: messageType, data: messageData },
    )
  await source.bringToFront()
  const popup = await browser.newPage()
  await source.bringToFront()
  await popup.goto(base + "popup.html")
  await popup.waitForSelector("[data-open-web-bilingual]:not([disabled])")
  await popup.$eval("[data-open-web-bilingual]", (node) => node.click())
  await source.waitForSelector("pierce/.rf-web-bilingual")
  const panel = () => source.$("pierce/.rf-web-bilingual")
  const ui = async (fn, ...args) => (await panel()).evaluate(fn, ...args)
  await pause(700)
  check("Popup opens the HTML pane without dispatching translation", (await calls()) === 0)
  check(
    "Opening the pane preserves source nodes, links and image",
    await source.evaluate(
      () =>
        document.querySelector("#first") === originalFirst &&
        document.querySelector("#original-link") === originalLink &&
        document.querySelector("#article-image").naturalWidth > 0,
    ),
  )
  await ui((root) => root.querySelector("[data-web-translate]").click())
  await source.waitForFunction(
    () => document.querySelectorAll(".read-frog-translated-content-wrapper").length >= 3,
  )
  await source.waitForSelector("pierce/.rf-web-output")
  await pause(500)
  const rows = await ui((root) => root.querySelectorAll("[data-web-pair]").length)
  check(
    "Translate page populates both inline translations and bilingual cards",
    rows >= 3 &&
      (await ui((root) => root.querySelector(".rf-web-output").textContent.includes("mỗi ngày"))),
  )
  const paid = await calls()
  await ui((root) => root.querySelector('[aria-label="Đóng khung song ngữ"]').click())
  await message("openWebBilingualPanel")
  await source.waitForSelector("pierce/.rf-web-output")
  await pause(500)
  check(
    "Reopening the pane reuses completed results without provider calls",
    (await calls()) === paid,
  )
  await ui((root) => root.querySelectorAll("[data-web-pair] header button")[1].click())
  await pause(350)
  check(
    "Selecting a card reveals source and translation speech/library controls",
    await ui((root) => !!root.querySelector(".rf-web-pair.active [data-reading-lab]")),
  )
  check(
    "Selected paragraph has a visible page highlight",
    await source.$eval(
      "pierce/.rf-web-highlight",
      (node) => !node.hidden && node.getBoundingClientRect().width > 50,
    ),
  )
  // Exercise the same private speech/download transport from the new content UI.
  const downloads = path.join(scratch, "downloads")
  await fs.mkdir(downloads)
  const cdp = await source.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloads,
  })
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.tts.provider = "openai"
    config.tts.openai.model = "gpt-4o-mini-tts"
    await chrome.storage.local.set({ config })
    const api = globalThis.browser?.runtime?.id ? globalThis.browser : chrome,
      download = api.downloads.download.bind(api.downloads),
      originalFetch = fetch
    api.downloads.download = (args) => download({ ...args, saveAs: false })
    globalThis.__speechCalls = []
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (!request.url.endsWith("/audio/speech")) return originalFetch(request)
      const body = await request.json()
      __speechCalls.push(body.input)
      const rate = 24000,
        bytes = new Uint8Array(44 + rate * 2),
        view = new DataView(bytes.buffer)
      for (const [at, tag] of [
        [0, "RIFF"],
        [8, "WAVE"],
        [12, "fmt "],
        [36, "data"],
      ])
        for (let index = 0; index < tag.length; index++) bytes[at + index] = tag.charCodeAt(index)
      view.setUint32(4, bytes.length - 8, true)
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, rate, true)
      view.setUint32(28, rate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      view.setUint32(40, rate * 2, true)
      for (let index = 0; index < rate; index++)
        view.setInt16(44 + index * 2, Math.sin((index * 2 * Math.PI * 440) / rate) * 5000, true)
      return new Response(bytes, { headers: { "content-type": "audio/wav" } })
    }
  })
  await source.waitForSelector("pierce/.rf-web-actions [data-tts-download]")
  await ui((root) => root.querySelector(".rf-web-actions [data-tts-download]").click())
  let audioFile
  for (let attempt = 0; attempt < 80; attempt++) {
    audioFile = (await fs.readdir(downloads)).find((name) => !name.endsWith(".crdownload"))
    if (audioFile) break
    await pause(100)
  }
  check(
    "OpenAI MP3 action downloads an actual encoded file from the HTML pane",
    !!audioFile &&
      (await fs.stat(path.join(downloads, audioFile))).size > 1000 &&
      (await worker.evaluate(() => __speechCalls.length === 1)),
  )
  const expectedPair = await ui((root) => ({
    original: root.querySelector(".rf-web-pair.active .rf-web-source").textContent,
    translation: root.querySelector(".rf-web-pair.active .rf-web-output").textContent,
  }))
  const beforeLab = new Set(browser.targets())
  await ui((root) => root.querySelector(".rf-web-pair.active [data-reading-lab]").click())
  const lab = await (
    await browser.waitForTarget(
      (target) => !beforeLab.has(target) && target.url().includes("reading-lab.html"),
    )
  ).page()
  await lab.waitForFunction(
    (expected) =>
      document.querySelector("#reading-original")?.value === expected.original &&
      document.querySelector("#reading-translation")?.value === expected.translation,
    {},
    expectedPair,
  )
  check(
    "Listening/save opens Reading Lab with the exact source/translation pair",
    (await calls()) === paid,
  )
  await source.bringToFront()
  const afterPick = await source.evaluate(() => scrollY)
  await ui((root) => {
    const host = root.querySelector(".rf-web-scroll")
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true }))
    host.scrollTop += 250
  })
  await pause(350)
  check(
    "Right-pane user scrolling moves the page",
    Math.abs((await source.evaluate(() => scrollY)) - afterPick) > 20,
  )
  const stable = await source.evaluate(() => scrollY)
  await pause(500)
  check(
    "Bidirectional scrolling settles without a feedback loop",
    Math.abs((await source.evaluate(() => scrollY)) - stable) < 2,
  )
  await ui((root) => root.querySelectorAll(".rf-web-controls input")[0].click())
  const independent = await source.evaluate(() => scrollY)
  await ui((root) => {
    const host = root.querySelector(".rf-web-scroll")
    host.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, bubbles: true }))
    host.scrollTop = 0
  })
  await pause(350)
  check(
    "Linked scrolling can be disabled",
    Math.abs((await source.evaluate(() => scrollY)) - independent) < 2,
  )
  await ui((root) => root.querySelectorAll(".rf-web-controls input")[0].click())
  await source.evaluate(() => scrollTo(0, 0))
  await pause(500)
  await ui((root) => root.querySelector("[data-web-pair] header button").click())
  await pause(300)
  await source.screenshot({ path: path.join(scratch, "desktop.png") })
  evidence.screenshots.push(path.join(scratch, "desktop.png"))
  check(
    "Pane remains open after clicking elsewhere",
    await source.evaluate(() => {
      document.body.click()
      return !!document.querySelector("read-frog").shadowRoot.querySelector(".rf-web-bilingual")
    }),
  )
  await source.evaluate(() => document.querySelector("#counter").click())
  check(
    "Existing page click handlers and element identities survive",
    await source.evaluate(
      () =>
        clicks === 1 &&
        document.querySelector("#first") === originalFirst &&
        document.querySelector("#original-link") === originalLink,
    ),
  )
  check(
    "Native text selection still reads the original English paragraph",
    await source.evaluate(() => {
      const text = originalFirst.firstChild,
        range = document.createRange(),
        selection = getSelection()
      range.selectNodeContents(text)
      selection.removeAllRanges()
      selection.addRange(range)
      const selected = selection.toString()
      selection.removeAllRanges()
      return selected.includes("Small daily steps")
    }),
  )
  await ui((root) => root.querySelector('[aria-label="Thu gọn khung song ngữ"]').click())
  await pause(250)
  check(
    "Minimize releases reserved page space without stopping Translate page",
    await source.evaluate(
      () =>
        ![...document.documentElement.classList].some((name) =>
          name.startsWith("rf-web-reserved-"),
        ) && document.querySelectorAll(".read-frog-translated-content-wrapper").length >= 3,
    ),
  )
  await ui((root) => root.querySelector('[aria-label="Mở rộng khung song ngữ"]').click())
  await pause(500)
  check("Expand restores the same pairs without translating again", (await calls()) === paid)
  await source.setViewport({ width: 390, height: 844 })
  await pause(600)
  check(
    "390px pane fits within viewport and uses the lower half",
    await ui((root) => {
      const box = root.getBoundingClientRect()
      return (
        box.left >= 0 &&
        box.right <= innerWidth &&
        box.top > innerHeight * 0.4 &&
        box.bottom <= innerHeight
      )
    }),
  )
  await source.screenshot({ path: path.join(scratch, "mobile.png") })
  evidence.screenshots.push(path.join(scratch, "mobile.png"))
  await source.setViewport({ width: 1440, height: 960 })
  await message("askManagerToTogglePageTranslation", { enabled: false })
  await source.waitForFunction(
    () => document.querySelectorAll(".read-frog-translated-content-wrapper").length === 0,
  )
  await source.waitForFunction(
    () =>
      document.querySelector("read-frog").shadowRoot.querySelectorAll("[data-web-pair]").length ===
      0,
  )
  check(
    "Show original clears the pane and restores original nodes",
    await source.evaluate(
      () =>
        document.querySelector("#first") === originalFirst &&
        originalFirst.textContent.includes("Small daily steps"),
    ),
  )
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.pageTranslation.mode = "translationOnly"
    await chrome.storage.local.set({ config })
  })
  await message("askManagerToTogglePageTranslation", { enabled: true })
  await source.waitForSelector("[data-read-frog-translation-only]")
  await source.waitForSelector("pierce/.rf-web-output")
  await pause(500)
  check(
    "Translation-only mode retains English originals in the bilingual pane",
    (await ui((root) =>
      root.querySelector(".rf-web-source").textContent.includes("Learning a little every day"),
    )) &&
      (await source.evaluate(() =>
        document.querySelector("h1").textContent.includes("Học một chút"),
      )),
  )
  await source.evaluate(() => {
    const p = document.createElement("p")
    p.id = "dynamic"
    p.textContent =
      "Small daily steps can make a lasting difference. Regular practice helps us remember new words."
    document.querySelector("#article").prepend(p)
  })
  await source.waitForFunction(() =>
    document.querySelector("#dynamic").textContent.includes("Những bước nhỏ"),
  )
  check(
    "Lazy-loaded article content enters the shared translation path",
    await ui((root) =>
      [...root.querySelectorAll(".rf-web-source")].some(
        (node) =>
          node.textContent ===
          "Small daily steps can make a lasting difference. Regular practice helps us remember new words.",
      ),
    ),
  )
  await source.evaluate(() => document.querySelector("#dynamic").remove())
  await pause(1000)
  check(
    "Removing a source paragraph removes its stale card",
    !(await ui((root) =>
      [...root.querySelectorAll(".rf-web-source")].some(
        (node) =>
          node.textContent ===
          "Small daily steps can make a lasting difference. Regular practice helps us remember new words.",
      ),
    )),
  )
  await message("askManagerToTogglePageTranslation", { enabled: false })
  await pause(500)
  check(
    "Translation-only restore preserves links, counters and source text",
    await source.evaluate(
      () =>
        document.querySelector("#original-link") === originalLink &&
        originalFirst.textContent.includes("Small daily steps") &&
        clicks === 1,
    ),
  )
  await worker.evaluate(async () => {
    __pdfDelay = 1500
    const { config } = await chrome.storage.local.get("config")
    config.pageTranslation.customPromptsConfig.patterns[0].systemPrompt += " Cancellation fixture."
    await chrome.storage.local.set({ config })
  })
  const beforeCancel = await calls()
  await message("askManagerToTogglePageTranslation", { enabled: true })
  for (let attempt = 0; attempt < 50 && (await calls()) === beforeCancel; attempt++) await pause(50)
  assert.ok((await calls()) > beforeCancel, "A request must be in flight before cancellation")
  await message("askManagerToTogglePageTranslation", { enabled: false })
  await pause(1700)
  check(
    "Stopping page translation drops late output from both page and pane",
    (await ui((root) => root.querySelectorAll("[data-web-pair]").length === 0)) &&
      (await source.evaluate(
        () =>
          !document.querySelector(".read-frog-translated-content-wrapper") &&
          originalFirst.textContent.includes("Small daily steps"),
      )),
  )
  await worker.evaluate(() => {
    __pdfDelay = 0
  })
  await message("askManagerToTogglePageTranslation", { enabled: true })
  await source.waitForSelector("pierce/.rf-web-output")
  await source.evaluate(() => {
    history.pushState({}, "", "/news/another-story")
    document.querySelector("#article").innerHTML =
      "<h1>Practice with a clear goal</h1><p>Take a break and return tomorrow. Regular practice helps us remember new words.</p>"
  })
  await source.waitForFunction(() => document.querySelector("h1").textContent.includes("Luyện tập"))
  await pause(1100)
  check(
    "SPA article navigation discards old paragraph pairs",
    await ui(
      (root) =>
        root.querySelectorAll("[data-web-pair]").length > 0 &&
        ![...root.querySelectorAll(".rf-web-source")].some((node) =>
          node.textContent.includes("Small daily steps"),
        ),
    ),
  )
  await ui((root) => root.querySelector('[aria-label="Đóng khung song ngữ"]').click())
  check(
    "Closing the pane removes highlight and reserved-space styling",
    await source.evaluate(
      () =>
        !document.querySelector("read-frog").shadowRoot.querySelector(".rf-web-highlight") &&
        ![...document.documentElement.classList].some((name) =>
          name.startsWith("rf-web-reserved-"),
        ),
    ),
  )
  check("No uncaught UI exceptions", errors.length === 0)
  evidence.providerCalls = await calls()
} catch (error) {
  evidence.error = error.stack
  if (source) {
    await source.screenshot({ path: path.join(scratch, "failure.png") }).catch(() => {})
    evidence.body = await source.evaluate(() => document.body.innerText).catch(() => "")
  }
  throw error
} finally {
  evidence.errors = errors
  evidence.console = consoles
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log(`EVIDENCE ${scratch}`)
  await browser.close()
}
