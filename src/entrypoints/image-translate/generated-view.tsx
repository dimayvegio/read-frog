import type { GeneratedImage } from "@/utils/image-translation/generated-schema"
import { useState } from "react"

export function GeneratedImageView({ value, source }: { value: GeneratedImage; source: string }) {
  const [original, setOriginal] = useState(false)
  const [zoom, setZoom] = useState("fit")
  return (
    <section className="rf-generated" aria-label="Ảnh OpenAI trả về">
      <div className="rf-generated-controls">
        <strong>{original ? "Vùng ảnh gốc" : "Ảnh dịch từ OpenAI"}</strong>
        <span>
          {value.width} × {value.height} px · PNG
        </span>
        <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>
          {original ? "Xem ảnh dịch" : "So với ảnh gốc"}
        </button>
        <label>
          Thu phóng{" "}
          <select
            aria-label="Thu phóng ảnh OpenAI"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
          >
            <option value="fit">Vừa khung</option>
            <option value="100">100% — pixel gốc</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
          </select>
        </label>
        <a
          className="rf-generated-download"
          href={value.image}
          download="FlowRead-OpenAI-anh-dich.png"
        >
          Tải PNG
        </a>
      </div>
      <div className="rf-generated-scroll">
        <img
          src={original ? source : value.image}
          alt={original ? "Vùng ảnh gốc gửi OpenAI" : "Ảnh dịch nguyên bản OpenAI trả về"}
          style={{
            width: zoom === "fit" ? "100%" : (value.width * Number(zoom)) / 100,
            maxWidth: zoom === "fit" ? value.width : "none",
          }}
        />
      </div>
    </section>
  )
}
