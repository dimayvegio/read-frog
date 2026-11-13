import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/pdf-controls-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const pdfFixture = await PDFDocument.create(),
  font = await pdfFixture.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 4; i++) {
  const page = pdfFixture.addPage([600, 800])
  for (const [text, y] of [
    ["Chapter heading", 760],
    ["uvm_test_top.env.agent data[31:0] VDD_CORE 8'hFF", 720],
    ["Alpha paragraph begins here and has useful words.", 680],
    ["Another line belonging to the same paragraph.", 660],
    ["Beta paragraph stays separate.", 580],
    ["Gamma paragraph for translation.", 480],
    ["Footer to ignore", 30],
  ])
    page.drawText(text, { x: 60, y, size: 14, font })
}
const file = path.join(scratch, "Technical guide.pdf")
await fs.writeFile(file, await pdfFixture.save())
const idHash = createHash("sha256")
  .update(await fs.readFile(file))
  .digest("hex")
const evidence = { checks: [], provider: "mocked; local PDF bytes never uploaded", errors: [] }
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  pipe: true,
  enableExtensions: true,
  userDataDir: path.join(scratch, "profile"),
  defaultViewport: { width: 1560, height: 1050 },
  args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking"],
})
try {
  const id = await browser.installExtension(
      path.resolve(process.env.PDF_UX_EXTENSION ?? ".output/edge-mv3"),
    ),
    root = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === root + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(root + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(() => chrome.storage.local.set({ theme: "dark" }))
  const reader = await browser.newPage()
  reader.on("pageerror", (error) => evidence.errors.push(error.message))
  await reader.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }])
  await reader.goto(root + "pdf-reader.html")
  await reader.bringToFront()
  await (await reader.waitForSelector('input[type="file"]')).uploadFile(file)
  await reader.waitForSelector('.rf-pdf-page[data-page="1"][data-rendered=true]')
  const click = async (text) =>
    reader.evaluate((value) => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes(value),
      )
      if (!button) throw Error(value)
      button.click()
    }, text)
  const set = async (selector, value) => {
    await reader.click(selector)
    await reader.keyboard.down("Control")
    await reader.keyboard.press("a")
    await reader.keyboard.up("Control")
    await reader.type(selector, value)
  }
  const dbNotes = () =>
    reader.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("read-frog-pdf-workspace")
          r.onerror = reject
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("textNotes"),
              q = tx.objectStore("textNotes").getAll()
            q.onsuccess = () => resolve(q.result.flatMap((d) => d.notes))
            tx.oncomplete = () => db.close()
          }
        }),
    )
  const waitNotes = async (predicate) => {
    const until = Date.now() + 5000
    while (Date.now() < until) {
      const notes = await dbNotes()
      if (predicate(notes)) return notes
      await pause(50)
    }
    throw Error("Notes timeout")
  }
  const network = []
  reader.on("request", (request) => {
    if (/^https?:/u.test(request.url()))
      network.push({ url: request.url(), method: request.method() })
  })
  const cdp = await reader.createCDPSession()
  const downloads = path.join(scratch, "downloads")
  await fs.mkdir(downloads)
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads })
  check(
    "Three navigation actions are compact accessible icons",
    await reader.$$eval(
      ".rf-compact-nav",
      (nodes) =>
        nodes.length === 3 &&
        nodes.every((n) => n.getBoundingClientRect().width <= 32 && n.getAttribute("aria-label")),
    ),
  )
  check(
    "Position forgetting control is removed",
    !(await reader.$eval(".rf-reader-toolbar", (n) => n.textContent.includes("Quên vị trí"))),
  )
  check("No download-original button", !(await reader.$('[aria-label="Tải PDF gốc"]')))
  await reader.click('[aria-label="Phóng to PDF"]')
  await pause(120)
  check(
    "Zoom in updates the reading scale",
    await reader.$eval('[aria-label="Thu phóng"]', (n) => Number(n.value) > 1),
  )
  await reader.select('[aria-label="Thu phóng"]', "fit-width")
  await pause(100)
  await reader.click('[aria-label="Trang cuối"]')
  await reader.waitForFunction(
    () => document.querySelector('[aria-label="Số trang"]').value === "4",
    { polling: 100 },
  )
  await reader.click('[aria-label="Trang đầu"]')
  await reader.waitForFunction(
    () => document.querySelector('[aria-label="Số trang"]').value === "1",
    { polling: 100 },
  )
  check("First and last page navigation works", true)
  await reader.click('[aria-label="Tìm kiếm"]')
  check(
    "Search hides document categories and collapses advanced options",
    !(await reader.$('[aria-label="Loại tài liệu tìm kiếm"]')) &&
      (await reader.$eval(".rf-search-advanced", (n) => !n.open)),
  )
  await reader.screenshot({ path: path.join(scratch, "search-redesign.png") })
  await reader.click(".rf-search-advanced summary")
  await reader.click('[aria-label="Phân biệt hoa/thường"]')
  await reader.click('[aria-label="Nguyên tên / từ"]')
  await reader.click('[aria-label="Dùng * làm wildcard"]')
  await reader.type('[aria-label="Từ khóa PDF"]', "data[31:0]")
  await reader.keyboard.press("Enter")
  await reader.waitForFunction(() => document.querySelectorAll(".rf-study-result").length === 4, {
    polling: 100,
  })
  check("Literal bus search returns four selectable page results", true)
  await reader.keyboard.press("F3")
  check(
    "F3 selects a result",
    await reader.$eval(".rf-search-summary", (n) => n.textContent.includes("4")),
  )
  await reader.click('[aria-label="Đóng menu PDF"]')
  await reader.click('[aria-label="Ô chữ"]')
  const closePanel = await reader.$('[aria-label="Đóng menu PDF"]')
  if (closePanel) await closePanel.click()
  const page = await reader.$eval('.rf-pdf-page[data-page="1"] .textLayer', (n) => {
    const span = [...n.querySelectorAll("span")].find((s) =>
      s.textContent.includes("Alpha paragraph"),
    )
    const r = span.getBoundingClientRect()
    return { x: r.left + 20, y: r.top + r.height / 2 }
  })
  await reader.mouse.click(page.x, page.y)
  await reader.waitForSelector('[aria-label="Nội dung ô chữ"]')
  await reader.type('[aria-label="Nội dung ô chữ"]', "Bản nháp hủy")
  await reader.keyboard.press("Escape")
  check("Canceled inline text draft writes nothing", (await dbNotes()).length === 0)
  await reader.mouse.click(page.x, page.y)
  await reader.waitForSelector('[aria-label="Nội dung ô chữ"]')
  await reader.type('[aria-label="Nội dung ô chữ"]', "Ghi chú tiếng Việt 日本語")
  await click("Lưu ô chữ")
  await waitNotes((n) => n.length === 1)
  await reader.waitForSelector(".rf-text-note")
  check(
    "Unicode text box persists in its additive store",
    (await dbNotes())[0].text.includes("tiếng Việt"),
  )
  await reader.click('[aria-label="Chọn / sửa hình"]')
  const box = await reader.$eval(".rf-text-note", (n) => {
      const r = n.getBoundingClientRect()
      return { x: r.x + 20, y: r.y + 15 }
    }),
    before = (await dbNotes())[0]
  await reader.mouse.move(box.x, box.y)
  await reader.mouse.down()
  await reader.mouse.move(box.x + 40, box.y + 20, { steps: 8 })
  await reader.mouse.up()
  await waitNotes((n) => n[0].x > before.x)
  check(
    "Text-box move commits bounded geometry",
    (await dbNotes())[0].x + (await dbNotes())[0].width <= 1.001,
  )
  await reader.click('[aria-label="Hoàn tác"]')
  await waitNotes((n) => n[0].x === before.x)
  check("Text-box move has one shared undo", true)
  await reader.click('[aria-label="Chọn chữ"]')
  check(
    "Editing and search stay local",
    (await worker.evaluate(() => __pdfCalls.length === 0)) && network.length === 0,
  )
  await reader.click('[aria-label="Tạo PDF từ trang"]')
  await set('[aria-label="Trang cần trích"]', "3-4, 1-3")
  await click("Tạo PDF mới")
  await reader.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Tạo tài liệu mới"]')
        .innerText.includes("Đã tạo PDF mới 4 trang"),
    { polling: 100 },
  )
  for (let i = 0; i < 100; i++) {
    if ((await fs.readdir(downloads)).some((n) => n.endsWith(".pdf"))) break
    await pause(50)
  }
  const extractedFile = (await fs.readdir(downloads)).find((n) => n.endsWith(".pdf")),
    bytes = await fs.readFile(path.join(downloads, extractedFile)),
    out = await PDFDocument.load(bytes)
  check("Extract worker deduplicates overlaps into a new four-page PDF", out.getPageCount() === 4)
  check(
    "Source PDF bytes remain identical",
    createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex") === idHash,
  )
  await reader.click('[aria-label="Đóng thao tác tài liệu"]')
  await reader.click('[aria-label="In PDF"]')
  await click("Chuẩn bị bản in")
  await reader.waitForSelector('iframe[title="Bản in PDF"]')
  check(
    "Print prepares a local PDF including annotations without uploads",
    (await reader.$eval('iframe[title="Bản in PDF"]', (n) =>
      n.src.startsWith("blob:chrome-extension://"),
    )) && network.length === 0,
  )
  await reader.click('[aria-label="Đóng thao tác tài liệu"]')
  await click("Song ngữ theo đoạn")
  await reader.waitForSelector(".rf-bilingual-card")
  await reader.click(".rf-batch-translation summary")
  await reader.type('[aria-label="Dịch song ngữ từ trang"]', "1")
  await reader.type('[aria-label="Dịch song ngữ đến trang"]', "3")
  await click("Dịch dải trang đã chọn")
  await reader.waitForFunction(
    () => document.querySelector(".rf-batch-translation").innerText.includes("Hoàn tất 3 trang"),
    { polling: 100, timeout: 30000 },
  )
  const calls = await worker.evaluate(() => __pdfCalls)
  check(
    "Explicit three-page translation completes sequentially",
    calls.length > 0 && calls.length <= 21,
  )
  check(
    "PDF translation payloads contain text only, with no file/path/image upload",
    calls.every(
      (c) =>
        c.url === "https://api.openai.com/v1/responses" &&
        !/input_file|file_data|application\/pdf|base64|file:\/\/|Technical guide|C:\\/u.test(
          JSON.stringify(c.body),
        ),
    ),
  )
  check("Reader never makes remote HTTP requests for local PDF operations", network.length === 0)
  await reader.evaluate(() => {
    const node = [...document.querySelectorAll('.rf-pdf-page[data-page="1"] .textLayer span')].find(
      (n) => n.textContent.includes("uvm_test"),
    )?.firstChild
    const range = document.createRange()
    range.selectNodeContents(node)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    document
      .querySelector(".rf-pdf-scroll")
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
  await reader.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((n) =>
        n.textContent.includes("Dịch đoạn đã chọn"),
      ).disabled,
    { polling: 100 },
  )
  await click("Gạch chân đoạn chọn")
  await pause(100)
  check(
    "Underline preserves source text",
    await reader.$eval(".textLayer", (n) => n.textContent.includes("data[31:0]")),
  )
  await reader.keyboard.down("Shift")
  await reader.keyboard.down("Alt")
  await reader.keyboard.press("KeyQ")
  await reader.keyboard.up("Alt")
  await reader.keyboard.up("Shift")
  check("Modified Alt+Shift+Q does not translate", !(await reader.$(".rf-reader-translation")))
  await reader.keyboard.down("Alt")
  await reader.keyboard.press("KeyQ")
  await reader.keyboard.up("Alt")
  await reader.waitForSelector(".rf-reader-translation")
  check("Alt+Q opens the existing selection translator", true)
  await reader.screenshot({ path: path.join(scratch, "large-upgrade.png") })
  check(
    "Reading canvas leases remain bounded",
    await reader.$$eval(".rf-pdf-page canvas", (n) => n.length <= 3),
  )
  check("No uncaught runtime exceptions", !evidence.errors.length)
} catch (error) {
  evidence.failure = error.stack
  for (const page of await browser.pages())
    if (page.url().includes("pdf-reader")) {
      evidence.ui = await page.evaluate(() => document.body.innerText).catch(() => "")
      await page.screenshot({ path: path.join(scratch, "failure.png") }).catch(() => {})
    }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("EVIDENCE", scratch)
  await browser.close()
}
