import fs from "node:fs/promises"
// Offline policy is generated from versioned policy, without scripts or remote assets.
const source = await fs.readFile("PRIVACY_POLICY.md", "utf8")
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const blocks = source
  .trim()
  .split(/\r?\n\r?\n/)
  .map((block) => {
    const tag = block.startsWith("# ") ? "h1" : block.startsWith("## ") ? "h2" : "p"
    let text = escape(
      block
        .replace(/^#{1,2} /, "")
        .replaceAll("**", "")
        .replaceAll("`", ""),
    )
    text = text.replace(
      /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
      '<a href="$2" rel="noreferrer">$1</a>',
    )
    return `<${tag}>${text}</${tag}>`
  })
await fs.writeFile(
  "public/privacy.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlowRead Privacy Policy</title><style>body{max-width:850px;margin:40px auto;padding:0 24px;font:17px/1.65 system-ui;color:#173d39;background:#f8fbfa}h1{font-size:32px}h2{margin-top:32px;font-size:23px}p{overflow-wrap:anywhere}a{color:#176351}</style><main>${blocks.join("")}</main></html>\n`,
)
