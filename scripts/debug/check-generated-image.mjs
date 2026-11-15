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
const dir = path.resolve(".codex/generated-image-" + Date.now())
await fs.mkdir(dir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(dir, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1440, height: 1050 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const report = {
  checks: [],
  errors: [],
  liveOpenAI: false,
  scope:
    "Packaged image edit UI/private port with synthetic OpenAI PNG; raw bytes, no local OCR or output repaint. No live model quality claim.",
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
  const fixture = await browser.newPage()
  await fixture.setViewport({ width: 900, height: 640 })
  const make = async (translated) => {
    await fixture.setContent(
      `<html><body style="margin:0;padding:40px;background:#eef3f8;color:#162b44;font:24px Arial"><h1>${translated ? "Hướng dẫn khởi động" : "Quick start guide"}</h1><p>${translated ? "Kiểm tra các thanh ghi trước khi bật thiết bị." : "Check registers before enabling the device."}</p><table style="border-collapse:collapse;width:100%;background:white" border="1" cellpadding="18"><tr><th>${translated ? "Tín hiệu" : "Signal"}</th><th>${translated ? "Mô tả" : "Description"}</th></tr><tr><td>clk</td><td>${translated ? "Xung nhịp hệ thống" : "System clock"}</td></tr><tr><td>rst_n</td><td>${translated ? "Reset tích cực mức thấp" : "Active-low reset"}</td></tr></table><div style="height:90px;background:linear-gradient(90deg,#ecc26e,#7ba9d5);margin-top:25px;border-radius:20px"></div></body></html>`,
    )
    return Buffer.from(
      await fixture.screenshot({
        path: path.join(dir, translated ? "mock-openai-output.png" : "source.png"),
      }),
    ).toString("base64")
  }
  await make(false)
  const output = await make(true)
  await fixture.close()
  await worker.evaluate((png) => {
    globalThis.__editPng = png
    globalThis.__editCalls = []
    globalThis.__editStatus = 200
    globalThis.__editDelay = 0
    globalThis.__editInvalid = false
    const previous = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url !== "https://api.openai.com/v1/images/edits") return previous(input, init)
      const body = await request.clone().json()
      __editCalls.push({
        model: body.model,
        quality: body.quality,
        n: body.n,
        output: body.output_format,
        targetVi: body.prompt.includes("Vietnamese"),
        inlineOnly:
          body.images.length === 1 && body.images[0].image_url.startsWith("data:image/png;base64,"),
        privateAuth: request.headers.get("authorization") === "Bearer pdf-reading-test-sentinel",
        noPaths: !JSON.stringify(body).includes("C:\\"),
        streaming: body.stream === true && body.partial_images === 0,
      })
      if (__editDelay) await new Promise((resolve) => setTimeout(resolve, __editDelay))
      if (request.signal.aborted) throw new DOMException("aborted", "AbortError")
      if (__editStatus === 200 && !__editInvalid)
        return new Response(
          `event: image_edit.completed\ndata: ${JSON.stringify({ type: "image_edit.completed", b64_json: __editPng })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        )
      return new Response(
        JSON.stringify(
          __editStatus !== 200
            ? { error: "RAW_PROVIDER_DETAIL_SENTINEL" }
            : {
                data: __editInvalid
                  ? [{ url: "https://other.invalid/image.png" }]
                  : [{ b64_json: __editPng }],
              },
        ),
        { status: __editStatus, headers: { "content-type": "application/json" } },
      )
    }
  }, output)
  const page = await browser.newPage()
  const ocrRequests = []
  page.on("request", (req) => {
    if (/ocr-assets|tesseract/iu.test(req.url())) ocrRequests.push(req.url())
  })
  page.on("pageerror", (error) => report.errors.push(error.message))
  const click = (name) =>
    page.evaluate((text) => {
      const button = [...document.querySelectorAll("button")].find(
        (el) => el.textContent.trim() === text,
      )
      if (!button || button.disabled) throw new Error("Unavailable: " + text)
      button.click()
    }, name)
  const calls = () => worker.evaluate(() => __editCalls.length)
  const waitImage = () =>
    page.waitForSelector('.rf-generated img[alt="Ảnh dịch nguyên bản OpenAI trả về"]')
  const upload = async () => {
    await (await page.$('input[type="file"]')).uploadFile(path.join(dir, "source.png"))
    await page.waitForFunction(
      () =>
        document.querySelector("canvas")?.width === 900 &&
        document.body.innerText.includes("Kéo chọn vùng chữ"),
    )
    await click("Toàn ảnh")
  }
  await page.goto(`chrome-extension://${id}/image-translate.html`)
  await page.waitForSelector('select[aria-label="Chế độ dịch ảnh"]')
  check(
    "Direct OpenAI image mode is the new default",
    await page.$eval('select[aria-label="Chế độ dịch ảnh"]', (el) => el.value === "generate"),
  )
  await upload()
  check(
    "Opening and cropping sends no API request or local OCR worker",
    (await calls()) === 0 && ocrRequests.length === 0,
  )
  await click("Tạo ảnh dịch")
  await waitImage()
  check(
    "One explicit cold request and exact raw output image",
    (await calls()) === 1 &&
      (await page.$eval(
        ".rf-generated img",
        (el, png) => el.src === "data:image/png;base64," + png,
        output,
      )),
  )
  const payload = await worker.evaluate(() => __editCalls[0])
  check(
    "Fixed image-edit contract, private authorization and crop-only inline input",
    payload.privateAuth &&
      payload.inlineOnly &&
      payload.noPaths &&
      payload.streaming &&
      payload.targetVi &&
      payload.n === 1 &&
      payload.output === "png",
  )
  await click("So với ảnh gốc")
  await click("Xem ảnh dịch")
  await page.select('select[aria-label="Thu phóng ảnh OpenAI"]', "150")
  check("Original/output toggle and zoom are free of provider calls", (await calls()) === 1)
  const cdp = await page.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir })
  await page.click(".rf-generated-download")
  const file = path.join(dir, "FlowRead-OpenAI-anh-dich.png")
  for (let i = 0; i < 100; i++) {
    if (await fs.stat(file).catch(() => null)) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  check(
    "Downloaded PNG is byte-identical to OpenAI output and costs no additional request",
    (await fs.readFile(file)).equals(Buffer.from(output, "base64")) && (await calls()) === 1,
  )
  await click("Tạo ảnh dịch")
  await waitImage()
  check("Repeated Create uses the page RAM cache", (await calls()) === 1)
  await click("Tạo ảnh mới (có phí)")
  await waitImage()
  check("Only explicit regenerate bypasses the matching cache", (await calls()) === 2)
  await page.select('select[aria-label="Chất lượng ảnh"]', "medium")
  check(
    "Quality selection clears the result without an API call",
    (await calls()) === 2 && !(await page.$(".rf-generated")),
  )
  await click("Tạo ảnh dịch")
  await waitImage()
  check("Different image quality has its own cache identity", (await calls()) === 3)
  await page.screenshot({ path: path.join(dir, "generated-view.png") })
  await page.setViewport({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(dir, "phone.png") })
  check(
    "Phone page has no horizontal document overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  )
  await page.setViewport({ width: 1440, height: 1050 })
  await worker.evaluate(() => {
    __editStatus = 429
  })
  await click("Tạo ảnh mới (có phí)")
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("IE-HTTP-429"),
  )
  check(
    "HTTP error is app-owned, no raw provider body or automatic retry",
    (await calls()) === 4 &&
      !(await page.evaluate(() =>
        document.body.innerText.includes("RAW_PROVIDER_DETAIL_SENTINEL"),
      )),
  )
  await worker.evaluate(() => {
    __editStatus = 200
    __editInvalid = true
  })
  await click("Tạo ảnh mới (có phí)")
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("IE-IMAGE"),
  )
  check(
    "Provider URLs are rejected instead of downloaded",
    (await calls()) === 5 && !(await page.$(".rf-generated")),
  )
  await worker.evaluate(() => {
    __editInvalid = false
    __editDelay = 1500
  })
  await click("Tạo ảnh mới (có phí)")
  await page.waitForFunction(() => document.body.innerText.includes("OpenAI đang đọc"))
  for (let i = 0; i < 100 && (await calls()) < 6; i++)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(await calls(), 6, "Cancellation must exercise an already started request")
  await click("Dừng")
  await new Promise((resolve) => setTimeout(resolve, 1800))
  check(
    "Stop discards the late image without retry or rendering it",
    (await calls()) === 6 && !(await page.$(".rf-generated")),
  )
  await worker.evaluate(() => {
    __editDelay = 0
  })
  await click("Xóa cache ảnh")
  await click("Tạo ảnh dịch")
  await waitImage()
  check("Explicit cache clear removes the prior RAM image", (await calls()) === 7)
  await page.reload()
  await page.waitForSelector('select[aria-label="Chế độ dịch ảnh"]')
  await upload()
  await click("Tạo ảnh dịch")
  await waitImage()
  check(
    "Reload never restores generated bitmap data from persistent storage",
    (await calls()) === 8,
  )
  check(
    "No local OCR asset requests or uncaught UI errors in direct mode",
    ocrRequests.length === 0 && report.errors.length === 0,
  )
} finally {
  await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
  console.log("Evidence: " + dir)
}
