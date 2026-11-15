import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import JSZip from "jszip"
import { PDFDocument, StandardFonts, degrees } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const dir = path.resolve(".codex/pdf-image-" + Date.now())
await fs.mkdir(dir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(dir, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1500, height: 1050 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const report = {
  checks: [],
  errors: [],
  liveOpenAI: false,
  browser: await browser.version(),
  scope:
    "Real local PDF.js page rasterization, private image edit port and actual PDF/ZIP exports; synthetic OpenAI PNG output, no live quality claim.",
}
const check = (name, value) => {
  assert.ok(value, name)
  report.checks.push(name)
  console.log("PASS " + name)
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  const sizes = [
    [612, 792],
    [792, 612],
    [612, 792],
    [480, 480],
  ]
  for (const [i, size] of sizes.entries()) {
    const page = pdf.addPage(size)
    page.drawText(`Page ${i + 1}: Quick start guide`, { x: 45, y: size[1] - 70, font, size: 24 })
    page.drawText(`Unique register clk_${i + 1}. Check reset before use.`, {
      x: 45,
      y: size[1] - 120,
      font,
      size: 16,
    })
    if (i === 2) page.setRotation(degrees(90))
  }
  const file = path.join(dir, "source-private-name.pdf")
  await fs.writeFile(file, await pdf.save())
  const id = await browser.installExtension(path.resolve(".output/edge-mv3"))
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === `chrome-extension://${id}/background.js`,
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(`chrome-extension://${id}/options.html#/api-providers`)
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  const fixture = await browser.newPage()
  await fixture.setViewport({ width: 800, height: 1000 })
  const outputs = []
  for (let n = 1; n <= 4; n++) {
    await fixture.setContent(
      `<body style="margin:0;padding:60px;background:#fff;color:#234332;font:28px Arial"><h1>Hướng dẫn sử dụng — ${n}</h1><p>Kiểm tra thanh ghi clk_${n} trước khi bật.</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="20"><tr><th>Tín hiệu</th><th>Mô tả</th></tr><tr><td>rst_n</td><td>Reset mức thấp</td></tr></table><div style="margin-top:40px;background:#d6e9e0;height:${n * 40}px"></div></body>`,
    )
    outputs.push(
      Buffer.from(
        await fixture.screenshot({ path: path.join(dir, `mock-output-${n}.png`) }),
      ).toString("base64"),
    )
  }
  await fixture.close()
  await worker.evaluate((images) => {
    globalThis.__pageImages = images
    globalThis.__imageCalls = []
    globalThis.__imageActive = 0
    globalThis.__imageMaximum = 0
    globalThis.__imageDelayAt = 0
    const previous = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url !== "https://api.openai.com/v1/images/edits") return previous(input, init)
      const body = await request.clone().json(),
        image = body.images[0].image_url
      const digest = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(image))),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
      const header = atob(image.split(",")[1].slice(0, 64)),
        read = (at) =>
          header.charCodeAt(at) * 0x1000000 +
          header.charCodeAt(at + 1) * 0x10000 +
          header.charCodeAt(at + 2) * 0x100 +
          header.charCodeAt(at + 3)
      __imageCalls.push({
        digest,
        width: read(16),
        height: read(20),
        png: image.startsWith("data:image/png;base64,"),
        onlyImage: body.images.length === 1,
        privateAuth: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        pathFree:
          !JSON.stringify(body).includes("source-private-name") &&
          !JSON.stringify(body).includes("C:\\"),
        targetVi: body.prompt.includes("Vietnamese"),
        customA: body.prompt.includes("QA_KEEP_STA"),
        customB: body.prompt.includes("QA_BIG_LABELS"),
        size: body.size,
        quality: body.quality,
      })
      const index = __imageCalls.length
      __imageActive++
      __imageMaximum = Math.max(__imageMaximum, __imageActive)
      try {
        await new Promise((resolve) => setTimeout(resolve, index === __imageDelayAt ? 1200 : 50))
        if (request.signal.aborted) throw new DOMException("aborted", "AbortError")
        return new Response(
          `event: image_edit.completed\ndata: ${JSON.stringify({ type: "image_edit.completed", b64_json: __pageImages[(index - 1) % 4] })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        )
      } finally {
        __imageActive--
      }
    }
  }, outputs)
  const page = await browser.newPage(),
    ocr = []
  page.on("pageerror", (error) => report.errors.push(error.message))
  page.on("request", (request) => {
    if (/ocr-assets|tesseract/iu.test(request.url())) ocr.push(request.url())
  })
  await page.goto(`chrome-extension://${id}/pdf-reader.html`)
  await page.waitForSelector('input[aria-label="Chọn PDF"]')
  await (await page.$('input[aria-label="Chọn PDF"]')).uploadFile(file)
  await page.waitForSelector('button[aria-label="Tạo PDF ảnh dịch"]')
  const calls = () => worker.evaluate(() => __imageCalls.length)
  const click = (name) =>
    page.evaluate((label) => {
      const scope = document.querySelector("dialog[open]") ?? document
      const b = [...scope.querySelectorAll("button")].find((el) => el.textContent.trim() === label)
      if (!b || b.disabled) throw new Error("Unavailable: " + label)
      b.click()
    }, name)
  const field = (name, value) =>
    page.$eval(
      `[aria-label="${name}"]`,
      (el, next) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, next)
        el.dispatchEvent(new Event("input", { bubbles: true }))
      },
      value,
    )
  const allDone = () =>
    page.waitForFunction(
      () =>
        document.querySelectorAll('.rf-pdf-image-pages button[data-status="done"]').length === 4,
    )
  const setPrompt = (value) =>
    page.$eval(
      '[aria-label="Yêu cầu bổ sung PDF ảnh dịch"]',
      (el, next) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, next)
        el.dispatchEvent(new Event("input", { bubbles: true }))
      },
      value,
    )
  await page.click('button[aria-label="Tạo PDF ảnh dịch"]')
  await page.waitForSelector("dialog[open]")
  check(
    "Opening PDF image dialog performs no paid request or local OCR",
    (await calls()) === 0 && ocr.length === 0,
  )
  check(
    "Native target language selector works inside modal and keeps English/Vietnamese first",
    await page.$eval(
      '[aria-label="Ngôn ngữ PDF ảnh dịch"]',
      (el) => el.options[0].value === "en" && el.options[1].value === "vi" && el.value === "vi",
    ),
  )
  check(
    "PDF defaults request a sharper 2K output at 200 DPI",
    (await page.$eval('[aria-label="DPI PDF ảnh dịch"]', (el) => el.value === "200")) &&
      (await page.$eval('[aria-label="Kích thước PDF ảnh dịch"]', (el) => el.value === "2k")),
  )
  await setPrompt("QA_KEEP_STA\nKeep technical terms unchanged.")
  check(
    "Typing bounded optional requirements does not call OpenAI",
    (await calls()) === 0 &&
      (await page.$eval(
        '[aria-label="Yêu cầu bổ sung PDF ảnh dịch"]',
        (el) => el.maxLength === 4000,
      )),
  )
  await field("PDF ảnh dịch từ trang", "1")
  await field("PDF ảnh dịch đến trang", "5")
  await click("Tạo ảnh dịch các trang")
  await page.waitForFunction(() =>
    document.querySelector(".rf-pdf-image-progress").textContent.includes("Nhập trang hợp lệ"),
  )
  check("Invalid ranges are rejected before provider work", (await calls()) === 0)
  await field("PDF ảnh dịch đến trang", "4")
  await page.waitForFunction(() =>
    document.querySelector(".rf-pdf-image-cost")?.textContent.includes("Tạo mới 4 trang"),
  )
  const initialQuote = await page.$eval(".rf-pdf-image-cost > div:last-of-type b", (el) =>
    Number(el.textContent.replace(/[^0-9.]/gu, "")),
  )
  check(
    "Cost estimate covers the selected range and discloses excluded input fees without API calls",
    initialQuote > 0 &&
      (await calls()) === 0 &&
      (await page.$eval(".rf-pdf-image-cost", (el) =>
        el.textContent.includes("Chưa cộng ảnh đầu vào và prompt"),
      )),
  )
  await click("Tạo ảnh dịch các trang")
  await allDone()
  const payloads = await worker.evaluate(() => __imageCalls)
  check(
    "Range 1-4 sends exactly four distinct PNG full pages, never PDF bytes/paths/filenames",
    (await calls()) === 4 &&
      new Set(payloads.map((p) => p.digest)).size === 4 &&
      payloads.every((p) => p.png && p.onlyImage && p.pathFree && p.privateAuth),
  )
  check(
    "Full-page raster sizes honor rotation and configured DPI",
    JSON.stringify(payloads.map((p) => [p.width, p.height])) ===
      JSON.stringify([
        [1700, 2200],
        [2200, 1700],
        [2200, 1700],
        [1333, 1333],
      ]),
  )
  check(
    "Each page receives the same custom requirements and an explicit output size",
    payloads.every((p) => p.customA && !p.customB && p.size !== "auto"),
  )
  check(
    "Image edits are sequential with only one in-flight job",
    await worker.evaluate(() => __imageMaximum === 1),
  )
  for (let n = 1; n <= 4; n++) {
    await page.click(`.rf-pdf-image-pages button[data-page="${n}"]`)
    await page.waitForFunction(
      (number) =>
        document.querySelector(".rf-pdf-image-preview img")?.alt ===
        `Ảnh dịch trang ${number} từ OpenAI`,
      {},
      n,
    )
    check(
      `Page ${n} preview displays unchanged OpenAI PNG`,
      await page.$eval(
        ".rf-pdf-image-preview img",
        (el, png) => el.src === "data:image/png;base64," + png,
        outputs[n - 1],
      ),
    )
  }
  await page.select('[aria-label="Thu phóng PDF ảnh dịch"]', "100")
  await page.select('[aria-label="Thu phóng PDF ảnh dịch"]', "fit")
  check("Switching pages and zooming never calls the provider", (await calls()) === 4)
  const cdp = await page.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir })
  const downloaded = async (name) => {
    const target = path.join(dir, name)
    for (let i = 0; i < 200; i++) {
      if (await fs.stat(target).catch(() => null)) return fs.readFile(target)
      await pause(25)
    }
    throw new Error("Missing download " + name)
  }
  await page.click(".rf-pdf-image-preview-toolbar a")
  check(
    "Individual page PNG download preserves exact output bytes",
    (await downloaded("FlowRead-trang-4.png")).equals(Buffer.from(outputs[3], "base64")),
  )
  await click("Tải PDF (4 trang xong)")
  const outputPdf = await PDFDocument.load(await downloaded("FlowRead-anh-dich-1-2-3-4.pdf"))
  check(
    "Local PDF assembly contains four image pages in original physical sizes",
    outputPdf.getPageCount() === 4 &&
      JSON.stringify(outputPdf.getPages().map((p) => [p.getWidth(), p.getHeight()])) ===
        JSON.stringify([
          [612, 792],
          [792, 612],
          [792, 612],
          [480, 480],
        ]),
  )
  await page.waitForFunction(() => !document.querySelector(".rf-pdf-image-export button").disabled)
  await click("Tải ZIP ảnh")
  const archive = await JSZip.loadAsync(await downloaded("FlowRead-anh-dich-1-2-3-4.zip"))
  check(
    "ZIP includes four byte-identical raw PNG outputs",
    Object.keys(archive.files).length === 4 &&
      (
        await Promise.all(
          outputs.map(
            async (png, i) =>
              (await archive
                .file(`trang-${String(i + 1).padStart(4, "0")}.png`)
                .async("base64")) === png,
          ),
        )
      ).every(Boolean),
  )
  check("PDF/ZIP/PNG exports are local with no extra API calls", (await calls()) === 4)
  await page.waitForFunction(() => !document.querySelector(".rf-pdf-image-primary").disabled)
  await click("Tạo / tiếp tục trang còn thiếu")
  await allDone()
  await page.waitForFunction(() => !document.querySelector(".rf-pdf-image-primary").disabled)
  check(
    "Repeated four-page create reuses all completed pages beyond the shared two-image cache",
    (await calls()) === 4,
  )
  await page.click('[aria-label="Đóng PDF ảnh dịch"]')
  await page.click('button[aria-label="Tạo PDF ảnh dịch"]')
  await allDone()
  check(
    "Closing/reopening dialog retains completed images without provider work",
    (await calls()) === 4,
  )
  check(
    "Requirements stay in the current PDF session when reopening",
    await page.$eval('[aria-label="Yêu cầu bổ sung PDF ảnh dịch"]', (el) =>
      el.value.includes("QA_KEEP_STA"),
    ),
  )
  await setPrompt("  QA_KEEP_STA\nKeep technical terms unchanged.  ")
  await allDone()
  await click("Tạo / tiếp tục trang còn thiếu")
  await page.waitForFunction(() => !document.querySelector(".rf-pdf-image-primary").disabled)
  check("Outer whitespace edits preserve the matching four-page cache", (await calls()) === 4)
  await setPrompt("QA_BIG_LABELS\nUse larger labels without changing numbers.")
  check(
    "Changing requirements clears stale results without a request",
    (await calls()) === 4 &&
      (await page.$eval(".rf-pdf-image-pages", (el) => el.children.length === 0)),
  )
  await click("Tạo ảnh dịch các trang")
  await allDone()
  await page.waitForFunction(() => !document.querySelector(".rf-pdf-image-primary").disabled)
  check(
    "Only explicit Create generates four new pages for changed instructions",
    (await calls()) === 8 &&
      (await worker.evaluate(() => __imageCalls.slice(4).every((p) => p.customB && !p.customA))),
  )
  await page.screenshot({ path: path.join(dir, "pdf-image-desktop.png") })
  await page.setViewport({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(dir, "pdf-image-phone.png") })
  check(
    "Phone dialog fits viewport horizontally",
    await page.$eval("dialog", (el) => el.scrollWidth <= el.clientWidth + 1),
  )
  await page.setViewport({ width: 1500, height: 1050 })
  await click("Chi tiết cao")
  check(
    "High-detail preset selects source 300 DPI, 4K and maximum quality without calling AI",
    (await calls()) === 8 &&
      (await page.$eval('[aria-label="DPI PDF ảnh dịch"]', (el) => el.value === "300")) &&
      (await page.$eval('[aria-label="Kích thước PDF ảnh dịch"]', (el) => el.value === "4k")) &&
      (await page.$eval('[aria-label="Chất lượng PDF ảnh dịch"]', (el) => el.value === "max")),
  )
  await page.waitForFunction(
    (before) => {
      const b = document.querySelector(".rf-pdf-image-cost > div:last-of-type b")
      return b && Number(b.textContent.replace(/[^0-9.]/gu, "")) > before
    },
    {},
    initialQuote,
  )
  check("High-detail estimate increases locally before any new request", (await calls()) === 8)
  await worker.evaluate(() => {
    __imageDelayAt = 10
  })
  await click("Tạo ảnh dịch các trang")
  for (let i = 0; i < 100 && (await calls()) < 10; i++) await pause(25)
  assert.equal(await calls(), 10)
  check(
    "Requirements are locked during the active paid batch",
    await page.$eval('[aria-label="Yêu cầu bổ sung PDF ảnh dịch"]', (el) => el.disabled),
  )
  await click("Dừng")
  await pause(1400)
  check(
    "Stop keeps page 1, drops late page 2 and never starts page 3",
    (await calls()) === 10 &&
      (await page.$eval(
        ".rf-pdf-image-pages",
        (el) => el.querySelectorAll('[data-status="done"]').length === 1,
      )),
  )
  await click("Tạo / tiếp tục trang còn thiếu")
  await allDone()
  check(
    "Explicit resume skips completed page and sends only three missing pages",
    (await calls()) === 13,
  )
  check(
    "High-detail sends maximum quality and bounded 4K dimensions without enlarging the returned bitmap",
    (await worker.evaluate(() =>
      __imageCalls.slice(8).every((p) => {
        const [w, h] = p.size.split("x").map(Number)
        return p.quality === "max" && w * h > 4194304 && w * h <= 8294400 && Math.max(w, h) <= 3840
      }),
    )) &&
      (await page.$eval(
        ".rf-pdf-image-preview img",
        (el) => el.naturalWidth === 800 && el.naturalHeight === 1000,
      )),
  )
  await page.select('[aria-label="Ngôn ngữ PDF ảnh dịch"]', "en")
  await page.waitForFunction(
    () => document.querySelectorAll(".rf-pdf-image-pages button").length === 0,
  )
  check(
    "Changing target invalidates displayed results without a paid request",
    (await calls()) === 13,
  )
  await page.select('[aria-label="Chất lượng PDF ảnh dịch"]', "low")
  await worker.evaluate(() => {
    __imageDelayAt = 14
  })
  await click("Tạo ảnh dịch các trang")
  for (let i = 0; i < 100 && (await calls()) < 14; i++) await pause(25)
  assert.equal(await calls(), 14)
  await (await page.$('input[aria-label="Chọn PDF"]')).uploadFile(file)
  await page.waitForFunction(() => !document.querySelector("dialog[open]"))
  await pause(1400)
  check(
    "Reopening source PDF cancels old owner and cannot render or continue late images",
    (await calls()) === 14 && !(await page.$(".rf-pdf-image-pages")),
  )
  await page.click('button[aria-label="Tạo PDF ảnh dịch"]')
  check(
    "New PDF owner does not inherit the previous private requirements",
    (await page.$eval('[aria-label="Yêu cầu bổ sung PDF ảnh dịch"]', (el) => el.value === "")) &&
      (await calls()) === 14,
  )
  await page.select('[aria-label="Kích thước PDF ảnh dịch"]', "auto")
  check(
    "Automatic output size is labeled as unknown cost rather than zero",
    (await page.$eval(".rf-pdf-image-cost", (el) => el.textContent.includes("chưa xác định"))) &&
      (await calls()) === 14,
  )
  check(
    "Direct PDF image translation never invokes OCR assets and has no uncaught errors",
    ocr.length === 0 && report.errors.length === 0,
  )
  report.payloads = payloads
} finally {
  await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
  console.log("Evidence: " + dir)
}
