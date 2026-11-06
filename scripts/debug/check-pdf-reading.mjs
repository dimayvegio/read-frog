import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

// Production extension, real Edge sidebar and local PDF; fake OpenAI only.
// Selection messages are seeded at the trusted native bridge because CDP does
// not drive Edge's OS context menu. Its routing/gesture order has unit coverage.
const { default: puppeteer } = await import(
  pathToFileURL(
    process.env.VOCAB_PUPPETEER_MODULE ??
      path.resolve(
        ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
      ),
  ).href
)
const scratch = path.resolve(`.codex/pdf-reading-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  screenshots: [],
  liveOpenAI: false,
  nativeMenuDriven: false,
  realSidePanel: true,
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
function pdfFixture() {
  const content =
    "BT /F1 18 Tf 50 700 Td (Read Frog local PDF fixture) Tj 0 -40 Td (The election is unlikely to reverse) Tj 0 -25 Td (the structural demand.) Tj ET"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let output = "%PDF-1.4\n",
    offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(output)
  output += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return output
}
const fixturePath = path.join(scratch, "Reading-fixture.pdf")
await fs.writeFile(fixturePath, pdfFixture())
const pdfURL = pathToFileURL(fixturePath).href,
  document = { id: digest(pdfURL), title: "Reading-fixture.pdf" }
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1280, height: 940 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
evidence.browser = await browser.version()
evidence.manifest = JSON.parse(await fs.readFile(".output/edge-mv3/manifest.json", "utf8")).version
const errors = []
let panel
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3"))
  const worker = await (
    await browser.waitForTarget(
      (target) =>
        target.type() === "service_worker" &&
        target.url() === `chrome-extension://${id}/background.js`,
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(`chrome-extension://${id}/options.html#/api-providers`)
  await options.waitForSelector("#openai-key")
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.language.targetCode = "vie"
    config.uiLanguage = "en"
    config.glossary.enabled = false
    config.providersConfig[0].model.model = "gpt-4o-mini"
    await chrome.storage.local.set({ config })
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("edge-openai-credentials")
      request.onerror = reject
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("credentialState", "readwrite")
        tx.objectStore("credentialState").put({
          id: "openai",
          state: "active",
          apiKey: "pdf-reading-test-sentinel",
          revision: 1000,
          updatedAt: Date.now(),
          legacyImportAllowed: false,
        })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
    globalThis.__pdfCalls = []
    globalThis.__pdfOffline = false
    globalThis.__pdfDelay = 0
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init),
        body = await request.json()
      if (request.url !== "https://api.openai.com/v1/responses")
        throw new Error("Unexpected API request")
      __pdfCalls.push({
        url: request.url,
        body,
        authorization: request.headers.get("authorization"),
      })
      if (__pdfOffline) throw new Error("Offline fixture")
      const output = `Bản dịch PDF số ${__pdfCalls.length}. Đây là văn bản tiếng Việt có dấu.`,
        delay = __pdfDelay
      const response = {
        id: "resp_pdf",
        object: "response",
        created_at: 1,
        status: "completed",
        model: body.model,
        output: [
          {
            id: "msg_pdf",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: output, annotations: [], logprobs: [] }],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 30,
          total_tokens: 40,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      if (!body.stream)
        return new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
        })
      const events = [
        {
          type: "response.created",
          response: { id: response.id, created_at: 1, model: body.model },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "message", id: "msg_pdf" },
        },
        { type: "response.output_text.delta", item_id: "msg_pdf", output_index: 0, delta: output },
        { type: "response.output_item.done", output_index: 0, item: response.output[0] },
        { type: "response.completed", response },
      ]
      return new Response(
        events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
        { headers: { "content-type": "text/event-stream" } },
      )
    }
  })
  const source = await browser.newPage()
  await source.goto(pdfURL)
  const sourceTab = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url),
    pdfURL,
  )
  assert.ok(sourceTab?.id)
  const popup = await browser.newPage()
  popup.on("pageerror", (error) => errors.push(error.message))
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForSelector('[aria-label="Mở khung dịch PDF"]:not([disabled])')
  await popup.click('[aria-label="Mở khung dịch PDF"]')
  const panelTarget = await browser.waitForTarget(
    (target) => target.url() === `chrome-extension://${id}/sidepanel.html`,
    { timeout: 15000 },
  )
  panel = await panelTarget.asPage()
  panel.setDefaultTimeout(15000)
  panel.on("pageerror", (error) => errors.push(error.message))
  await panel.waitForFunction(() =>
    document.body.textContent.includes("Khung dịch PDF đã sẵn sàng"),
  )
  check(
    "The production PDF button opens a real Edge side-panel target through a user click",
    panelTarget.type() === "other" || panelTarget.type() === "page",
  )
  evidence.panelTargetType = panelTarget.type()
  const seed = async (selectionText, selectedDocument = document) => {
    const requestId = await worker.evaluate(
      async ({ text, doc, sourceTabId, windowId }) => {
        const key = "native-panel:" + windowId,
          previous = (await chrome.storage.session.get(key))[key],
          channel = crypto.randomUUID(),
          selectionRequestId = crypto.randomUUID()
        await chrome.storage.session.set({
          [key]: channel,
          ["native-selection:" + channel]: {
            id: selectionRequestId,
            text,
            tooLong: false,
            createdAt: Date.now(),
            panelWindowId: windowId,
            sourceTabId,
            document: doc,
          },
        })
        if (previous) await chrome.storage.session.remove("native-selection:" + previous)
        return selectionRequestId
      },
      {
        text: selectionText,
        doc: selectedDocument,
        sourceTabId: sourceTab.id,
        windowId: sourceTab.windowId,
      },
    )
    await panel.waitForFunction(
      (expectedId) =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("data-selection-id") === expectedId,
      {},
      requestId,
    )
  }
  const calls = () => worker.evaluate(() => __pdfCalls.length)
  const records = () =>
    panel.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("read-frog-pdf-reading")
          request.onerror = reject
          request.onsuccess = () => {
            const db = request.result,
              rows = db.transaction("translations").objectStore("translations").getAll()
            rows.onsuccess = () => {
              resolve(rows.result)
              db.close()
            }
            rows.onerror = reject
          }
        }),
    )
  const completed = () =>
    panel.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("aria-busy") === "false",
    )
  const selected =
    "The election is unlikely to reverse\nthe structural demand.\n\nAnother paragraph."
  await seed(selected)
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  check(
    "The trusted native bridge streams Vietnamese in the same panel and saves document history",
    (await calls()) === 1 && (await records()).length === 1,
  )
  check(
    "PDF line cleanup joins prose while preserving paragraph breaks",
    await worker.evaluate(
      () =>
        JSON.stringify(__pdfCalls[0].body).includes("reverse the structural demand.") &&
        JSON.stringify(__pdfCalls[0].body).includes("\\n\\nAnother paragraph."),
    ),
  )
  check(
    "Only the selected passage reaches the private official OpenAI transport, without a local path or filename",
    await worker.evaluate(() =>
      __pdfCalls.every(
        (call) =>
          call.authorization === "Bearer pdf-reading-test-sentinel" &&
          !/file:\/\/|Reading-fixture\.pdf/.test(JSON.stringify(call.body)),
      ),
    ),
  )
  await source.bringToFront()
  await source.mouse.click(300, 300)
  check(
    "Clicking the local PDF leaves the translation panel alive",
    !panel.isClosed() && (await panel.$('[data-testid="native-selection-output"]')) !== null,
  )
  await seed(selected)
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Dùng bản lưu trên máy"))
  check(
    "Reselecting an identical passage uses the cached translation without another API request",
    (await calls()) === 1 && (await records()).length === 1,
  )
  await worker.evaluate(() => {
    __pdfOffline = true
  })
  await panel.reload()
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Dùng bản lưu trên máy"))
  check(
    "Stored translation survives panel reload and works with the API unavailable",
    (await calls()) === 1,
  )
  await worker.evaluate(() => {
    __pdfOffline = false
  })
  await panel.$eval('[data-testid="pdf-reading-controls"] details', (node) => {
    node.open = true
  })
  await panel.click('[data-testid="pdf-reading-controls"] input[type="checkbox"]')
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  check(
    "Disabling cleanup preserves raw newlines and creates a distinct cache variant",
    (await calls()) === 2 &&
      (await records()).length === 2 &&
      (await worker.evaluate(() =>
        JSON.stringify(__pdfCalls[1].body).includes("reverse\\nthe structural demand."),
      )),
  )
  await panel.click('[data-testid="pdf-reading-controls"] input[type="checkbox"]')
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Dùng bản lưu trên máy"))
  check("Restoring cleanup reuses its previous variant", (await calls()) === 2)
  await panel.click('[aria-label="Regenerate"]')
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  check(
    "Explicit regenerate bypasses cache and replaces the existing history entry",
    (await calls()) === 3 && (await records()).length === 2,
  )
  await panel.$eval('[data-testid="pdf-history"]', (node) => {
    node.open = true
  })
  const beforeHistory = await calls()
  await panel.click('[data-testid="pdf-history"] ol li:last-child button')
  check(
    "Opening an older history result makes no API request",
    (await calls()) === beforeHistory &&
      (await panel.$eval('[data-testid="native-selection-output"]', (node) =>
        node.textContent.includes("Bản dịch PDF"),
      )),
  )
  const cdp = await panel.createCDPSession(),
    downloads = path.join(scratch, "downloads")
  await fs.mkdir(downloads)
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads })
  await panel.locator("::-p-aria(Xuất lịch sử JSON)").click()
  let exportFile
  for (let i = 0; i < 100; i++) {
    exportFile = (await fs.readdir(downloads)).find((name) => name.endsWith(".json"))
    if (exportFile) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(exportFile)
  const exported = JSON.parse(await fs.readFile(path.join(downloads, exportFile), "utf8"))
  check(
    "History JSON export carries originals, prepared text and outputs without a file path or key",
    exported.records.length === 2 &&
      exported.records.every((row) => row.original === selected && row.output) &&
      !/file:\/\/|pdf-reading-test-sentinel|apiKey/.test(JSON.stringify(exported)),
  )
  const otherDoc = { id: digest("another-local-file"), title: "Other.pdf" }
  await seed("Another document's passage.", otherDoc)
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  check(
    "A second PDF receives a separate document history",
    await panel.$eval('[data-testid="pdf-history"] summary', (node) =>
      node.textContent.includes("1 đoạn"),
    ),
  )
  await seed(selected)
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Dùng bản lưu trên máy"))
  await panel.$eval('[data-testid="pdf-history"]', (node) => {
    node.open = true
  })
  panel.once("dialog", (dialog) => void dialog.accept())
  await panel.locator("::-p-aria(Xóa lịch sử tài liệu)").click()
  await panel.waitForFunction(() =>
    document.querySelector('[data-testid="pdf-history"] summary')?.textContent.includes("0 đoạn"),
  )
  check(
    "Clearing one PDF's history preserves other documents",
    (await records()).length === 1 && (await records())[0].documentId === otherDoc.id,
  )
  const previousCalls = await calls()
  await seed(selected)
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  check(
    "Clearing history also invalidates its cached translation",
    (await calls()) === previousCalls + 1,
  )
  await worker.evaluate(() => {
    __pdfDelay = 900
  })
  await seed("This pending old request must be cancelled.")
  await panel.waitForSelector('[aria-label="Stop translation"]')
  for (let attempt = 0; attempt < 100 && (await calls()) < previousCalls + 2; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(
    await calls(),
    previousCalls + 2,
    "The old provider request must actually start before cancellation",
  )
  await worker.evaluate(() => {
    __pdfDelay = 0
  })
  await seed("The replacement passage is current.")
  await completed()
  await panel.waitForFunction(() => document.body.textContent.includes("Đã lưu bản dịch trên máy"))
  await new Promise((resolve) => setTimeout(resolve, 1100)) // Let the aborted provider's delayed completion arrive.
  check(
    "A new PDF selection cancels the old stream and never stores its partial result",
    !(await records()).some((row) => row.original.includes("pending old request")) &&
      (await records()).some((row) => row.original.includes("replacement passage")),
  )
  for (const width of [320, 390, 600]) {
    await panel.setViewport({ width, height: 940 })
    check(
      `PDF panel controls have no page overflow at ${width}px`,
      await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
  }
  await panel.setViewport({ width: 390, height: 940 })
  await panel.screenshot({ path: path.join(scratch, "panel-390.png"), fullPage: true })
  evidence.screenshots.push("panel-390.png")
  check("The browser flow completes without JavaScript errors", errors.length === 0)
  evidence.apiCalls = await calls()
  evidence.historyRecords = (await records()).length
  evidence.checkCount = evidence.checks.length
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  evidence.failure = String(error)
  if (panel) {
    evidence.failureUI = await panel.evaluate(() => document.body.innerText).catch(() => "")
    await panel
      .screenshot({ path: path.join(scratch, "failure.png"), fullPage: true })
      .catch(() => {})
  }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
}
