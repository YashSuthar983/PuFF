# Performance audit — 15 October 2026

CPU-only rendering of the full cloud scene is too expensive for a normal website. The demos now choose an artwork fallback when usable hardware acceleration is unavailable, and a smaller live profile for constrained hardware. These changes cover both `emerald-demo` and `emerald-3d`, while preserving the newer demo's plate alignment, glass model, and cliff options.

## What was expensive

- Emerald 3D had three independently scheduled WebGL renderers: the world/composite pass and two mist layers. The world updated at display cadence while each cloud layer had its own clock.
- Its offscreen G-buffer used three RGBA8 attachments plus depth. A high-quality 2880×1620 target needs about 71 MiB per buffer set before driver overhead; keeping an old and new bake plus a preview could approach 147 MiB for these attachments alone.
- Fixed resolution/sample settings were used initially, even on software graphics. Cloud Kit's GPU timer adaptation does not run on browsers lacking the timer extension, and its timing only covers the cloud pass.
- The old cliff renderer allocated new light-upload arrays every draw and used antialiasing even for constrained devices.
- The newer demo did not stop its host loop when offscreen. Its `?cliff=3d` failure path also left the artwork layers hidden.

## Measured software-rendering result

The actual Cloud Kit shaders and Emerald 3D mist masks were drawn through surfaceless EGL/GLES3 using llvmpipe, with `LIBGL_ALWAYS_SOFTWARE=1` and `LP_NUM_THREADS=1`. Each case has three warmups and twenty timed combined mist draws, waiting for completion outside the application. Fixed density, lighting, time, and view inputs make the three cases comparable.

| Controlled mist workload | Median | 95th percentile |
|---|---:|---:|
| Previous: 1280×720 / 28 samples + 960×540 / 20 samples | 1475.424 ms | 1896.087 ms |
| Balanced: two 720×405 / 20-sample layers | 542.732 ms | 587.363 ms |
| Power saver: one 480×270 / 12-sample layer | 71.142 ms | 73.639 ms |

Power saver reduced this measured mist cost by about **20.7×**. Even that cost exceeds a 15 fps frame budget before adding the world, browser layout, decoding, or compositing. This supports using static artwork on CPU-only graphics rather than claiming live 3D will stay smooth.

These are **not browser frame rates, integrated-GPU benchmarks, or phone measurements**. The executable measures only the mist passes in this container. It deliberately bypasses the new browser guard to measure the software path. See [raw measurements](benchmarks/software-mist-2026-10-15.json) and [reproduction script](benchmarks/measure-mist.mjs):

```sh
node cloud-library/benchmarks/measure-mist.mjs
```

A C compiler and EGL/GLES development libraries are needed for this optional benchmark. Normal website use requires no installation.

## Current device policy

| Mode | Frame cap | Live mist | World target cap | Maximum bake-strip work |
|---|---:|---|---|---:|
| Static artwork | No effect loop | None | None allocated | None |
| Power saver | 15 fps | One layer, 12 samples, max 480 px long edge | 800 px long edge / 360,000 pixels | 18,000 pixels |
| Balanced | 30 fps | Two layers, 20 samples, max 720 px long edge | 1440 px long edge / 1,200,000 pixels | 64,000 pixels |
| Full effects | 30 fps | Two layers, 32 samples, max 1100 px long edge | 1920 px long edge / 2,100,000 pixels | 100,000 pixels |

These are ceilings, not promised frame rates. In Auto, low reported memory or core count starts power saver. Unknown hardware starts balanced conservatively. Data saver and reduced motion start with artwork; the visitor can explicitly select another rendering mode.

Context creation uses `failIfMajorPerformanceCaveat` to reject major performance caveats, with a one-time software-renderer check when the browser exposes the renderer name. Browsers may hide hardware details, so the policy also observes sustained frame cadence. The available context hints and their limitations are documented by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext).

Auto drops to power saver after sustained slow cadence and then to artwork if it remains overloaded. Three severe consecutive stalls trigger an earlier downgrade. Hidden/offscreen intervals reset the observer so resuming does not count as a stalled frame. This cadence check observes overall scheduling pressure; it is not a GPU timer and cannot identify the bottleneck by itself.

The rendering selector offers Auto, Power saver, Balanced, Full effects, and Static artwork. The same options are available as `?render=auto|low|balanced|high|static`. Explicit live modes still require a usable accelerated context. They do not force software rendering.

## Work and memory reductions

- Emerald 3D uses one capped host clock. Its mist layers are manually stepped by that clock rather than running independent RAF loops.
- Effect rendering stops for hidden tabs and offscreen heroes. Pause clears live pulses; stopped time does not replay on resume.
- The world target is bounded by both long edge and total pixels, including portrait/high-DPI screens. Preview work is capped to the strip budget. Completed bakes release the startup preview.
- At the power-saver limits, two full G-buffer sets plus a preview are approximately 11.3 MiB. Balanced is approximately 37.6 MiB. These estimates cover colour/depth attachments only; decoded images, driver storage, the canvas, textures, and browser compositing add memory.
- The original demo's power-saver cliff uses a 3,072-triangle mesh, pre-sized 256 px scan maps, a capped framebuffer, and reused light arrays. Antialiasing is disabled for this renderer.
- Expensive idle parallax, per-frame award image filtering, grain, backdrop blur, and permanent promoted image layers are disabled in power saver/static where applicable.
- Cloud Scene and mask renderers no longer allocate an unused default depth buffer. The world's explicit offscreen depth attachments remain, so its glass/rock occlusion still works.
- `CloudText` requests an accelerated context and preserves native HTML if the browser rejects it. This also protects the portfolio's text fallback. Direct `CloudScene`/`CloudVolume` hosts can opt into the same creation guard via `failIfMajorPerformanceCaveat:true` and `powerPreference:'low-power'`.

Reducing the backbuffer and avoiding unnecessary allocations follows the tradeoffs described in [MDN's WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). The chosen limits are application policy, not values prescribed by that documentation.

## Verification and remaining limits

The automated suite covers no WebGL, software graphics, low-spec hints, data saver, reduced motion, initial resource budgets, one frame clock, frame caps, offscreen/hidden suspension, release, slow-frame downgrades, portrait/high-DPI memory caps, strip size, and native text fallback. It also compiles the real shader pairs and preserves the existing glass model / scene tests.

Real integrated GPUs, older phones, thermal throttling, battery use, and browser compositor costs have **not** been measured here. A physical-device matrix is still needed before promising a target FPS. The software measurements justify the fallback policy; they do not replace those device tests.
