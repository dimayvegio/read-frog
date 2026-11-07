import fs from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"

export async function checkImageTranslation({
  browser,
  id,
  worker,
  source,
  scratch,
  check,
  calls,
  evidence,
}) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(
      '<!doctype html><style>html,body{margin:0;background:#27ae60;font:28px Arial;color:#172033}#target{position:absolute;left:160px;top:110px;width:600px;height:240px;background:white;display:flex;align-items:center;justify-content:center;text-align:center}#private{position:absolute;left:900px;top:40px;background:#e74c3c;padding:30px}</style><div id="target">Read Frog image fixture.<br>Remember the words you learn.</div><div id="private">Outside selected region</div>',
    )
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const popup = await browser.newPage()
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForFunction(() => document.body.textContent.includes("Chụp vùng & dịch ảnh"))
  const web = await browser.newPage(),
    imagePages = [],
    errors = []
  let editor
  const beforeCalls = await calls()
  try {
    await web.setViewport({ width: 1280, height: 850, deviceScaleFactor: 2 })
    await web.goto(`http://127.0.0.1:${server.address().port}`)
    await web.waitForSelector("#target")
    await web.bringToFront()
    const previous = new Set(browser.targets())
    await popup.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Chụp vùng & dịch ảnh"))
        .click(),
    )
    const target = await browser.waitForTarget(
      (t) => !previous.has(t) && t.url().includes(`chrome-extension://${id}/image-translate.html`),
      { timeout: 15000 },
    )
    editor = await target.page()
    imagePages.push(editor)
    editor.setDefaultTimeout(15000)
    editor.on("pageerror", (error) => errors.push(error.message))
    await editor.waitForFunction(
      () =>
        document.querySelector("canvas")?.width > 100 &&
        !document.querySelector(".rf-image-canvas-wrap").hidden,
    )
    check(
      "Popup captures a real web viewport and opens the trusted crop editor",
      await editor.$eval("canvas", (node) => node.width >= 1280),
    )
    check("Capture and crop selection make no OpenAI request", (await calls()) === beforeCalls)
    check(
      "Image editor controls use visible borders from the application theme",
      await editor.$eval(".rf-image-toolbar button", (node) => {
        const style = getComputedStyle(node)
        return parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle === "solid"
      }),
    )
    const sourceSize = await editor.$eval("canvas", (node) => ({
      width: node.width,
      height: node.height,
    }))
    const storage = await worker.evaluate(async () =>
      JSON.stringify([
        await chrome.storage.local.get(null),
        await chrome.storage.session.get(null),
      ]),
    )
    check(
      "Screenshot bytes never enter persistent or session settings storage",
      !storage.includes("data:image/") && !editor.url().includes("base64"),
    )
    const box = await (await editor.$("canvas")).boundingBox()
    // Reverse drag at DPR2. Select the white text card, excluding red/green surroundings.
    await editor.mouse.move(box.x + (box.width * 750) / 1280, box.y + (box.height * 345) / 850)
    await editor.mouse.down()
    await editor.mouse.move(box.x + (box.width * 165) / 1280, box.y + (box.height * 115) / 850, {
      steps: 6,
    })
    await editor.mouse.up()
    await editor.locator("::-p-aria(Đọc chữ và dịch)").click()
    await editor.waitForFunction(() =>
      document
        .querySelector('[data-testid="native-selection-output"]')
        ?.textContent.includes("Bản dịch PDF"),
    )
    const inputs = await worker.evaluate(() =>
      __pdfCalls.flatMap(
        (call) =>
          call.body.input?.flatMap((item) =>
            Array.isArray(item.content)
              ? item.content.filter((part) => part.type === "input_image")
              : [],
          ) ?? [],
      ),
    )
    const sent = inputs.at(-1).image_url
    const image = await editor.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(data)).blob())
      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext("2d")
      ctx.drawImage(bitmap, 0, 0)
      const result = {
        width: bitmap.width,
        height: bitmap.height,
        corner: [...ctx.getImageData(5, 5, 1, 1).data],
      }
      bitmap.close()
      return result
    }, sent)
    check(
      "Only the selected crop reaches OpenAI at natural screenshot resolution",
      image.width < sourceSize.width * 0.6 &&
        image.width > 500 &&
        image.height < sourceSize.height * 0.4 &&
        image.corner.slice(0, 3).every((n) => n > 245),
    )
    check(
      "Vision uses inline image input and the existing private Responses endpoint",
      await worker.evaluate(() =>
        __pdfCalls
          .filter((call) =>
            call.body.input?.some(
              (item) =>
                Array.isArray(item.content) &&
                item.content.some((part) => part.type === "input_image"),
            ),
          )
          .every(
            (call) =>
              call.url === "https://api.openai.com/v1/responses" &&
              call.authorization === "Bearer pdf-reading-test-sentinel",
          ),
      ),
    )
    check(
      "OCR text feeds the existing translation interface in a second text-only request",
      (await calls()) === beforeCalls + 2 &&
        (await editor.$eval("#image-ocr-text", (node) =>
          node.value.includes("Remember the words"),
        )),
    )
    // Use the native setter to update React's controlled textarea.
    await editor.evaluate(() => {
      const node = document.querySelector("#image-ocr-text")
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
        node,
        "Corrected original text.",
      )
      node.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const beforeEdit = await calls()
    await editor.locator("::-p-aria(Dịch lại văn bản)").click()
    await editor.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("aria-busy") === "false",
    )
    check(
      "Correcting OCR reruns only text translation without uploading the image again",
      (await calls()) === beforeEdit + 1 &&
        (await worker.evaluate(() =>
          JSON.stringify(__pdfCalls.at(-1).body).includes("Corrected original text."),
        )),
    )
    // Clipboard event uses a real PNG file; OS snipping itself is outside CDP.
    await editor.evaluate(async (data) => {
      const blob = await (await fetch(data)).blob(),
        transfer = new DataTransfer()
      transfer.items.add(new File([blob], "clipboard.png", { type: "image/png" }))
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }),
      )
    }, sent)
    await editor.waitForFunction(
      () =>
        document.body.textContent.includes("Chưa gửi ảnh tới OpenAI") &&
        !document.querySelector("#image-ocr-text"),
    )
    check(
      "Pasting a new image clears the previous result without an API request",
      (await calls()) === beforeEdit + 1 && (await editor.$(".rf-image-result")) === null,
    )
    await editor.locator("::-p-aria(Toàn ảnh)").click()
    await worker.evaluate(() => {
      __pdfDelay = 900
    })
    const beforeStop = await calls()
    await editor.locator("::-p-aria(Đọc chữ và dịch)").click()
    for (let attempt = 0; attempt < 60 && (await calls()) === beforeStop; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 30))
    await editor.locator("::-p-aria(Dừng)").click()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await worker.evaluate(() => {
      __pdfDelay = 0
    })
    check(
      "Stop aborts recognition and a delayed OCR response never starts translation",
      (await calls()) === beforeStop + 1 && (await editor.$(".rf-image-result")) === null,
    )
    await worker.evaluate(() => {
      __imageOutput = ""
    })
    const beforeEmpty = await calls()
    await editor.locator("::-p-aria(Đọc chữ và dịch)").click()
    await editor.waitForSelector('[role="alert"]')
    check(
      "An image with no recognized text shows an error without calling translation",
      (await calls()) === beforeEmpty + 1 && (await editor.$(".rf-image-result")) === null,
    )
    await worker.evaluate(() => {
      __imageOutput = "x".repeat(20001)
    })
    const beforeLong = await calls()
    await editor.locator("::-p-aria(Đọc chữ và dịch)").click()
    await editor.waitForFunction(() =>
      document.querySelector('[role="alert"]')?.textContent.includes("20.000"),
    )
    check(
      "Oversized OCR is rejected without translating a truncated passage",
      (await calls()) === beforeLong + 1,
    )
    await worker.evaluate(() => {
      delete globalThis.__imageOutput
    })
    const filePath = path.join(scratch, "Image-fixture.png")
    await fs.writeFile(filePath, Buffer.from(sent.split(",")[1], "base64"))
    await (await editor.$('input[type="file"]')).uploadFile(filePath)
    await editor.waitForFunction(() => !document.querySelector('[role="alert"]'))
    check(
      "Local PNG file selection works without clipboard permissions",
      (await editor.$eval("canvas", (node) => node.width)) === image.width,
    )
    await editor.locator("::-p-aria(Toàn ảnh)").click()
    await editor.locator("::-p-aria(Đọc chữ và dịch)").click()
    await editor.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("aria-busy") === "false",
    )
    for (const width of [390, 760, 1280]) {
      await editor.setViewport({ width, height: 900 })
      check(
        `Image editor and result have no page overflow at ${width}px`,
        await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      if (width === 390) {
        await editor.screenshot({ path: path.join(scratch, "image-390.png"), fullPage: true })
        evidence.screenshots.push("image-390.png")
      }
    }
    await editor.screenshot({ path: path.join(scratch, "image-translation.png"), fullPage: true })
    evidence.screenshots.push("image-translation.png")
    check("Image translation browser flow has no JavaScript errors", errors.length === 0)
    // The PDF reader captures its own rendered canvas without injecting into Edge native.
    const reader = await browser.newPage()
    imagePages.push(reader)
    await reader.goto(`chrome-extension://${id}/pdf-reader.html`)
    await (
      await reader.waitForSelector('input[type="file"]')
    ).uploadFile(path.join(scratch, "Auto-book.pdf"))
    await reader.waitForSelector('[aria-label="Số trang"]')
    await reader.waitForSelector('[data-rendered="true"]')
    const prior = new Set(browser.targets())
    await reader.locator("::-p-aria(Chụp vùng & dịch ảnh)").click()
    const pdfImage = await (
      await browser.waitForTarget((t) => !prior.has(t) && t.url().includes("/image-translate.html"))
    ).page()
    imagePages.push(pdfImage)
    await pdfImage.waitForFunction(() => document.querySelector("canvas")?.width > 100)
    check(
      "PDF reader captures its visible rendered pages and opens the same crop editor",
      await pdfImage.$eval("canvas", (node) => node.height > 100),
    )
    await source.bringToFront()
    const nativePrior = new Set(browser.targets())
    await popup.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Chụp vùng & dịch ảnh"))
        .click(),
    )
    const nativeTarget = await browser
      .waitForTarget((t) => !nativePrior.has(t) && t.url().includes("/image-translate.html"), {
        timeout: 10000,
      })
      .catch(() => null)
    if (nativeTarget) {
      const nativeEditor = await nativeTarget.page()
      imagePages.push(nativeEditor)
      await nativeEditor.waitForFunction(() => document.querySelector("canvas")?.width > 100)
      check("Native local PDF screenshots reach the crop editor without text selection", true)
      evidence.nativePdfCapture = true
    } else {
      check(
        "Restricted native capture offers the image paste fallback",
        await popup.$eval('[role="alert"]', (node) => node.textContent.includes("Win+Shift+S")),
      )
      evidence.nativePdfCapture = false
    }
    evidence.imageTranslation = {
      realScreenshot: true,
      realCrop: true,
      dpr: 2,
      liveOpenAI: false,
      osClipboardDriven: false,
      errors,
    }
  } catch (error) {
    evidence.imageFailure = {
      error: String(error),
      popup: await popup.evaluate(() => document.body.innerText).catch(() => ""),
      editor: editor ? await editor.evaluate(() => document.body.innerText).catch(() => "") : "",
    }
    console.log(JSON.stringify(evidence.imageFailure))
    throw error
  } finally {
    for (const page of imagePages) await page.close().catch(() => {})
    await web.close()
    await popup.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
