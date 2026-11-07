import fs from "node:fs/promises"
import path from "node:path"

const HOST = "#read-frog-subtitles-sidebar-host"
const grip = "pierce/[data-sidebar-move]"
async function bounds(page) {
  return page.$eval(HOST, (host) => {
    const r = host.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
}
async function drag(page, selector, dx, dy) {
  const box = await (await page.$(selector)).boundingBox()
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}
async function openLearning(page) {
  const clickLearning = () =>
    page.evaluate(() => {
      for (const host of document.querySelectorAll("*")) {
        const button = [...(host.shadowRoot?.querySelectorAll("button") ?? [])].find(
          (node) => node.textContent.includes("Learning") && node.checkVisibility(),
        )
        if (button) {
          button.click()
          return true
        }
      }
      return false
    })
  if (!(await clickLearning())) {
    await page.$eval('pierce/button[aria-label="Subtitle Translation Panel"]', (node) =>
      node.click(),
    )
    await page.waitForFunction(() =>
      [...document.querySelectorAll("*")].some((host) =>
        [...(host.shadowRoot?.querySelectorAll("button") ?? [])].some(
          (node) => node.textContent.includes("Learning") && node.checkVisibility(),
        ),
      ),
    )
    await clickLearning()
  }
  await page.waitForSelector(grip)
}

export async function checkSidebarWindow({ page, worker, check, scratch, evidence }) {
  await page.bringToFront()
  const before = await bounds(page)
  check(
    "Learning panel retains its familiar 400px right-side default",
    Math.abs(before.width - 400) < 1,
  )
  await page.evaluate(() => {
    globalThis.__sidebarContentIdentity = document
      .querySelector("#read-frog-subtitles-sidebar-host")
      .shadowRoot.querySelector('[data-slot="scroll-area-viewport"]')
  })
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="s"]', 0, -200)
  let rect = await bounds(page)
  check(
    "Dragging the bottom edge changes height without changing width",
    Math.abs(rect.height - (before.height - 200)) < 2 && rect.width === before.width,
  )
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="w"]', -180, 0)
  const wider = await bounds(page)
  check(
    "Dragging the left edge expands width with the right edge anchored",
    wider.width > rect.width + 170 &&
      Math.abs(wider.left + wider.width - rect.left - rect.width) < 2,
  )
  await drag(page, grip, -300, 80)
  rect = await bounds(page)
  check(
    "Dragging the grip moves the entire panel on both axes",
    Math.abs(rect.left - (wider.left - 300)) < 2 && Math.abs(rect.top - (wider.top + 80)) < 2,
  )
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="se"]', 80, 40)
  let next = await bounds(page)
  check(
    "The bottom-right corner resizes both dimensions",
    next.width > rect.width + 70 && next.height > rect.height + 30,
  )
  rect = next
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="nw"]', 40, 40)
  next = await bounds(page)
  check(
    "The top-left corner preserves the opposite corner",
    Math.abs(next.width - (rect.width - 40)) < 2 &&
      Math.abs(next.left + next.width - rect.left - rect.width) < 2 &&
      Math.abs(next.top + next.height - rect.top - rect.height) < 2,
  )
  check(
    "Moving and resizing preserves the mounted transcript DOM",
    await page.evaluate(
      () =>
        __sidebarContentIdentity ===
        document
          .querySelector("#read-frog-subtitles-sidebar-host")
          .shadowRoot.querySelector('[data-slot="scroll-area-viewport"]'),
    ),
  )
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="se"]', -2000, -2000)
  next = await bounds(page)
  check(
    "Minimum window dimensions remain usable",
    Math.abs(next.width - 300) < 2 && Math.abs(next.height - 220) < 2,
  )
  check(
    "Tabs and window controls remain inside the compact header",
    await page.$eval(HOST, (host) => {
      const r = host.getBoundingClientRect()
      return [
        ...host.shadowRoot.querySelectorAll('[data-slot="sidebar-drag-header"] button'),
      ].every((button) => {
        const b = button.getBoundingClientRect()
        return b.left >= r.left && b.right <= r.right
      })
    }),
  )
  check(
    "A compact panel scrolls its transcript instead of moving the window",
    await page.$eval('pierce/[data-slot="scroll-area-viewport"]', (node) => {
      node.scrollTop = 30
      return node.scrollHeight > node.clientHeight && node.scrollTop > 0
    }),
  )
  await drag(page, grip, -3000, -3000)
  rect = await bounds(page)
  check(
    "Off-screen dragging clamps the header inside the viewport",
    Math.abs(rect.left - 16) < 2 && Math.abs(rect.top - 16) < 2,
  )
  await page.$eval('pierce/button[aria-label="Close the learning panel"]', (node) => node.click())
  await openLearning(page)
  check(
    "Closing and reopening keeps the chosen position and size",
    JSON.stringify(await bounds(page)) === JSON.stringify(rect),
  )
  await page.reload()
  await page.waitForSelector('pierce/button[aria-label="Subtitle Translation Panel"]')
  await openLearning(page)
  await page.waitForFunction(
    () =>
      parseFloat(document.querySelector("#read-frog-subtitles-sidebar-host").style.width) === 300,
  )
  check(
    "The local panel preference survives a page reload",
    JSON.stringify(await bounds(page)) === JSON.stringify(rect),
  )
  await drag(page, 'pierce/[data-slot="sidebar-resize-handle"][data-edge="se"]', 360, 320)
  rect = await bounds(page)
  await page.setViewport({ width: 390, height: 680 })
  check(
    "The panel fits a narrow viewport after a resize",
    await page.$eval(HOST, (host) => {
      const r = host.getBoundingClientRect()
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    }),
  )
  await page.setViewport({ width: 1280, height: 940 })
  await page.waitForFunction(
    (expected) =>
      Math.abs(
        document.querySelector("#read-frog-subtitles-sidebar-host").getBoundingClientRect().width -
          expected,
      ) < 2,
    {},
    rect.width,
  )
  check(
    "Returning to desktop restores the preferred dimensions",
    Math.abs((await bounds(page)).width - rect.width) < 2,
  )
  await page.evaluate(() => {
    const button = document.createElement("button")
    button.id = "sidebar-fullscreen-fixture"
    button.textContent = "Fullscreen test"
    Object.assign(button.style, {
      position: "fixed",
      right: "8px",
      bottom: "8px",
      zIndex: "2147483647",
    })
    button.onclick = () => document.querySelector("#movie_player").requestFullscreen()
    document.body.append(button)
  })
  await page.click("#sidebar-fullscreen-fixture")
  await page.waitForFunction(
    () =>
      document.fullscreenElement &&
      document.querySelector("#read-frog-subtitles-sidebar-host").parentElement ===
        document.fullscreenElement,
  )
  check(
    "The movable panel follows the real fullscreen player and remains reachable",
    await page.$eval(HOST, (host) => {
      const r = host.getBoundingClientRect()
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
    }),
  )
  await page.evaluate(() => document.exitFullscreen())
  await page.waitForFunction(
    () =>
      !document.fullscreenElement &&
      document.querySelector("#read-frog-subtitles-sidebar-host").parentElement === document.body,
  )
  await page.evaluate(() => document.querySelector("#sidebar-fullscreen-fixture").remove())
  await page.$eval(grip, (node) => node.focus())
  const keyBefore = await bounds(page)
  await page.keyboard.press("ArrowRight")
  await page.keyboard.down("Shift")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.up("Shift")
  next = await bounds(page)
  check(
    "Keyboard arrows move and Shift-arrows resize the focused grip",
    Math.abs(next.left - keyBefore.left - 10) < 2 &&
      Math.abs(next.height - keyBefore.height - 10) < 2,
  )
  await page.screenshot({ path: path.join(scratch, "learning-window-moved.png") })
  evidence.screenshots.push("learning-window-moved.png")
  await page.$eval('pierce/button[aria-label="Reset panel position and size"]', (node) =>
    node.click(),
  )
  next = await bounds(page)
  check(
    "Reset restores the original right-side layout",
    next.width === before.width &&
      Math.abs(next.height - before.height) < 2 &&
      Math.abs(next.left - before.left) < 2,
  )
  check(
    "Reset removes only the local window preference",
    await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("subtitlesSidebarWindowV1")).subtitlesSidebarWindowV1 ===
        undefined,
    ),
  )
  evidence.sidebarWindow = {
    gestures: true,
    realFullscreen: true,
    keyboard: true,
    localPersistence: true,
  }
  await fs.writeFile(
    path.join(scratch, "sidebar-window.json"),
    JSON.stringify(evidence.sidebarWindow, null, 2),
  )
}
