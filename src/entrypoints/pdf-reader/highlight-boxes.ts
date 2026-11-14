export interface HighlightBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Merges fragmented text rects on the same line into uniform line bounding boxes.
 * Prevents color stacking, stepped underlines, and patchy alpha seams in PDF text layers.
 */
export function mergeHighlightBoxes(boxes: readonly HighlightBox[]): HighlightBox[] {
  if (boxes.length <= 1) return [...boxes]

  const valid = boxes.filter((b) => b.width > 0.0005 && b.height > 0.0005)
  if (valid.length <= 1) return valid

  // Group boxes into lines based on vertical overlap
  type LineGroup = {
    top: number
    bottom: number
    items: HighlightBox[]
  }

  const lines: LineGroup[] = []

  for (const box of valid) {
    const boxBottom = box.y + box.height
    // Check vertical overlap against existing lines
    const line = lines.find((candidate) => {
      const overlap = Math.min(candidate.bottom, boxBottom) - Math.max(candidate.top, box.y)
      const minH = Math.min(candidate.bottom - candidate.top, box.height)
      return overlap > 0.45 * minH
    })

    if (line) {
      line.top = Math.min(line.top, box.y)
      line.bottom = Math.max(line.bottom, boxBottom)
      line.items.push(box)
    } else {
      lines.push({
        top: box.y,
        bottom: boxBottom,
        items: [box],
      })
    }
  }

  // Sort lines vertically from top to bottom
  lines.sort((a, b) => a.top - b.top)

  const result: HighlightBox[] = []

  for (const line of lines) {
    // Sort items on the same line from left to right
    line.items.sort((a, b) => a.x - b.x)

    const lineHeight = Math.max(0.001, line.bottom - line.top)
    let current: HighlightBox | null = null

    for (const item of line.items) {
      if (!current) {
        current = {
          x: item.x,
          y: line.top,
          width: item.width,
          height: lineHeight,
        }
        continue
      }

      const currentRight = current.x + current.width
      const itemRight = item.x + item.width

      // If item touches, overlaps, or is separated by a normal word space (<= 2.5% of page width)
      if (item.x <= currentRight + 0.025) {
        current.width = Math.max(currentRight, itemRight) - current.x
      } else {
        result.push(current)
        current = {
          x: item.x,
          y: line.top,
          width: item.width,
          height: lineHeight,
        }
      }
    }

    if (current) {
      result.push(current)
    }
  }

  return result
}
