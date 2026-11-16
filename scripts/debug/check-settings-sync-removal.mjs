import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"
import JSZip from "jszip"
import { preparePdfWorker } from "./pdf-worker-fixture.mjs"

const upstream160 = process.env.FLOWREAD_UPSTREAM_160 === "1"
const targetVersion = upstream160 ? "1.60.0.1" : "1.59.3.19"
const baselinePath = path.resolve(
  process.env.SYNC_REMOVAL_BASELINE ??
    (upstream160 ? ".codex/review-160/baseline-a19.zip" : ".codex/review-a19/baseline-a18.zip"),
)
const candidate = path.resolve(".output/edge-mv3")
const scratch = path.resolve(".codex/sync-removal-" + Date.now())
const installed = path.join(scratch, "installed")
const downloads = path.join(scratch, "downloads")
await fs.mkdir(downloads, { recursive: true })
const raw = await fs.readFile(baselinePath)
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  upstream160
    ? "a4965cb2cc5a5c1cca40b74de5afd67a7fb5d611d5bb0b9491aad7aa414092e4"
    : "0215bfd24128ff6847c0837a736259240f7ac36cf2671d9d26ef0fc42da4efee",
  "Use the real reviewed baseline ZIP, never relabel the candidate",
)
const zip = await JSZip.loadAsync(raw, { checkCRC32: true })
assert.equal(
  JSON.parse(await zip.file("manifest.json").async("string")).version,
  upstream160 ? "1.59.3.19" : "1.59.3.18",
)
for (const entry of Object.values(zip.files)) {
  if (entry.dir) continue
  assert.ok(!entry.name.includes("\\") && !entry.name.includes(":"))
  const target = path.resolve(installed, entry.name)
  assert.ok(target.startsWith(installed + path.sep), "Safe baseline path")
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, await entry.async("nodebuffer"))
}
const { default: puppeteer } = await import(
  pathToFileURL(
    path.resolve(
      ".codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    ),
  ).href
)
const browser = await puppeteer.launch({
  executablePath:
    process.env.VOCAB_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: path.join(scratch, "profile"),
  headless: false,
  pipe: true,
  enableExtensions: true,
  protocolTimeout: 10000,
  defaultViewport: { width: 1400, height: 1000 },
  args: ["--no-first-run", "--no-default-browser-check"],
})
const evidence = {
  checks: [],
  errors: [],
  liveOpenAI: false,
  mainEdgeControlled: false,
  cloudAccountDeliveryTested: false,
  browser: await browser.version(),
}
const check = (name, value) => {
  assert.ok(value, name)
  evidence.checks.push(name)
  console.log("PASS", name)
}
const click = (page, name) =>
  page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (node) => node.textContent.trim() === text,
    )
    if (!button || button.disabled) throw new Error("Unavailable control: " + text)
    button.click()
  }, name)
