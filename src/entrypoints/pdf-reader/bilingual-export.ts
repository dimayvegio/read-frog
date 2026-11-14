import type { PdfParagraph } from "./paragraphs"
import type { BilingualTranslations } from "./bilingual-session"

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function slugify(text: string) {
  return (
    text
      .replace(/\.pdf$/iu, "")
      .replace(/[\\/:*?"<>|\p{Cc}\s]/gu, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "ban-dich"
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function exportBilingualMarkdown(
  title: string,
  paragraphs: PdfParagraph[],
  translations: BilingualTranslations,
) {
  const dateStr = new Date().toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  let md = `# ${title} — Bản dịch song ngữ FlowRead\n\n`
  md += `> Ngày xuất: ${dateStr} · Số đoạn: ${paragraphs.length}\n\n---\n\n`

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!
    const row = translations.rows[p.id]
    const translatedText = row?.complete || row?.output || "(Chưa có bản dịch)"
    md += `### [Đoạn ${p.index + 1}] — Trang ${p.page}\n\n`
    md += `**Văn bản gốc:**\n`
    md += `> ${p.text.split("\n").join("\n> ")}\n\n`
    md += `**Bản dịch:**\n`
    md += `${translatedText}\n\n`
    md += `---\n\n`
  }

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" })
  downloadBlob(blob, `${slugify(title)}-song-ngu.md`)
}

export function exportBilingualHtml(
  title: string,
  paragraphs: PdfParagraph[],
  translations: BilingualTranslations,
) {
  const dateStr = new Date().toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  let cardsHtml = ""
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!
    const row = translations.rows[p.id]
    const translatedText =
      row?.complete || row?.output || '<span class="empty">Chưa có bản dịch</span>'
    cardsHtml += `
    <article class="pair-card">
      <div class="card-meta">
        <span class="badge">Đoạn ${p.index + 1}</span>
        <span class="page-num">Trang ${p.page}</span>
      </div>
      <div class="card-body">
        <div class="column source">
          <div class="col-label">Bản gốc</div>
          <div class="text">${escapeHtml(p.text)}</div>
        </div>
        <div class="column translation">
          <div class="col-label">Bản dịch (FlowRead AI)</div>
          <div class="text">${escapeHtml(translatedText)}</div>
        </div>
      </div>
    </article>`
  }

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Bản dịch song ngữ FlowRead</title>
  <style>
    :root {
      --bg: #f8faf9;
      --card-bg: #ffffff;
      --text: #1a2e22;
      --muted: #607369;
      --border: #dce6df;
      --primary: #206a47;
      --source-bg: #f4f8f5;
      --trans-bg: #ffffff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121814;
        --card-bg: #1a221d;
        --text: #e2ede6;
        --muted: #8ca295;
        --border: #2b3930;
        --primary: #34a86f;
        --source-bg: #161e18;
        --trans-bg: #1f2a23;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 24px 16px;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--border);
    }
    h1 { font-size: 22px; color: var(--primary); margin-bottom: 6px; }
    .meta { font-size: 13px; color: var(--muted); }
    .pair-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 16px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    }
    .card-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      background: rgba(32, 106, 71, 0.06);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: 600;
    }
    .badge { color: var(--primary); }
    .page-num { color: var(--muted); }
    .card-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 768px) {
      .card-body { grid-template-columns: 1fr; }
    }
    .column { padding: 14px; }
    .column.source {
      background: var(--source-bg);
      border-right: 1px solid var(--border);
    }
    .column.translation { background: var(--trans-bg); }
    .col-label {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--muted);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
    .empty { color: var(--muted); font-style: italic; }
    @media print {
      body { background: white; color: black; padding: 0; }
      .pair-card { break-inside: avoid; border: 1px solid #ccc; box-shadow: none; margin-bottom: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Bản dịch song ngữ FlowRead · Xuất ngày: ${dateStr} · Tổng số đoạn: ${paragraphs.length}</div>
    </header>
    <main>
      ${cardsHtml}
    </main>
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  downloadBlob(blob, `${slugify(title)}-song-ngu.html`)
}
