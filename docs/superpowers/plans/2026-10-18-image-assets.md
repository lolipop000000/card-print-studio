# Image Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Independent leaf modules may use the dispatching-parallel-agents skill; the parent owns integration and final verification.

**Goal:** Keep attribute selection compact and let users crop, split and reuse images across decks.

**Architecture:** Native canvas crop dialog produces independent PNG assets. A versioned shared asset library persists through IndexedDB and the already remembered workspace folder. UI consumers copy selected assets into their existing card/effect/keyword workflows.

**Tech Stack:** Existing ES modules, Canvas2D, IndexedDB, File System Access, esbuild and Edge/Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-image-assets-design.md`

## Global Constraints

- Offline single HTML; preserve personal decks, source artwork and editable layers.
- Cropping creates independent PNGs at original pixel dimensions and preserves alpha; white backgrounds remain white.
- No nested `작업실 데이터` inside an existing data folder or an unidentified descendant.
- A library deletion cannot change an already applied card, effect or keyword icon.
- Folder failures/cancellation/conflicts never become reported disk-save success.
- Do not publish the user's attachment or personal library.

## Review Focus

- Empty or excessively large sprite grids must produce an actionable error before allocating output canvases (Task 1).
- Image coordinates after zoom/scroll and reversed drags must identify the same source pixels (Task 1).
- Folder switch or external disk edit during save must preserve the existing file (Task 2).
- Choosing an asset while a destination changes or an effect dialog closes must not attach it to a different target (Task 3).
- Deleting a shared entry after applying it must preserve card art and portable JSON (Task 3).

### Task 1: Crop and sprite sheet tool

Files: `src/model/image-crop.js`, `src/ui/image-crop.js`, `tests/image-crop.test.mjs`, `tests/image-crop.spec.mjs`. The worker owns these only; styles go in a separate snippet for parent integration.

Interfaces: `openImageCropper({asset,name}) -> Promise<Array<{asset,name,sourceRect}>|null>`. Assets use existing `{id,mime,dataUrl,width,height,paintingId:null}`. Export pure crop/grid functions for geometry tests. Dialog owns its lifecycle and native cancellation.

- [x] Write geometry/alpha/grid and browser drag tests; observe missing implementation failure.
- [x] Implement manual region drawing/numeric fields, original-resolution PNG extraction and configurable selected-cell sheet splitting.
- [x] Run owned tests: 13/13 geometry and actual Edge cases passed; no shared work committed.

### Task 2: Shared library model and storage

Files: `src/model/asset-library.js`, `src/storage/asset-library.js`, `src/storage/workspace.js`, `tests/asset-library.test.mjs`, `tests/asset-library-storage.test.mjs`, workspace storage tests. The worker owns these only.

Interfaces: `createAssetLibrary`, `parseAssetLibrary`, `serializeAssetLibrary`, `createLibraryEntry(asset,name)`; library `{format:'card-print-studio-assets',version:1,entries:[{id,name,asset,createdAt}]}`. `createAssetLibraryStorage({workspace}) -> {load,save,getState,subscribe,destroy}`; load returns validated library, save accepts validated library. State distinguishes disk saved, browser temporary and error with readable location. Provide an injectable persistence seam for storage tests. Disk methods on workspace must use its queued atomic writer and stale connection guards.

- [x] Write tests for JSON validation, detached image copies, persistent reload, duplicate IDs, quota errors, stale folders, conflict detection and no nested data folder.
- [x] Implement library and disk/cache adapter with bounded image validation and no silent fallback claims.
- [x] Run owned tests and existing workspace suites: 65/65 passed.

### Task 3: Integrate reusable assets

Files: `src/ui/asset-library.js`, `src/app.js`, `src/ui/inspector.js`, `src/ui/visual-effects.js`, `src/ui/visual-effect-fields.js`, `src/ui/keywords.js`, `src/styles.css`; `tests/asset-library.spec.mjs` and adjusted attribute UI tests.

- [x] Build the library dialog with search, multiple import, crop selected image, rename/delete, per-image download, portable JSON import/export and folder status/reconnect.
- [x] Expose `ctx.openAssetLibrary(options)` returning selected asset or null. Capture destination IDs/project identity before async picks, copy assets on application, preserve staged effect undo/apply/cancel behavior.
- [x] Connect card art, selected image, free image insertion, sprite input and keyword icon. Test fresh-deck reuse and library deletion preserving applied JSON.
- [x] Integrate compact native attribute disclosure, preserve its open state across edits, and run existing attribute/Variant tests.

### Task 4: Validate and deliver

- [x] Build offline HTML and run unit, targeted actual Edge crop/library/attribute/keyword/effect tests and existing output regression.
- [x] Review the integrated diff, resolve concrete issues and inspect the cropped attachment locally without publishing it.
- [x] Update usage/version and publish a verified release; copy tested HTML into the user's existing studio only after backup guards.

## Additional authorized scope during implementation

- Standalone effects: user found the existing `모양 안쪽` option. Clarify `발생 위치` and `영역 전체`; new standalone layer/preset defaults use the whole area. Existing explicit choices and saved recipes retain their behavior. No renderer migration.
- Object list: searchable names, direct/Shift selection, front-to-back order with drag and buttons, and undoable pointer locking. Locked elements remain editable from the inspector, are excluded from canvas hits/marquee, and keep lock metadata through automatic skill layout.
- Bloom: profile actual Edge, improve a proven hot path without changing print quality or frozen output. Report microbenchmark separately from application frame rate.
- Selected-only playback: default on in the effects dialog. Animate selected element/frame or all occurrences of the selected skill name; freeze other targets at the print frame and reuse their composed pixels. Keep this setting outside saved JSON and history. At the saved print time, pixels must match ordinary full rendering at 300 DPI.
- GPU status: source inspection confirms Canvas2D and CPU bloom. The isolated QA browser can obtain a hardware adapter, but production bloom does not use it. This release optimizes the existing CPU implementation, with no unvalidated GPU replacement.

## Execution ledger

- Ruling: independent leaf work uses the already announced parallel dispatch workflow; parent owns integration and one final fresh review. Existing feature branch is reused; personal delivery remains untouched until final checks.
- Pre-flight: crop outputs use the same asset shape as the library and current project; shared library storage reads the current folder before atomic writes. No new runtime dependency.
- Task 1 complete: geometry and canvas pixel tests, 13/13 pass; source artwork untouched. Added zoom floating-point boundary regression after a reproduced failure.
- Task 2 complete: model/cache/workspace tests, 65/65 pass; failure and conflict retain explicit temporary/error status.
- Task 3 in progress: placement tests RED (missing helper) then GREEN 2/2; integrated app entry points. Compact attribute UI and legacy canvas selection regressions 9/9 pass after updating missing zoom controls in the test fixture.
- Task 3 RED: actual app has no asset library button before integration (0 vs expected 1), observed in `tests/asset-library.spec.mjs`.
- Integrated crop RED: the last focused numeric field did not commit before the disabled save button was clicked. Added an input-update regression, then corrected manual/grid numeric input handling; crop geometry and actual Edge tests 14/14 passed.
- Selected playback RED: unselected region moved before implementation; the first frozen-pixel cache also changed print edges due to an extra padded raster transfer. Cache the original composed surface instead; selected element and repeated skill-name tests both passed, including exact 300 DPI print equality and warm cache reuse.
- Existing effects/keywords regression: 59/59 actual Edge cases passed. Object list/lock browser cases 10/10, existing alignment 7/7 and multiselect 8/8 passed. Full model/storage units currently 336/336 passed before the final storage review repairs.
- Local attachment check: selected 21 sheet cells into 78×80 PNGs, all 21 matched original pixels exactly; no HTTP requests or page errors. Attachment and resulting library stay in ignored QA files.
- Fresh independent review found two gaps under repair: pending browser drafts were replaced by old disk data after restart, and closing/reopening the library during its first read left the new dialog unloaded. Final verification must include recovery and cancellation regressions.
- Existing print test used a fixed 105 DPI reference after the previous release made paper preview resolution adaptive. Updated the test to compare against the displayed preview DPI; PDF references remain 300 DPI.
- A third review finding reproduced temporary-mask cache churn: four styled skill titles recomposed eight frozen effects per frame; twelve standalone effects recomposed eleven. A separate 64 MiB LRU stores final surfaces, using semantic protection-mask keys. Unit cache limits/invalidation tests and actual Edge warm-frame tests passed with zero frozen recompositions, exact pixels, matching diagnostics/geometry and unchanged JSON.
- Output regression passed 15/15 actual Edge cases: browser direct printing, offline deck/painting reload, PDF export and deterministic 300 DPI effect frames. Selected-playback regression passed 4/4 after the cache repair, including repeated skill-name effects inside frozen parent effects.
- Final source verification: 345/345 units, 59/59 related actual Edge cases, then 14/14 library/app cases after final shared-completion and small-preview fixes. Independent final review approved storage/UI 33/33, cache/playback 8/8 and both additional 300 DPI stress comparisons.
- Explicit reload review follow-up: closing/reopening after an external disk update used to adopt only the new storage baseline, allowing retry to overwrite it with an old visible list. Reproduced RED and unified shared read/save adoption before origin checks; obsolete imports/crops still cancel and external JSON now stays exact. Successful saves also clear the reopened manager's temporary-state display.
- Delivery complete: published public v1.3.0 from `336ff4d8c0f6f856446de42f62d1c3ac5f73f15d`, verified all five release asset sizes/SHA256, live v1.2.0-to-v1.3.0 download with dirty deck/undo/redo retained, and unauthenticated latest download. Rechecked all six delivery-file backup hashes before copying; delivered HTML SHA256 `77ae01aa0c1a37a12b92ce5ecc5e53b3aad2e3b9ca11c453324855d67f9dc5c1`. Personal data and the active user tab were not changed.
