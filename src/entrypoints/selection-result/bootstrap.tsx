import "@/utils/zod-config"
import type { Config } from "@/types/config/config"
import type { Theme, ThemeMode } from "@/types/config/theme"
import { QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/base-ui/toast"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { showConfigRecovery } from "@/utils/config/readiness"
import { getLocalConfig } from "@/utils/config/storage"
import { i18n, initI18n } from "@/utils/i18n"
import { renderPersistentReactRoot } from "@/utils/react-root"
import { queryClient } from "@/utils/tanstack-query"
import { getLocalThemeMode } from "@/utils/theme"
import App from "./app"
import "@fontsource-variable/inter/index.css"
import "@/assets/styles/theme.css"

function Hydrate({
  config,
  theme,
  children,
}: {
  config: Config
  theme: ThemeMode
  children: React.ReactNode
}) {
  useHydrateAtoms([
    [configAtom, config],
    [baseThemeModeAtom, theme],
  ])
  return children
}

export const mountSelectionResult = (panel = false) =>
  mountExtensionPage(() => <App panel={panel} />)
export async function mountExtensionPage(
  view: (config: Config) => React.ReactNode,
  { forcedTheme }: { forcedTheme?: Theme } = {},
) {
  const [config, theme] = await Promise.all([getLocalConfig(), getLocalThemeMode()])
  await initI18n(config.uiLanguage)
  document.title = `${i18n.t("selectionResult.title")} | Read Frog`
  renderPersistentReactRoot(
    document.getElementById("root")!,
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <Hydrate config={config} theme={theme}>
          <ThemeProvider forcedTheme={forcedTheme}>
            <TooltipProvider>
              <ToastProvider>
                <AnchoredToastProvider>{view(config)}</AnchoredToastProvider>
              </ToastProvider>
            </TooltipProvider>
          </ThemeProvider>
        </Hydrate>
      </JotaiProvider>
    </QueryClientProvider>,
  )
}
export const showSelectionRecovery = (error: unknown) =>
  showConfigRecovery(document.getElementById("root")!, error)
