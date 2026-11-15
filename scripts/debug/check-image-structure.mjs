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
const scratch = path.resolve(`.codex/image-structure-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const evidence = {
  checks: [],
  liveOpenAI: false,
  screenshots: [],
  scope:
    "Real packaged image UI/private stream/cache; synthetic OCR and translation replies, no live model quality claim",
}
const check = (name, ok) => {
  assert.ok(ok, name)
  evidence.checks.push(name)
  console.log(`PASS ${name}`)
}
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1440, height: 1000 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const errors = []
const doc = {
  blocks: [
    { type: "heading", level: 2, text: "Register map" },
    { type: "paragraph", text: "Read each register before reset." },
    { type: "paragraph", text: "Keep the original order." },
    {
      type: "table",
      header: true,
      rows: [
        ["Name", "Value"],
        ["rst_n", "1'b0"],
        ["reserved", ""],
      ],
    },
    { type: "list", ordered: true, start: 8, items: ["Check reset", "Read status"] },
    { type: "code", language: "sv", text: "module test;\n  assign rst_n = 1'b0;\nendmodule" },
  ],
}
try {
  evidence.browser = await browser.version()
  evidence.manifest = JSON.parse(
    await fs.readFile(".output/edge-mv3/manifest.json", "utf8"),
  ).version
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
  await worker.evaluate((source) => {
    globalThis.__imageOutput = JSON.stringify(source)
    globalThis.__structureInvalid = false
    globalThis.__pdfTextOutput = (body) => {
      const visit = (v) =>
        typeof v === "string"
          ? [v]
          : Array.isArray(v)
            ? v.flatMap(visit)
            : v && typeof v === "object"
              ? Object.values(v).flatMap(visit)
              : []
      for (const text of visit(body.input)) {
        const start = text.indexOf('{"format":"image-structure-v1"')
        if (start < 0) continue
        for (let end = text.length; end > start; end--) {
          try {
            const parsed = JSON.parse(text.slice(start, end))
            if (parsed.cells)
              return JSON.stringify({
                cells: __structureInvalid
                  ? parsed.cells.slice(1)
                  : parsed.cells.map((c) => ({ id: c.id, text: `VI ${c.text}` })),
              })
          } catch {}
        }
      }
      return "Unexpected text request"
    }
  }, doc)
  const page = await browser.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  page.setDefaultTimeout(20000)
  const fixture = await browser.newPage()
  await fixture.setViewport({ width: 780, height: 700 })
  await fixture.setContent(
    '<html><body style="background:white;color:#182b42;font:20px Arial;padding:30px"><h2>Register map</h2><p>Read each register before reset.</p><p>Keep the original order.</p><table border="1" cellpadding="12"><tr><th>Name</th><th>Value</th></tr><tr><td>rst_n</td><td>1\'b0</td></tr><tr><td>reserved</td><td></td></tr></table><ol start="8"><li>Check reset</li><li>Read status</li></ol><pre>module test;\n  assign rst_n = 1\'b0;\nendmodule</pre></body></html>',
  )
  const image = path.join(scratch, "structure.png")
  await fixture.screenshot({ path: image })
  await fixture.close()
  const calls = () => worker.evaluate(() => __pdfCalls.length)
  const click = (label) =>
    page.evaluate((name) => {
      const b = [...document.querySelectorAll("button")].find(
        (el) => el.textContent.trim() === name,
      )
      if (!b || b.disabled) throw new Error(`Button unavailable: ${name}`)
      b.click()
    }, label)
  const load = async () => {
    await (await page.waitForSelector('input[type="file"]')).uploadFile(image)
    await page.waitForFunction(() =>
      document.querySelector(".rf-image-status")?.textContent.includes("Chưa gửi ảnh"),
    )
    await click("Toàn ảnh")
  }
  const completed = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="native-selection-output"]')
          ?.getAttribute("aria-busy") === "false" &&
        document.querySelector('[data-testid="native-selection-output"] table'),
    )
  const read = async (label = "Đọc chữ và dịch") => {
    await click(label)
    await completed()
  }
  await page.goto(`chrome-extension://${id}/image-translate.html`)
  await page.waitForSelector('[aria-label="Chế độ dịch ảnh"]')
  await page.select('[aria-label="Chế độ dịch ảnh"]', "structure")
  await load()
  check(
    "Loading/cropping/selecting structure mode makes zero provider requests",
    (await calls()) === 0,
  )
  await read()
  check("Cold structured OCR plus translation makes exactly two requests", (await calls()) === 2)
  check(
    "Source has six typed blocks and a real 3x2 table",
    await page.evaluate(
      () =>
        document.querySelectorAll(".rf-structure-card").length === 6 &&
        document.querySelectorAll('.rf-structure-card[data-block-type="table"] tr').length === 3 &&
        document.querySelectorAll('.rf-structure-card[data-block-type="table"] tr')[2].children[1]
          .textContent === "",
    ),
  )
  check(
    "Numbered lists retain their starting number in source and translated output",
    await page.evaluate(
      () =>
        document.querySelector(".rf-structure-card ol")?.start === 8 &&
        document.querySelector('[data-testid="native-selection-output"] ol')?.start === 8,
    ),
  )
  check(
    "Literal source and translated code keep indentation and are identical",
    await page.evaluate(
      () =>
        document.querySelector(".rf-structure-card pre code")?.textContent ===
          "module test;\n  assign rst_n = 1'b0;\nendmodule" &&
        document
          .querySelector('[data-testid="native-selection-output"] pre code')
          ?.textContent.trimEnd() === "module test;\n  assign rst_n = 1'b0;\nendmodule",
    ),
  )
  check(
    "Only selected image reaches vision; translation contains indexed cells without code or file paths",
    await worker.evaluate(() => {
      const [ocr, translated] = __pdfCalls
      return (
        ocr.url === "https://api.openai.com/v1/responses" &&
        JSON.stringify(ocr.body).includes("input_image") &&
        !JSON.stringify(translated.body).includes("input_image") &&
        !JSON.stringify(translated.body).includes("module test;") &&
        !JSON.stringify(__pdfCalls).includes("structure.png")
      )
    }),
  )
  await read()
  check(
    "Reselecting the same crop reuses OCR and translation with zero requests",
    (await calls()) === 2,
  )
  await page.reload()
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Chế độ dịch ảnh"]')?.value === "structure",
  )
  await load()
  await read()
  check("Structure mode and both text-only caches survive reload", (await calls()) === 2)
  await read("Đọc lại ảnh")
  check(
    "Explicit force-read repeats OCR only when unchanged translation remains cached",
    (await calls()) === 3,
  )
  await page.click('[aria-label="Sửa khối 4"]')
  await page.$eval('[aria-label="Hàng 2, cột 2"]', (el) => el.focus())
  await page.keyboard.down("Control")
  await page.keyboard.press("A")
  await page.keyboard.up("Control")
  await page.keyboard.type("0xF")
  await click("Lưu chỉnh sửa")
  check(
    "Editing a table cell is local, closes stale results, and retains the grid",
    (await calls()) === 3 &&
      !(await page.$('[data-testid="native-selection-output"]')) &&
      (await page.$eval('.rf-structure-card[data-block-type="table"]', (el) =>
        el.textContent.includes("0xF"),
      )),
  )
  await read("Dịch lại cấu trúc")
  check(
    "Translating the edited structure adds one text request without image upload",
    (await calls()) === 4 &&
      (await page.$eval('[data-testid="native-selection-output"] table', (el) =>
        el.textContent.includes("VI 0xF"),
      )),
  )
  await click("Gộp với đoạn sau")
  check(
    "Merging adjacent paragraphs is local and does not flatten the table",
    (await calls()) === 4 && (await page.$$eval(".rf-structure-card", (els) => els.length === 5)),
  )
  await page.click('[aria-label="Sửa khối 2"]')
  await page.click('[aria-label="Nội dung khối 2"]')
  await page.keyboard.down("Control")
  await page.keyboard.press("A")
  await page.keyboard.up("Control")
  await page.keyboard.type("First section\n\nSecond section")
  await page.click('.rf-structure-draft input[type="checkbox"]')
  await click("Lưu chỉnh sửa")
  check(
    "Explicit paragraph split preserves two blocks and makes zero requests",
    (await calls()) === 4 && (await page.$$eval(".rf-structure-card", (els) => els.length === 6)),
  )
  await page.$eval(".rf-structure-card footer button", (el) => {
    const card = el.closest("article")
    ;[...card.querySelectorAll("button")].find((b) => b.textContent === "Bỏ khối").click()
  })
  check(
    "Removing a heading is local and cannot submit removed text",
    (await calls()) === 4 && (await page.$$eval(".rf-structure-card", (els) => els.length === 5)),
  )
  await worker.evaluate(() => {
    __structureInvalid = true
  })
  await click("Dịch lại cấu trúc")
  await page.waitForSelector('[role="alert"]')
  await new Promise((resolve) => setTimeout(resolve, 700))
  check(
    "Incomplete cell replies show an error and never automatically retry",
    (await calls()) === 5 &&
      (await page.$eval(
        '[data-testid="native-selection-output"]',
        (el) => !el.querySelector("table"),
      )),
  )
  await worker.evaluate(() => {
    __structureInvalid = false
  })
  await read("Dịch lại cấu trúc")
  check(
    "Failed output was not cached; an explicit retry sends once and succeeds",
    (await calls()) === 6,
  )
  check(
    "Excluded heading never enters subsequent translation requests",
    await worker.evaluate(() => !JSON.stringify(__pdfCalls.at(-1).body).includes("Register map")),
  )
  await read("Dịch lại cấu trúc")
  check("The completed edited result is reused without another request", (await calls()) === 6)
  await page.evaluate(() => document.querySelector(".rf-structure-editor").scrollIntoView())
  const desktop = path.join(scratch, "structure-desktop.png")
  await page.screenshot({ path: desktop })
  evidence.screenshots.push(desktop)
  await page.setViewport({ width: 390, height: 844 })
  check(
    "Phone layout confines tables to scrolling regions without page overflow",
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.querySelector(".rf-image-result").getBoundingClientRect().width <= innerWidth + 1,
    ),
  )
  await page.evaluate(() => document.querySelector(".rf-image-result").scrollIntoView())
  check(
    "Phone result pane retains usable reading height below controls",
    await page.$eval(".rf-image-result", (el) => el.getBoundingClientRect().height >= 540),
  )
  const mobile = path.join(scratch, "structure-phone.png")
  await page.screenshot({ path: mobile })
  evidence.screenshots.push(mobile)
  await page.setViewport({ width: 1440, height: 1000 })
  await worker.evaluate(() => {
    __pdfDelay = 1000
  })
  await click("Đọc lại ảnh")
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((el) => el.textContent === "Dừng"),
  )
  await worker.evaluate(async () => {
    for (let i = 0; i < 100 && __pdfCalls.length < 7; i++)
      await new Promise((r) => setTimeout(r, 20))
    if (__pdfCalls.length !== 7) throw new Error("Delayed OCR request did not start")
  })
  await click("Dừng")
  await new Promise((resolve) => setTimeout(resolve, 1300))
  check(
    "Stopping delayed OCR prevents a late source/result remount and paid retry",
    (await calls()) === 7 &&
      (await page.$$eval(".rf-structure-card", (els) => els.length === 0)) &&
      !(await page.$('[data-testid="native-selection-output"]')),
  )
  check("Production image flow has no uncaught page errors", errors.length === 0)
  evidence.apiCalls = await calls()
  evidence.success = true
} catch (error) {
  evidence.error = error.stack
  throw error
} finally {
  evidence.pageErrors = errors
  await fs.writeFile(path.join(scratch, "results.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log(`Evidence: ${scratch}`)
}
