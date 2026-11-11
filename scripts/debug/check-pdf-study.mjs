import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument, StandardFonts, degrees, PDFName, PDFDict, PDFHexString } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

// Isolated production-extension test. Real PDF.js/Tesseract workers and local
// language models; OpenAI translation is the existing controlled fixture only.
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/pdf-study-${Date.now()}`)
await fs.mkdir(path.join(scratch, "downloads"), { recursive: true })
const evidence = { checks: [], ocr: [], liveOpenAI: false },
  errors = [],
  remote = []
const check = (name, result) => {
  assert.ok(result, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1560, height: 1050 },
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
  ],
})
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  evidence.browser = await browser.version()
  evidence.externalDnsBlocked = true
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  const maker = await browser.newPage()
  const texts = [
    ["eng", "Learning English every day", "Read a little. Listen carefully. Remember new words."],
    ["vie", "Học tiếng Việt mỗi ngày", "Đọc sách giúp chúng ta nhớ những từ mới."],
    ["chi_sim", "每天学习中文", "阅读帮助我们学习新的知识。"],
    ["jpn", "毎日日本語を勉強します", "本を読んで新しい言葉を覚えます。"],
  ]
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  const native = pdf.addPage([612, 792])
  for (const [line, y] of [
    ["A useful reading document", 710],
    ["abx first xyz and abx second xyz", 640],
    ["Read a little every day. Read a little every day.", 580],
    ["Highlight a sentence and write a note.", 490],
  ])
    native.drawText(line, { x: 55, y, size: 18, font })
  for (const [, title, line] of texts) {
    const data = await maker.evaluate(
      (imageTitle, imageLine) => {
        const canvas = document.createElement("canvas")
        canvas.width = 1530
        canvas.height = 1980
        const c = canvas.getContext("2d")
        c.fillStyle = "white"
        c.fillRect(0, 0, canvas.width, canvas.height)
        c.fillStyle = "#111"
        c.font = "bold 58px Arial, sans-serif"
        c.fillText(imageTitle, 110, 200)
        c.font = "42px Arial, sans-serif"
        c.fillText(imageLine, 110, 350)
        return canvas.toDataURL("image/png").split(",")[1]
      },
      title,
      line,
    )
    const image = await pdf.embedPng(Buffer.from(data, "base64")),
      page = pdf.addPage([612, 792])
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
  }
  const rotated = pdf.addPage([612, 792])
  rotated.drawText("A rotated final page", { x: 50, y: 700, size: 22, font })
  rotated.setRotation(degrees(90))
  // Embed a safe local outline destination, never a URL action.
  const outline = pdf.context.obj({ Type: "Outlines", Count: 1 })
  const outlineRef = pdf.context.register(outline)
  const item = pdf.context.register(
    pdf.context.obj({
      Title: PDFHexString.fromText("Chapter one"),
      Parent: outlineRef,
      Dest: [native.ref, "Fit"],
    }),
  )
  outline.set(PDFName.of("First"), item)
  outline.set(PDFName.of("Last"), item)
  pdf.catalog.set(PDFName.of("Outlines"), outlineRef)
  const input = path.join(scratch, "Reader study fixture.pdf"),
    renamed = path.join(scratch, "Renamed.pdf")
  const originalBytes = await pdf.save()
  await fs.writeFile(input, originalBytes)
  await fs.copyFile(input, renamed)
  await maker.close()
  const reader = await browser.newPage()
  reader.on("pageerror", (error) => errors.push(error.message))
  reader.on("request", (request) => {
    if (/^https?:/i.test(request.url())) remote.push(request.url())
  })
  const cdp = await reader.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: path.join(scratch, "downloads"),
  })
  await reader.goto(base + "pdf-reader.html")
  await reader.bringToFront()
  const click = async (needle) =>
    reader.evaluate((targetText) => {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        candidate.textContent.trim().includes(targetText),
      )
      if (!button) throw Error("No button " + targetText)
      button.click()
    }, needle)
  const ready = async (number) =>
    reader.waitForFunction(
      (n) =>
        !!document.querySelector(
          `.rf-pdf-page[data-page="${n}"][data-rendered=true] .rf-study-overlay`,
        ),
      { polling: 100 },
      number,
    )
  const load = async (file) => {
    const picker = await reader.$('input[type="file"]')
    await picker.uploadFile(file)
    await reader.waitForSelector('[aria-label="Số trang"]')
    await reader.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.includes("Tô sáng đoạn chọn") && !b.disabled,
        ),
      { polling: 100 },
    )
    await navigate(1)
  }
  const navigate = async (pageNumber) => {
    await reader.$eval(
      '[aria-label="Số trang"]',
      (e, value) => {
        e.value = value
        e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      },
      pageNumber,
    )
    await ready(pageNumber)
    await pause(300)
  }
  const selectTool = async (label) => reader.click(`.rf-tool-segment [aria-label="${label}"]`)
  const count = () => reader.$$eval(".rf-study-overlay [data-annotation]", (nodes) => nodes.length)
  const waitCount = (expected) =>
    reader.waitForFunction(
      (value) => document.querySelectorAll(".rf-study-overlay [data-annotation]").length === value,
      { polling: 100 },
      expected,
    )
  await load(input)
  check(
    "Opening reader creates no provider request or remote OCR request",
    (await worker.evaluate(() => __pdfCalls.length)) === 0 && remote.length === 0,
  )
  await reader.keyboard.down("Control")
  await reader.keyboard.press("f")
  await reader.keyboard.up("Control")
  await reader.waitForSelector('[aria-label="Từ khóa PDF"]')
  await reader.type('[aria-label="Từ khóa PDF"]', "abx*xyz")
  await reader.keyboard.press("Enter")
  await reader.waitForFunction(() => document.querySelectorAll(".rf-study-result").length === 2, {
    polling: 100,
  })
  check(
    "Wildcard search lists both occurrences on the same page",
    (await reader.$$eval(".rf-study-result", (nodes) => nodes.map((n) => n.textContent))).every(
      (t) => t.includes("Trang 1"),
    ),
  )
  await reader.$eval(".rf-study-result:nth-of-type(2)", (n) => n.click())
  await reader.waitForSelector(".rf-search-overlay .active")
  check(
    "Selecting an individual result highlights the matching passage",
    !!(await reader.$(".rf-search-overlay .active")),
  )
  await reader.screenshot({ path: path.join(scratch, "search-desktop.png") })
  await reader.click('[aria-label="Đóng menu PDF"]')
  await reader.waitForFunction(() => !!document.querySelector('[data-page="1"] .textLayer span'), {
    polling: 100,
  })
  await reader.evaluate(() => {
    const span = [...document.querySelectorAll('[data-page="1"] .textLayer span')].find((s) =>
        s.textContent.includes("Highlight a sentence"),
      ),
      range = document.createRange()
    range.selectNodeContents(span)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await click("Tô sáng đoạn chọn")
  await waitCount(1)
  check(
    "Highlight persists without modifying native text",
    (await reader.$eval('[data-page="1"] .textLayer', (n) =>
      n.textContent.includes("Highlight a sentence"),
    )) && (await count()) === 1,
  )
  await selectTool("Vẽ")
  const box = await reader.$eval('[data-page="1"]', (e) => {
    const b = e.getBoundingClientRect()
    return { x: b.left, y: b.top, w: b.width, h: b.height }
  })
  await reader.mouse.move(box.x + box.w * 0.12, box.y + box.h * 0.34)
  await reader.mouse.down()
  await reader.mouse.move(box.x + box.w * 0.55, box.y + box.h * 0.39, { steps: 20 })
  await reader.mouse.up()
  await waitCount(2)
  check(
    "Freehand pen uses persisted normalized points",
    await reader.$eval(
      ".rf-study-overlay polyline",
      (e) => e.getAttribute("points").split(" ").length > 2,
    ),
  )
  await reader.click('[aria-label="Hoàn tác"]')
  await waitCount(1)
  await reader.click('[aria-label="Làm lại"]')
  await waitCount(2)
  check("Undo and redo restore a stroke once", (await count()) === 2)
  await selectTool("Ghi chú")
  reader.once("dialog", (dialog) => dialog.accept("Ghi chú tiếng Việt 日本語"))
  await reader.mouse.click(box.x + box.w * 0.7, box.y + box.h * 0.42)
  await waitCount(3)
  check(
    "Unicode sticky note is saved",
    (
      await reader.$$eval(".rf-study-overlay title", (nodes) => nodes.map((n) => n.textContent))
    ).includes("Ghi chú tiếng Việt 日本語"),
  )
  await selectTool("Chọn chữ")
  await click("Tải PDF có chú thích")
  let downloads = []
  for (let n = 0; n < 100; n++) {
    downloads = (await fs.readdir(path.join(scratch, "downloads"))).filter((filename) =>
      filename.endsWith(".pdf"),
    )
    if (downloads.length) break
    await pause(100)
  }
  assert.equal(downloads.length, 1)
  const exported = await PDFDocument.load(
    await fs.readFile(path.join(scratch, "downloads", downloads[0])),
  )
  const note = exported.getPage(0).node.Annots().lookup(0, PDFDict)
  check(
    "Exported PDF copy retains Unicode note and original rotated page",
    note.lookup(PDFName.of("Contents"), PDFHexString).decodeText() ===
      "Ghi chú tiếng Việt 日本語" && exported.getPage(5).getRotation().angle === 90,
  )
  check(
    "Original input file is unchanged",
    Buffer.from(originalBytes).equals(await fs.readFile(input)),
  )
  await reader.reload()
  await load(renamed)
  await waitCount(3)
  check("Renamed PDF restores all three annotations after reload", (await count()) === 3)
  await selectTool("Tẩy chú thích")
  await reader.$eval(".rf-study-overlay g[data-annotation] rect", (e) => {
    const b = e.getBoundingClientRect()
    e.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: b.left + 2,
        clientY: b.top + 2,
        bubbles: true,
      }),
    )
  })
  await waitCount(2)
  check("Eraser removes only the selected annotation", (await count()) === 2)
  await selectTool("Chọn chữ")
  await click("Mục lục / Trang")
  await reader.waitForSelector(".rf-study-result")
  check(
    "Embedded PDF outline is listed",
    await reader.$eval(".rf-study-result", (n) => n.textContent === "Chapter one"),
  )
  await reader.click('[aria-label="Đóng menu PDF"]')
  await click("OCR trên máy")
  const beforeImage = new Set(browser.targets())
  await click("OpenAI OCR vùng khó")
  const imageTarget = await browser.waitForTarget(
    (t) => !beforeImage.has(t) && t.url().startsWith(base + "image-translate.html"),
  )
  const imageEditor = await imageTarget.page()
  await imageEditor.waitForFunction(() => document.querySelector("canvas")?.width > 100, {
    polling: 100,
  })
  check(
    "OpenAI OCR option opens the existing crop editor without uploading automatically",
    (await worker.evaluate(() => __pdfCalls.length)) === 0,
  )
  await imageEditor.close()
  await reader.bringToFront()
  await reader.click('[aria-label="Đóng menu PDF"]')
  for (const [i, [language, expected]] of texts.entries()) {
    await navigate(i + 2)
    await click("OCR trên máy")
    await reader.select('[aria-label="Ngôn ngữ OCR"]', language)
    const started = Date.now()
    await reader.click("#pdf-local-ocr")
    await reader.waitForFunction(
      (n) => document.querySelectorAll(`[data-page="${n}"] .rf-ocr-text span`).length > 3,
      { timeout: 130000, polling: 100 },
      i + 2,
    )
    const text = await reader.$eval(`[data-page="${i + 2}"] .rf-ocr-text`, (n) => n.textContent)
    evidence.ocr.push({ language, ms: Date.now() - started, text })
    const fragment = { eng: "Learning", vie: "Việt", chi_sim: "学习", jpn: "日本語" }[language]
    check(
      `Real local ${language} OCR creates selectable words (${expected})`,
      text.includes(fragment),
    )
    await reader.click('[aria-label="Đóng menu PDF"]')
    if (language === "eng") {
      await click("Song ngữ theo đoạn")
      await reader.waitForFunction(
        () =>
          [...document.querySelectorAll(".rf-bilingual-card")].some((n) =>
            n.textContent.includes("Learning"),
          ),
        { polling: 100 },
      )
      check(
        "OCR words feed existing bilingual paragraphs without a provider call",
        (await worker.evaluate(() => __pdfCalls.length)) === 0,
      )
      await click("Song ngữ theo đoạn")
    }
  }
  await reader.keyboard.down("Control")
  await reader.keyboard.press("f")
  await reader.keyboard.up("Control")
  await reader.type('[aria-label="Từ khóa PDF"]', "日本語")
  await reader.keyboard.press("Enter")
  await reader.waitForFunction(() => document.querySelectorAll(".rf-study-result").length === 1, {
    polling: 100,
  })
  check(
    "Search finds a continuous Japanese word across OCR boxes",
    await reader.$eval(".rf-study-result", (n) => n.textContent.includes("Trang 5")),
  )
  await reader.click('[aria-label="Đóng menu PDF"]')
  check("Four OCR languages use bundled assets without HTTP requests", remote.length === 0)
  check(
    "Reading retains at most three PDF canvases",
    await reader.$$eval(".rf-pdf-page canvas", (n) => n.length <= 3),
  )
  await reader.reload()
  await load(renamed)
  await navigate(2)
  await reader.waitForSelector('[data-page="2"] .rf-ocr-text')
  check(
    "OCR geometry/text survive reload and file rename without rerunning OCR",
    await reader.$eval('[data-page="2"] .rf-ocr-text', (n) => n.textContent.includes("Learning")),
  )
  await click("OCR trên máy")
  await reader.click("#pdf-local-ocr")
  await reader.waitForSelector("#pdf-local-ocr:disabled")
  await navigate(6)
  await reader.waitForFunction(() => !document.querySelector("#pdf-local-ocr").disabled, {
    polling: 100,
  })
  check(
    "Page navigation cancels the OCR worker",
    !(await reader.$(".rf-pdf-page[data-page='6'] .rf-ocr-text")),
  )
  await reader.click('[aria-label="Đóng menu PDF"]')
  await navigate(1)
  await reader.screenshot({ path: path.join(scratch, "reader-desktop.png") })
  await reader.setViewport({ width: 390, height: 844 })
  await pause(500)
  await click("OCR trên máy")
  await reader.screenshot({ path: path.join(scratch, "reader-mobile.png") })
  check(
    "Phone layout keeps reader/menu within the viewport",
    await reader.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.querySelector(".rf-study-panel").getBoundingClientRect().right <= innerWidth + 1,
    ),
  )
  check(
    "No provider calls from search, annotations, OCR, export or menu controls",
    (await worker.evaluate(() => __pdfCalls.length)) === 0,
  )
  check("No uncaught runtime exceptions", errors.length === 0)
  evidence.errors = errors
  evidence.remote = remote
} catch (error) {
  evidence.failure = error.stack
  evidence.errors = errors
  evidence.remote = remote
  for (const [i, page] of (await browser.pages()).entries())
    await page.screenshot({ path: path.join(scratch, `failure-${i}.png`) }).catch(() => {})
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("EVIDENCE", scratch)
  await browser.close()
}
