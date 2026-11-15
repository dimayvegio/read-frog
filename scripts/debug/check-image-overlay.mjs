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
const dir = path.resolve(".codex/image-overlay-" + Date.now())
await fs.mkdir(dir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(dir, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1500, height: 1060 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const report = {
  checks: [],
  errors: [],
  liveOpenAI: false,
  localOcrReal: true,
  rawScreenshots: [],
  browser: await browser.version(),
}
const check = (name, value) => {
  assert.ok(value, name)
  report.checks.push(name)
  console.log("PASS " + name)
}
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3"))
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === `chrome-extension://${id}/background.js`,
    )
  ).worker()
  const settings = await browser.newPage()
  await settings.goto(`chrome-extension://${id}/options.html#/api-providers`)
  await settings.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.uiLanguage = "vi"
    await chrome.storage.local.set({ config })
    const previous = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const body = await request.clone().json()
      const visit = (v) =>
        typeof v === "string"
          ? [v]
          : Array.isArray(v)
            ? v.flatMap(visit)
            : v && typeof v === "object"
              ? Object.values(v).flatMap(visit)
              : []
      const translations = {
        Overview: "Tổng quan",
        Signal: "Tín hiệu",
        Direction: "Hướng",
        Description: "Mô tả",
        Input: "Đầu vào",
        Output: "Đầu ra",
        "System clock": "Xung nhịp hệ thống",
        "Active-low reset": "Reset mức thấp",
        "Operation complete": "Thao tác hoàn tất",
      }
      for (const text of visit(body.input)) {
        const start = text.indexOf('{"format":"image-overlay-v1"')
        if (start < 0) continue
        for (let end = text.length; end > start; end--) {
          try {
            const data = JSON.parse(text.slice(start, end))
            if (data.regions) {
              globalThis.__imageOutput = JSON.stringify({
                regions: globalThis.__overlayInvalid
                  ? data.regions.slice(1).map((r) => ({
                      id: r.id,
                      original: r.text,
                      translation: translations[r.text] ?? r.text,
                    }))
                  : data.regions.map((r) => ({
                      id: r.id,
                      original: r.text,
                      translation: translations[r.text] ?? r.text,
                    })),
              })
              return previous(request)
            }
          } catch {}
        }
      }
      return previous(request)
    }
  })
  const fixture = await browser.newPage()
  await fixture.setViewport({ width: 960, height: 650 })
  await fixture.setContent(
    `<html><body style="margin:0;background:white;font:24px Arial;color:#183347"><div style="height:52px;background:#1c6550"></div><div style="margin:32px 40px"><h1 style="color:#136b4e;font-size:32px;margin:0 0 32px">Overview</h1><table style="border-collapse:collapse;width:100%;font-size:24px" border="1" cellpadding="16"><tr style="background:#e9f4ec"><th>Signal</th><th>Direction</th><th>Description</th></tr><tr><td>clk</td><td>Input</td><td>System clock</td></tr><tr><td>rst_n</td><td>Input</td><td>Active-low reset</td></tr><tr><td>done</td><td>Output</td><td>Operation complete</td></tr></table><div style="margin-top:32px;width:100%;height:60px;background:linear-gradient(90deg,#efb34b,#82b5dc);border-radius:16px"></div></div></body></html>`,
  )
  const file = path.join(dir, "source.png")
  await fixture.screenshot({ path: file })
  await fixture.close()
  const page = await browser.newPage()
  page.on("pageerror", (e) => report.errors.push(e.message))
  page.setDefaultTimeout(20000)
  await page.goto(`chrome-extension://${id}/image-translate.html`)
  await page.waitForSelector('[aria-label="Chế độ dịch ảnh"]')
  await page.select('[aria-label="Chế độ dịch ảnh"]', "overlay")
  await (await page.$('input[type="file"]')).uploadFile(file)
  await page.waitForFunction(() =>
    document.querySelector(".rf-image-status")?.textContent.includes("Chưa gửi ảnh"),
  )
  const click = (label) =>
    page.evaluate((name) => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === name,
      )
      if (!button || button.disabled) throw new Error("Unavailable " + label)
      button.click()
    }, label)
  await click("Toàn ảnh")
  check(
    "Open/select/crop has zero paid calls",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  await click("Đo vùng chữ")
  await page.waitForFunction(
    () =>
      document.querySelector(".rf-overlay-editor canvas") || document.querySelector("[role=alert]"),
    { timeout: 120000 },
  )
  const alert = await page.$("[role=alert]")
  if (alert) throw new Error(await alert.evaluate((el) => el.textContent))
  await page.waitForFunction(
    () => document.querySelector(".rf-overlay-editor canvas")?.width === 960,
  )
  check(
    "Measuring real OCR regions has zero paid calls",
    await worker.evaluate(() => __pdfCalls.length === 0),
  )
  await click("Dịch vùng đang bật")
  await page.waitForFunction(() =>
    document.querySelector('.rf-overlay-controls [role="status"]')?.textContent.includes("Đã vẽ"),
  )
  check(
    "One OpenAI vision call follows real bundled local OCR",
    await worker.evaluate(() => __pdfCalls.length === 1),
  )
  const state = await page.evaluate(async () => {
    const image = await createImageBitmap(
      await (await fetch(document.querySelector(".rf-image-preview img").src)).blob(),
    )
    const c = document.createElement("canvas")
    c.width = image.width
    c.height = image.height
    c.getContext("2d").drawImage(image, 0, 0)
    image.close()
    const a = c.getContext("2d").getImageData(0, 0, c.width, c.height).data
    const result = document.querySelector(".rf-overlay-editor canvas")
    const b = result.getContext("2d").getImageData(0, 0, result.width, result.height).data
    let outsideChanged = 0,
      changed = 0
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        const diff =
          a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]
        if (diff) changed++
        if (diff && (y < 60 || y > 490 || x < 25 || x > 935)) outsideChanged++
      }
    return {
      width: result.width,
      height: result.height,
      changed,
      outsideChanged,
      regions: document.querySelectorAll(".rf-overlay-box").length,
      content: document.querySelector(".rf-overlay-controls").textContent,
    }
  })
  report.state = state
  check(
    "Original dimensions and non-text artwork pixels are retained exactly",
    state.width === 960 &&
      state.height === 650 &&
      state.changed > 100 &&
      state.outsideChanged === 0,
  )
  check("Multiple measured regions appear for editing", state.regions >= 8)
  await page.screenshot({ path: path.join(dir, "overlay-editor.png") })
  report.rawScreenshots.push(path.join(dir, "overlay-editor.png"))
  const output = await page.$eval(".rf-overlay-editor canvas", (c) => c.toDataURL("image/png"))
  await fs.writeFile(path.join(dir, "translated.png"), Buffer.from(output.split(",")[1], "base64"))
  await click("Dịch vùng đang bật")
  await page.waitForFunction(() =>
    document.querySelector('.rf-overlay-controls [role="status"]')?.textContent.includes("Đã vẽ"),
  )
  check(
    "Re-translate unchanged corrected source uses cache",
    await worker.evaluate(() => __pdfCalls.length === 1),
  )
  await page.select(
    '[aria-label="Chọn vùng chữ"]',
    await page.$$eval(
      '[aria-label="Chọn vùng chữ"] option',
      (els) => els.find((el) => el.textContent.includes("Overview")).value,
    ),
  )
  const before = await page.$eval(".rf-overlay-editor canvas", (c) => c.toDataURL())

  await page.select('[aria-label="Font chữ"]', "serif")
  await page.waitForFunction(
    (old) => document.querySelector(".rf-overlay-editor canvas").toDataURL() !== old,
    {},
    before,
  )
  check(
    "Local font edits paint without a provider call",
    await worker.evaluate(() => __pdfCalls.length === 1),
  )
  await page.select('[aria-label="Font chữ"]', "sans-serif")
  const box = await (await page.$("button.rf-overlay-box.selected")).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8, { steps: 5 })
  await page.mouse.up()
  check(
    "Dragging is local and preserves visible rectangle geometry",
    (await worker.evaluate(() => __pdfCalls.length === 1)) &&
      (await page.$eval(
        "button.rf-overlay-box.selected",
        (el) => el.getBoundingClientRect().width > 4,
      )),
  )
  const session = await browser.target().createCDPSession()
  await session.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir })
  const expectedPNG = await page.$eval(".rf-overlay-editor canvas", (c) => c.toDataURL("image/png"))
  await click("Tải ảnh PNG")
  const download = path.join(dir, "FlowRead-anh-dich.png")
  for (let i = 0; i < 100; i++) {
    if (
      await fs
        .stat(download)
        .then(() => true)
        .catch(() => false)
    )
      break
    await new Promise((r) => setTimeout(r, 30))
  }
  const downloaded = await fs.readFile(download)
  check(
    "Explicit PNG download matches the preview canvas exactly with no provider call",
    downloaded.equals(Buffer.from(expectedPNG.split(",")[1], "base64")) &&
      (await worker.evaluate(() => __pdfCalls.length === 1)),
  )
  await click("Thêm vùng chữ")
  const imageBox = await (await page.$(".rf-overlay-editor canvas")).boundingBox()
  const n = await page.$$eval('[aria-label="Chọn vùng chữ"] option', (els) => els.length)
  await page.mouse.move(imageBox.x + 45, imageBox.y + 45)
  await page.mouse.down()
  await page.mouse.move(imageBox.x + 190, imageBox.y + 88, { steps: 4 })
  await page.mouse.up()
  check(
    "Manual region selection is local and does not call OpenAI",
    (await worker.evaluate(() => __pdfCalls.length === 1)) &&
      (await page.$$eval('[aria-label="Chọn vùng chữ"] option', (els) => els.length)) === n + 1,
  )
  await page.$eval('.rf-overlay-controls input[type="checkbox"]', (el) => el.click())
  await page.$eval('fieldset input[type="checkbox"]', (el) => el.click())
  await click("Dịch vùng đang bật")
  await page.waitForFunction(() =>
    document.querySelector('.rf-overlay-controls [role="status"]')?.textContent.includes("Đã vẽ"),
  )
  check(
    "Disabled manual region does not invalidate matching cached translated cells",
    await worker.evaluate(() => __pdfCalls.length === 1),
  )
  await page.setViewport({ width: 390, height: 844 })
  check(
    "Phone controls fit viewport",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  )
  await page.screenshot({ path: path.join(dir, "phone.png") })
  report.rawScreenshots.push(path.join(dir, "phone.png"))
  await page.setViewport({ width: 1500, height: 1060 })
  await worker.evaluate(() => {
    __overlayInvalid = true
  })
  await click("Tạo lại bản dịch")
  await page.waitForSelector('.rf-overlay-controls [role="alert"]')
  await new Promise((r) => setTimeout(r, 400))
  check(
    "Invalid region reply fails without an automatic paid retry",
    await worker.evaluate(() => __pdfCalls.length === 2),
  )
  await worker.evaluate(() => {
    __overlayInvalid = false
    __pdfDelay = 800
  })
  await click("Tạo lại bản dịch")
  await worker.evaluate(async () => {
    for (let i = 0; i < 100 && __pdfCalls.length < 3; i++)
      await new Promise((r) => setTimeout(r, 10))
  })
  await click("Chọn lại vùng")
  await new Promise((r) => setTimeout(r, 1000))
  check(
    "Changing the crop cancels the owner and rejects late output",
    (await worker.evaluate(() => __pdfCalls.length === 3)) && !(await page.$(".rf-overlay-editor")),
  )
  check("No uncaught runtime errors", report.errors.length === 0)
  report.success = true
} catch (error) {
  report.error = error.stack
  for (const page of await browser.pages())
    if (page.url().includes("image-translate.html")) {
      report.ui = await page.evaluate(() => ({
        status: document.querySelector(".rf-image-status")?.textContent,
        alert: document.querySelector("[role=alert]")?.textContent,
      }))
      await page.screenshot({ path: path.join(dir, "failure.png") })
    }
  throw error
} finally {
  await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(dir)
}
