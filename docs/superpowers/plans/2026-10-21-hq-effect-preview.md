# Six-second Effect Preview Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved behavior in this session.

**Goal:** Precompute six seconds of sharp effect frames, then play them smoothly; remove effect clipping warnings.

**Architecture:** Render a frozen copy of the current card at 300 dpi and 30 fps into a bounded WebCodecs encoder. A small VP8/WebM writer feeds a native video viewer; existing live preview and printing stay independent.

**Tech Stack:** Canvas, WebCodecs, WebM, native video, existing offline HTML build.

**Spec:** User-approved six-second precomputation; server explicitly deferred; latest request removes effect clipping warnings.

## Global Constraints

- No network or server work. No changes to user artwork, project data, print frame, or undo history during preview.
- Exactly 180 frames / six seconds, starting at the current preview time. Preserve selection-only playback in the effects editor.
- Show preparation progress and support immediate cancellation/close/reopen. Release encoder, VideoFrames, caches and object URLs.
- Unsupported encoding produces a concrete message and leaves normal preview usable.
- Remove only `effect-clipped`; retain actual card boundaries and other validation.

## Review Focus

- Real six-second video duration and seeking after slow offline rendering.
- Cancellation during encoding or flush, missing codec, encoder errors.
- Effects editor drafts, selected target, frozen other targets and assets.
- Closing nested dialogs with Escape, reopening and resource cleanup.
- Mobile viewport and no project/print/history mutation.

### Task 1: Clipping warning

- [x] Change existing render/preflight/PDF assertions to require no clipping warning while retaining actual clipping.
- [x] Run the focused test and observe the obsolete warning failure.
- [x] Remove its production emission; rerun render and real PDF checks.

### Task 2: Offline video preparation

**Files:** `src/media/webm.js`, `src/render/effect-video.js`, `tests/effect-video.spec.mjs`.

**Interface:** `renderEffectVideo({canvas, renderFrame, signal, onProgress, startTimeSec=0}) -> Promise<Blob>`; `renderFrame(timeSec)` draws the next frame. Output is six seconds of VP8/WebM.

- [x] Test real browser video duration, dimensions, first/last frame, seek, progress and cancellation before implementation.
- [x] Encode explicit timestamps, close each VideoFrame, bound pending work and compressed bytes; mux seekable WebM.
- [x] Run the new browser tests and confirm clean errors/network.

### Task 3: Viewer and release

**Files:** `src/ui/effect-video.js`, card/effects transports, styles, UI tests, release metadata.

**Interface:** `openEffectVideo({project,target,assets,startTimeSec,playbackTarget,frozenTimeSec,onClose}) -> close()` snapshots inputs and owns its dialog lifecycle.

- [x] Test both entry points, preparation/cancel/reopen, selected-target rendering, state preservation and mobile fit.
- [x] Add progress/cancel and native video playback, then run focused affected suites.
- [x] Obtain independent code review, fix material issues, rebuild and verify delivery/update metadata before publishing.

## Execution Record

- Existing feature branch is clean at `145a773`. User already authorized implementation and public release; no additional design approval is needed.
- Tests report compact JSON; detailed logs stay in ignored QA artifacts.
- Final feature suite: **49/49 PASS**, including both entry points, real six-second codec output and real duplex PDF checks. Independent review approved after reproducing and fixing an encoder-internal queue issue with explicit batches of four frames.
- Follow-up request: keep repeated checks in the repository. Added `scripts/verify.mjs` with quick/effects/print/full profiles, fresh build and version checks, concise results, detailed logs, code/HTML fingerprints and change monitoring. Eleven regression checks cover success, real failure, missing coverage/counts, skips/cancellation/todo, timeout, interrupts, split Korean output, metadata changes and transient edits.
- Final repeatable quick run: **418/418 PASS**, 53 seconds. The actual delivered local HTML also reports v1.5.2 and plays a six-second 744×1039 video without changing save state, page errors or network requests. Existing six delivery files were hash-checked and backed up before copying; personal data and the open user tab were untouched.
