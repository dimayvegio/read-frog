import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import { CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"

const MAX_PAIRS = 400
const MAX_CHARS = 2 * 1024 * 1024
export interface WebPair {
  id: string
  original: string
  translation: string
  target: string
  mode: string
}
export interface WebPairSnapshot {
  rows: WebPair[]
  limited: boolean
}
interface Capture {
  epoch: number
  route: string
  original: string
  texts: Text[]
  values: string[]
  parents: (Node | null)[]
  omitted?: boolean
}
interface LivePair {
  row: WebPair
  owner: WeakRef<Node>
  anchor: WeakRef<Node>
  source: WeakRef<Text>[]
  expected: { node: WeakRef<Node>; text: string; parent: WeakRef<Node> | null }[]
}
const route = () => location.href.split("#")[0]!
/** Read-only view of committed page-engine results; never requests translation or owns a cache. */
export class WebBilingualPairs {
  private entries = new Map<string, LivePair>()
  private owners = new WeakMap<Node, string>()
  private listeners = new Set<() => void>()
  private state: WebPairSnapshot = { rows: [], limited: false }
  private epoch = 0
  private sequence = 0
  private url = ""
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  private remove(id: string) {
    const owner = this.entries.get(id)?.owner.deref()
    if (owner && this.owners.get(owner) === id) this.owners.delete(owner)
    this.entries.delete(id)
  }
  private publish(limited = this.state.limited) {
    const entries = [...this.entries.values()].sort((a, b) => {
      const first = a.anchor.deref(),
        second = b.anchor.deref()
      if (!first || !second || first === second) return 0
      const order = first.compareDocumentPosition(second)
      return order & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : order & Node.DOCUMENT_POSITION_PRECEDING
          ? 1
          : 0
    })
    const rows = entries.map((item) => item.row)
    if (
      limited === this.state.limited &&
      rows.length === this.state.rows.length &&
      rows.every((row, index) => row === this.state.rows[index])
    )
      return
    this.state = { rows, limited }
    this.listeners.forEach((listener) => listener())
  }
  private checkRoute() {
    const current = route()
    if (this.url !== current) {
      this.clear()
      this.url = current
    }
  }
  capture(nodes: readonly TransNode[], original?: string): Capture {
    this.checkRoute()
    const texts: Text[] = []
    const pending: Node[] = [...nodes].reverse()
    let characters = 0,
      visited = 0
    while (pending.length) {
      const node = pending.pop()!
      if (++visited > 6000 || characters > 20000 || pending.length + node.childNodes.length > 6000)
        return {
          epoch: this.epoch,
          route: this.url,
          texts: [],
          values: [],
          parents: [],
          original: "",
          omitted: true,
        }
      if (node instanceof Text) {
        texts.push(node)
        characters += node.length
      } else if (node instanceof HTMLElement && !node.classList.contains(CONTENT_WRAPPER_CLASS)) {
        for (let index = node.childNodes.length - 1; index >= 0; index--)
          pending.push(node.childNodes[index]!)
      }
    }
    return {
      epoch: this.epoch,
      route: this.url,
      texts,
      values: texts.map((node) => node.data),
      parents: texts.map((node) => node.parentNode),
      original: original ?? texts.map((node) => node.data).join(""),
    }
  }
  commit(
    capture: Capture,
    owner: Node,
    anchor: Node,
    translation: string,
    config: Config,
    options?: { detachedSource?: boolean; virtual?: boolean; swapped?: boolean },
  ) {
    if (window !== window.top) return
    this.checkRoute()
    if (
      capture.epoch !== this.epoch ||
      capture.route !== this.url ||
      !owner.isConnected ||
      !anchor.isConnected ||
      anchor.ownerDocument !== document
    )
      return
    const element = anchor instanceof Element ? anchor : anchor.parentElement
    if (
      !element ||
      element.closest(
        'nav, footer, aside, form, input, textarea, select, button, [contenteditable="true"], [role="navigation"]',
      )
    )
      return
    const original = capture.original.trim().normalize("NFC"),
      output = translation.trim().normalize("NFC")
    if (capture.omitted || original.length > 20000 || output.length > 60000) {
      this.publish(true)
      return
    }
    if (!original || !output) return
    if (
      !options?.swapped &&
      !options?.detachedSource &&
      !options?.virtual &&
      capture.texts.some(
        (node, index) =>
          node.data !== capture.values[index] || node.parentNode !== capture.parents[index],
      )
    )
      return
    this.prune()
    const id = this.owners.get(owner) ?? `web-${++this.sequence}`
    this.owners.set(owner, id)
    const liveNodes: Node[] =
      options?.detachedSource || options?.virtual
        ? [owner]
        : options?.swapped
          ? capture.texts
          : [...capture.texts, owner]
    const entry: LivePair = {
      row: {
        id,
        original,
        translation: output,
        target: config.language.targetCode,
        mode: config.pageTranslation.mode,
      },
      owner: new WeakRef(owner),
      anchor: new WeakRef(anchor),
      source:
        options?.detachedSource || options?.virtual
          ? []
          : capture.texts.map((node) => new WeakRef(node)),
      expected: [...new Set(liveNodes)].map((node) => ({
        node: new WeakRef(node),
        text: node.textContent ?? "",
        parent: node.parentNode ? new WeakRef(node.parentNode) : null,
      })),
    }
    this.entries.set(id, entry)
    let size = [...this.entries.values()].reduce(
        (sum, item) => sum + item.row.original.length + item.row.translation.length,
        0,
      ),
      limited = this.state.limited
    let refs = [...this.entries.values()].reduce(
      (sum, item) => sum + item.source.length + item.expected.length * 2 + 2,
      0,
    )
    while (this.entries.size > MAX_PAIRS || size > MAX_CHARS || refs > 30000) {
      const oldest = this.entries.entries().next().value!
      size -= oldest[1].row.original.length + oldest[1].row.translation.length
      refs -= oldest[1].source.length + oldest[1].expected.length * 2 + 2
      this.remove(oldest[0])
      limited = true
    }
    this.publish(limited)
  }
  prune() {
    this.checkRoute()
    for (const [id, entry] of this.entries) {
      if (
        !entry.anchor.deref()?.isConnected ||
        entry.expected.some((item) => {
          const node = item.node.deref()
          return (
            !node?.isConnected ||
            node.textContent !== item.text ||
            node.parentNode !== item.parent?.deref()
          )
        })
      )
        this.remove(id)
    }
    this.publish()
  }
  /** The engine moved an intact translation wrapper into an identical source copy. */
  rebind(previous: HTMLElement, next: HTMLElement) {
    this.checkRoute()
    for (const [id, entry] of this.entries) {
      if (entry.anchor.deref() !== previous) continue
      const owner = entry.owner.deref(),
        capture = this.capture([next])
      const expected = entry.expected.find((item) => item.node.deref() === owner)
      if (
        !owner?.isConnected ||
        !expected ||
        owner.textContent !== expected.text ||
        capture.omitted ||
        capture.original.trim().normalize("NFC") !== entry.row.original
      ) {
        this.remove(id)
        continue
      }
      this.entries.set(id, {
        ...entry,
        row: { ...entry.row },
        anchor: new WeakRef(next),
        source: capture.texts.map((node) => new WeakRef(node)),
        expected: [...capture.texts, owner].map((node) => ({
          node: new WeakRef(node),
          text: node.textContent ?? "",
          parent: node.parentNode ? new WeakRef(node.parentNode) : null,
        })),
      })
    }
    let refs = 0
    for (const [id, entry] of this.entries) {
      refs += entry.source.length + entry.expected.length * 2 + 2
      if (refs > 30000) this.remove(id)
    }
    this.publish(refs > 30000 || this.state.limited)
  }
  anchor(id: string): Node | undefined {
    return this.entries.get(id)?.anchor.deref()
  }
  rect(id: string): DOMRect | null {
    const entry = this.entries.get(id),
      anchor = entry?.anchor.deref()
    if (!entry || !anchor?.isConnected) return null
    const nodes = entry.source
      .map((ref) => ref.deref())
      .filter((node): node is Text => !!node?.isConnected)
    if (nodes.length && nodes.every((node) => node.getRootNode() === nodes[0]!.getRootNode())) {
      const range = anchor.ownerDocument!.createRange()
      range.setStart(nodes[0]!, 0)
      range.setEnd(nodes.at(-1)!, nodes.at(-1)!.length)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return rect
    }
    return anchor instanceof Element
      ? anchor.getBoundingClientRect()
      : (anchor.parentElement?.getBoundingClientRect() ?? null)
  }
  clear(root?: Document | ShadowRoot) {
    if (root) {
      for (const [id, entry] of this.entries) {
        const node = entry.anchor.deref()
        if (
          !node ||
          (root instanceof Document ? node.ownerDocument === root : node.getRootNode() === root)
        )
          this.remove(id)
      }
    } else {
      this.entries.clear()
      this.owners = new WeakMap()
    }
    if (!root || root === document) this.epoch++
    this.publish(false)
  }
}
export const webBilingualPairs = new WebBilingualPairs()
