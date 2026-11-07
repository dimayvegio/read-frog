import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { PdfReader } from "./app"
import "pdfjs-dist/web/pdf_viewer.css"
import "./reader.css"
void mountExtensionPage((config) => <PdfReader config={config} />)
  .then(() => {
    document.title = "Đọc PDF | Read Frog"
    const controller = new AbortController()
    window.addEventListener("pagehide", () => controller.abort(), { once: true })
    void import("@/utils/vocabulary/study-highlights").then(({ startStudyHighlights }) => {
      const root = document.querySelector<HTMLElement>(".rf-pdf-scroll")
      if (root) startStudyHighlights(root, controller.signal)
    })
  })
  .catch(showSelectionRecovery)
