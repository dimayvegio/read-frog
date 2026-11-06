import { mountSelectionResult, showSelectionRecovery } from "./bootstrap"

void mountSelectionResult().catch(showSelectionRecovery)
