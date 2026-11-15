import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const dir = path.resolve("store/media")
await fs.mkdir(dir, { recursive: true })
const master = await fs.readFile("assets/brand/flowread-horse-master.png"),
  data = "data:image/png;base64," + master.toString("base64")
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  pipe: true,
  args: ["--no-first-run"],
})
try {
  const page = await browser.newPage()
  for (const size of [16, 32, 48, 96, 128, 300]) {
    const png = await page.evaluate(
      async (src, dimension) => {
        const image = new Image()
        image.src = src
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = dimension
        const c = canvas.getContext("2d")
        c.imageSmoothingQuality = "high"
        c.drawImage(image, 0, 0, dimension, dimension)
        return canvas.toDataURL("image/png").split(",")[1]
      },
      data,
      size,
    )
    const bytes = Buffer.from(png, "base64")
    await fs.writeFile(path.join(dir, `icon-${size}.png`), bytes)
    if (size !== 300) await fs.writeFile(`public/icon/${size}.png`, bytes)
    if (size === 128) await fs.writeFile("src/assets/icons/read-frog.png", bytes)
    if ([16, 32, 48].includes(size)) {
      const active = await page.evaluate(
        async (src, dimension) => {
          const image = new Image()
          image.src = src
          await image.decode()
          const canvas = document.createElement("canvas")
          canvas.width = canvas.height = dimension
          const c = canvas.getContext("2d")
          c.imageSmoothingQuality = "high"
          c.drawImage(image, 0, 0, dimension, dimension)
          c.beginPath()
          c.arc(dimension * 0.83, dimension * 0.82, dimension * 0.14, 0, Math.PI * 2)
          c.fillStyle = "#129b63"
          c.fill()
          c.strokeStyle = "#fff"
          c.lineWidth = Math.max(1, dimension * 0.04)
          c.stroke()
          return canvas.toDataURL("image/png").split(",")[1]
        },
        data,
        size,
      )
      await fs.writeFile(`public/icon/${size}-active.png`, Buffer.from(active, "base64"))
    }
  }
  for (const [name, width, height] of [
    ["promo-small", 440, 280],
    ["promo-marquee", 1400, 560],
  ]) {
    const large = width > 500
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#eaf5f2;font-family:'Segoe UI',Arial,sans-serif;color:#123e43}.stage{height:100vh;position:relative;overflow:hidden;padding:${large ? "64px 76px" : "28px"}}.name{font-size:${large ? "31" : "26"}px;font-weight:700;letter-spacing:-1px}h1{font-size:${large ? "70" : "36"}px;line-height:1.05;letter-spacing:-${large ? "3" : "1.3"}px;margin:${large ? "44px 0 22px" : "30px 0 14px"};max-width:${large ? "780" : "270"}px;font-weight:650}p{font-size:${large ? "22" : "14"}px;line-height:1.5;max-width:${large ? "690" : "260"}px;margin:0;color:#376063}.note{position:absolute;bottom:${large ? "42" : "20"}px;left:${large ? "76" : "28"}px;font-size:${large ? "15" : "10"}px;color:#376063}img{position:absolute;right:${large ? "8" : "-12"}px;bottom:${large ? "-22" : "18"}px;width:${large ? "460" : "175"}px;filter:drop-shadow(0 14px 10px #123e4310)}.copy{position:relative;z-index:1}</style><main class="stage"><img src="${data}"/><div class="copy"><div class="name">FlowRead</div><h1>${large ? "Read across<br>languages." : "Read.<br>Listen. Learn."}</h1><p>${large ? "Bilingual webpages, local PDFs, video captions<br>and vocabulary practice." : "Web · PDF · Video"}</p></div><div class="note">Your OpenAI key. AI usage is billed by OpenAI.</div></main>`,
    )
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    await page.screenshot({ path: path.join(dir, name + ".png") })
  }
  console.log(
    JSON.stringify({
      directory: dir,
      horseMaster: "assets/brand/flowread-horse-master.png",
      icons: [16, 32, 48, 96, 128, 300],
      promos: ["440x280", "1400x560"],
    }),
  )
} finally {
  await browser.close()
}
