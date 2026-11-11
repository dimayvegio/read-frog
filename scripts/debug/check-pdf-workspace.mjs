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
const scratch = path.resolve(`.codex/pdf-workspace-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const pdfFixture = await PDFDocument.create(),
  font = await pdfFixture.embedFont(StandardFonts.Helvetica)
for (let i = 0; i < 4; i++) {
  const page = pdfFixture.addPage([600, 800])
  for (const [text, y] of [
    ["Chapter heading", 760],
    ["Alpha paragraph begins here and has useful words.", 680],
    ["Another line belonging to the same paragraph.", 660],
    ["Beta paragraph stays separate.", 580],
    ["Gamma paragraph for translation.", 480],
    ["Footer to ignore", 30],
  ])
    page.drawText(text, { x: 60, y, size: 14, font })
}
const file = path.join(scratch, "Workspace.pdf")
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
  const readDB = (name) =>
    worker.evaluate(
      (dbName, hash) =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open(dbName)
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const connection = req.result,
              q = connection.transaction("documents").objectStore("documents").get(hash)
            q.onsuccess = () => {
              connection.close()
              resolve(q.result)
            }
            q.onerror = () => {
              connection.close()
              reject(q.error)
            }
          }
        }),
      name,
      idHash,
    )
  const workspaceDB = () => readDB("read-frog-pdf-workspace")
  const waitWorkspace = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      const v = await workspaceDB()
      if (v && predicate(v)) return v
      await pause(30)
    }
    throw Error("Workspace did not commit")
  }
  const selectTool = (label) => reader.click(`.rf-tool-segment [aria-label="${label}"]`)
  const stroke = async (index = 0) =>
    reader.$eval(`.rf-study-overlay g:nth-child(${index + 1}) polyline`, (node) => {
      const p = node.points.getItem(0),
        q = new DOMPoint(p.x, p.y).matrixTransform(node.getScreenCTM())
      return { x: q.x, y: q.y }
    })
  const chooseBoth = async () => {
    const clear = await reader.$('[aria-label="Bỏ chọn hình"]')
    if (clear) await clear.click()
    await selectTool("Chọn chữ")
    const a = await stroke()
    await reader.mouse.click(a.x, a.y)
    await reader.keyboard.down("Shift")
    const b = await stroke(1)
    await reader.mouse.click(b.x, b.y)
    await reader.keyboard.up("Shift")
  }
  await selectTool("Hình chữ nhật")
  for (const x of [0.12, 0.42]) {
    const page = await rect('.rf-pdf-page[data-page="1"]'),
      before = await db()
    await drag(
      page.x + page.width * x,
      page.y + page.height * 0.18,
      page.width * 0.15,
      page.height * 0.06,
    )
    await revision(before.revision)
  }
  const original = await db()
  await chooseBoth()
  check(
    "Shift-click selects two shapes without writing",
    (await reader.$eval(".rf-shape-properties strong", (n) =>
      n.textContent.startsWith("2 hình"),
    )) && (await db()).revision === original.revision,
  )
  const box = await rect(".rf-shape-selection"),
    page = await rect('.rf-pdf-page[data-page="1"]')
  await drag(box.x + box.width / 2, box.y + box.height / 2, 30, 20)
  const moved = await revision(original.revision)
  check(
    "Group movement is one revision with stable IDs and equal offsets",
    moved.revision === original.revision + 1 &&
      moved.annotations.every(
        (a, i) =>
          a.id === original.annotations[i].id &&
          Math.abs((a.points[0].x - original.annotations[i].points[0].x) * page.width - 30) < 1,
      ),
  )
  const edge = await rect('[data-shape-handle="e"]')
  await drag(edge.x + 6, edge.y + 6, 20, 0)
  const resized = await revision(moved.revision)
  check(
    "Group resize commits once without changing shape count",
    resized.revision === moved.revision + 1 && resized.annotations.length === 2,
  )
  await reader.waitForSelector('[aria-label="Xóa hình đã chọn"]:not(:disabled)')
  await reader.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const corner = await rect('[data-shape-handle="se"]')
  await reader.mouse.move(corner.x + 6, corner.y + 6)
  await reader.mouse.down()
  await reader.mouse.move(corner.x + 40, corner.y + 40, { steps: 5 })
  await reader.evaluate(() =>
    document.querySelector(".rf-pdf-scroll").dispatchEvent(new Event("scroll")),
  )
  await reader.mouse.up()
  await pause(60)
  const canceled = await db()
  if (canceled.revision !== resized.revision)
    console.log(
      "CANCEL_DIAGNOSTIC",
      JSON.stringify({ expected: resized.revision, actual: canceled, previous: resized }),
    )
  check("Canceled group gesture writes nothing", canceled.revision === resized.revision)
  await reader.select('[aria-label="Độ dày nét"]', "6")
  await waitWorkspace(
    (d) =>
      Object.values(d.styles).length === 2 && Object.values(d.styles).every((s) => s.width === 6),
  )
  await reader.waitForSelector('[aria-label="Độ đậm"]:not(:disabled)')
  await reader.select('[aria-label="Độ đậm"]', "0.5")
  await waitWorkspace((d) => Object.values(d.styles).every((s) => s.opacity === 0.5))
  await reader.waitForSelector('[aria-label="Màu nền hình"]:not(:disabled)')
  await reader.select('[aria-label="Màu nền hình"]', "#ef5350")
  await waitWorkspace((d) => Object.values(d.styles).every((s) => s.fill === "#ef5350"))
  await reader.waitForFunction(
    () =>
      [...document.querySelectorAll(".rf-study-overlay g > polyline:first-of-type")].length === 2 &&
      [...document.querySelectorAll(".rf-study-overlay g > polyline:first-of-type")].every(
        (n) =>
          n.getAttribute("stroke-width") === "6" &&
          n.getAttribute("stroke-opacity") === "0.5" &&
          n.getAttribute("fill") === "#ef5350",
      ),
    { polling: 100 },
  )
  check(
    "Both shapes render persisted width, opacity and fill with no geometry rewrite",
    (await reader.$$eval(".rf-study-overlay g > polyline:first-of-type", (nodes) =>
      nodes.every(
        (n) =>
          n.getAttribute("stroke-width") === "6" &&
          n.getAttribute("stroke-opacity") === "0.5" &&
          n.getAttribute("fill") === "#ef5350",
      ),
    )) && (await db()).revision === resized.revision,
  )
  await reader.screenshot({ path: path.join(scratch, "group-style.png") })
  await selectTool("Chọn chữ")
  await click("Bookmark")
  await reader.evaluate(() => {
    const host = document.querySelector(".rf-pdf-scroll"),
      sheet = document.querySelector('.rf-pdf-page[data-page="1"]')
    host.scrollTop = sheet.offsetTop + sheet.clientHeight * 0.18
  })
  await pause(100)
  await reader.type('[aria-label="Tên bookmark"]', "Ôn lại chương 1")
  await reader.type('[aria-label="Ghi chú bookmark"]', "Nhớ kiểm tra ví dụ và thuật ngữ.")
  await reader.select('[aria-label="Màu bookmark"]', "#42a5f5")
  await click("Đánh dấu vị trí đang đọc")
  const marked = await waitWorkspace((d) => d.bookmarks.length === 1)
  check(
    "Bookmark stores name, Unicode note, color and exact local reading position",
    marked.bookmarks[0].name === "Ôn lại chương 1" &&
      marked.bookmarks[0].note.includes("thuật ngữ") &&
      marked.bookmarks[0].color === "#42a5f5",
  )
  await reader.select('[aria-label="Thu phóng"]', "1.5")
  await reader.$eval('[aria-label="Số trang"]', (n) => {
    n.value = "2"
    n.dispatchEvent(new Event("change", { bubbles: true }))
    n.focus()
  })
  await reader.keyboard.press("Enter")
  await reader.waitForFunction(
    () => document.querySelector('[aria-label="Số trang"]').value === "2",
    { polling: 100 },
  )
  await reader.click(".rf-bookmark .rf-study-result")
  await reader.waitForFunction(
    () =>
      document.querySelector('[aria-label="Số trang"]').value === "1" &&
      document.querySelector('[aria-label="Thu phóng"]').value === "fit-width",
    { polling: 100 },
  )
  await pause(150)
  const offset = await reader.evaluate(() => {
    const h = document.querySelector(".rf-pdf-scroll"),
      p = document.querySelector('.rf-pdf-page[data-page="1"]')
    return (h.scrollTop - p.offsetTop) / p.clientHeight
  })
  check(
    "Bookmark restores page, fractional scroll and zoom after navigation",
    Math.abs(offset - marked.bookmarks[0].offset) < 0.01,
  )
  await reader.screenshot({ path: path.join(scratch, "bookmarks.png") })
  await reader.click('[aria-label="Đóng menu PDF"]')
  await chooseBoth()
  await reader.click('[aria-label="Sao chép hình"]')
  await reader.click('[aria-label="Dán hình"]')
  const pasted = await revision(resized.revision)
  check(
    "Copy/paste creates two new bounded IDs and preserves old shapes",
    pasted.annotations.length === 4 &&
      new Set(pasted.annotations.map((a) => a.id)).size === 4 &&
      pasted.annotations.every((a) =>
        a.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
      ),
  )
  const copiedIds = pasted.annotations.slice(2).map((a) => a.id)
  await reader.click('[aria-label="Hoàn tác"]')
  await revision(pasted.revision)
  await reader.click('[aria-label="Hoàn tác"]')
  await waitWorkspace((d) => d.bookmarks.length === 0)
  await reader.click('[aria-label="Làm lại"]')
  await waitWorkspace((d) => d.bookmarks.length === 1)
  const beforeRedo = await db()
  await reader.click('[aria-label="Làm lại"]')
  await revision(beforeRedo.revision)
  const redone = await workspaceDB()
  check(
    "Shared chronological undo/redo restores bookmark and copied styles",
    copiedIds.every(
      (key) => redone.styles[key]?.width === 6 && redone.styles[key]?.fill === "#ef5350",
    ) && (await db()).annotations.length === 4,
  )
  await selectTool("Chọn chữ")
  await click("Song ngữ theo đoạn")
  await reader.waitForSelector(".rf-bilingual-original")
  await click("Chỉnh đoạn")
  const startCount = await reader.$$eval(".rf-bilingual-card", (n) => n.length)
  const alphaId = await reader.$eval(
    ".rf-bilingual-scroll",
    (n) =>
      [...n.querySelectorAll("article")].find((a) =>
        a.querySelector(".rf-bilingual-original").textContent.includes("Alpha"),
      ).dataset.translationId,
  )
  const alphaSelector = `[data-translation-id="${alphaId}"]`
  await reader.$eval(alphaSelector, (n) =>
    [...n.querySelectorAll("button")].find((b) => b.textContent === "Gộp với đoạn sau").click(),
  )
  await waitWorkspace(
    (d) => d.layouts.length === 1 && d.layouts[0].paragraphs.length === startCount - 1,
  )
  await reader.waitForFunction(
    (count) => document.querySelectorAll(".rf-bilingual-card").length === count,
    { polling: 100 },
    startCount - 1,
  )
  check(
    "Merge persists a new paragraph while preserving native PDF text",
    await reader.$eval(".textLayer", (n) => n.textContent.includes("Alpha")),
  )
  const mergedId = await reader.$eval(
    ".rf-bilingual-scroll",
    (n) =>
      [...n.querySelectorAll("article")].find((a) =>
        a.querySelector(".rf-bilingual-original").textContent.includes("Alpha"),
      ).dataset.translationId,
  )
  await reader.$eval(`[data-translation-id="${mergedId}"]`, (n) => {
    const t = n.querySelector("textarea")
    t.focus()
    t.setSelectionRange(t.value.indexOf("Beta"), t.value.indexOf("Beta"))
    ;[...n.querySelectorAll("button")].find((b) => b.textContent === "Tách tại con trỏ").click()
  })
  await waitWorkspace((d) => d.layouts[0].paragraphs.length === startCount)
  await reader.waitForFunction(
    (count) => document.querySelectorAll(".rf-bilingual-card").length === count,
    { polling: 100 },
    startCount,
  )
  check(
    "Split restores the chosen text boundary and saves stable paragraph IDs",
    (await workspaceDB()).layouts[0].paragraphs.some(
      (p) => p.text === "Beta paragraph stays separate.",
    ),
  )
  await reader.$eval(".rf-bilingual-scroll", (n) => {
    const article = [...n.querySelectorAll("article")].find(
      (a) => a.querySelector(".rf-bilingual-original").textContent === "Footer to ignore",
    )
    ;[...article.querySelectorAll("button")]
      .find((b) => b.textContent === "Bỏ qua đoạn này")
      .click()
  })
  const edited = await waitWorkspace((d) =>
    d.layouts[0].paragraphs.some((p) => p.excluded && p.text === "Footer to ignore"),
  )
  await reader.waitForSelector(".rf-bilingual-card.excluded")
  check(
    "Excluded header/footer stays locally restorable and cannot be translated",
    await reader.$eval(
      ".rf-bilingual-card.excluded",
      (n) => [...n.querySelectorAll("button")].find((b) => b.textContent === "Dịch đoạn").disabled,
    ),
  )
  check(
    "Editing, bookmarks and group properties never call a provider",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  await reader.screenshot({ path: path.join(scratch, "paragraph-edit.png") })
  await click("Dịch trang đang xem")
  await reader.waitForFunction(
    () => document.querySelectorAll(".rf-bilingual-output").length >= 3,
    { polling: 100 },
  )
  const calls = await worker.evaluate(() => __pdfCalls.map((c) => JSON.stringify(c.body)))
  check(
    "Explicit page translation omits excluded source text",
    calls.length === edited.layouts[0].paragraphs.filter((p) => !p.excluded).length &&
      calls.every((body) => !body.includes("Footer to ignore")),
  )
  const savedText = edited.layouts[0].paragraphs.map((p) => [p.id, p.text, p.excluded])
  await reader.reload()
  await reader.bringToFront()
  await (await reader.waitForSelector('input[type="file"]')).uploadFile(file)
  await reader.waitForSelector('.rf-pdf-page[data-page="1"][data-rendered=true]')
  await click("Song ngữ theo đoạn")
  await reader.waitForSelector(".rf-bilingual-card.excluded")
  check(
    "Reopening the same file restores manual layout, ignored text, styles and bookmarks",
    JSON.stringify(
      (await workspaceDB()).layouts[0].paragraphs.map((p) => [p.id, p.text, p.excluded]),
    ) === JSON.stringify(savedText) && (await workspaceDB()).bookmarks.length === 1,
  )
  await click("Chỉnh đoạn")
  await click("Khôi phục chia tự động")
  await waitWorkspace((d) => d.layouts.length === 0)
  await reader.waitForFunction(() => !document.querySelector(".rf-bilingual-card.excluded"), {
    polling: 100,
  })
  check(
    "Reset returns to automatic paragraphs without changing original PDF text",
    await reader.$eval(".textLayer", (n) => n.textContent.includes("Footer to ignore")),
  )
  await click("Song ngữ theo đoạn")
  await click("Bookmark")
  const bookmarkId = (await workspaceDB()).bookmarks[0].id
  await click("Sửa bookmark")
  await reader.click('[aria-label="Tên bookmark"]')
  await reader.keyboard.down("Control")
  await reader.keyboard.press("KeyA")
  await reader.keyboard.up("Control")
  await reader.type('[aria-label="Tên bookmark"]', "Đã ôn chương 1")
  await reader.select('[aria-label="Màu bookmark"]', "#ef5350")
  await click("Lưu bookmark")
  await waitWorkspace((d) => d.bookmarks[0]?.name === "Đã ôn chương 1")
  check(
    "Bookmark rename/color edit preserves its ID and reading location",
    (await workspaceDB()).bookmarks[0].id === bookmarkId &&
      (await workspaceDB()).bookmarks[0].offset === marked.bookmarks[0].offset,
  )
  await click("Xóa bookmark")
  await waitWorkspace((d) => !d.bookmarks.length)
  await reader.click('[aria-label="Hoàn tác"]')
  await waitWorkspace((d) => d.bookmarks.length === 1)
  check(
    "Deleted bookmark can be undone with the same ID",
    (await workspaceDB()).bookmarks[0].id === bookmarkId,
  )
  await reader.setViewport({ width: 390, height: 850 })
  await pause(150)
  const floating = await rect(".rf-study-panel")
  check(
    "Bookmark form stays reachable on a phone viewport",
    floating.x >= 0 &&
      floating.x + floating.width <= 391 &&
      floating.y >= 0 &&
      floating.y + floating.height <= 851,
  )
  await reader.screenshot({ path: path.join(scratch, "bookmarks-phone.png") })
  await reader.setViewport({ width: 1560, height: 1050 })
  const other = await PDFDocument.create()
  other.addPage([600, 800]).drawText("Other document", {
    x: 50,
    y: 600,
    size: 14,
    font: await other.embedFont(StandardFonts.Helvetica),
  })
  const otherFile = path.join(scratch, "Other.pdf")
  await fs.writeFile(otherFile, await other.save())
  await (await reader.waitForSelector('input[type="file"]')).uploadFile(otherFile)
  await reader.waitForFunction(() => document.body.textContent.includes("Other.pdf"), {
    polling: 100,
  })
  await reader.waitForSelector(".rf-pdf-page[data-rendered=true]")
  await click("Bookmark")
  check(
    "Different PDF has no leaked bookmarks or annotations",
    (await reader.$eval(".rf-bookmarks", (n) => n.textContent.includes("Chưa có bookmark."))) &&
      (await reader.$$eval(".rf-study-overlay g", (n) => n.length === 0)),
  )
  check(
    "Reopening, reset and bookmark controls add no provider requests",
    await worker.evaluate((expected) => __pdfCalls.length === expected, calls.length),
  )
  check(
    "Reader retains at most three reading canvases",
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
