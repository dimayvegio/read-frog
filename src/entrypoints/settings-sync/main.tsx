import { mountExtensionPage, showSelectionRecovery } from "../selection-result/bootstrap"
import { SettingsSyncPage } from "./view"
import "../usage/style.css"
import "./style.css"
void mountExtensionPage(() => <SettingsSyncPage />).catch(showSelectionRecovery)
