import { useAtomValue } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { currentVideoIdAtom, subtitlesVisibleAtom } from "../../../atoms"
import { useSubtitlesUI } from "../../subtitles-ui-context"

function ContextForm() {
  const { getViewerContext, setViewerContext } = useSubtitlesUI()
  const enabled = useAtomValue(subtitlesVisibleAtom)
  const [value, setValue] = useState(() => getViewerContext?.() ?? "")
  const [message, setMessage] = useState("")
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
      <label className="block space-y-2">
        <span>Tên anime, nhân vật, cách xưng hô và chủ đề</span>
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
