import * as csstree from "css-tree"

/** Sanitize before insertion in either a style element or a constructed sheet. */
export function sanitizeLocalCSS(css: string): string {
  // Escaped resource names must not hide a URL, import or image function.
  if (css.includes("\\")) return ""
  try {
    const ast = csstree.parse(css)
    let changed = false
    csstree.walk(ast, {
      visit: "Atrule",
      enter(node, item, list) {
        if (["import", "font-face", "namespace"].includes(node.name.toLowerCase()) && item) {
          changed = true
          list.remove(item)
        }
      },
    })
    csstree.walk(ast, {
      visit: "Declaration",
      enter(node, item, list) {
        let unsafe = false
        csstree.walk(node.value, (value) => {
          if (value.type === "Url" && !value.value.startsWith("#")) unsafe = true
          if (
            value.type === "Function" &&
            ["image", "image-set", "-webkit-image-set", "cross-fade", "src"].includes(
              value.name.toLowerCase(),
            )
          )
            unsafe = true
          if (value.type === "Raw" && /url\s*\(|image-set\s*\(/i.test(value.value)) unsafe = true
        })
        if (unsafe && item) {
          changed = true
          list.remove(item)
        }
      },
    })
    return changed ? csstree.generate(ast) : css
  } catch {
    return ""
  }
}
