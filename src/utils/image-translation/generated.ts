import type { GeneratedImage, ImageEditRequest } from "./generated-schema"
import type { Config } from "@/types/config/config"
import { sha256 } from "js-sha256"
import { getLocalConfig } from "@/utils/config/storage"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { sendMessage } from "@/utils/message"
import { imageCacheDB } from "./cache"
import { IMAGE_EDIT_ID, IMAGE_EDIT_PORT, imageEditPng } from "./generated-schema"

// Encoded images remain in this page's RAM only, never image DB1/settings/sync.
const cache = new Map<string, { result: GeneratedImage; expires: number }>()
const MAX_CACHE_CHARS = 48 * 1024 * 1024
let clearEpoch = 0
export function clearGeneratedImages() {
  ++clearEpoch
  cache.clear()
}
/** Shared scope for explicit multi-page image jobs; never starts a provider. */
export async function imageEditScope(config: Config, signal: AbortSignal) {
  const credential = await sendMessage("getOpenAIKeyStatus", undefined)
  const epoch = (await imageCacheDB.meta.get("state"))?.epoch ?? 0
  const localEpoch = clearEpoch
  const target = config.language.targetCode
  const current = async () => {
    signal.throwIfAborted()
    const [next, key, meta] = await Promise.all([
      getLocalConfig(),
      sendMessage("getOpenAIKeyStatus", undefined),
      imageCacheDB.meta.get("state"),
    ])
    signal.throwIfAborted()
    if (
      localEpoch !== clearEpoch ||
      epoch !== (meta?.epoch ?? 0) ||
      key.revision !== credential.revision ||
      next.language.targetCode !== target
    )
      throw new DOMException("Ngôn ngữ, khóa hoặc cache đã đổi; bỏ kết quả cũ.", "AbortError")
  }
  await current()
  return {
    revision: credential.revision,
    identity: JSON.stringify([IMAGE_EDIT_ID, target, credential.revision, epoch, localEpoch]),
    current,
  }
}
export async function generateTranslatedImage({
  image,
  config,
  model,
  quality,
  signal,
  bypass = false,
  onStatus,
}: {
  image: string
  config: Config
  model: ImageEditRequest["model"]
  quality: ImageEditRequest["quality"]
  signal: AbortSignal
  bypass?: boolean
  onStatus: (message: string) => void
}) {
  const scope = await imageEditScope(config, signal)
  const target = config.language.targetCode
  const { current } = scope
  const key = sha256(
    JSON.stringify([IMAGE_EDIT_ID, sha256(image), model, quality, target, scope.identity]),
  )
  for (const [id, item] of cache) if (item.expires <= Date.now()) cache.delete(id)
  const cached = cache.get(key)
  if (!bypass && cached) {
    cache.delete(key)
    cache.set(key, cached)
    onStatus("Dùng ảnh OpenAI đã tạo trong phiên này — không gọi API.")
    return cached.result
  }
  onStatus("OpenAI đang đọc, dịch và tạo ảnh… Có tính phí tạo ảnh; không tự gửi lại.")
  const wire = await createPortStreamPromise<GeneratedImage>(
    IMAGE_EDIT_PORT,
    { image, model, quality, target, revision: scope.revision },
    { signal },
  )
  await current()
  const result = imageEditPng(wire.image.replace(/^data:image\/png;base64,/u, ""))
  // Decode the complete raster too: a valid PNG header alone is insufficient.
  const bitmap = await createImageBitmap(await (await fetch(result.image)).blob())
  try {
    if (bitmap.width !== result.width || bitmap.height !== result.height)
      throw new Error("IE-IMAGE: Ảnh trả về không đầy đủ.")
  } finally {
    bitmap.close()
  }
  await current()
  cache.set(key, { result, expires: Date.now() + 30 * 60_000 })
  while (
    cache.size > 2 ||
    [...cache.values()].reduce((n, item) => n + item.result.image.length, 0) > MAX_CACHE_CHARS
  )
    cache.delete(cache.keys().next().value!)
  onStatus(
    "Đã nhận ảnh OpenAI. Xem ảnh hoặc tải PNG không gọi API; cache giữ trong phiên này tối đa 30 phút.",
  )
  return result
}
