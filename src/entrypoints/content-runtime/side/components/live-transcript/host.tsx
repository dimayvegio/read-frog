import type { ReactElement } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { REACT_SHADOW_HOST_CLASS } from "@/utils/constants/dom-labels"
import { ShadowHostBuilder } from "@/utils/react-shadow-host/shadow-host-builder"

type Host = HTMLElement & { __reactShadowContainerCleanup?: () => void }

/** This native-control pane needs no app settings/theme/query providers. */
export function createLiveHost(component: ReactElement, css: string): Host {
  const host: Host = document.createElement("div")
  host.classList.add(REACT_SHADOW_HOST_CLASS)
  const builder = new ShadowHostBuilder(host.attachShadow({ mode: "open" }), {
    position: "block",
    inheritStyles: false,
    cssContent: [css],
    style: { height: "100%" },
  })
  const root = createRoot(builder.build())
  flushSync(() => root.render(component))
  host.__reactShadowContainerCleanup = () => {
    root.unmount()
    builder.cleanup()
  }
  return host
}
export function removeLiveHost(host: Host) {
  host.__reactShadowContainerCleanup?.()
  delete host.__reactShadowContainerCleanup
  host.remove()
}
