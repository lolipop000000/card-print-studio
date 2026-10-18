# GPU Effects Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for implementation and superpowers:requesting-code-review before delivery.

**Goal:** Extend the user's approved GPU rendering change from bloom to the other existing effects, without changing saved recipes or the offline print workflow.

**Architecture:** Explicit WebGL2 passes replace CPU pixel filters and alpha morphology. Accelerated Canvas2D handles existing vector, sprite, text-warp, blur and blend drawing, with software-only analysis masks separated from drawable surfaces. Retain synchronous CPU implementations as the fallback and comparison oracle. Reuse bounded GPU resources and report actual shader activity separately from the browser-managed drawing preference.

**Tech Stack:** JavaScript, WebGL2 / EXT_color_buffer_float, accelerated Canvas2D, existing Edge integration tests. No additional dependencies.

**Spec / accepted scope:** “다른 애들도 다 GPU로”, extending v1.3.1's GPU bloom. The existing effect kinds, visual controls, source artwork, alpha, object selection, saved seed/time, physical dimensions and print behavior are the contract.

## Global Constraints

- Do not modify personal project data or reload the user's existing browser tab.
- Preserve independent output surfaces and editable original assets.
- Preserve deterministic seed/time rendering and identical saved frames across the preview and print paths at the same DPI.
- CPU fallback remains available without changing JSON. Unsupported GPU, failed allocation, oversized work and lost contexts must not break rendering; restored contexts resume GPU work.
- GPU work uses bounded, reused targets and a bounded lazy program cache; never create one context per effect or frame.
- Measure the actual filter result, not a GPU detection call or a no-op pass. Browser-managed Canvas acceleration is identified honestly as a preference, rather than a guaranteed per-canvas backend.
- Compare alpha and premultiplied colors, record raster differences and benchmark complete work including transfers.

## Review Focus

- Transparent holes, low-alpha artwork and work edges must not acquire opaque boxes, black fringes, wrapping or inverted rows.
- Morphology, chromatic channel transport, grain hashing and material tables must retain their authored behavior.
- Context loss mid-operation and a failure after previous success must produce a complete CPU result with honest status.
- Repeated sizes and mixed stacks must not leak textures, reuse stale uniforms or change frozen results.
- Native GPU drawing can rasterize edges differently from software drawing: check Korean text, sprites, masking, selection, cached frames and actual PDF pixels.

## Tasks

### Task 1: Shared GPU pixel filters

**Files:** create `src/render/effects/gpu-runtime.js`, `gpu-filters.js`, `gpu-filter-shaders.js`; modify `filters.js`, `material-filters.js`, `creative-filters.js`; create `tests/effects-gpu.spec.mjs`.

**Interfaces:** `applyGpuFilter(surface, layer, options) -> surface | null`; `runGpuEffect(job) -> Uint8ClampedArray | null`; `getEffectAccelerationStatus() -> snapshot`. `backend: 'cpu'` is an internal comparison option, never persisted.

- [x] Write and observe failing browser checks: each CPU pixel-filter kind submits real GPU draws whose returned pixels change the source as expected.
- [x] Implement common guarded WebGL runtime, alpha-safe sampling, deterministic filter kernels and alpha morphology; preserve the CPU fallback.
- [x] Compare tiny/empty/partial-alpha/colored/300 DPI fixtures and deterministic repeats; exercise unsupported and lost/restored contexts and bounded target reuse.

### Task 2: Drawing, compositing and visible status

**Files:** modify `masks.js`, `composite.js`, `generators.js`, `visual-effects.js`; add integration and performance checks.

**Interfaces:** `makeSurface(work, dpi, {readback = false} = {})` keeps drawable canvases eligible for GPU drawing; dedicated analysis canvases opt into frequent CPU readback. Existing renderer interfaces remain compatible.

- [x] Add failing checks for accelerated surface settings, generator/drawing coverage and actual preview shader status without bloom.
- [x] Enable GPU-eligible vector/sprite/text/blur/blend surfaces, accelerate ripple pixels and filter mixing, retain analysis-only readback surfaces.
- [x] Verify actual browser GPU drawing support, representative complete stacks, selected playback, frozen cache, high resolution and offline UI. Benchmark warmed complete filters and stacks, documenting cold setup costs.

### Task 3: Review, complete verification and delivery

**Files:** version metadata, README, quality rules, verification record, offline distribution and six delivered files.

