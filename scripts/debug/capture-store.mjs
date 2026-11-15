import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const scratch = path.resolve(`.codex/store-screens-${Date.now()}`)
await fs.mkdir(scratch, { recursive: true })
const pdf = await PDFDocument.create(),
  font = await pdf.embedFont(StandardFonts.Helvetica),
  bold = await pdf.embedFont(StandardFonts.HelveticaBold)
const page = pdf.addPage([612, 792])
page.drawText("FLOWREAD  /  READING NOTES", {
  x: 48,
  y: 738,
  size: 11,
  font: bold,
  color: rgb(0.13, 0.4, 0.34),
})
page.drawText("A little, every day.", { x: 48, y: 683, size: 30, font: bold })
page.drawText("A short guide to building a reading habit", {
  x: 48,
  y: 653,
  size: 13,
  font,
  color: rgb(0.3, 0.4, 0.4),
})
for (const [text, y] of [
  ["Learning a little every day is more effective", 580],
  ["than studying a lot once a week.", 557],
  ["Regular practice helps us remember new words.", 495],
  ["Read the original paragraph, then compare it", 430],
  ["with the translation. Listen and repeat aloud.", 407],
  ["Small steps can make a lasting difference.", 345],
  ["Use the words in a sentence of your own.", 280],
  ["Take a break and return tomorrow.", 215],
])
  page.drawText(text, { x: 48, y, size: 17, font })
page.drawText("Sample document - generated locally for this product screenshot", {
  x: 48,
  y: 60,
  size: 9,
  font,
  color: rgb(0.4, 0.5, 0.5),
})
const input = path.join(scratch, "A little every day.pdf")
await fs.writeFile(input, await pdf.save())
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  defaultViewport: { width: 1280, height: 800 },
  args: [
    "--no-first-run",
    "--disable-background-networking",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
  ],
})
const shots = [],
  errors = []
try {
  const id = await browser.installExtension(path.resolve(".output/edge-mv3")),
    base = `chrome-extension://${id}/`
  const worker = await (
    await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url() === base + "background.js",
    )
  ).worker()
  const options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await worker.evaluate(() => {
    globalThis.__pdfTextOutput = (body) => {
      const text = JSON.stringify(body)
      const pairs = [
        [
          "Learning a little",
          "Học một chút mỗi ngày hiệu quả hơn việc học thật nhiều một lần mỗi tuần.",
        ],
        ["Regular practice", "Luyện tập thường xuyên giúp chúng ta ghi nhớ những từ mới."],
        [
          "Read the original",
          "Đọc đoạn gốc, sau đó đối chiếu với bản dịch. Nghe và đọc lại thành tiếng.",
        ],
        ["Small steps", "Những bước nhỏ có thể tạo nên sự thay đổi lâu dài."],
        ["Use the words", "Hãy dùng những từ này trong một câu do chính bạn viết."],
        ["Take a break", "Hãy nghỉ ngơi và quay lại vào ngày mai."],
      ]
      return (
        pairs.find(([s]) => text.includes(s))?.[1] ??
        "Một chút mỗi ngày — xây dựng thói quen đọc sách."
      )
    }
  })
  const reader = await browser.newPage()
  reader.on("pageerror", (e) => errors.push(e.message))
  await reader.goto(base + "pdf-reader.html")
  await (await reader.waitForSelector('input[type="file"]')).uploadFile(input)
  await reader.waitForSelector(".rf-pdf-page[data-rendered=true] .textLayer")
  await reader.evaluate(() => document.fonts.ready)
  const shot = async (name) => {
    await reader.screenshot({ path: `store/media/screenshot-${name}.png` })
    shots.push(name)
  }
  await shot("pdf-reader")
  await reader.keyboard.down("Control")
  await reader.keyboard.press("f")
  await reader.keyboard.up("Control")
  await reader.type('[aria-label="Từ khóa PDF"]', "words")
  await reader.keyboard.press("Enter")
  await reader.waitForSelector(".rf-study-result")
  await shot("pdf-search")
  await reader.click('[aria-label="Đóng menu PDF"]')
  // Clear previous search through its real UI, then use a readable fixed zoom in the split view.
  await reader.keyboard.down("Control")
  await reader.keyboard.press("f")
  await reader.keyboard.up("Control")
  await reader.$eval('[aria-label="Từ khóa PDF"]', (n) => {
    n.value = ""
    n.dispatchEvent(new Event("input", { bubbles: true }))
    n.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  })
  await reader.click('[aria-label="Đóng menu PDF"]')
  await reader.reload()
  await (await reader.waitForSelector('input[type="file"]')).uploadFile(input)
  await reader.waitForSelector(".rf-pdf-page[data-rendered=true] .textLayer")
  await reader.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => /^(Song ngữ theo đoạn|Paragraph bilingual)$/.test(b.textContent.trim()))
      ?.click(),
  )
  await reader.waitForSelector(".rf-bilingual-card")
  await reader.select('[aria-label="Thu phóng"]', "0.75")
  const card = await reader.waitForFunction(() =>
    [...document.querySelectorAll(".rf-bilingual-card")].find((n) =>
      n.textContent.includes("Regular practice"),
    ),
  )
  await card.evaluate((n) => {
    n.querySelector("header button:first-child").click()
    n.querySelector("header button:last-child").click()
    n.scrollIntoView({ block: "center" })
  })
  await reader.waitForSelector(".rf-bilingual-output")
  await shot("pdf-bilingual")
  assert.equal(errors.length, 0)
  const policy = await browser.newPage()
  await policy.goto(base + "privacy.html")
  assert.ok((await policy.$eval("body", (n) => n.textContent)).includes("admin@4dv.top"))
  await fs.writeFile(
    path.join(scratch, "evidence.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        viewport: [1280, 800],
        shots,
        errors,
        liveOpenAI: false,
        content: "Synthetic PDF with mocked OpenAI replies, actual production UI",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ shots, evidence: scratch }))
} finally {
  await browser.close()
}
