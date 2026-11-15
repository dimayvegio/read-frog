# FlowRead 1.59.3A.10 — file upload diagnostics

Baseline `310c785e` / A.9 checked before edits. Package 1.59.3-a.10, numeric 1.59.3.10, display 1.59.3A. No model, endpoint, permission, migration, DB or sync format changes. Existing uncommitted QA harness changes are separate from this production patch.

## Report and scope

User reports an approximately 18 MB MP3 reaches local preparation 100%, then fails while sending/receiving OpenAI SRT. This does not establish whether the failure is network, HTTP rejection or invalid/incomplete timestamp response. The original file/error response is not available; do not claim its root cause has been fixed.

A real locally generated 18,001,772-byte MP3 traversed the production extension's bounded chunk channel and fixed multipart upload boundary intact, once; a mocked valid timestamp response produced a downloadable SRT. This verifies local transport at that size, not live provider acceptance or that user's media file.

## Changed

- Local 100% preparation is explicitly labeled as local. Processing says uploading to OpenAI and waiting, without claiming remote upload progress or acceptance.
- Safe diagnostics distinguish AT-UPLOAD-NETWORK, AT-HTTP-400/401/403/404/413/415/429/other status, AT-SRT-RESPONSE, AT-TEXT-RESPONSE and the existing 15-minute deadline AT-TIMEOUT.
- HTTP statuses distinguish key/model access, size, media type, invalid request, quota and service failure. HTTP 400 stays honest: decoding versus request parameter cannot be established without more evidence.
- Only fixed app-owned messages and numeric HTTP status are exposed. No response bodies, exception text, keys, filenames, URLs, audio or transcript enter diagnostics/logging. Provider responses are canceled on failure; no automatic paid retry, fallback model, guessed timing or automatic re-upload.
- Existing SRT model whisper-1 / verbose_json / validated segment timestamps, 25,000,000-byte file bound, private credentials, source capture ownership, cancellation and text/live defaults remain unchanged. Official docs checked 15 November 2026 in the investigation still document 25 MB and whisper-1 timestamps; published shutdown date remains 26 February 2027. See AUDIO_TRANSCRIPTION.md for preserved contracts.

## Verification

27 focused tests passed (10 new diagnostic cases), covering HTTP status/privacy, network failure, timed-out request, invalid SRT response, existing exact byte transfer/credential/usage/timing contracts. Production SRT and 18 MB payload checks use controlled API responses. Full suite/build/audits and installation verification are recorded in store/VALIDATION.md.

No live paid OpenAI call was made. User should reproduce once on the diagnostic build and provide the AT-* code; failure after sending may already incur provider costs. Do not repeatedly retry automatically. Root-cause repair of the original file remains unverified.
