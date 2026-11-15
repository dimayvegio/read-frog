import { createHash } from "node:crypto"

const EXPECTED_WORKER_SHA256 = "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d"
function once(source: string, needle: string, replacement: string) {
  if (source.split(needle).length !== 2)
    throw new Error("Pinned Tesseract patch changed; review before building")
  return source.replace(needle, replacement)
}
/** Build-only, pinned vendor transformation. Never loads remote code. */
export function localOnlyOcrWorker(source: string) {
  if (createHash("sha256").update(source).digest("hex") !== EXPECTED_WORKER_SHA256)
    throw new Error("Tesseract 7 worker fingerprint changed; review local-only patch")
  const missing = '(()=>{throw new Error("Explicit local OCR path required")})()'
  let out = once(
    source,
    '"https://cdn.jsdelivr.net/npm/@tesseract.js-data/".concat(i,m?"/4.0.0_best_int":"/4.0.0")',
    missing,
  )
  out = once(
    out,
    '"https://cdn.jsdelivr.net/npm/tesseract.js-core@v".concat(h.substring(1))',
    missing,
  )
  out = once(
    out,
    'r.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(t){if("object"==typeof window)return window}}()',
    "r.g=globalThis",
  )
  const guard = `/* FlowRead: local-only OCR, modified Tesseract.js 7.0.0; Apache-2.0. */
(()=>{const base=new URL(".",self.location.href);if(!["chrome-extension:","moz-extension:"].includes(base.protocol))throw new Error("OCR must run inside the extension");const check=(value,kind)=>{const u=new URL(typeof value==="string"?value:value.url,base);const name=u.pathname.slice(base.pathname.length);if(u.protocol!==base.protocol||u.host!==base.host||!u.pathname.startsWith(base.pathname)||!(kind==="core"?/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\\.wasm\\.js$/.test(name):/^(eng|vie|chi_sim|jpn)\\.traineddata\\.gz$/.test(name)))throw new Error("OCR only accepts bundled assets");return u.href};const load=self.importScripts.bind(self);self.importScripts=(...urls)=>load(...urls.map(u=>check(u,"core")));const fetchLocal=self.fetch.bind(self);self.fetch=(url,options)=>fetchLocal(check(url,"data"),options)})();\n`
  return guard + out
}

/** The only production caller passes explicit packaged paths. Remove vendor CDN defaults. */
export function localOnlyOcrDefaults(source: string) {
  return once(
    source,
    "workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${version}/dist/worker.min.js`",
    "workerPath: undefined",
  )
}