const poll = async (operation) => {
  for (let i = 0; i < 100; i++) {
    if (await operation()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error("Fixture condition timed out")
}
// Bootstrap may legitimately refresh its public-config digest on startup;
// credential state, legacy recovery records and all user data must be unchanged.
const sameCredentials = (before, after) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => key !== "bootstrapJournal")
    .every((key) => isDeepStrictEqual(before[key], after[key]))
const snapshot = async () => {
  const local = await chrome.storage.local.get(null)
  const names = [
    "config",
    "config$",
    "studyHighlightsEnabled",
    "openaiFeatureModelsV1",
    "backup_ids",
    ...(local.backup_ids ?? []).flatMap((id) => [id, id + "$"]),
  ]
  const selected = Object.fromEntries(
    names.filter((key) => key in local).map((key) => [key, local[key]]),
  )
  const read = (name) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onerror = () => reject(new Error("Fixture DB read failed"))
      request.onsuccess = () => {
        const db = request.result,
          stores = [...db.objectStoreNames],
          out = {}
        const tx = db.transaction(stores, "readonly")
        for (const store of stores) {
          const query = tx.objectStore(store).getAll()
          query.onsuccess = () => {
            out[store] = query.result
          }
        }
        tx.oncomplete = () => {
          db.close()
          resolve(out)
        }
        tx.onerror = () => {
          db.close()
          reject(new Error("Fixture DB transaction failed"))
        }
      }
    })
  return {
    local: selected,
    credentials: await read("edge-openai-credentials"),
    vocabulary: await read("read-frog-vocabulary"),
    legacy: await read("read-frog-settings-sync"),
  }
}
let options
try {
  const id = await browser.installExtension(installed),
    base = `chrome-extension://${id}/`
  let target = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url() === base + "background.js",
  )
  let worker = await target.worker()
  options = await browser.newPage()
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  await worker.evaluate(preparePdfWorker)
  await options.goto(base + "options.html#/preference/config-backup")
  await options.bringToFront()
  await options.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (node) => node.textContent.trim() === "Backup now",
      ),
    { polling: 100 },
  )
  await click(options, "Backup now")
  await poll(() =>
    worker.evaluate(
      async () => (await chrome.storage.local.get("backup_ids")).backup_ids?.length > 0,
    ),
  )
  const vocabulary = await browser.newPage()
  await vocabulary.goto(base + "vocabulary.html")
  await vocabulary.waitForSelector("#content")
  await poll(() =>
    worker.evaluate(async () =>
      (await indexedDB.databases()).some((db) => db.name === "read-frog-vocabulary"),
    ),
  )
  let oldPage = await browser.newPage()
  await oldPage.goto(base + "settings-sync.html")
  await oldPage.waitForFunction(() => document.body.innerText.includes("Đồng bộ"), { polling: 100 })
  check(
    "baseline has the expected sync retirement state",
    upstream160
      ? (await oldPage.$("[data-retired-feature]")) !== null
      : (await oldPage.$("button")) !== null,
  )
  if (upstream160)
    await worker.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("read-frog-settings-sync", 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore("state", { keyPath: "id" })
        }
        request.onerror = reject
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
      })
      const { config } = await chrome.storage.local.get("config")
      config.pageTranslation.translationNodeStyle.customCSS = '[lang="zh"] { color: green; }'
      config.videoSubtitles.style.customCSS = '[lang="zh-TW"] { color: white; }'
      await chrome.storage.local.set({ config })
    })
  // Copy-only update leaves obsolete chunks on disk, exactly like the user's installation.
  const entries = []
  const walk = async (dir, relative = "") => {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      assert.ok(!item.isSymbolicLink())
      const name = path.join(relative, item.name)
      if (item.isDirectory()) await walk(path.join(dir, item.name), name)
      else entries.push(name)
    }
  }
  await walk(candidate)
  entries.sort(
    (a, b) => Number(a === "manifest.json") - Number(b === "manifest.json") || a.localeCompare(b),
  )
  for (const relative of entries) {
    const file = path.join(installed, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.copyFile(path.join(candidate, relative), file)
  }
  check("copy-only upgrade replaces the manifest last", entries.at(-1) === "manifest.json")
  // Seed last, after copying, so the old worker's five-second debounce cannot race the upgrade.
  await worker.evaluate(async () => {
    const write = (name, store, value) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onerror = reject
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(store, "readwrite")
          tx.objectStore(store).put(value)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = reject
        }
      })
    const now = Date.now()
    await write("read-frog-vocabulary", "notebooks", {
      id: "f2434f89-ea92-412c-99d0-00c5a3b1a922",
      name: "QA preserved notebook",
      nameKey: "qa preserved notebook",
      createdAt: now,
      updatedAt: now,
    })
    await write("read-frog-settings-sync", "state", {
      id: "main",
      device: "retired-qa-device",
      enabled: true,
      generation: 7,
      counter: 3,
      status: "ready",
      message: "QA legacy enabled state",
    })
    await chrome.storage.local.set({
      studyHighlightsEnabled: false,
      openaiFeatureModelsV1: { selectionTranslate: { model: "gpt-4o" } },
    })
    await chrome.storage.sync.set({
      "rf-config:qa-retired-canary": { marker: "QA old cloud value", revision: 3 },
    })
    await chrome.alarms.create("edge-settings-sync", { delayInMinutes: 60, periodInMinutes: 60 })
    await chrome.alarms.create("qa-unrelated", { delayInMinutes: 60 })
  })
  const before = await worker.evaluate(snapshot)
  const cloudBefore = await worker.evaluate(() => chrome.storage.sync.get(null))
  const previousTarget = target
  check(
    "same directory reload preserves extension ID",
    (await browser.installExtension(installed)) === id,
  )
  target = await browser.waitForTarget(
    (t) =>
      t !== previousTarget && t.type() === "service_worker" && t.url() === base + "background.js",
  )
  worker = await target.worker()
  options = await browser.newPage()
  options.on("pageerror", (error) => evidence.errors.push(error.message))
  await options.goto(base + "options.html#/api-providers")
  await options.waitForSelector("#openai-key")
  check(
    "candidate manifest has the intended fork version",
    await worker.evaluate(
      (version) => chrome.runtime.getManifest().version === version,
      targetVersion,
    ),
  )
  const expectedLocal = structuredClone(before.local)
  if (upstream160) {
    expectedLocal["config$"].schemaVersion = 127
    expectedLocal.config.pageTranslation.requestQueueConfig.timeoutMs = 20000
    expectedLocal.config.videoSubtitles.requestQueueConfig.timeoutMs = 20000
    expectedLocal.config.pageTranslation.translationNodeStyle.customCSS =
      ':is([lang="zh-Hans"], [lang="yue"]) { color: green; }'
    expectedLocal.config.videoSubtitles.style.customCSS = '[lang="zh-Hant"] { color: white; }'
    for (const backupId of expectedLocal.backup_ids ?? []) {
      const backup = expectedLocal[backupId]
      backup.schemaVersion = 127
      backup.config.pageTranslation.requestQueueConfig.timeoutMs = 20000
      backup.config.videoSubtitles.requestQueueConfig.timeoutMs = 20000
    }
  }
  const afterUpgrade = await worker.evaluate(snapshot)
  const diff = (expected, actual, prefix = "") => {
    if (isDeepStrictEqual(expected, actual)) return []
    if (!expected || !actual || typeof expected !== "object" || typeof actual !== "object")
      return [{ path: prefix, expected, actual }]
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) =>
      diff(expected[key], actual[key], prefix + "." + key),
    )
  }
  evidence.expectedLocalDiff = diff(expectedLocal, afterUpgrade.local)

  evidence.preserved = Object.fromEntries(
    Object.keys(before).map((key) => [key, isDeepStrictEqual(before[key], afterUpgrade[key])]),
  )
  evidence.changedCredentialStores = Object.keys(before.credentials).filter(
    (key) => !isDeepStrictEqual(before.credentials[key], afterUpgrade.credentials[key]),
  )
  evidence.preserved.credentials = sameCredentials(before.credentials, afterUpgrade.credentials)
  evidence.bootstrapJournalRefreshed = evidence.changedCredentialStores.includes("bootstrapJournal")
  evidence.keyAndRevisionPreserved = isDeepStrictEqual(
    before.credentials.credentialState,
    afterUpgrade.credentials.credentialState,
  )
  evidence.changedLocalKeys = Object.keys(before.local).filter(
    (key) => !isDeepStrictEqual(before.local[key], afterUpgrade.local[key]),
  )
  if (!evidence.preserved.legacy)
    evidence.legacyStateDiff = { before: before.legacy, after: afterUpgrade.legacy }
  if (!evidence.preserved.vocabulary)
    evidence.changedVocabularyStores = Object.keys(before.vocabulary).filter(
      (key) => !isDeepStrictEqual(before.vocabulary[key], afterUpgrade.vocabulary[key]),
    )
  check(
    "private credential, settings, backups, notebooks and inert legacy DB survive",
    isDeepStrictEqual(afterUpgrade.local, expectedLocal) &&
      sameCredentials(before.credentials, afterUpgrade.credentials) &&
      isDeepStrictEqual(afterUpgrade.vocabulary, before.vocabulary) &&
      isDeepStrictEqual(afterUpgrade.legacy, before.legacy),
  )
  check(
    "old cloud values are left unchanged",
    isDeepStrictEqual(await worker.evaluate(() => chrome.storage.sync.get(null)), cloudBefore),
  )
  await poll(() => worker.evaluate(async () => !(await chrome.alarms.get("edge-settings-sync"))))
  check(
    "legacy enabled state cannot keep its recurring sync alarm",
    await worker.evaluate(async () => !(await chrome.alarms.get("edge-settings-sync"))),
  )
  // DevTools loadUnpacked may reset browser alarms. The app must restore its
  // backup alarm; then an unrelated fixture alarm must survive all app actions.
  evidence.unrelatedAlarmSurvivedDevtoolsReload = await worker.evaluate(
    async () => !!(await chrome.alarms.get("qa-unrelated")),
  )
  await poll(() => worker.evaluate(async () => !!(await chrome.alarms.get("config-backup"))))
  check(
    "automatic local backup remains scheduled after upgrade",
    await worker.evaluate(async () => !!(await chrome.alarms.get("config-backup"))),
  )
  await worker.evaluate(() => chrome.alarms.create("qa-unrelated", { delayInMinutes: 60 }))
  // Unlike loadUnpacked, closing only the worker retains alarms. Exercise cleanup,
  // not merely the browser's extension-reload housekeeping.
  await worker.evaluate(() =>
    chrome.alarms.create("edge-settings-sync", { delayInMinutes: 60, periodInMinutes: 60 }),
  )
  check(
    "legacy alarm exists before the worker-only restart",
    await worker.evaluate(async () => !!(await chrome.alarms.get("edge-settings-sync"))),
  )
  const previousWorkerTargets = new Set(browser.targets())
  evidence.restartStage = "closing-attached-worker"
  await worker.close()
  evidence.restartStage = "sending-wake"
  await options.evaluate(() => {
    globalThis.__qaWake = new Promise((resolve, reject) =>
      chrome.runtime.sendMessage(
        {
          id: Date.now(),
          type: "getTabContext",
          data: undefined,
          timestamp: Date.now(),
        },
        (response) =>
          chrome.runtime.lastError ? reject(new Error("Fixture wake failed")) : resolve(response),
      ),
    )
  })
  target = await browser.waitForTarget(
    (t) =>
      !previousWorkerTargets.has(t) &&
      t.type() === "service_worker" &&
      t.url() === base + "background.js",
  )
  worker = await target.worker()
  evidence.restartStage = "worker-attached-await-response"
  check(
    "runtime messaging responds after worker restart",
    await options.evaluate(async () => !!(await __qaWake)?.res),
  )
  await poll(() => worker.evaluate(async () => !(await chrome.alarms.get("edge-settings-sync"))))
  check(
    "startup removes only the retired alarm across worker restart",
    await worker.evaluate(
      async () =>
        !(await chrome.alarms.get("edge-settings-sync")) &&
        !!(await chrome.alarms.get("qa-unrelated")) &&
        !!(await chrome.alarms.get("config-backup")),
    ),
  )
  evidence.restartStage = "restart-verified"
  await worker.evaluate(() => {
    globalThis.__qaSyncCalls = []
    globalThis.__qaNetwork = []
    globalThis.__qaLocalFetches = []
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.__qaReadCloud = chrome.storage.sync.get.bind(chrome.storage.sync)
    for (const method of ["get", "set", "remove", "clear", "getBytesInUse", "setAccessLevel"])
      if (typeof chrome.storage.sync[method] === "function")
        chrome.storage.sync[method] = () => {
          __qaSyncCalls.push(method)
          return Promise.reject(new Error("Unexpected retired API"))
        }
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, chrome.runtime.getURL("/"))
      if (url.origin === new URL(chrome.runtime.getURL("/")).origin) {
        __qaLocalFetches.push(url.href)
        return originalFetch(input, init)
      }
      __qaNetwork.push(url.href)
      throw new Error("Unexpected external fetch")
    }
  })
  const popup = await browser.newPage()
  await popup.goto(base + "popup.html")
  await popup.waitForFunction(() => document.body.innerText.includes("Chi phí OpenAI"), {
    polling: 100,
  })
  check(
    "popup has no Edge sync launcher",
    !(await popup.evaluate(() => document.body.innerText.includes("Đồng bộ cấu hình Edge"))),
  )
  await options.goto(base + "options.html#/preference")
  await options.waitForSelector("#import-config-file")
  check(
    "preferences retain local import/export without an Edge sync action",
    await options.evaluate(
      () =>
        document.body.innerText.includes("Export/import settings files") &&
        !document.body.innerText.includes("Đồng bộ cấu hình qua tài khoản Edge"),
    ),
  )
  // Unknown retired RPCs must never return the former view or open another page.
  const removed = [
    "openSettingsSync",
    "getEdgeSettingsSync",
    "setEdgeSettingsSyncEnabled",
    "syncEdgeSettingsNow",
    "undoEdgeSettingsSync",
    "acknowledgeEdgeSyncRecovery",
    "openEdgeSyncSettings",
  ]
  const targets = browser.targets().length
  const replies = await options.evaluate(
    async (names) =>
      Promise.all(
        names.map(async (type, index) => {
          try {
            const response = await Promise.race([
              chrome.runtime.sendMessage({
                id: Date.now() + index,
                type,
                data: { enabled: true },
                timestamp: Date.now(),
              }),
              new Promise((resolve) => setTimeout(() => resolve(undefined), 1500)),
            ])
            return response === undefined || response === null || !!response.err
          } catch {
            return true
          }
        }),
      ),
    removed,
  )
  check(
    "all seven retired RPCs are unavailable and open no page",
    replies.every(Boolean) && browser.targets().length === targets,
  )
  await oldPage.close().catch((error) => {
    if (!/No target with given id|Target closed/u.test(error.message)) throw error
  })
  oldPage = await browser.newPage()
  await oldPage.bringToFront()
  const oldRequests = []
  oldPage.on("request", (request) => {
    if (request.resourceType() === "script") oldRequests.push(request.url())
  })
  await oldPage.goto(base + "settings-sync.html")
  await oldPage.waitForSelector("[data-retired-feature]")
  check(
    "old bookmarked URL becomes inert even with old chunks still on disk",
    (await oldPage.evaluate(
      () => !document.scripts.length && !document.querySelector("button,input,form"),
    )) && oldRequests.length === 0,
  )
  const cdp = await options.createCDPSession()
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads })
  await click(options, "Export")
  await poll(async () => (await fs.readdir(downloads)).some((name) => name.endsWith(".json")))
  const filename = (await fs.readdir(downloads)).find((name) => name.endsWith(".json")),
    file = path.join(downloads, filename)
  const exported = JSON.parse(await fs.readFile(file, "utf8"))
  check(
    "local settings export has the current schema and excludes private keys",
    exported.schemaVersion === (upstream160 ? 127 : 125) &&
      isDeepStrictEqual(exported.config, expectedLocal.config) &&
      !JSON.stringify(exported).includes("pdf-reading-test-sentinel"),
  )
  await worker.evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.language.targetCode = "ja"
    await chrome.storage.local.set({ config })
  })
  await (await options.$("#import-config-file")).uploadFile(file)
  await poll(() =>
    worker.evaluate(
      async () => (await chrome.storage.local.get("config")).config.language.targetCode === "vi",
    ),
  )
  check(
    "local file import restores settings and leaves credentials/notebooks intact",
    await worker
      .evaluate(snapshot)
      .then(
        (after) =>
          isDeepStrictEqual(after.local.config, expectedLocal.config) &&
          sameCredentials(before.credentials, after.credentials) &&
          isDeepStrictEqual(after.vocabulary, before.vocabulary),
      ),
  )
  await new Promise((resolve) => setTimeout(resolve, 6000))
  evidence.runtimeCalls = await worker.evaluate(async () => ({
    sync: __qaSyncCalls,
    externalFetch: __qaNetwork,
    bundledAssetFetch: __qaLocalFetches,
    syncAlarm: !!(await chrome.alarms.get("edge-settings-sync")),
  }))
  check(
    "local changes never reschedule removed sync or call its APIs",
    await worker.evaluate(
      async () =>
        __qaSyncCalls.length === 0 &&
        __qaNetwork.length === 0 &&
        !(await chrome.alarms.get("edge-settings-sync")),
    ),
  )
  check(
    "unrelated alarm is not cleared by local settings actions",
    await worker.evaluate(async () => !!(await chrome.alarms.get("qa-unrelated"))),
  )
  check(
    "fixture cloud read confirms no deletion or overwrite",
    isDeepStrictEqual(await worker.evaluate(() => __qaReadCloud(null)), cloudBefore),
  )
  await options.screenshot({ path: path.join(scratch, "local-settings.png") })
  await oldPage.screenshot({ path: path.join(scratch, "retired-page.png") })
  check("no uncaught application errors", evidence.errors.length === 0)
} catch (error) {
  evidence.failure = String(error)
  if (options && !options.isClosed()) {
    evidence.pageText = await Promise.race([
      options.evaluate(() => document.body.innerText.slice(0, 1800)),
      new Promise((resolve) => setTimeout(() => resolve("unavailable"), 2000)),
    ]).catch(() => "unavailable")
    await options.screenshot({ path: path.join(scratch, "failure.png") }).catch(() => {})
  }
  throw error
} finally {
  await fs.writeFile(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log("Evidence:", scratch)
}
