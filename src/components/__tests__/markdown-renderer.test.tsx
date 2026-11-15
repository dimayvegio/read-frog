// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { MarkdownRenderer } from "../markdown-renderer"

it("renders technical GFM tables and preserves fenced/inline code and ordered numbering", () => {
  const { container } = render(
    <MarkdownRenderer
      content={
        "| Register | Bits |\n| --- | --- |\n| CTRL | `a[31:0]` |\n\n```verilog\nassign a = b;\n  // giữ khoảng trắng\n```\n\n3. Read\n4. Write"
      }
    />,
  )
  expect(screen.getByRole("table").querySelectorAll("td")).toHaveLength(2)
  expect(screen.getByRole("region", { name: "Table" }).className).toContain("overflow-x-auto")
  expect(screen.getByLabelText("Code block").textContent).toBe(
    "assign a = b;\n  // giữ khoảng trắng\n",
  )
  expect(container.querySelector("pre code")?.className).toContain("language-verilog")
  expect(container.querySelector("ol")?.getAttribute("start")).toBe("3")
  expect(container.querySelector("code")?.textContent).toBe("a[31:0]")
})
it("keeps model HTML inert, blocks image loading and does not enable javascript links", () => {
  const { container } = render(
    <MarkdownRenderer
      content={
        '![private](https://example.com/tracker.png)\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src="https://example.com/another.png" onerror="alert(1)" />'
      }
    />,
  )
  expect(container.querySelector("img,script,iframe")).toBeNull()
  expect(container.querySelector('[href^="javascript:"]')).toBeNull()
  expect(container.textContent).toContain("private")
})
