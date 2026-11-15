# Permission justifications

| Permission       | User-facing need                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| activeTab        | Explicit current-page screenshot/crop and user-triggered actions.                                           |
| storage          | Local configuration/credential status and opt-in native settings sync.                                      |
| unlimitedStorage | User-authored notebooks/recordings/PDF workspaces may exceed normal local quotas. Not cloud storage.        |
| tabs             | Exact source tab/URL ownership, cancel stale work, open owned tools. No server browsing-history collection. |
| alarms           | Existing scheduled local configuration/cache maintenance.                                                   |
| contextMenus     | Translate selected text, including native PDF viewer selection.                                             |
| scripting        | Inject packaged isolated UI into authorized documents and Netflix's packaged MAIN bridge.                   |
| webNavigation    | Detect source document/navigation changes and cancel stale owners.                                          |
| offscreen        | Owned background TTS/audio infrastructure without popup focus.                                              |
| sidePanel        | Persistent selected-text/PDF translation interface.                                                         |
| tabCapture       | Explicit chosen-tab audio recording/live transcription; no microphone or silent capture.                    |
| downloads        | Explicit MP3/transcript/PDF/notebook exports and validated downloads.                                       |
| <all_urls>       | Translate user-chosen pages and captions across sites; support site restrictions.                           |
| file:///*        | Local HTML/PDF tools after the user enables file access; PDF file-picker fallback remains.                  |

No permissions added for automatic analysis or horse branding. Microphone practice uses an explicit getUserMedia prompt on its own page. CSP `wasm-unsafe-eval` permits **bundled WASM**, not JavaScript eval or remote execution. The `tabs` warning is not a requested `history` permission; `history` is absent.
