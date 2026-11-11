import type { Config } from "@/types/config/config"
import type { ImagePretranslation } from "@/types/image-translation"
import type { NativeSelectionRequest } from "@/types/native-selection"
import { useEffect, useRef, useState } from "react"
import { browser } from "#imports"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { getLocalConfig } from "@/utils/config/storage"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { clearImageCache } from "@/utils/image-translation/cache"
import { recognizeImage } from "@/utils/image-translation/recognize"
import { imageShortcutLabel, openImageShortcuts } from "@/utils/image-translation/shortcut"
import { sendMessage } from "@/utils/message"
import { DEFAULT_PDF_TEXT_OPTIONS } from "@/utils/selection-result/pdf-text"
import { SelectionTranslation } from "../selection-result/app"
import { cropBetween, decodeImage, encodeCrop, type Point, type Crop } from "./image"

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
  const [mode, setMode] = useState<"fast" | "two-step">("fast")
  const modeChanged = useRef(false)
  const [shortcut, setShortcut] = useState("")
  const [options, setOptions] = useState(DEFAULT_PDF_TEXT_OPTIONS)
  const resetRun = () => {
    ++version.current
    start.current = null
    controller.current?.abort()
    setBusy(false)
    setRequest(null)
    setPretranslated(undefined)
    setFastOutput("")
    setStatus("")
    setError("")
  }
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
    void browser.storage.local.get("imageTranslationMode").then((value) => {
      if (
        !modeChanged.current &&
        (value.imageTranslationMode === "fast" || value.imageTranslationMode === "two-step")
      )
        setMode(value.imageTranslationMode)
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
    if (!crop || !canvas.current || !hasImage) return
    resetRun()
    const token = version.current,
      abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setText("")
    try {
      const image = encodeCrop(canvas.current, canvas.current.width, canvas.current.height, crop)
      setPreview(image)
      const current = await getLocalConfig()
      abort.signal.throwIfAborted()
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
      setFastOutput("")
      translateText(result.original)
    } catch (cause) {
      if (!abort.signal.aborted && token === version.current) {
        setError(cause instanceof Error ? cause.message : "Không đọc được ảnh.")
        setStatus("")
      }
    } finally {
      if (token === version.current) setBusy(false)
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
        <strong>Read Frog · Dịch ảnh</strong>
        <label>
          Chế độ{" "}
          <select
            aria-label="Chế độ dịch ảnh"
            value={mode}
            disabled={busy || loadingImage}
            onChange={(event) => {
              if (loadingImage) return
              const value = event.target.value === "fast" ? "fast" : "two-step"
              modeChanged.current = true
              resetRun()
              setText("")
              setMode(value)
              void browser.storage.local.set({ imageTranslationMode: value }).catch(() => {})
            }}
          >
            <option value="fast">Nhanh — một lượt</option>
            <option value="two-step">Đọc chữ trước — hai bước</option>
          </select>
        </label>
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
          Đọc chữ và dịch
        </button>
        <button
          type="button"
          disabled={!crop || busy || loadingImage}
          onClick={() => void recognize(true)}
        >
          Đọc lại ảnh
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
              setStatus("Đã dừng đọc ảnh.")
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
      <p role="status" className="rf-image-status">
        {status}
      </p>
      {error && (
        <p role="alert" className="rf-image-error">
          {error}
        </p>
      )}
      <div className="rf-image-body">
        <section className="rf-image-editor" aria-label="Chọn vùng ảnh">
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
          {text && (
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
              textOptions={options}
              onTextOptions={setOptions}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
