import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { UsageDashboard } from "./view"
import "./style.css"
void mountExtensionPage(() => <UsageDashboard />).catch(showSelectionRecovery)
