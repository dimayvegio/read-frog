import { browser } from "#imports"

export function PdfPanelButton() {
  return (
    <button
      type="button"
      aria-label="Mở trình đọc PDF"
      title="Mở trình đọc PDF trong tab mới"
      className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
      onClick={() => {
        void browser.tabs.create({ url: browser.runtime.getURL("/pdf-reader.html") })
        window.close()
      }}
    >
      PDF
    </button>
  )
}
