# FlowRead 1.59.3A.8 — HTML fixed pane and analysis intervals

Baseline `0752ee8c` / v1.59.3A.7 checked before edits. Package 1.59.3-a.8, numeric 1.59.3.8, display 1.59.3A. No migration, DB, settings sync, notebook/ZIP or permission changes.

## Fixed selection pane on HTML

The trusted context menu now says **Dịch trong khung cố định** for both HTML/PDF. Previously it unconditionally called identifyPdfDocument for any HTTP/file URL, causing HTML to acquire PDF document/history/structured-cleanup metadata. Only detected PDF now receives that metadata. HTML has a web source/title, generic controls, unchanged selected text, selection usage classification and no PDF history writes. Existing PDF identity/history/cleanup and popup fallback remain intact; generic identifyPdfDocument itself is not changed because other reader callers rely on its frozen identities.

Once explicitly opened for an HTML source, subsequent toolbar/menu/shortcut Translate uses the same pane and existing private selection translator, without a duplicate in-page provider request. Routing is limited to a mounted trusted sidepanel view and the same browser window/tab/exact route hash. Current frame/document IDs are verified for content messages; partial modern IDs fail closed. Queue ordering, TTL/length limits, source closure and late results retain existing cancellation. Closed/unrelated panes fall back to the original web popover. No automatic translation on selecting text alone.

An extension-owned port/20s local heartbeat marks a visible mounted pane; disconnect, visibility loss, onClosed or window close ends ownership. No provider call or session write from heartbeat. Web source highlight uses CSS Custom Highlight paint and one adopted stylesheet, not wrappers or text/HTML replacement. It follows layout/scroll natively, replaces the previous range, remains when native selection is cleared, and clears on close, URL change or source mutation/removal. One bounded range set (≤32 ranges/20,000 chars) and 1s local validity check; no unbounded observer or provider work.

## Configurable video analysis

**Thời lượng audio phân tích:** 15s, 30s, 1m, 2m, 5m or 10m. Default remains 15s; choices are RAM-only in the tab. Changing duration cancels current work, clears the old profile and turns AI off; it never silently starts paid analysis.

- **Tự phân tích khi xem:** sample the selected amount of played audio without seek/pause/rate/volume/microphone mutation. Remains one paid attempt per new ten-minute timeline part, ≤128 parts/session, ≤8MiB audio, ≤660s stalled-sample wall bound. Pause/buffering excluded; seek/rate changes discard the sample. Early video end uses actual captured duration.
- **Chuẩn bị trước:** explicitly pre-record that interval starting at the current position at 1×, including a short interval on a long video. Wait for played audio and analysis, restore owned original position/rate paused. Clip exactly to interval frame quota or EOF; user seek/pause/rate intent cancels. A queued setup pause event arriving after play resumes must not count as a user pause. Selected matching MP3/WAV remains a separate whole-video alternative, ≤10m/8MiB.
- Read bounded native CC context for semantics; only fully heard corresponding CC receives speaker mapping with sample-relative timing remapped to verified native indices. Unknown/unheard speakers keep baseline voice. No future-audio download, voice clone, DRM bypass, new provider, paid retry or persistent audio/profile. Existing gpt-audio-1.5 analysis, private TTS, playback/mix/offset and caption engine/cache remain.

## Validation and limits

Full suite 4,690 passing / one intentional free-service skip. Focused lifecycle/security tests cover HTML classification, routing ownership/close/expiry/current IDs, no duplicate translator, native paint/DOM preservation, selected 30s capture and prepared intervals on long videos. Production Chrome HTML check covers the real sidepanel and toolbar, 10 assertions, mocked OpenAI. Native OS context menu is covered via unit/bridge tests, not driven by CDP. Real four-language offline OCR/PDF and video capture regressions are retained.

OpenAI quality/cost/live API and full ten-minute real capture are not claimed tested. Edge isolated launch was blocked in a.7; routine local update remains filesystem-only with user Reload. Current store handoff/validation contains final release evidence and ZIP hash. Preserve this behavior across upstream merges.
