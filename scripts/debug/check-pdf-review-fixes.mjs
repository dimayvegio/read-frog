import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument, StandardFonts, degrees } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(".codex/review-c3-browser-" + Date.now())
await fs.mkdir(scratch, { recursive: true })
const evidence = { observations: [], errors: [], requests: [] }
for (const rotated of [false, true]) {
  const pdf = await PDFDocument.create()
  const p = pdf.addPage([600, 800])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  p.drawText(
    rotated
      ? "A different technical document with a rotated heading."
      : "Rotation fixture. The original heading.",
    { x: 60, y: 700, size: 16, font },
  )
  if (rotated) p.setRotation(degrees(90))
  await fs.writeFile(path.join(scratch, rotated ? "rotated.pdf" : "normal.pdf"), await pdf.save())
}
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  pipe: true,
  enableExtensions: true,
  userDataDir: path.join(scratch, "profile"),
  defaultViewport: { width: 1560, height: 1050 },
  args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking"],
})
const observe = (name, data) => {
  evidence.observations.push({ name, data })
  if (name.startsWith("Shape toolbar"))
    assert.ok(
      Math.abs(parseFloat(data.inlineLeft) - data.actualLeft) < 1,
      "Toolbar must share viewport coordinates",
    )
  if (name.startsWith("Rotate changes")) {
    assert.ok(
      Math.abs(data.after.shape.x - (1 - data.before.shape.y - data.before.shape.height)) < 0.005,
    )
    assert.ok(Math.abs(data.after.shape.y - data.before.shape.x) < 0.005)
    assert.equal(data.before.ink, data.after.ink)
  }
  if (name.startsWith("Recent item"))
    assert.equal(data.fileChooser, true, "Metadata-only recent entry must offer file picker")
  if (name.startsWith("Intrinsic"))
    assert.ok(data.width > data.height, "Native Rotate 90 must stay landscape")
  if (name.startsWith("Opening another")) {
    assert.equal(data.afterSwitch, data.beforeSwitch)
    assert.equal(data.modalOpen, false)
  }
  if (name === "Local operations") {
    assert.equal(data.remoteRequests.length, 0)
    assert.equal(data.errors.length, 0)
  }
  console.log("PASS", name)
}
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3"))
  const root = `chrome-extension://${id}/`
  const sw = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === root + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(root + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await sw.evaluate(preparePdfWorker)
  const page = await browser.newPage()
  page.on("pageerror", (e) => evidence.errors.push(e.message))
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) evidence.requests.push({ url: r.url(), method: r.method() })
  })
  await page.goto(root + "pdf-reader.html")
  const load = async (name) => {
    await (await page.$('input[type="file"]')).uploadFile(path.join(scratch, name))
    await page.waitForFunction((t) => document.title.startsWith(t), {}, name)
    await page.waitForSelector('.rf-pdf-page[data-page="1"][data-rendered="true"]')
    await new Promise((r) => setTimeout(r, 350))
  }
  await load("normal.pdf")
  await page.click('[aria-label="Hình chữ nhật"]')
  const box = await page.$eval(".rf-pdf-page", (n) => {
    const r = n.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  await page.mouse.move(box.x + box.w * 0.1, box.y + box.h * 0.1)
  await page.mouse.down()
  await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.16, { steps: 10 })
  await page.mouse.up()
  await page.waitForSelector(".rf-study-overlay polyline")
  await new Promise((r) => setTimeout(r, 200))
  await page.click('[aria-label="Chọn chữ"]')
  const stroke = await page.$eval(".rf-study-overlay polyline", (n) => {
    const r = n.getBoundingClientRect()
    return { x: r.left + r.width * 0.5, y: r.top }
  })
  await page.mouse.click(stroke.x, stroke.y)
  await page.waitForSelector(".rf-shape-properties")
  observe(
    "Shape toolbar is viewport-positioned inside transformed page",
    await page.$eval(".rf-shape-properties", (n) => {
      const r = n.getBoundingClientRect(),
        p = document.querySelector(".rf-pdf-page"),
        b = p.getBoundingClientRect(),
        s = document.querySelector(".rf-shape-selection").getBoundingClientRect()
      return {
        transform: getComputedStyle(p).transform,
        inlineLeft: n.style.left,
        actualLeft: r.left,
        pageLeft: b.left,
        toolbar: { left: r.left, top: r.top, bottom: r.bottom, right: r.right },
        shape: { left: s.left, top: s.top, bottom: s.bottom, right: s.right },
        overlap: r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top,
      }
    }),
  )
  await page.screenshot({ path: path.join(scratch, "shape-toolbar-offset.png") })
  await page.$eval('[aria-label="Bỏ chọn hình"]', (node) => node.click())
  const geometry = () =>
    page.evaluate(() => {
      const p = document.querySelector(".rf-pdf-page"),
        b = p.getBoundingClientRect(),
        t = p.querySelector(".textLayer span").getBoundingClientRect()
      return {
        text: { x: (t.left - b.left) / b.width, y: (t.top - b.top) / b.height },
        ink: p.querySelector(".rf-study-overlay polyline")?.getAttribute("points"),
        shape: (() => {
          const r = p.querySelector(".rf-study-overlay polyline").getBoundingClientRect()
          return {
            x: (r.left - b.left) / b.width,
            y: (r.top - b.top) / b.height,
            width: r.width / b.width,
            height: r.height / b.height,
          }
        })(),
      }
    })
  const before = await geometry()
  await page.click('[aria-label="Xoay trang"]')
  await new Promise((r) => setTimeout(r, 600))
  const after = await geometry()
  observe("Rotate changes text coordinates but leaves ink coordinates unchanged", { before, after })
  await page.click('[aria-label="Chọn / sửa hình"]')
  const strokeBox = await page.$eval(".rf-study-overlay polyline", (node) => {
    const r = node.getBoundingClientRect()
    return { x: r.left, y: r.top + r.height / 2 }
  })
  await page.mouse.click(strokeBox.x, strokeBox.y)
  await page.waitForSelector(".rf-shape-properties")
  await page.focus('[data-shape-handle="move"]')
  const beforeKey = await page.$eval(
    ".rf-study-overlay polyline",
    (node) => node.getBoundingClientRect().left,
  )
  await page.keyboard.press("ArrowRight")
  await page.waitForFunction(
    (x) =>
      Math.abs(
        document.querySelector(".rf-study-overlay polyline").getBoundingClientRect().left - x - 1,
      ) < 0.2,
    {},
    beforeKey,
  )
  await page.waitForFunction(() => !document.querySelector(".rf-shape-color")?.disabled)
  console.log("PASS Rotated keyboard move follows the physical right axis")
  await page.$eval('[aria-label="Bỏ chọn hình"]', (node) => node.click())
  await page.click('[aria-label="Hình chữ nhật"]')
  const rotatedPage = await page.$eval(".rf-pdf-page", (node) => {
    const r = node.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })
  await page.mouse.move(
    rotatedPage.x + rotatedPage.width * 0.2,
    rotatedPage.y + rotatedPage.height * 0.3,
  )
  await page.mouse.down()
  await page.mouse.move(
    rotatedPage.x + rotatedPage.width * 0.2 + 100,
    rotatedPage.y + rotatedPage.height * 0.3 + 40,
    { steps: 8 },
  )
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelectorAll(".rf-study-overlay g").length === 2)
  const drawn = await page.$eval(".rf-study-overlay g:last-child polyline", (node) => {
    const r = node.getBoundingClientRect()
    return { width: r.width, height: r.height }
  })
  assert.ok(Math.abs(drawn.width - 100) < 1 && Math.abs(drawn.height - 40) < 1)
  console.log("PASS Drawing while rotated roundtrips through canonical storage")
  await page.reload()
  await page.waitForSelector('[aria-label="PDF mở gần đây"]')
  await page.click('[aria-label="PDF mở gần đây"]')
  await page.waitForSelector(".rf-recent-menu li button")
  const pickerWait = page.waitForFileChooser({ timeout: 5000 })
  await page.click(".rf-recent-menu li button")
  const chooser = await pickerWait
  await chooser.cancel()
  const fileChooser = true
  await new Promise((resolve) => setTimeout(resolve, 100))
  observe("Recent item with no handle offers a file picker after reload", {
    fileChooser,
    loaded: !!(await page.$(".rf-pdf-page")),
    menuOpen: !!(await page.$(".rf-recent-menu")),
  })
  await load("rotated.pdf")
  observe(
    "Intrinsic Rotate 90 PDF canvas retains its native landscape rotation",
    await page.$eval(".rf-pdf-page canvas", (n) => ({
      width: n.width,
      height: n.height,
      expectedLandscape: true,
    })),
  )
  await page.screenshot({ path: path.join(scratch, "intrinsic-rotation.png") })
  await page.click(".rf-summarize-page")
  await page.waitForFunction(
    () => document.querySelector(".rf-page-summary-content")?.textContent.length > 10,
  )
  const beforeSwitch = await sw.evaluate(() => __pdfCalls.length)
  await load("normal.pdf")
  await new Promise((r) => setTimeout(r, 400))
  const afterSwitch = await sw.evaluate(() => __pdfCalls.length)
  observe("Opening another PDF carries summary modal and does not trigger another provider call", {
    beforeSwitch,
    afterSwitch,
    modalOpen: !!(await page.$(".rf-page-summary-modal")),
  })
  observe("Local operations", { remoteRequests: evidence.requests, errors: evidence.errors })
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log("EVIDENCE", scratch)
  await browser.close()
}
