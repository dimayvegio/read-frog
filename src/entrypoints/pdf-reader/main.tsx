import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { PdfReader } from "./app"
import "pdfjs-dist/web/pdf_viewer.css"
import "./reader.css"
void mountExtensionPage((config) => <PdfReader config={config} />)
  .then(() => {
    document.title = "Đọc PDF | Read Frog"
  })
  .catch(showSelectionRecovery)
