import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { ReadingLab } from "./app"
import "./style.css"
void mountExtensionPage(() => <ReadingLab />)
  .then(() => {
    document.title = "Luyện nghe & Thư viện | Read Frog"
  })
  .catch(showSelectionRecovery)
