import { useAtomValue } from "jotai"
import { Sparkles, Wand2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { sendMessage } from "@/utils/message"
import { currentVideoIdAtom, subtitlesVisibleAtom } from "../../../atoms"
import { useSubtitlesUI } from "../../subtitles-ui-context"

function parseAnimeContext(info: { title: string; url: string }) {
  let name = ""
  let ep = ""

  if (info.url) {
    try {
      const parsedUrl = new URL(info.url)
      const pathParts = parsedUrl.pathname.split("/").filter(Boolean)
      const animeIndex = pathParts.indexOf("anime")
      const slug = animeIndex !== -1 ? pathParts[animeIndex + 1] : undefined
      if (slug) {
        const cleanSlug = slug.replace(/-\d+-[a-z0-9]+$/i, "").replace(/-/g, " ")
        if (cleanSlug) {
          name = cleanSlug
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        }
      }
      const epPart = pathParts.find((p) => p.startsWith("tap-") || p.startsWith("ep-"))
      if (epPart) {
        const num = epPart.replace(/^(tap|ep)-/i, "")
        if (num) ep = `Tập ${num}`
      }
    } catch {}
  }

  if (info.title) {
    let cleanTitle = info.title
      .replace(/\s*[-–|•]\s*(ani\.pm|Xem Phim.*|Vietsub.*|Thuyết minh.*|Full HD.*)$/gi, "")
      .trim()
    const epMatch = cleanTitle.match(/(?:Tập|Ep|Episode)\s*(\d+)/i)
    if (epMatch) {
      if (!ep) ep = `Tập ${epMatch[1]}`
      cleanTitle = cleanTitle.replace(/(?:[-–|•]?\s*)?(?:Tập|Ep|Episode)\s*\d+/gi, "").trim()
    }
    if (!name && cleanTitle) {
      name = cleanTitle
    }
  }

  return { name, ep }
}

function buildAnimePrompt(
  name: string,
  ep: string,
  style: "general" | "shounen" | "slice_of_life" | "isekai" = "general",
) {
  const titleStr = name ? `Phim: ${name}${ep ? ` (${ep})` : ""}.` : "Phim: Anime Nhật Bản."
  if (style === "shounen") {
    return `${titleStr} Thể loại: Hành động, chiến đấu.
- Giữ nguyên tên nhân vật và tên tuyệt chiêu theo nguyên tác.
- Xưng hô dứt khoát, hào sảng (ngươi - ta với đối thủ; cậu - tớ / anh - em với đồng đội).
- Câu thoại ngắn gọn, mạnh mẽ, truyền cảm xúc.`
  }
  if (style === "slice_of_life") {
    return `${titleStr} Thể loại: Đời thường, học đường.
- Giữ nguyên tên nhân vật và kính ngữ tiếng Nhật (-san, -kun, -chan, senpai, sensei).
- Xưng hô thân mật tự nhiên (cậu - tớ, anh - em theo quan hệ bạn bè).
- Lời thoại mượt mà, cảm xúc, tự nhiên.`
  }
  if (style === "isekai") {
    return `${titleStr} Thể loại: Giả tưởng ma pháp, isekai.
- Giữ nguyên tên nhân vật, cấp bậc mạo hiểm giả, chức nghiệp, ma pháp.
- Xưng hô chuẩn mực theo quan hệ bang hội và giai cấp.
- Giọng văn trang trọng, lôi cuốn.`
  }
  return `${titleStr}
- Giữ nguyên tên riêng nhân vật và chiêu thức theo nguyên tác anime.
- Dịch xưng hô tự nhiên, linh hoạt theo quan hệ nhân vật (cậu - tớ, anh - em, ngươi - ta).
- Lời thoại ngắn gọn, biểu cảm, không dịch thô cứng máy móc.`
}

function ContextForm() {
  const { getViewerContext, setViewerContext } = useSubtitlesUI()
  const enabled = useAtomValue(subtitlesVisibleAtom)
  const [value, setValue] = useState(() => getViewerContext?.() ?? "")
  const [message, setMessage] = useState("")
  const [detected, setDetected] = useState<{ name: string; ep: string }>({ name: "", ep: "" })

  useEffect(() => {
    let disposed = false
    void sendMessage("getTabContext", undefined)
      .then((context) => {
        if (!disposed && context) {
          const parsed = parseAnimeContext(context)
          if (parsed.name) setDetected(parsed)
        }
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [])

  const applyPreset = (style: "general" | "shounen" | "slice_of_life" | "isekai") => {
    const prompt = buildAnimePrompt(detected.name, detected.ep, style)
    if (value.trim() && !value.includes(prompt.slice(0, 25))) {
      setValue(`${prompt}\n\n- Ghi chú nhân vật:\n${value.trim()}`)
    } else {
      setValue(prompt)
    }
    setMessage("Đã nạp prompt gợi ý. Hãy kiểm tra hoặc chỉnh sửa rồi bấm Áp dụng bên dưới.")
  }

  return (
    <form
      className="space-y-3 p-3 text-xs"
      onSubmit={(event) => {
        event.preventDefault()
        try {
          setViewerContext?.(value)
          setMessage(
            enabled ? "Đã áp dụng cho lượt dịch mới." : "Đã lưu trong tab. Bật phụ đề để dịch.",
          )
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Chưa áp dụng được ngữ cảnh.")
        }
      }}
    >
      {detected.name && (
        <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-foreground">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold flex items-center gap-1 text-[11px]">
              <Sparkles className="size-3 text-primary" />
              Anime: {detected.name} {detected.ep && `· ${detected.ep}`}
            </span>
            <button
              type="button"
              className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
              onClick={() => applyPreset("general")}
            >
              Nạp prompt AI
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">Tên anime, nhân vật, phong cách xưng hô:</span>
        <button
          type="button"
          title="Tự động tạo prompt ngữ cảnh cho phim đang xem"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          onClick={() => applyPreset("general")}
        >
          <Wand2 className="size-3" /> Gợi ý AI
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] hover:bg-muted"
          onClick={() => applyPreset("shounen")}
        >
          ⚔️ Hành động
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] hover:bg-muted"
          onClick={() => applyPreset("slice_of_life")}
        >
          🌸 Đời thường
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] hover:bg-muted"
          onClick={() => applyPreset("isekai")}
        >
          🔮 Ma pháp / Dị giới
        </button>
      </div>

      <label className="block space-y-1">
        <textarea
          aria-label="Ngữ cảnh anime"
          maxLength={1000}
          rows={6}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setMessage("")
          }}
          className="block w-full resize-y rounded-md border border-border bg-background p-2 text-foreground"
          placeholder="One Piece. Luffy là thuyền trưởng; Zoro là kiếm sĩ. Chủ đề: đồng đội, hải tặc. Giữ nguyên tên nhân vật."
        />
      </label>
      <p className="text-muted-foreground">
        Chỉ giữ trong tab đang xem; đổi nguồn video sẽ xóa. Không ghi vào cấu hình hay đồng bộ.
      </p>
      <p className="text-muted-foreground">
        Để dịch phụ đề, chọn SOFT dưới player ani.pm và bật CC English. HARD là chữ đã gắn vào hình
        video, không phải track CC.
      </p>
      <p className="text-muted-foreground">
        Ngữ cảnh giúp thống nhất thuật ngữ và xưng hô, không bảo đảm hiểu toàn bộ phim. Không thêm
        lời thoại.
      </p>
      {enabled && <p>Áp dụng sẽ dịch lại bộ đệm phụ đề với ngữ cảnh mới, có tính phí OpenAI.</p>}
      <Button type="submit" size="sm" className="w-full">
        {enabled ? "Áp dụng và dịch lại" : "Áp dụng ngữ cảnh"}
      </Button>
      <p role="status">{message}</p>
    </form>
  )
}
export function AnimeContextView() {
  const video = useAtomValue(currentVideoIdAtom)
  return <ContextForm key={video} />
}
