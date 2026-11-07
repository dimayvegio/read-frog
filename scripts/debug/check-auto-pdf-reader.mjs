import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

export function bookFixture(label, count = 80) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  const kids = []
  for (let n = 1; n <= count; n++) {
    const page = objects.length + 1,
      content = page + 1
    kids.push(`${page} 0 R`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    const text = `BT /F1 18 Tf 50 700 Td (${label} page ${n}) Tj 0 -40 Td (Remember the exact place where you are reading.) Tj ET`
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${count} >>`
  let output = "%PDF-1.4\n",
    offsets = []
  for (const [n, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output))
    output += `${n + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(output)
}
export async function checkAutoPdfReader({
  browser,
  id,
  worker,
  source,
  panel,
  scratch,
  check,
  calls,
  evidence,
}) {
  const fixture = path.join(scratch, "Auto-book.pdf"),
    renamed = path.join(scratch, "Renamed-book.pdf"),
    other = path.join(scratch, "Other-book.pdf")
  const bytes = bookFixture("Read Frog"),
    digest = createHash("sha256").update(bytes).digest("hex")
  await fs.writeFile(fixture, bytes)
  await fs.writeFile(renamed, bytes)
  await fs.writeFile(other, bookFixture("Another book"))
  await source.bringToFront()
  const before = new Set(browser.targets())
  await panel.locator("::-p-aria(Đọc PDF và tự lưu vị trí)").click()
  const target = await browser.waitForTarget(
    (t) => !before.has(t) && t.url().startsWith(`chrome-extension://${id}/pdf-reader.html`),
  )
  const reader = await target.page(),
    errors = [],
    requests = []
  reader.on("pageerror", (error) => errors.push(error.message))
  reader.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url())
  })
  reader.setDefaultTimeout(15000)
  await reader.waitForSelector('input[type="file"]')
  await reader.waitForFunction(
    () =>
      document.body.innerText.includes("Hãy chọn file PDF") ||
      document.querySelector('[aria-label="Số trang"]'),
  )
  const load = async (file) => {
    await (await reader.$('input[type="file"]')).uploadFile(file)
    await reader.waitForSelector('[aria-label="Số trang"]')
    await reader.waitForSelector(".textLayer span")
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const readPosition = () =>
    worker.evaluate(async (documentId) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("read-frog-pdf-reading")
        r.onsuccess = () => resolve(r.result)
        r.onerror = reject
      })
      return new Promise((resolve, reject) => {
        const r = db.transaction("positions").objectStore("positions").get(documentId)
        r.onsuccess = () => {
          db.close()
          resolve(r.result ?? null)
        }
        r.onerror = reject
      })
    }, digest)
  const waitSaved = async () => {
    await reader.waitForFunction(() => document.body.innerText.includes("Đã tự lưu trên máy"))
    return readPosition()
  }
  const scroll = async (pageNumber, fraction) =>
    reader.evaluate(
      ({ page, offset }) => {
        const host = document.querySelector(".rf-pdf-scroll"),
          element = document.querySelector(`[data-page="${page}"]`)
        host.scrollTop = element.offsetTop + element.clientHeight * offset
      },
      { page: pageNumber, offset: fraction },
    )
  const beforeCalls = await calls()
  await load(fixture)
  check(
    "Reader renders selectable local PDF text using a bundled worker",
    (await reader.$eval(".textLayer", (node) => node.textContent.includes("Read Frog"))) &&
      (await reader.workers()).some((w) =>
        w.url().startsWith(`chrome-extension://${id}/assets/pdf.worker`),
      ),
  )
  check(
    "Opening and initial layout do not overwrite an unread document position",
    (await readPosition()) === null,
  )
  await scroll(27, 0.37)
  const saved = await waitSaved()
  check(
    "Scrolling automatically persists the page and within-page offset",
    saved.page === 27 && Math.abs(saved.offset - 0.37) < 0.01 && saved.pageCount === 80,
  )
  check(
    "Reading does not send a PDF or text to OpenAI or any HTTP service",
    (await calls()) === beforeCalls && requests.length === 0,
  )
  check(
    "Only nearby pages have canvas and text layers in an 80-page PDF",
    (await reader.$$eval(".rf-pdf-page canvas", (nodes) => nodes.length <= 3)) &&
      (await reader.$$eval(".rf-pdf-page", (nodes) => nodes.length === 80)),
  )
  await reader.select('[aria-label="Thu phóng"]', "1.5")
  await waitSaved()
  await reader.reload()
  await reader.waitForSelector('input[type="file"]')
  await load(renamed)
  const restored = await reader.evaluate(() => ({
    page: Number(document.querySelector('[aria-label="Số trang"]').value),
    zoom: document.querySelector('[aria-label="Thu phóng"]').value,
    top: document.querySelector(".rf-pdf-scroll").scrollTop,
  }))
  check(
    "Reload and reopening renamed identical content restore page, scroll and zoom",
    restored.page === 27 &&
      restored.zoom === "1.5" &&
      restored.top > 20000 &&
      (await reader.$eval('[role="status"]', (n) => n.textContent.includes("Đã khôi phục"))),
  )
  const unchanged = await readPosition()
  await reader.setViewport({ width: 940, height: 800 })
  await new Promise((resolve) => setTimeout(resolve, 450))
  check(
    "Layout and resize preserve the saved activity timestamp",
    (await readPosition()).updatedAt === unchanged.updatedAt,
  )
  await load(other)
  check(
    "Different file content starts at its own position",
    await reader.$eval('[aria-label="Số trang"]', (node) => node.value === "1"),
  )
  await load(renamed)
  await reader.select('[aria-label="Thu phóng"]', "0.5")
  await scroll(47, 0.75)
  await reader.waitForFunction(() => document.querySelector('[data-page="49"] .textLayer span'))
  check(
    "Smaller zoom renders visible pages before prefetching offscreen pages",
    await reader.$$eval(".rf-pdf-page canvas", (nodes) => nodes.length <= 3),
  )
  await reader.select('[aria-label="Thu phóng"]', "1.5")
  // Select through the actual PDF.js text layer, then use the shared translation UI.
  await scroll(27, 0)
  await reader.waitForFunction(() =>
    document.querySelector('[data-page="27"] .textLayer span')?.textContent.includes("Read Frog"),
  )
  await reader.evaluate(() => {
    const text = document.querySelector('[data-page="27"] .textLayer span'),
      range = document.createRange()
    range.selectNodeContents(text)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document
      .querySelector(".rf-pdf-scroll")
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
  await reader.locator("::-p-aria(Dịch đoạn đã chọn)").click()
  await reader.waitForFunction(() =>
    document
      .querySelector('[data-testid="native-selection-output"]')
      ?.textContent.includes("Bản dịch PDF"),
  )
  check(
    "Selectable PDF text uses the existing translation, history and vocabulary UI",
    (await reader.$('[data-testid="pdf-history"]')) && (await calls()) === beforeCalls + 1,
  )
  await reader.locator("::-p-aria(Đóng khung dịch ×)").click()
  await reader.evaluate(() => {
    const layer = document.querySelector('[data-page="27"] .textLayer'),
      text = document.createElement("span")
    text.textContent = "x".repeat(20001)
    layer.append(text)
    const range = document.createRange()
    range.selectNodeContents(text)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    document
      .querySelector(".rf-pdf-scroll")
      .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
  await reader.locator("::-p-aria(Dịch đoạn đã chọn)").click()
  await reader.waitForSelector('[data-testid="native-selection-output"] p[role="alert"]')
  check(
    "Oversized reader selections are rejected without silently translating a truncated passage",
    (await calls()) === beforeCalls + 1,
  )
  await reader.locator("::-p-aria(Đóng khung dịch ×)").click()
  await reader.locator("::-p-aria(Quên vị trí)").click()
  await reader.waitForFunction(() => document.body.innerText.includes("Đã quên vị trí"))
  await new Promise((resolve) => setTimeout(resolve, 450))
  check(
    "Forget removes the bookmark without an initial-layout save resurrecting it",
    (await readPosition()) === null &&
      (await reader.$eval('[aria-label="Số trang"]', (node) => node.value === "1")),
  )
  await scroll(11, 0.24)
  await waitSaved()
  check("Automatic saving resumes with the new clear epoch", (await readPosition()).page === 11)
  for (const n of [60, 5, 79, 20]) {
    await scroll(n, 0.2)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  await reader.waitForFunction(() => document.querySelector('[data-page="20"] .textLayer span'))
  check(
    "Rapid navigation cancels old renders and retains at most three canvases",
    await reader.$$eval(".rf-pdf-page canvas", (nodes) => nodes.length <= 3),
  )
  for (const width of [390, 760, 1280]) {
    await reader.setViewport({ width, height: 850 })
    await new Promise((resolve) => setTimeout(resolve, 120))
    check(
      `Reader toolbar has no page overflow at ${width}px`,
      await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await reader.select('[aria-label="Thu phóng"]', "fit-width")
  await scroll(20, 0.03)
  await waitSaved()
  await reader.screenshot({ path: path.join(scratch, "auto-reader.png"), fullPage: true })
  evidence.screenshots.push("auto-reader.png")
  check("Reader browser flow has no JavaScript errors", errors.length === 0)
  assert.deepEqual(requests, [])
  // Close before the 300 ms debounce. pagehide must hand the pending save to
  // the background, rather than relying only on already committed positions.
  await scroll(21, 0.12)
  await reader.waitForFunction(
    () => document.querySelector('[aria-label="Số trang"]').value === "21",
  )
  await reader.close()
  const reopener = await browser.newPage()
  await reopener.goto(`chrome-extension://${id}/pdf-reader.html`)
  await (await reopener.waitForSelector('input[type="file"]')).uploadFile(fixture)
  await reopener.waitForSelector('[aria-label="Số trang"]')
  check(
    "Closing the reader and opening a new tab retains the reading position",
    await reopener.$eval('[aria-label="Số trang"]', (node) => node.value === "21"),
  )
  await reopener.close()
  evidence.autoReader = {
    pages: 80,
    localWorker: true,
    noReadingUpload: true,
    errors,
    contentHash: digest,
  }
}
