import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { performance } from "node:perf_hooks"
import JSZip from "jszip"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function readButton(page, label = "Đọc chữ và dịch") {
  await page.bringToFront()
  const previous = await page
    .$eval('[data-testid="native-selection-output"]', (node) => node.dataset.selectionId)
    .catch(() => "")
  const started = performance.now()
  await page.evaluate(
    (text) =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === text)
        .click(),
    label,
  )
  await page.waitForFunction(
    (id) => {
      const node = document.querySelector('[data-testid="native-selection-output"]')
      return node && node.dataset.selectionId !== id && node.getAttribute("aria-busy") === "false"
    },
    {},
    previous,
  )
  assert.equal(
    await page.$('[role="alert"]'),
    null,
    "A measured translation must complete successfully",
  )
  return performance.now() - started
}
async function clear(page) {
  await page.bringToFront()
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "Xóa cache ảnh")
      .click(),
  )
  await page.waitForFunction(() =>
    document.querySelector(".rf-image-status")?.textContent.includes("Đã xóa cache"),
  )
}
async function load(page, file) {
  await page.bringToFront()
  await (await page.waitForSelector('input[type="file"]')).uploadFile(file)
  await page.waitForFunction(
    () =>
      document.querySelector("canvas")?.width > 0 &&
      document.querySelector(".rf-image-status")?.textContent.includes("Chưa gửi ảnh"),
  )
  await page.bringToFront()
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "Toàn ảnh")
      .click(),
  )
}
async function rows(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("read-frog-image-cache")
      r.onsuccess = () => resolve(r.result)
      r.onerror = reject
    })
    const result = await new Promise((resolve, reject) => {
      const r = db.transaction("entries").objectStore("entries").getAll()
      r.onsuccess = () => resolve(r.result)
      r.onerror = reject
    })
    db.close()
    return result
  })
}
function summarize(samples) {
  const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b)
  return {
    runs: samples.length,
    apiCallsPerRun: samples.map((sample) => sample.apiCalls),
    medianMs: Math.round(
      (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) /
        2,
    ),
    p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    samples: samples.map((sample) => ({ ...sample, ms: Math.round(sample.ms) })),
  }
}
export async function checkFastImage({ browser, id, worker, scratch, check, calls, evidence }) {
  const page = await browser.newPage(),
    errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.setDefaultTimeout(15000)
  const image = path.join(scratch, "Image-fixture.png")
  let baselineId, baseline
  const snapshot = await worker.evaluate(async () =>
    structuredClone((await chrome.storage.local.get("config")).config),
  )
  try {
    await page.goto(`chrome-extension://${id}/image-translate.html`)
    await load(page, image)
    await page.select('[aria-label="Chế độ dịch ảnh"]', "fast")
    await clear(page)
    const before = await calls()
    await readButton(page)
    check(
      "Fast image translation returns original and translation in exactly one API request",
      (await calls()) === before + 1 &&
        (await page.$eval('[data-testid="native-selection-output"]', (node) =>
          node.textContent.includes("Bản dịch nhanh"),
        )),
    )
    check(
      "Fast mode requests a bounded structured original/translation pair",
      await worker.evaluate(
        () =>
          __pdfCalls.at(-1).body.text?.format?.schema?.properties?.original?.type === "string" &&
          __pdfCalls.at(-1).body.text?.format?.schema?.properties?.translation?.type === "string",
      ),
    )
    const warm = await calls()
    await readButton(page)
    check(
      "Repeating the same image and settings uses zero API requests",
      (await calls()) === warm &&
        (await page.$eval(".rf-image-status", (node) => node.textContent.includes("bản lưu"))),
    )
    await page.reload()
    await load(page, image)
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Chế độ dịch ảnh"]').value === "fast",
    )
    await readButton(page)
    check("The image cache and mode preference survive a page reload", (await calls()) === warm)
    const records = await rows(page)
    check(
      "Image cache persists only hashes, text and bounded metadata",
      records.length > 0 && !/data:image|base64|apiKey|file:\/\//.test(JSON.stringify(records)),
    )
    const forced = await calls()
    await readButton(page, "Đọc lại ảnh")
    check("Force-read bypasses a warm image cache", (await calls()) === forced + 1)
    const regenerated = await calls()
    await page.locator("::-p-aria(Regenerate)").click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("aria-busy") === "false" &&
        document.body.textContent.includes("Đã lưu cache bản dịch ảnh"),
    )
    check(
      "Regenerate uses the existing text engine without uploading an image again",
      (await calls()) === regenerated + 1 &&
        (await worker.evaluate(
          () =>
            !__pdfCalls
              .at(-1)
              .body.input.some(
                (item) =>
                  Array.isArray(item.content) &&
                  item.content.some((part) => part.type === "input_image"),
              ),
        )),
    )
    await page.select('[aria-label="Chế độ dịch ảnh"]', "two-step")
    await clear(page)
    const firstTwo = await calls()
    await readButton(page)
    check(
      "The two-step mode still recognizes and translates with two cold requests",
      (await calls()) === firstTwo + 2,
    )
    const twoWarm = await calls()
    await readButton(page)
    check(
      "The two-step mode reuses both recognition and text translation caches",
      (await calls()) === twoWarm,
    )
    await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      config.language.targetCode = "en"
      await chrome.storage.local.set({ config })
    })
    await page.reload()
    await load(page, image)
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Chế độ dịch ảnh"]').value === "two-step",
    )
    const newTarget = await calls()
    await readButton(page)
    check(
      "Changing the target language reuses OCR but invalidates the text translation",
      (await calls()) === newTarget + 1 &&
        (await worker.evaluate(() => JSON.stringify(__pdfCalls.at(-1).body).includes("English"))),
    )
    // Reproduce a custom template which hard-codes Chinese and has no language token.
    await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      config.language.targetCode = "zh-Hans"
      config.pageTranslation.customPromptsConfig = {
        promptId: "fixed-chinese-target-fixture",
        patterns: [
          {
            id: "fixed-chinese-target-fixture",
            name: "Technical style",
            systemPrompt: "Translate into Chinese. Keep code and headings.",
            prompt: "{{input}}",
          },
        ],
      }
      globalThis.__pdfTextOutput = (body) => {
        const prompt = JSON.stringify(body)
        return prompt.includes("Vietnamese (vi)")
          ? "Có cần khởi tạo semaphore không?"
          : prompt.includes("English (en)")
            ? "Does semaphore need initialization?"
            : "使用 semaphore 时需要初始化吗？"
      }
      await chrome.storage.local.set({ config })
    })
    await page.reload()
    await load(page, image)
    await page.select('[aria-label="Chế độ dịch ảnh"]', "fast")
    await readButton(page)
    const imageUploads = () =>
      worker.evaluate(
        () =>
          __pdfCalls.filter((entry) =>
            entry.body.input?.some(
              (item) =>
                Array.isArray(item.content) &&
                item.content.some((part) => part.type === "input_image"),
            ),
          ).length,
      )
    const customUploads = await imageUploads()
    for (const [code, expected] of [
      ["vi", "Có cần khởi tạo semaphore không?"],
      ["en", "Does semaphore need initialization?"],
    ]) {
      await worker.evaluate(async (targetCode) => {
        const { config } = await chrome.storage.local.get("config")
        config.language.targetCode = targetCode
        await chrome.storage.local.set({ config })
      }, code)
      await page.reload()
      await load(page, image)
      const beforeTarget = await calls()
      await readButton(page)
      check(
        `Custom Chinese-only template honors the explicit ${code} picker and never reuses the previous language's cache`,
        (await calls()) === beforeTarget + 1 &&
          (await page.$eval(
            '[data-testid="native-selection-output"]',
            (node, text) => node.textContent.includes(text),
            expected,
          )),
      )
      const warmTarget = await calls()
      await readButton(page)
      check(
        `The corrected custom-prompt ${code} translation has its own warm cache`,
        (await calls()) === warmTarget,
      )
      if (code === "vi") {
        await page.screenshot({
          path: path.join(scratch, "image-vietnamese-custom-prompt.png"),
          fullPage: true,
        })
        evidence.screenshots.push("image-vietnamese-custom-prompt.png")
      }
    }
    check(
      "Target changes in the custom image path reuse OCR rather than uploading the image again",
      (await imageUploads()) === customUploads,
    )
    await worker.evaluate(() => {
      delete globalThis.__pdfTextOutput
    })
    await worker.evaluate(async (config) => chrome.storage.local.set({ config }), snapshot)
    await page.reload()
    await load(page, image)
    await page.select('[aria-label="Chế độ dịch ảnh"]', "fast")
    await clear(page)
    await worker.evaluate(() => {
      __pdfDelay = 500
    })
    const pending = await calls()
    await page.locator("::-p-aria(Đọc chữ và dịch)").click()
    for (let n = 0; n < 100 && (await calls()) === pending; n++) await wait(15)
    await clear(page)
    await wait(600)
    await worker.evaluate(() => {
      __pdfDelay = 0
    })
    check(
      "Clearing cache during an active request cancels the UI and prevents late writes",
      (await rows(page)).length === 0 &&
        (await page.$('[data-testid="native-selection-output"]')) === null,
    )
    await worker.evaluate(() => {
      __quickOutput = '{"original":"incomplete"}'
    })
    await page.locator("::-p-aria(Đọc chữ và dịch)").click()
    await page.waitForSelector('[role="alert"]')
    check(
      "Malformed fast output is not cached or silently retried",
      (await rows(page)).length === 0 && (await calls()) === pending + 2,
    )
    await worker.evaluate(() => {
      delete globalThis.__quickOutput
    })
    const shortcut = await page.evaluate(
      async () =>
        (await chrome.commands.getAll()).find((command) => command.name === "capture-and-translate")
          ?.shortcut,
    )
    check(
      "Edge registers the configurable capture shortcut as Alt+Shift+S",
      shortcut === "Alt+Shift+S",
    )
    check(
      "The image page displays the actual shortcut returned by Edge",
      await page.evaluate(
        (key) => document.body.textContent.includes(`Phím tắt: ${key}`),
        shortcut,
      ),
    )
    await readButton(page)
    for (const width of [390, 760, 1280]) {
      await page.setViewport({ width, height: 940 })
      check(
        `Fast image controls and result fit ${width}px`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
    }
    await page.screenshot({ path: path.join(scratch, "fast-image.png"), fullPage: true })
    evidence.screenshots.push("fast-image.png")

    // Language/cancellation regressions do not need to re-run the historical latency benchmark.
    if (process.env.PDF_IMAGE_SKIP_BENCHMARK === "1") return

    // Compare the shipped a.12 build against this production build using the
    // same browser, image, model configuration and deterministic mock RTT.
    const oldZip = await JSZip.loadAsync(
      await fs.readFile(".output/read-frogextension-1.58.0-a.12-edge.zip"),
      { checkCRC32: true },
    )
    const oldRoot = path.join(scratch, "benchmark-baseline")
    await fs.mkdir(oldRoot, { recursive: true })
    for (const [name, entry] of Object.entries(oldZip.files)) {
      if (entry.dir) continue
      const target = path.resolve(oldRoot, name)
      assert.ok(
        target.startsWith(path.resolve(oldRoot) + path.sep) && !name.split("/").includes(".."),
      )
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await entry.async("nodebuffer"))
    }
    baselineId = await browser.installExtension(oldRoot)
    assert.notEqual(baselineId, id, "Baseline and candidate must run in separate extension origins")
    const oldWorker = await (
      await browser.waitForTarget(
        (target) =>
          target.type() === "service_worker" &&
          target.url() === `chrome-extension://${baselineId}/background.js`,
      )
    ).worker()
    baseline = await browser.newPage()
    await baseline.goto(`chrome-extension://${baselineId}/options.html#/api-providers`)
    await baseline.waitForSelector("#openai-key")
    await oldWorker.evaluate(preparePdfWorker)
    await baseline.goto(`chrome-extension://${baselineId}/image-translate.html`)
    await load(baseline, image)
    await baseline.setViewport({ width: 1280, height: 940 })
    await worker.evaluate(() => {
      __pdfDelay = 200
    })
    await oldWorker.evaluate(() => {
      __pdfDelay = 200
    })
    const oldCalls = () => oldWorker.evaluate(() => __pdfCalls.length)
    const old = [],
      fast = [],
      warmSamples = []
    for (let run = 0; run < 20; run++) {
      const count = await oldCalls(),
        ms = await readButton(baseline)
      old.push({ ms, apiCalls: (await oldCalls()) - count })
      await clear(page)
      const coldCount = await calls(),
        coldMs = await readButton(page)
      fast.push({ ms: coldMs, apiCalls: (await calls()) - coldCount })
      const warmCount = await calls(),
        warmMs = await readButton(page)
      warmSamples.push({ ms: warmMs, apiCalls: (await calls()) - warmCount })
    }
    const benchmark = {
      browser: await browser.version(),
      baselineManifest: JSON.parse(await oldZip.file("manifest.json").async("string")).version,
      candidateManifest: evidence.manifest,
      liveOpenAI: false,
      mockLatencyMsPerRequest: 200,
      includes:
        "click to settled translation UI; crop encoding, actual IndexedDB, private runtime and mocked network; excludes real model generation",
      baseline: summarize(old),
      fastCold: summarize(fast),
      fastWarm: summarize(warmSamples),
      osShortcutDriven: false,
    }
    check(
      "Measured baseline uses two requests, fast uses one, and warm cache uses zero",
      old.every((sample) => sample.apiCalls === 2) &&
        fast.every((sample) => sample.apiCalls === 1) &&
        warmSamples.every((sample) => sample.apiCalls === 0),
    )
    evidence.imageBenchmark = benchmark
    await fs.writeFile(
      path.join(scratch, "image-benchmark.json"),
      JSON.stringify(benchmark, null, 2),
    )
    await fs.writeFile(
      path.join(scratch, "image-benchmark.md"),
      `# Image translation comparison\n\nAPI is mocked at 200 ms/request; no real OpenAI model speed is measured. Twenty interleaved runs per case.\n\n| Case | API calls/run | Median ms | P95 ms |\n|---|---:|---:|---:|\n| Shipped a.12 | 2 | ${benchmark.baseline.medianMs} | ${benchmark.baseline.p95Ms} |\n| New fast, cold cache | 1 | ${benchmark.fastCold.medianMs} | ${benchmark.fastCold.p95Ms} |\n| New fast, warm cache | 0 | ${benchmark.fastWarm.medianMs} | ${benchmark.fastWarm.p95Ms} |\n`,
    )
    check(
      "Fast image and benchmark flows complete without browser JavaScript errors",
      errors.length === 0,
    )
  } catch (error) {
    evidence.fastImageFailure = {
      error: String(error),
      current: await page.evaluate(() => document.body.innerText).catch(() => ""),
      baseline: baseline
        ? await baseline.evaluate(() => document.body.innerText).catch(() => "")
        : "",
    }
    console.log(JSON.stringify(evidence.fastImageFailure))
    throw error
  } finally {
    await worker
      .evaluate(async (config) => {
        __pdfDelay = 0
        delete globalThis.__quickOutput
        await chrome.storage.local.set({ config })
      }, snapshot)
      .catch(() => {})
    await baseline?.close().catch(() => {})
    if (baselineId) await browser.uninstallExtension(baselineId).catch(() => {})
    await page.close()
  }
}
