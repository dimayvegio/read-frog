import type { Browser } from "wxt/browser"
import { browser } from "#imports"
import { getLocalConfig } from "@/utils/config/storage"
import {
  imageEditRequest,
  imageEditPrompt,
  imageEditPng,
  MAX_IMAGE_EDIT_BASE64,
  requestedImageSize,
  type ImageEditRequest,
} from "@/utils/image-translation/generated-schema"
import {
  BackgroundStreamError,
  createStartMessageParser,
  createStreamPortHandler,
} from "./background-stream"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential } from "./openai-credentials"
import { isTrustedOptionsSender } from "./settings-sender"
import { beginUsage } from "./usage"
const fail = (message: string) => new BackgroundStreamError("image_edit", message)
let active = 0
export async function executeImageEdit(
  input: ImageEditRequest,
  options: { signal?: AbortSignal } = {},
) {
  const value = imageEditRequest.parse(input)
  let size = "auto"
  if (value.outputSize && value.outputSize !== "auto") {
    try {
      if (!value.image.startsWith("data:image/png;base64,")) throw new Error()
      const source = imageEditPng(value.image.slice("data:image/png;base64,".length))
      size = requestedImageSize(value.outputSize, source.width, source.height)
    } catch {
      throw fail(
        "IE-SIZE: Không xác định được kích thước phù hợp. Chọn Tự động, nguồn PNG hoặc vùng ảnh có tỷ lệ trong 1:3–3:1; chưa gửi OpenAI.",
      )
    }
  }
  options.signal?.throwIfAborted()
  if (active >= 2)
    throw fail("IE-BUSY: Đang tạo ảnh khác; chờ hoàn tất hoặc dừng trước khi tạo tiếp.")
  active++
  const timeout = AbortSignal.timeout(10 * 60 * 1000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  let span: Awaited<ReturnType<typeof beginUsage>> | undefined
  try {
    await ensureInitializedConfig()
    const credential = await readOpenAIExecutionCredential()
    if (!credential.apiKey || credential.revision !== value.revision)
      throw fail("IE-KEY: Khóa OpenAI chưa có hoặc đã đổi; kiểm tra OpenAI Settings.")
    if ((await getLocalConfig()).language.targetCode !== value.target)
      throw fail("IE-TARGET: Ngôn ngữ đã đổi; hãy bấm tạo ảnh lại khi sẵn sàng.")
    signal.throwIfAborted()
    span = await beginUsage("image", value.model)
    let response: Response
    try {
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        credentials: "omit",
        redirect: "error",
        signal,
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: value.model,
          images: [{ image_url: value.image }],
          prompt: imageEditPrompt(value.target, value.extraInstructions),
          n: 1,
          size,
          quality: value.quality,
          output_format: "png",
          // Receive headers early for long-running MV3 requests. Never display
          // or cache a partial image: only the completed PNG is accepted.
          stream: true,
          partial_images: 0,
        }),
      })
    } catch (issue) {
      if (signal.aborted) throw issue
      throw fail(
        "IE-NETWORK: Không kết nối được OpenAI. Không tự gửi lại; yêu cầu có thể đã được nhận.",
      )
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw fail(
        `IE-HTTP-${response.status}: ` +
          (response.status === 401
            ? "Khóa OpenAI không được chấp nhận."
            : response.status === 403 || response.status === 404
              ? `Tài khoản chưa có quyền hoặc không tìm thấy ${value.model}. Chọn model khác hoặc kiểm tra quyền API; không tự đổi model.`
              : response.status === 429
                ? "OpenAI giới hạn yêu cầu hoặc hết hạn mức; không tự gửi lại."
                : "OpenAI chưa xử lý được yêu cầu tạo ảnh; không tự gửi lại."),
      )
    }
    if (!response.body) throw fail("IE-RESPONSE: OpenAI không trả nội dung ảnh.")
    const reader = response.body.getReader(),
      decoder = new TextDecoder("utf-8", { fatal: true })
    const cancel = () => {
      void reader.cancel().catch(() => {})
    }
    signal.addEventListener("abort", cancel, { once: true })
    let bytes = 0,
      raw = ""
    try {
      while (true) {
        signal.throwIfAborted()
        const next = await reader.read()
        if (next.done) break
        bytes += next.value.length
        if (bytes > MAX_IMAGE_EDIT_BASE64 + 1024 * 1024)
          throw fail("IE-SIZE: Phản hồi ảnh quá lớn; chưa nhận kết quả.")
        raw += decoder.decode(next.value, { stream: true })
      }
      raw += decoder.decode()
    } finally {
      signal.removeEventListener("abort", cancel)
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    signal.throwIfAborted()
    let result
    try {
      let base64: unknown
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const events = raw.split(/\r?\n\r?\n/u).flatMap((event) => {
          const data = event
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
          return data && data !== "[DONE]" ? [JSON.parse(data)] : []
        })
        if (
          events.some(
            (event) => event.type === "error" || event.type === "image_edit.failed" || event.error,
          )
        )
          throw new Error()
        const complete = events.filter((event) => event.type === "image_edit.completed")
        if (complete.length !== 1) throw new Error()
        base64 = complete[0].b64_json
      } else {
        const body = JSON.parse(raw)
        if (!Array.isArray(body.data) || body.data.length !== 1) throw new Error()
        base64 = body.data[0]?.b64_json
      }
      if (typeof base64 !== "string") throw new Error()
      result = imageEditPng(base64)
    } catch {
      throw fail(
        "IE-IMAGE: OpenAI chưa trả ảnh PNG hoàn chỉnh/hợp lệ. Không tải URL hoặc tự tạo lại.",
      )
    }
    const current = await readOpenAIExecutionCredential()
    signal.throwIfAborted()
    if (
      current.revision !== value.revision ||
      !current.apiKey ||
      (await getLocalConfig()).language.targetCode !== value.target
    )
      throw fail("IE-STALE: Khóa hoặc ngôn ngữ đã đổi trong lúc tạo ảnh; bỏ kết quả cũ.")
    // Mixed text/image generation tokens are not priced as ordinary text tokens.
    await span.finish("complete")
    return result
  } catch (issue) {
    await span?.finish(signal.aborted ? "cancelled" : "error")
    if (options.signal?.aborted) throw issue
    if (timeout.aborted)
      throw fail("IE-TIMEOUT: Hết thời gian chờ ảnh. Yêu cầu có thể đã tính phí; không tự tạo lại.")
    if (issue instanceof BackgroundStreamError) throw issue
    throw fail("IE-RESPONSE: Chưa nhận được ảnh OpenAI hợp lệ; không tự gửi lại.")
  } finally {
    active--
  }
}
const handler = createStreamPortHandler(
  executeImageEdit,
  createStartMessageParser<ImageEditRequest>(imageEditRequest),
)
export function handleImageEditPort(port: Browser.runtime.Port) {
  if (
    !(["/image-translate.html", "/pdf-reader.html"] as const).some((page) =>
      isTrustedOptionsSender(port.sender, browser.runtime.id, browser.runtime.getURL(page)),
    )
  ) {
    port.disconnect()
    return
  }
  handler(port)
}
