import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { PronunciationPractice } from "./app"
import "./style.css"
void mountExtensionPage(() => <PronunciationPractice />)
  .then(() => {
    document.title = "Phát âm | Read Frog"
  })
  .catch(showSelectionRecovery)
