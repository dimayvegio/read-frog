# FlowRead a.7 — store candidate and automatic video analysis

Compared to a.6 (`f7c32bbe`): package 1.59.3-a.7, numeric 1.59.3.7, display 1.59.3A. No upstream merge; published migrations, config/DB/sync/ZIP formats and manifest permissions unchanged.

## Automatic mode

AI master remains **off by default**, per tab/source and RAM-only. Mode defaults to **Tự phân tích khi xem**. Enabling starts an owned loop on the selected playing YouTube/ani.pm video: captureStream → mono 16kHz MP3 32kbps → existing fixed OpenAI analysis endpoint/model `gpt-audio-1.5`. No file, microphone, seek, pause, rate or volume mutation in sampling; continue watching.

Sample ~15 seconds of played audio, not future audio. Setup abortable/10s bounded; skip pause/buffering, discard seek/rate discontinuities, release tracks/nodes/context. Stalled-sample wall cap ten minutes, ≤256KiB compressed sample, one paid attempt per distinct ten-minute timeline part, ≤128 parts/session. Source/config/key/ad/navigation guards reject late data; recheck source after awaited key/source lookups and verify current native CC hash before upload/after response. Failed paid work stops; retry is explicit. No persistence/new permissions/published schemas.

Context is a ≤100,000-character head/tail caption excerpt built without joining the whole long track. Only fully heard cues have normalized sample timing and verified global index mapping. Unknown/unheard speakers keep baseline preset voice. A new sample replaces the RAM profile; cross-sample person identity/voice consistency is **not guaranteed**. Context uses existing caption engine/cache identity, no separate translator. Profile refresh aborts old TTS/cache while retaining active controller/unlocked player; manual pause stays manual.

This improves context, not full future-video diarization before playback. Prepared mode remains for up to ten minutes/8MiB, with explicit pre-recording wait and owned position/rate restoration paused. Missing CC never starts OCR/ASR fallback. Restricted/DRM players fail without downloader/circumvention.

## Store work

Horse replaces runtime frog icons; master/provenance and resize/promo script included. Own support/source replaces upstream review/help. API Providers shows processing/fee disclosure before key entry, with bundled policy. Kit includes nine manifest locale listings, data/permission forms, reviewer steps, GPL/source and ID/data migration limits. Unsupported manifest az omitted, runtime Azerbaijani retained.

Pinned Tesseract 7 removes remote core/language defaults and dynamic Function, restricts packaged asset loads; client worker CDN default removed. Vendor fingerprint/replacement changes fail the build. Local WASM remains allowed by CSP, JavaScript eval is not. Manual store workflow prepares only, no inherited IDs/secrets or Discord sends. No store submission/approval claim.

See [store/VALIDATION.md](store/VALIDATION.md). Preserve these alongside existing fork contracts across upgrades.
