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
const scratch = path.resolve(`.codex/pdf-ux-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
let file = process.env.PDF_UX_FILE
if (!file) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 0; n < 2; n++) {
    const page = pdf.addPage([612, 792])
    page.drawText("2. Senior Design Engineer", { x: 70, y: 680, size: 15, font })
    page.drawText("Responsibilities include:", { x: 85, y: 650, size: 12, font })
    page.drawText("• Implement a full-chip process for", { x: 85, y: 632, size: 12, font })
    page.drawText("SoCs.", { x: 105, y: 614, size: 12, font })
  }
  file = path.join(scratch, "Reader-UX.pdf")
  await fs.writeFile(file, await pdf.save())
}
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
  const select = (label) => reader.click(`.rf-tool-segment [aria-label="${label}"]`)
  const click = (text) =>
    reader.evaluate((value) => {
      const b = [...document.querySelectorAll("button")].find((n) => n.textContent.includes(value))
      if (!b) throw Error(value)
      b.click()
    }, text)
  const rect = (selector) =>
    reader.$eval(selector, (node) => {
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
  const db = () =>
    worker.evaluate(
      (hash) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("read-frog-pdf-study")
          r.onerror = reject
          r.onsuccess = () => {
            const d = r.result,
              q = d.transaction("documents").objectStore("documents").get(hash)
            q.onsuccess = () => {
              d.close()
              resolve(q.result ?? { revision: 0, annotations: [] })
            }
            q.onerror = reject
          }
        }),
      idHash,
    )
  const revision = async (before) => {
    for (let n = 0; n < 100; n++) {
      const value = await db()
      if (value.revision > before) return value
      await pause(20)
    }
    throw Error("Annotation did not commit")
  }
  const drag = async (x, y, dx, dy, steps = 20) => {
    await reader.mouse.move(x, y)
    await reader.mouse.down()
    await reader.mouse.move(x + dx, y + dy, { steps })
    await reader.mouse.up()
  }
  // Draw against the same reader state for baseline and candidate.
  const cdp = await reader.createCDPSession()
  if (process.env.PDF_UX_BILINGUAL) {
    await click("Song ngữ theo đoạn")
    await reader.waitForSelector(".rf-bilingual-original")
  }
  await cdp.send("Performance.enable")
  await reader.evaluate(() => {
    globalThis.__drawPerf = { latest: 0, latency: [], longTasks: [], points: 0 }
    document.addEventListener(
      "pointermove",
      () => {
        __drawPerf.latest = performance.now()
      },
      true,
    )
    new MutationObserver((records) => {
      if (records.some((r) => r.type === "attributes" && r.attributeName === "points")) {
        __drawPerf.latency.push(performance.now() - __drawPerf.latest)
        __drawPerf.points++
      }
    }).observe(document.querySelector(".rf-pdf-scroll"), {
      attributes: true,
      attributeFilter: ["points"],
      subtree: true,
    })
    new PerformanceObserver((list) =>
      __drawPerf.longTasks.push(...list.getEntries().map((e) => e.duration)),
    ).observe({ type: "longtask" })
  })
  const metric = async () =>
    Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
    )
  const before = await metric()
  await select("Hình tròn")
  await reader.keyboard.down("Shift")
  for (let n = 0; n < 12; n++) {
    const previous = await db(),
      box = await rect('.rf-pdf-page[data-page="1"]')
    await drag(
      box.x + box.width * 0.12,
      box.y + box.height * 0.2,
      box.width * 0.15,
      box.height * 0.07,
    )
    await revision(previous.revision)
  }
  await reader.keyboard.up("Shift")
  const after = await metric()
  evidence.draw = await reader.evaluate(() => __drawPerf)
  evidence.draw.metrics = Object.fromEntries(
    [
      "LayoutCount",
      "RecalcStyleCount",
      "TaskDuration",
      "LayoutDuration",
      "RecalcStyleDuration",
    ].map((key) => [key, after[key] - before[key]]),
  )
  evidence.browser = await browser.version()
  evidence.fixtureHash = idHash
  check(
    "Twelve shapes commit once each with no provider calls",
    (await db()).revision === 12 && (await worker.evaluate(() => __pdfCalls.length === 0)),
  )
  if (!process.env.PDF_UX_BENCH_ONLY) {
    const beforeEllipse = await db(),
      ellipsePage = await rect('.rf-pdf-page[data-page="1"]')
    await drag(
      ellipsePage.x + ellipsePage.width * 0.12,
      ellipsePage.y + ellipsePage.height * 0.2,
      ellipsePage.width * 0.25,
      ellipsePage.height * 0.04,
    )
    await revision(beforeEllipse.revision)
    const ellipse = await reader.$eval(
      ".rf-study-overlay g:last-child polyline",
      (node) => node.getBoundingClientRect().width / node.getBoundingClientRect().height,
    )
    check("Circle tool follows a wide drag as an ellipse without Shift", ellipse > 3)
    await click("Song ngữ theo đoạn")
    await reader.waitForSelector(".rf-bilingual-original")
    const activeParagraph = await reader.$eval(
      ".rf-paragraph-box.active",
      (node) => node.dataset.paragraphId,
    )
    check(
      "Dark preference and dark OS do not mix the PDF reader palette",
      await reader.evaluate(
        () =>
          document.documentElement.classList.contains("light") &&
          getComputedStyle(document.documentElement).colorScheme === "light",
      ),
    )
    await select("Chọn / sửa hình")
    const hit = await rect(".rf-study-overlay g:last-child rect")
    await reader.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2)
    await reader.waitForSelector(".rf-shape-selection")
    const selected = await rect(".rf-shape-selection"),
      previous = await db()
    await drag(selected.x + selected.width / 2, selected.y + selected.height / 2, 55, 25)
    const moved = await revision(previous.revision),
      movedBox = await rect(".rf-shape-selection")
    check(
      "Move follows both axes and persists the same annotation ID",
      moved.annotations.at(-1).id === previous.annotations.at(-1).id &&
        movedBox.x > selected.x + 45 &&
        movedBox.y > selected.y + 15,
    )
    const edge = await rect('[data-shape-handle="e"]')
    await drag(edge.x + edge.width / 2, edge.y + edge.height / 2, 80, 0)
    const resized = await revision(moved.revision),
      enlarged = await rect(".rf-shape-selection")
    check(
      "Side handle changes width independently and commits only once",
      enlarged.width > movedBox.width + 65 &&
        Math.abs(enlarged.height - movedBox.height) < 1 &&
        resized.revision === moved.revision + 1,
    )
    check(
      "Drawing and shape editing do not select another bilingual paragraph",
      (await reader.$eval(".rf-paragraph-box.active", (node) => node.dataset.paragraphId)) ===
        activeParagraph,
    )
    await reader.click('[aria-label="Hoàn tác"]')
    await revision(resized.revision)
    check(
      "Undo restores geometry without adding a shape",
      Math.abs((await rect(".rf-shape-selection")).width - movedBox.width) < 1 &&
        (await db()).annotations.length === 13,
    )
    const start = await rect(".rf-shape-selection"),
      unchanged = await db()
    await reader.mouse.move(start.x + 15, start.y + 15)
    await reader.mouse.down()
    await reader.mouse.move(start.x + 90, start.y + 70)
    await reader.$eval(".rf-pdf-scroll", (node) =>
      node.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 1, isPrimary: true, bubbles: true }),
      ),
    )
    await reader.mouse.up()
    await pause(150)
    check(
      "Pointer cancellation restores preview without writing",
      (await db()).revision === unchanged.revision &&
        Math.abs((await rect(".rf-shape-selection")).x - start.x) < 1,
    )
    const keyBefore = await db(),
      keyBox = await rect(".rf-shape-selection")
    await reader.$eval('[data-shape-handle="move"]', (node) => node.focus())
    await reader.keyboard.press("ArrowRight")
    await revision(keyBefore.revision)
    check(
      "Shape handles support precise keyboard adjustment and keep focus",
      Math.abs((await rect(".rf-shape-selection")).x - keyBox.x - 1) < 0.2 &&
        (await reader.evaluate(() => document.activeElement.dataset.shapeHandle === "move")),
    )
    await reader.screenshot({ path: path.join(scratch, "shape-edit.png") })
    await select("Chọn chữ")
    const pickedBefore = await db()
    const existingId = pickedBefore.annotations.at(-1).id
    const point = await reader.$eval(".rf-study-overlay g:last-child polyline", (node) => {
      const p = node.points.getItem(0),
        matrix = node.getScreenCTM()
      const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    })
    await reader.mouse.click(point.x, point.y)
    await reader.waitForSelector(".rf-shape-properties:not([hidden])")
    check(
      "Clicking an existing stroke in reading mode selects it without a database write",
      (await db()).revision === pickedBefore.revision &&
        (await reader.$eval(".rf-shape-selection", (n) => n.dataset.shapeId)) === existingId,
    )
    await reader.click('[aria-label="Đổi màu hình: Đỏ"]')
    const recolored = await revision(pickedBefore.revision)
    check(
      "Color editing keeps points and ID, and writes exactly one revision",
      recolored.revision === pickedBefore.revision + 1 &&
        recolored.annotations.at(-1).id === existingId &&
        recolored.annotations.at(-1).color === "#ef5350" &&
        JSON.stringify(recolored.annotations.at(-1).points) ===
          JSON.stringify(pickedBefore.annotations.at(-1).points),
    )
    await reader.waitForSelector('[aria-label="Xóa hình đã chọn"]:not(:disabled)')
    await reader.click('[aria-label="Xóa hình đã chọn"]')
    const deleted = await revision(recolored.revision)
    check(
      "Delete removes only the selected shape",
      deleted.annotations.length === recolored.annotations.length - 1 &&
        !deleted.annotations.some((a) => a.id === existingId),
    )
    await reader.click('[aria-label="Hoàn tác"]')
    const restored = await revision(deleted.revision)
    check(
      "Undo restores the same shape and edited color",
      restored.annotations.at(-1).id === existingId &&
        restored.annotations.at(-1).color === "#ef5350",
    )
    check(
      "Square tool is removed, line and arrow tools are available",
      await reader.evaluate(
        () =>
          !document.querySelector('.rf-tool-segment [aria-label="Hình vuông"]') &&
          !!document.querySelector('.rf-tool-segment [aria-label="Đường thẳng"]') &&
          !!document.querySelector('.rf-tool-segment [aria-label="Mũi tên"]'),
      ),
    )
    for (const [label, dx, dy] of [
      ["Đường thẳng", 120, 0],
      ["Đường thẳng", 0, 120],
      ["Mũi tên", -100, 0],
      ["Mũi tên", 0, -100],
    ]) {
      await select(label)
      const linePage = await rect('.rf-pdf-page[data-page="1"]')
      const beforeLine = await db()
      await drag(linePage.x + linePage.width * 0.5, linePage.y + linePage.height * 0.36, dx, dy)
      const drawn = await revision(beforeLine.revision),
        item = drawn.annotations.at(-1)
      check(
        `${label} ${dx},${dy} commits one bounded open ink path`,
        drawn.revision === beforeLine.revision + 1 &&
          item.points.length === (label === "Mũi tên" ? 5 : 2) &&
          item.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) &&
          Math.abs((item.points[1].x - item.points[0].x) * linePage.width - dx) < 1 &&
          Math.abs((item.points[1].y - item.points[0].y) * linePage.height - dy) < 1,
      )
      const midpoint = {
        x: linePage.x + ((item.points[0].x + item.points[1].x) / 2) * linePage.width,
        y: linePage.y + ((item.points[0].y + item.points[1].y) / 2) * linePage.height,
      }
      await reader.mouse.click(midpoint.x, midpoint.y)
      await reader.waitForSelector('[data-shape-handle="end"]')
      check(
        "Stroke selection keeps the same ID and provides two endpoint handles without writing",
        (await db()).revision === drawn.revision &&
          (await reader.$$("[data-shape-handle]")).length === 3 &&
          (await reader.$eval(
            ".rf-shape-selection",
            (node, shapeId) => node.dataset.shapeId === shapeId,
            item.id,
          )),
      )
      const end = await rect('[data-shape-handle="end"]')
      await drag(end.x + end.width / 2, end.y + end.height / 2, 24, 32)
      const edited = await revision(drawn.revision),
        editedItem = edited.annotations.at(-1)
      check(
        "Endpoint drag rotates/lengthens the same ink once and keeps its opposite endpoint",
        edited.revision === drawn.revision + 1 &&
          editedItem.id === item.id &&
          JSON.stringify(editedItem.points[0]) === JSON.stringify(item.points[0]) &&
          Math.abs((editedItem.points[1].x - item.points[1].x) * linePage.width - 24) < 1 &&
          Math.abs((editedItem.points[1].y - item.points[1].y) * linePage.height - 32) < 1 &&
          (label !== "Mũi tên" ||
            JSON.stringify(editedItem.points[1]) === JSON.stringify(editedItem.points[3])),
      )
      const cancelEnd = await rect('[data-shape-handle="end"]')
      await reader.mouse.move(cancelEnd.x + 6, cancelEnd.y + 6)
      await reader.mouse.down()
      await reader.mouse.move(cancelEnd.x + 45, cancelEnd.y + 45, { steps: 8 })
      await reader.evaluate(() =>
        document.querySelector(".rf-pdf-scroll").dispatchEvent(new Event("scroll")),
      )
      await reader.mouse.up()
      await pause(60)
      check("Canceled endpoint gesture never writes", (await db()).revision === edited.revision)
      await reader.$eval('[data-shape-handle="start"]', (n) => n.focus())
      await reader.keyboard.press("ArrowLeft")
      const keyed = await revision(edited.revision)
      check(
        "Endpoint keyboard edit moves just the focused endpoint and preserves focus",
        Math.abs(
          (keyed.annotations.at(-1).points[0].x - editedItem.points[0].x) * linePage.width + 1,
        ) < 0.1 &&
          JSON.stringify(keyed.annotations.at(-1).points[1]) ===
            JSON.stringify(editedItem.points[1]) &&
          (await reader.evaluate(() => document.activeElement.dataset.shapeHandle === "start")),
      )
      if (label === "Mũi tên")
        await reader.screenshot({ path: path.join(scratch, "arrow-endpoints.png") })
      await reader.$eval('[data-shape-handle="move"]', (n) => n.focus())
      await reader.keyboard.press("Delete")
      const removed = await revision(keyed.revision)
      check(
        "Line/arrow delete is one undoable revision",
        removed.revision === keyed.revision + 1 &&
          !removed.annotations.some((a) => a.id === item.id),
      )
      await reader.click('[aria-label="Hoàn tác"]')
      const restoredLine = await revision(removed.revision)
      check(
        "Undo restores exact line/arrow geometry",
        JSON.stringify(restoredLine.annotations.at(-1)) ===
          JSON.stringify(keyed.annotations.at(-1)),
      )
      await reader.click('[aria-label="Làm lại"]')
      await revision(restoredLine.revision)
    }
    check(
      "Shape property controls never call a provider",
      await worker.evaluate(() => __pdfCalls.length === 0),
    )
    await click("Tìm kiếm")
    await reader.waitForSelector(".rf-study-panel")
    const panel = await rect(".rf-study-panel"),
      input = await rect('[aria-label="Từ khóa PDF"]'),
      pageWidth = (await rect('.rf-pdf-page[data-page="1"]')).width
    check(
      "Search has a full-width readable field and exits drawing mode",
      input.width > panel.width - 140 &&
        (await reader.$eval(".rf-pdf-scroll", (e) => e.dataset.studyTool === "select")),
    )
    const handle = await rect('[data-panel-handle="se"]')
    await drag(handle.x + 6, handle.y + 6, 140, 70)
    const bigger = await rect(".rf-study-panel")
    check(
      "Search resizes in both dimensions without resizing the PDF canvas",
      bigger.width > panel.width + 110 &&
        bigger.height > panel.height + 45 &&
        Math.abs((await rect('.rf-pdf-page[data-page="1"]')).width - pageWidth) < 1,
    )
    const title = await rect('[data-panel-handle="move"]')
    await drag(title.x + title.width / 2, title.y + title.height / 2, 140, 15)
    check("Search window moves immediately", (await rect(".rf-study-panel")).x > bigger.x + 110)
    await reader.type('[aria-label="Từ khóa PDF"]', "SoCs")
    await reader.keyboard.press("Enter")
    await reader.waitForSelector(".rf-study-result")
    check(
      "Results remain selectable after resize",
      await reader.$$eval(".rf-study-result", (rows) => rows.length > 0),
    )
    await reader.click('[aria-label="Kết quả sau"]')
    check(
      "Search next selects a result and shows its position",
      await reader.$eval(
        '.rf-study-result[aria-current="true"]',
        (node) => !!node.textContent.includes("SoCs"),
      ),
    )
    await click("Mục lục / Trang")
    check(
      "Outline and pages share the same resized window",
      Math.abs((await rect(".rf-study-panel")).width - bigger.width) < 1,
    )
    check(
      "PDFs without an embedded outline open a useful page grid",
      await reader.$$eval(".rf-page-grid button", (nodes) => nodes.length === 2),
    )
    await reader.screenshot({ path: path.join(scratch, "outline.png") })
    await reader.click('[aria-label="Đóng menu PDF"]')
    await select("Chọn chữ")
    await reader.$eval('.rf-pdf-page[data-page="1"] .textLayer', (node) => {
      const span = [...node.querySelectorAll("span")].find((n) =>
        n.textContent.includes("Responsibilities"),
      )
      const range = document.createRange()
      range.selectNodeContents(span)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    })
    check(
      "Translate selection is in the top toolbar immediately before annotated PDF download",
      await reader.evaluate(() => {
        const button = document.querySelector(".rf-translate-selection")
        return (
          !button.disabled &&
          button.closest(".rf-study-toolbar") &&
          button.nextElementSibling?.classList.contains("rf-export-pdf") &&
          !document.querySelector(".rf-reader-action") &&
          button.getBoundingClientRect().top <
            document.querySelector(".rf-reader-body").getBoundingClientRect().top
        )
      }),
    )
    const selectedText = await reader.evaluate(() => {
      document.querySelector(".rf-translate-selection").addEventListener(
        "click",
        () => {
          globalThis.__selectionAtToolbarClick = getSelection().toString()
        },
        { capture: true, once: true },
      )
      return getSelection().toString()
    })
    await reader.click(".rf-translate-selection")
    check(
      "Toolbar pointer click retains selection until the explicit translation action",
      selectedText && (await reader.evaluate(() => __selectionAtToolbarClick)) === selectedText,
    )
    await reader.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.textContent.includes("Bản dịch PDF"),
      { polling: 100 },
    )
    check(
      "Existing pipeline translates the exact selected text once",
      await worker.evaluate(
        (text) => __pdfCalls.length === 1 && JSON.stringify(__pdfCalls[0].body).includes(text),
        selectedText,
      ),
    )
    await reader.waitForFunction(
      () => document.querySelector('[aria-label="Lưu vào sổ"] option')?.value,
      { polling: 100 },
    )
    evidence.colors = await reader.$eval('[aria-label="Lưu vào sổ"]', (node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        foreground: style.color,
        option: node.selectedOptions[0]?.textContent,
        scheme: style.colorScheme,
      }
    })
    check(
      "Notebook selector has dark text on a light surface",
      evidence.colors.background === "rgb(255, 255, 255)" &&
        evidence.colors.foreground !== "rgb(255, 255, 255)" &&
        evidence.colors.scheme === "light",
    )
    await reader.screenshot({ path: path.join(scratch, "translation-light.png") })
    await click("Đóng khung dịch")
    await click("Song ngữ theo đoạn")
    await reader.waitForSelector(".rf-bilingual-original")
    const paragraphs = await reader.$$eval(".rf-bilingual-original", (nodes) =>
      nodes.map((n) => n.textContent),
    )
    check(
      "Numbered title, colon label and wrapped solid-dot bullets remain separate",
      paragraphs.some((p) => /2\.\s+Senior/.test(p) && !p.includes("Responsibilities")) &&
        paragraphs.some(
          (p) => p.includes("SoCs.") && /[●•]/.test(p) && !p.includes("Responsibilities"),
        ),
    )
    evidence.paragraphCount = paragraphs.length
    if (process.env.PDF_UX_FILE)
      check(
        "A colon inside a bullet keeps its hanging continuation",
        paragraphs.some(
          (p) =>
            p.includes("following majors:") &&
            p.includes("Electronics & Telecommunications") &&
            p.includes("related fields."),
        ),
      )
    await reader.screenshot({ path: path.join(scratch, "paragraphs.png") })
    const other = await browser.newPage()
    await other.goto(root + "selection-result.html")
    await other.waitForFunction(() => document.documentElement.classList.contains("dark"), {
      polling: 100,
    })
    check(
      "Other extension pages and saved preference stay dark",
      await worker.evaluate(async () => (await chrome.storage.local.get("theme")).theme === "dark"),
    )
    await other.close()
    await reader.bringToFront()
    await reader.setViewport({ width: 390, height: 844 })
    await click("Tìm kiếm")
    await pause(100)
    check(
      "Floating panel stays reachable on a phone viewport",
      (await rect(".rf-study-panel")).x >= 0 && (await rect(".rf-study-panel")).width <= 390,
    )
    check(
      "Only explicit passage translation called the provider",
      await worker.evaluate(() => __pdfCalls.length === 1),
    )
    check("No uncaught reader errors", !evidence.errors.length)
  }
} catch (error) {
  evidence.failure = error.stack
  console.error(error)
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("EVIDENCE", scratch)
  await browser.close()
}
