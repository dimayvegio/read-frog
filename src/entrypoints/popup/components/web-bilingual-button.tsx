import { useAtomValue } from "jotai"
import { useState } from "react"
import { browser } from "#imports"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { sendMessage } from "@/utils/message"
import { isIgnoreTabAtom } from "../atoms/ignore"
import { isCurrentSiteInBlacklistAtom, isCurrentSiteInWhitelistAtom } from "../atoms/site-control"
export function WebBilingualButton() {
  const ignored = useAtomValue(isIgnoreTabAtom),
    { mode } = useAtomValue(configFieldsAtomMap.siteControl),
    white = useAtomValue(isCurrentSiteInWhitelistAtom),
    black = useAtomValue(isCurrentSiteInBlacklistAtom)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  return (
    <div>
      <button
        type="button"
        data-open-web-bilingual
        className="w-full rounded-md border px-3 py-2 text-[13px] hover:bg-muted disabled:opacity-40"
        disabled={busy || ignored || (mode === "whitelist" ? !white : black)}
        onClick={async () => {
          setBusy(true)
          setError("")
          try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
            if (
              tab?.id === undefined ||
              !(await sendMessage("openWebBilingualPanel", undefined, tab.id))
            )
              throw new Error("Unavailable")
          } catch {
            setError("Chưa mở được khung. Tải lại trang HTML rồi thử lại.")
          } finally {
            setBusy(false)
          }
        }}
      >
        Khung song ngữ HTML
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
