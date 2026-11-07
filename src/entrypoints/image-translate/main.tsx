import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { ImageTranslation } from "./app"
import "./style.css"
void mountExtensionPage((config) => <ImageTranslation config={config} />)
  .then(() => {
    document.title = "Dịch ảnh | Read Frog"
  })
  .catch(showSelectionRecovery)
