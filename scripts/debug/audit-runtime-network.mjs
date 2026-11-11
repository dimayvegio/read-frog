import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

const root = path.resolve(process.argv[2] ?? ".output/edge-mv3")
const forbidden = [
  "dev.microsofttranslator.com/apps/endpoint",
  "tts.speech.microsoft.com/cognitiveservices",
  "speech.platform.bing.com/consumer/speech",
  "rules.readfrog.app",
  "api.iconify.design",
  "api.simplesvg.com",
  "api.unisvg.com",
  "unpkg.com/@lobehub",
  "https://api.readfrog.app",
]
const scripts = []
async function walk(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) await walk(file)
    else if (file.endsWith(".js")) scripts.push(file)
  }
}
await walk(root)
const found = []
for (const file of scripts) {
  const text = await fs.readFile(file, "utf8")
  for (const endpoint of forbidden) if (text.includes(endpoint)) found.push({ file, endpoint })
}
assert.deepEqual(found, [], "Forbidden service endpoints must not be bundled")
const background = await fs.readFile(path.join(root, "background.js"), "utf8")
assert.ok(background.includes("https://api.openai.com"), "Fixed OpenAI runtime remains present")
console.log(
  JSON.stringify({
    scripts: scripts.length,
    forbiddenEndpoints: found,
    policy:
      "OpenAI content processing; native source GETs and opt-in browser sync remain separate. This static scan complements runtime payload/network regressions.",
  }),
)