- [x] Run the project test command and inspect every failure; fix regressions and rerun affected checks.
- [x] Obtain independent review with this plan's Review Focus, address actionable findings with regression coverage.
- [x] Back up and hash six local delivery files, build a versioned HTML, publish using the existing authorized release workflow, verify public assets and guarded local replacement.
- [x] Record measured scope, checks, performance, limitations and delivery hashes. Final response explains activation and the actual accelerated scope.

## Execution notes

- Observed RED on the production draw check before implementation, and on the old readback-only surface setting. New GPU suite: 11/11 passed, including 18 filter kinds, 90 edge/DPI cases, ripple pixels, partial-alpha interpolation, a composite failure after a successful filter, complete native/GPU stacks at 150/300 DPI, context loss/restoration (including three mid-operation interruptions) and bounded resource reuse.
- Preserved the existing Canvas chromatic fringe/auto-dark sequence after independent review found differences from single-pass float compositing. Its tint quantization and fractional edge sampling remain exact; it reports native Canvas activity separately. RGB splitting remains a shader.
- Existing strict grain world-position regression initially found six mismatched bytes. Splitting double-precision grid coordinates before upload corrected it; related GPU/material suite passed 42/42.
- Independent reviewer approved the corrected implementation and separately probed 48 morphology cases with tiny/thin, filled, alpha-hole and maximum-radius surfaces. The full-project attempt exposed two test assumptions: software-only golden bytes on native GPU canvases, and requesting synthetic restoration before the loss event completed. Preserve all original CPU hashes on a separate legacy-raster page, test the real GPU against the unchanged native oracle and effect-specific alpha/premultiplied limits, and schedule synthetic restore after the event. Blending 13/13, tightened raster cases 2/2 and GPU 11/11 passed without further production-code changes.
- Independent follow-up review approved the split and checked four transparent fixtures against white/dark backgrounds at 1x/8x. No matte, color bleed or clipping issue was visible. Native blur differs by up to alpha 3 / premultiplied color 3.169 from software rasterization; gradient, erosion and halftone use stricter individual bounds. Same-path frozen print equality remains strict.
- Measured actual Intel Arc 130V / ANGLE D3D11 output for all 18 kinds at 150/300 DPI including transfers and independent full stacks. Directional blur 300 DPI: 477.9 ms CPU / 25.0 ms GPU; complete stack: 769.9 / 686.5 ms. Lightweight filters can be slower. Selected playback, frozen caches, Korean zoom and offline editor checks passed in the full-project attempt; PDF verification and delivery remain separate gates.
- The strict 200%/800% paint-display check raced the initial animation-frame fit, which reset its zoom input before Tab committed it. A separate deferred-fit probe reproduced the reset without changing artwork. Wait for initial layout and assert the actual scaled canvas dimensions before the unchanged zero-mismatch pixel check. The focused check passed and independent review approved the test synchronization.
- Recovery testing found a real completion-status race: after a new painting edit, the old `saved` status remained throughout the debounce, allowing reload before the latest snapshot existed. Reproduced in the unchanged browser test and a new failing unit test. Invalidate the prior completion revision before capturing each new snapshot and publish `pending`; this also prevents an older in-flight write from announcing a newer edit saved. Recovery units 8/8 passed and independent review approved the four-line fix. Final build and recovery/offline affected-file reruns follow the original full-project run; GPU source files remain unchanged.

- Final full-project attempt: 787 tests / 781 pass / 6 fail. All failures were investigated. Final units 346/346, render checks 79/79 and affected app/paint/recovery/print checks 44/44 passed. Four new regressions bring aggregate unique coverage to 791; this is not represented as one all-green full command. Production hash comparison bounds changes after the full run.
- Paired floor/fract GPU rounding was reproduced in cardinal directional blur and tiny inner-shadow offsets; weights now derive from the same cell used for fetches. Original strict test, 33 directional cases, 21 shadow cases and independent 500 directional cases passed. The original sprite encoded-PNG discrepancy remains unreproduced/unknown after 50 probes; exact decoded RGBA plus two actual PDF comparisons pass and full diagnostics are retained. Reviewer approved final changes.

- Published v1.4.0, verified all five server asset hashes, exercised live current/update/download UI in isolated Edge, and confirmed unauthenticated latest download. Guarded six-file local delivery matched the release SHA256; personal data and the user tab remained untouched.
