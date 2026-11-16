import { setupExtensionPageLogging } from "@/utils/logging/setup"
import { mountSelectionResult, showSelectionRecovery } from "../selection-result/bootstrap"

setupExtensionPageLogging("sidepanel")

void mountSelectionResult(true).catch(showSelectionRecovery)
