import { useAtom } from "jotai"
import { lazy, Suspense, useEffect } from "react"
import { onMessage } from "@/utils/message"
import { webBilingualOpenAtom } from "../../atoms"
const View = lazy(() => import("./view"))
export function WebBilingualGate() {
  const [open, setOpen] = useAtom(webBilingualOpenAtom)
  useEffect(
    () =>
      onMessage("openWebBilingualPanel", () => {
        setOpen(true)
        return true
      }),
    [setOpen],
  )
  return open ? (
    <Suspense fallback={null}>
      <View onClose={() => setOpen(false)} />
    </Suspense>
  ) : null
}
