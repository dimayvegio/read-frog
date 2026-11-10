/** Watch direct mount parents only; never scan Teams' changing DOM subtree. */
export function keepLiveTranscriptVisible(host: HTMLElement, place: () => void) {
  let disposed = false,
    frame = 0,
    parent: Element | null = null,
    body: HTMLElement | null = null
  const observer = new MutationObserver((records) => {
    if (
      !host.isConnected ||
      document.body !== body ||
      records.some((record) => record.type === "attributes")
    )
      schedule()
  })
  const repair = () => {
    frame = 0
    if (disposed) return
    place()
    if (parent !== host.parentElement || body !== document.body) {
      observer.disconnect()
      parent = host.parentElement
      body = document.body
      observer.observe(document.documentElement, { childList: true })
      if (body)
        observer.observe(body, {
          childList: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden"],
        })
      if (parent && parent !== body && parent !== document.documentElement)
        observer.observe(parent, { childList: true })
    }
    host.hidden = false
    for (const [key, value] of [
      ["display", "block"],
      ["visibility", "visible"],
      ["opacity", "1"],
    ])
      if (
        host.style.getPropertyValue(key!) !== value ||
        host.style.getPropertyPriority(key!) !== "important"
      )
        host.style.setProperty(key!, value!, "important")
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(repair)
  }
  // A bounded health check also covers direct style changes on the host itself.
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") schedule()
  }, 2000)
  repair()
  return () => {
    disposed = true
    observer.disconnect()
    clearInterval(timer)
    cancelAnimationFrame(frame)
  }
}
