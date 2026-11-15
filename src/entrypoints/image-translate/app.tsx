import type { Config } from "@/types/config/config"
import type { ImagePretranslation } from "@/types/image-translation"
import type { NativeSelectionRequest } from "@/types/native-selection"
import type { GeneratedImage, ImageEditRequest } from "@/utils/image-translation/generated-schema"
import type { OverlayImage } from "@/utils/image-translation/overlay-model"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { browser } from "#imports"
import { TargetLanguageSelector } from "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/target-language-selector"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { clearImageCache } from "@/utils/image-translation/cache"
import { clearGeneratedImages, generateTranslatedImage } from "@/utils/image-translation/generated"
import {
  imageEditModel,
  imageEditQuality,
  imageEditOutputSize,
} from "@/utils/image-translation/generated-schema"
import { detectOverlayRegions } from "@/utils/image-translation/overlay-ocr"
import { recognizeImage } from "@/utils/image-translation/recognize"
import { imageShortcutLabel, openImageShortcuts } from "@/utils/image-translation/shortcut"
import {
  imageStructureSchema,
  renderImageStructure,
  type ImageStructure,
} from "@/utils/image-translation/structure"
import { sendMessage } from "@/utils/message"
import { DEFAULT_PDF_TEXT_OPTIONS } from "@/utils/selection-result/pdf-text"
import { SelectionTranslation } from "../selection-result/app"
import { GeneratedImageView } from "./generated-view"
import { cropBetween, decodeImage, encodeCrop, type Point, type Crop } from "./image"
import { ImageOverlayEditor } from "./overlay-editor"
import { ImageStructureEditor } from "./structure-editor"

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 }
export function ImageTranslation({ config }: { config: Config }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null)
  const start = useRef<Point | null>(null),
    version = useRef(0),
    controller = useRef<AbortController | null>(null)
  const [hasImage, setHasImage] = useState(false),
    [crop, setCrop] = useState<Crop | null>(null)
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("")
  const [loadingImage, setLoadingImage] = useState(false)
  const [text, setText] = useState(""),
    [preview, setPreview] = useState("")
  const [request, setRequest] = useState<NativeSelectionRequest | null>(null)
  const [pretranslated, setPretranslated] = useState<ImagePretranslation>()
  const [fastOutput, setFastOutput] = useState("")
  const [mode, setMode] = useState<"generate" | "fast" | "two-step" | "structure" | "overlay">(
    "generate",
  )
  const [generated, setGenerated] = useState<GeneratedImage>()
  const [model, setModel] = useState<ImageEditRequest["model"]>("gpt-image-2.6-sunburst")
  const [quality, setQuality] = useState<ImageEditRequest["quality"]>("high")
  const [outputSize, setOutputSize] = useState<NonNullable<ImageEditRequest["outputSize"]>>("auto")
  const { targetCode } = useAtomValue(configFieldsAtomMap.language)
  const previousTarget = useRef(targetCode)
  const activeMode = useRef(mode)
  useEffect(() => {
    activeMode.current = mode
  }, [mode])
  const [structure, setStructure] = useState<ImageStructure>()
  const [overlay, setOverlay] = useState<OverlayImage>()
  const [ocrLanguage, setOcrLanguage] = useState("eng")
  const modeChanged = useRef(false)
  const running = useRef(false)
  const [shortcut, setShortcut] = useState("")
  const [options, setOptions] = useState(DEFAULT_PDF_TEXT_OPTIONS)
  const resetRun = () => {
    ++version.current
    start.current = null
    controller.current?.abort()
    running.current = false
    setBusy(false)
    setRequest(null)
    setPretranslated(undefined)
    setFastOutput("")
    setStructure(undefined)
    setOverlay(undefined)
    setGenerated(undefined)
    setStatus("")
    setError("")
  }
  useEffect(() => {
    if (previousTarget.current === targetCode) return
    previousTarget.current = targetCode
    if (activeMode.current === "generate") {
      resetRun()
      setStatus("Đã đổi ngôn ngữ. Bấm Tạo ảnh dịch khi sẵn sàng; chưa gọi API.")
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- resetRun only invalidates owned work; depend on the selected target.
  }, [targetCode])
  const load = async (file: Blob) => {
    resetRun()
    setLoadingImage(true)
    const token = version.current
    setError("")
    setStatus("Đang mở ảnh trên máy…")
    setCrop(null)
    setText("")
    setPreview("")
    try {
      const image = await decodeImage(file)
      if (token !== version.current) {
        image.close()
        return
      }
      if (
        (activeMode.current === "overlay" || activeMode.current === "generate") &&
        (image.width * image.height > 12_000_000 || Math.max(image.width, image.height) > 6000)
      ) {
        image.close()
        throw new Error(
          "Ảnh quá lớn để giữ nguyên pixel trong editor (12 triệu pixel / cạnh 6.000). Hãy mở một ảnh/crop nhỏ hơn.",
        )
      }
      // Limit the editor backing canvas; cropped payloads are bounded again.
      const scale = Math.min(
        1,
        Math.sqrt(12_000_000 / (image.width * image.height)),
        6000 / Math.max(image.width, image.height),
      )
      const element = canvas.current!
      element.width = Math.round(image.width * scale)
      element.height = Math.round(image.height * scale)
      try {
        element.getContext("2d")!.drawImage(image, 0, 0, element.width, element.height)
      } finally {
        image.close()
      }
      setHasImage(true)
      setStatus("Kéo chọn vùng chữ, hoặc bấm Toàn ảnh. Chưa gửi ảnh tới OpenAI.")
    } catch (cause) {
      if (token === version.current) {
        setError(cause instanceof Error ? cause.message : "Không mở được ảnh.")
        setStatus("")
      }
    } finally {
      if (token === version.current) setLoadingImage(false)
    }
  }
  useEffect(() => {
    void imageShortcutLabel()
      .then(setShortcut)
      .catch(() => setShortcut("Chưa gán"))
    void browser.storage.local
      .get(["imageTranslationMode", "imageGenerationPreferredV1"])
      .then((value) => {
        if (
          !modeChanged.current &&
          value.imageGenerationPreferredV1 === true &&
          (value.imageTranslationMode === "fast" ||
            value.imageTranslationMode === "generate" ||
            value.imageTranslationMode === "two-step" ||
            value.imageTranslationMode === "structure" ||
            value.imageTranslationMode === "overlay")
        )
          setMode(value.imageTranslationMode)
        if (!value.imageGenerationPreferredV1 && !modeChanged.current)
          void browser.storage.local
            .set({ imageGenerationPreferredV1: true, imageTranslationMode: "generate" })
            .catch(() => {})
      })
    if (new URLSearchParams(location.search).has("captureError"))
      setError("Chưa chụp được tab này. Hãy thử lại hoặc dùng Win+Shift+S rồi dán Ctrl+V tại đây.")
    const token = version.current,
      channel = new URLSearchParams(location.search).get("capture")
    if (channel) setLoadingImage(true)
    if (channel)
      void (async () => {
        try {
          const value = await sendMessage("consumeCapturedImage", { channel })
          if (version.current !== token) return
          if (!value)
            throw new Error("Ảnh chụp đã hết phiên. Hãy chụp lại hoặc dán ảnh bằng Ctrl+V.")
          const response = await fetch(value.image)
          const blob = await response.blob()
          if (version.current === token) await load(blob)
        } catch {
          if (version.current === token) {
            setError("Ảnh chụp đã hết phiên. Hãy chụp lại hoặc dán ảnh bằng Ctrl+V.")
            setLoadingImage(false)
          }
        }
      })()
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((candidate) =>
        candidate.type.startsWith("image/"),
      )
      if (file) {
        event.preventDefault()
        void load(file)
      }
    }
    const abort = () => controller.current?.abort()
    document.addEventListener("paste", paste)
    window.addEventListener("pagehide", abort)
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- invalidate pending image decoding, not a DOM ref.
      ++version.current
      controller.current?.abort()
      document.removeEventListener("paste", paste)
      window.removeEventListener("pagehide", abort)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- startup channel is one-use; file and clipboard actions explicitly load later images.
  }, [])
  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }
  const translateText = (value: string) =>
    setRequest({
      id: getRandomUUID(),
      text: value,
      createdAt: Date.now(),
      tooLong: value.length > MAX_NATIVE_SELECTION_LENGTH,
    })
  const recognize = async (bypass = false) => {
    if (running.current || !crop || !canvas.current || !hasImage) return
    resetRun()
    running.current = true
    const token = version.current,
      abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setText("")
    try {
      const image = encodeCrop(
        canvas.current,
        canvas.current.width,
        canvas.current.height,
        crop,
        mode === "overlay" || mode === "generate",
      )
      setPreview(image)
      const current = await getLocalConfig()
      abort.signal.throwIfAborted()
      if (mode === "generate") {
        const result = await generateTranslatedImage({
          image,
          config: current,
          model,
          quality,
          outputSize,
          signal: abort.signal,
          bypass,
          onStatus: (message) => {
            if (token === version.current && !abort.signal.aborted) setStatus(message)
          },
        })
        abort.signal.throwIfAborted()
        if (token === version.current) setGenerated(result)
        return
      }
      if (mode === "overlay") {
        const geometry = await detectOverlayRegions(image, ocrLanguage, abort.signal, (message) => {
          if (token === version.current && !abort.signal.aborted) setStatus(message)
        })
        abort.signal.throwIfAborted()
        if (token !== version.current) return
        if (token === version.current) {
          setOverlay({ image, ...geometry })
          setStatus(
            geometry.regions.length
              ? "Kiểm tra các vùng đo trên máy rồi bấm Dịch vùng đang bật. Tiến trình hiển thị ở khung bên phải."
              : "Chưa dò được chữ. Bấm Thêm vùng chữ để chọn trên ảnh, rồi bấm Dịch vùng đang bật khi sẵn sàng.",
          )
        }
        return
      }
      const result = await recognizeImage({
        image,
        mode,
        config: current,
        options,
        signal: abort.signal,
        bypass,
        onStatus: (message) => {
          if (token === version.current && !abort.signal.aborted) setStatus(message)
        },
        onChunk: (original, translation) => {
          if (token !== version.current || abort.signal.aborted) return
          if (original.length > MAX_NATIVE_SELECTION_LENGTH || translation.length > 60000) {
            abort.abort()
            setError("Ảnh chứa quá nhiều chữ (tối đa 20.000 ký tự). Hãy chọn vùng nhỏ hơn.")
            setStatus("")
            setBusy(false)
            return
          }
          setText(original)
          setFastOutput(translation)
        },
      })
      abort.signal.throwIfAborted()
      if (token !== version.current) return
      setText(result.original)
      setPretranslated(result.pretranslated)
      setStructure(result.structure)
      setFastOutput("")
      translateText(result.original)
    } catch (cause) {
      if (!abort.signal.aborted && token === version.current) {
        setError(cause instanceof Error ? cause.message : "Không đọc được ảnh.")
        setStatus("")
      }
    } finally {
      if (token === version.current) {
        running.current = false
        setBusy(false)
      }
    }
  }
  return (
    <main
      className="rf-image-app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) void load(file)
      }}
    >
      <header className="rf-image-toolbar">
        <strong>FlowRead · Dịch ảnh</strong>
        <label>
          Chế độ{" "}
          <select
            aria-label="Chế độ dịch ảnh"
            value={mode}
            disabled={busy || loadingImage}
            onChange={(event) => {
              if (loadingImage) return
              const value =
                event.target.value === "generate"
                  ? "generate"
                  : event.target.value === "overlay"
                    ? "overlay"
                    : event.target.value === "structure"
                      ? "structure"
                      : event.target.value === "fast"
                        ? "fast"
                        : "two-step"
              modeChanged.current = true
              resetRun()
              setText("")
              setMode(value)
              void browser.storage.local
                .set({ imageTranslationMode: value, imageGenerationPreferredV1: true })
                .catch(() => {})
            }}
          >
            <option value="generate">OpenAI tạo ảnh dịch</option>
            <option value="fast">Nhanh — một lượt</option>
            <option value="two-step">Đọc chữ trước — hai bước</option>
            <option value="structure">Giữ cấu trúc — bảng, danh sách, code</option>
            <option value="overlay">Thay chữ trên máy — chỉnh vùng thủ công</option>
          </select>
        </label>
        {mode === "generate" && (
          <>
            <TargetLanguageSelector />
            <label>
              Model{" "}
              <select
                aria-label="Model tạo ảnh"
                value={model}
                disabled={busy || loadingImage}
                onChange={(e) => {
                  resetRun()
                  setModel(imageEditModel.parse(e.target.value))
                }}
              >
                <option value="gpt-image-2.6-sunburst">GPT Image 2.6 Sunburst</option>
                <option value="gpt-image-2.6-flare">GPT Image 2.6 Flare</option>
                <option value="gpt-image-2.5-sunburst">GPT Image 2.5 Sunburst</option>
              </select>
            </label>
            <label>
              Chất lượng{" "}
              <select
                aria-label="Chất lượng ảnh"
                value={quality}
                disabled={busy || loadingImage}
                onChange={(e) => {
                  resetRun()
                  setQuality(imageEditQuality.parse(e.target.value))
                }}
              >
                <option value="high">Cao</option>
                <option value="xhigh">Rất cao</option>
                <option value="max">Tối đa</option>
                <option value="medium">Vừa</option>
                <option value="low">Thấp</option>
              </select>
            </label>
            <label>
              Ảnh đầu ra{" "}
              <select
                aria-label="Kích thước ảnh OpenAI"
                value={outputSize}
                disabled={busy || loadingImage}
                onChange={(e) => {
                  resetRun()
                  setOutputSize(imageEditOutputSize.parse(e.target.value))
                }}
              >
                <option value="auto">Tự động</option>
                <option value="1k">1K — khoảng 1 MP</option>
                <option value="2k">2K — khoảng 4 MP</option>
                <option value="4k">4K — tối đa 8 MP (thử nghiệm)</option>
              </select>
            </label>
          </>
        )}
        {mode === "overlay" && (
          <label>
            OCR vị trí{" "}
            <select
              aria-label="Ngôn ngữ OCR vị trí"
              value={ocrLanguage}
              disabled={busy || loadingImage}
              onChange={(e) => {
                resetRun()
                setOcrLanguage(e.target.value)
              }}
            >
              <option value="eng">English</option>
              <option value="vie">Tiếng Việt + English</option>
              <option value="chi_sim">中文 + English</option>
              <option value="jpn">日本語 + English</option>
            </select>
          </label>
        )}
        <button type="button" onClick={() => input.current?.click()}>
          Mở ảnh
        </button>
        <input
          ref={input}
          aria-label="Chọn ảnh"
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void load(file)
          }}
        />
        <button
          type="button"
          disabled={!hasImage || busy || loadingImage}
          onClick={() => {
            resetRun()
            setCrop(FULL)
            setText("")
            setPreview("")
          }}
        >
          Toàn ảnh
        </button>
        <button
          type="button"
          disabled={!hasImage || busy || loadingImage}
          onClick={() => {
            resetRun()
            setCrop(null)
            setPreview("")
            setText("")
          }}
        >
          Chọn lại vùng
        </button>
        <button
          type="button"
          className="rf-image-primary"
          disabled={!crop || busy || loadingImage}
          onClick={() => void recognize(false)}
        >
          {mode === "generate"
            ? "Tạo ảnh dịch"
            : mode === "overlay"
              ? "Đo vùng chữ"
              : "Đọc chữ và dịch"}
        </button>
        <button
          type="button"
          disabled={!crop || busy || loadingImage}
          onClick={() => void recognize(true)}
        >
          {mode === "generate"
            ? "Tạo ảnh mới (có phí)"
            : mode === "overlay"
              ? "Đo lại vùng"
              : "Đọc lại ảnh"}
        </button>
        <button
          type="button"
          disabled={loadingImage}
          onClick={async () => {
            resetRun()
            setText("")
            const token = version.current
            try {
              await clearImageCache()
              clearGeneratedImages()
              if (token === version.current)
                setStatus("Đã xóa cache nhận dạng và bản dịch ảnh trên máy.")
            } catch {
              if (token === version.current) setError("Chưa xóa được cache. Hãy thử lại.")
            }
          }}
        >
          Xóa cache ảnh
        </button>
        <button type="button" onClick={() => void openImageShortcuts()}>
          Phím tắt: {shortcut}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              resetRun()
              setStatus(
                mode === "generate"
                  ? "Đã dừng chờ ảnh. OpenAI có thể đã nhận/tính phí; không tự gửi lại."
                  : "Đã dừng đọc ảnh.",
              )
            }}
          >
            Dừng
          </button>
        )}
        <button
          type="button"
          onClick={() => void sendMessage("openOptionsPage", { route: "/api-providers" })}
        >
          OpenAI Settings
        </button>
      </header>
      <p className="rf-image-help">
        Chụp từ popup extension, hoặc Win+Shift+S rồi dán Ctrl+V tại đây. Chỉ vùng bạn chọn được gửi
        tới OpenAI sau khi bấm đọc và dịch.
      </p>
      {mode === "generate" && (
        <p className="rf-image-help">
          Gửi vùng ảnh trực tiếp để OpenAI dịch chữ và tạo ảnh, giữ bố cục tối đa. Hiển thị/tải
          nguyên PNG trả về; có phí tạo ảnh riêng. Font, chữ nhỏ và bố cục có thể chưa giống tuyệt
          đối. Không áp dụng prompt/glossary của chế độ dịch văn bản.
        </p>
      )}
      {mode === "structure" && (
        <p className="rf-image-help">
          Giữ cấu trúc: đọc ảnh rồi dịch theo từng khối / ô. Hai lượt khi chưa có cache; không phục
          dựng chính xác font, màu hoặc vị trí.
        </p>
      )}
      {mode === "overlay" && (
        <p className="rf-image-help">
          Giữ ảnh gốc, đo vùng chữ bằng OCR local, rồi OpenAI đọc và dịch. Font/nền hoa văn và bản
          dịch dài có thể cần chỉnh; không bảo đảm giống tuyệt đối tự động.
        </p>
      )}
      <p role="status" className="rf-image-status">
        {status}
      </p>
      {error && (
        <p role="alert" className="rf-image-error">
          {error}
        </p>
      )}
      <div className="rf-image-body">
        <section
          className="rf-image-editor"
          aria-label="Chọn vùng ảnh"
          hidden={!!overlay || !!generated}
        >
          {!hasImage && (
            <div className="rf-image-empty">
              Dán ảnh bằng <strong>Ctrl+V</strong>, kéo thả ảnh hoặc bấm <strong>Mở ảnh</strong>.
              <br />
              Hỗ trợ PNG, JPEG, WebP. Bạn có thể dịch chữ trong ảnh và PDF scan.
            </div>
          )}
          <div className="rf-image-scroll">
            <div className="rf-image-canvas-wrap" hidden={!hasImage}>
              <canvas
                ref={canvas}
                aria-label="Kéo chọn vùng cần dịch"
                onPointerDown={(event) => {
                  if (busy || loadingImage) return
                  resetRun()
                  setText("")
                  start.current = point(event)
                  setCrop(null)
                  setPreview("")
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (start.current) setCrop(cropBetween(start.current, point(event)))
                }}
                onPointerUp={(event) => {
                  if (start.current) {
                    setCrop(cropBetween(start.current, point(event)))
                    start.current = null
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                }}
                onPointerCancel={() => {
                  start.current = null
                  setCrop(null)
                }}
              />
              {crop && (
                <div
                  className="rf-image-crop"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
          {preview && (
            <details className="rf-image-preview">
              <summary>Vùng ảnh dùng để đọc chữ</summary>
              <img src={preview} alt="Vùng ảnh gửi để đọc chữ" />
            </details>
          )}
          {structure && (
            <>
              <ImageStructureEditor
                value={structure}
                disabled={busy || loadingImage}
                onChange={(next) => {
                  try {
                    const value = imageStructureSchema.parse(next)
                    const rendered = renderImageStructure(value)
                    if (rendered.length > MAX_NATIVE_SELECTION_LENGTH)
                      throw new Error("Cấu trúc quá dài; hãy giảm nội dung.")
                    setRequest(null)
                    setPretranslated(undefined)
                    setStructure(value)
                    setText(rendered)
                    setError("")
                    setStatus(
                      "Đã sửa cấu trúc trên máy. Bấm Dịch lại cấu trúc để cập nhật bản dịch.",
                    )
                    return true
                  } catch {
                    setError(
                      "Chưa lưu được: tối đa 128 khối / 20.000 ký tự, bảng phải cùng số cột; hãy giảm nội dung.",
                    )
                    return false
                  }
                }}
              />
              <button
                className="rf-structure-translate"
                type="button"
                disabled={busy || loadingImage}
                onClick={() => translateText(text)}
              >
                Dịch lại cấu trúc
              </button>
            </>
          )}
          {text && !structure && (
            <section className="rf-image-text">
              <label htmlFor="image-ocr-text">
                Văn bản đọc từ ảnh — có thể sửa trước khi dịch lại
              </label>
              <textarea
                id="image-ocr-text"
                value={text}
                disabled={busy || loadingImage}
                onChange={(event) => setText(event.target.value)}
                maxLength={MAX_NATIVE_SELECTION_LENGTH}
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => {
                  setRequest(null)
                  setPretranslated(undefined)
                  translateText(text.trim())
                }}
              >
                Dịch lại văn bản
              </button>
            </section>
          )}
        </section>
        {overlay && <ImageOverlayEditor value={overlay} />}
        {generated && <GeneratedImageView value={generated} source={preview} />}
        {busy && fastOutput && (
          <aside className="rf-image-result">
            <p className="p-4 text-sm" role="status">
              Đang dịch trong một lượt…
            </p>
            <div
              className="overflow-y-auto p-4 whitespace-pre-wrap"
              aria-live="polite"
              aria-busy="true"
            >
              {fastOutput}
            </div>
          </aside>
        )}
        {request && (
          <aside className="rf-image-result">
            <button type="button" className="rf-image-close" onClick={() => setRequest(null)}>
              Đóng khung dịch ×
            </button>
            <SelectionTranslation
              key={request.id}
              request={request}
              config={config}
              panel
              embedded
              sourceTitle="Ảnh chụp"
              imageCache
              pretranslated={pretranslated}
              imageStructure={structure}
              textOptions={options}
              onTextOptions={setOptions}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
