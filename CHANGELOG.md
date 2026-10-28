# Changelog

## 0.2.0 — 2026-10-28

- Release WebGL contexts on `destroy()` via `WEBGL_lose_context` in `CloudScene` and `CloudVolume`, and support React `StrictMode` same-canvas remounts.
- Automatic `webglcontextlost` and `webglcontextrestored` recovery for `CloudScene`, `CloudVolume`, and `CloudText`, with `onContextLost`, `onContextRestored`, and `contextLost` performance reporting.
- Non-blocking shader compilation via `KHR_parallel_shader_compile`, `ready` promises on `CloudScene` and `CloudVolume`, and `onError` handling for asynchronous shader failures.
- Sleep-backed frame scheduling at low target frame rates, `beforeRender` host hook, and `pauseWhenHidden` offscreen `IntersectionObserver` suspension.
- Specialized `CloudScene` fragment shader loop bounds (`PUFF_MAX_STEPS` and `PUFF_BOLTS`), per-context program caching, and background recompilation when bounds increase.

## 0.1.0 — 2026-10-19

- Initial npm release as `@chartara/puff`, licensed under MIT.
- WebGL2 cloud scenes, cloud lettering, lightning, and custom density fields.
- ES module exports and a classic script bundle with the `PuFF` global.
- TypeScript declarations and an external CloudText stylesheet for strict Content Security Policy.
- Automatic quality settings and adaptive resolution, with presets for mobile devices and software WebGL.
- Reduced-motion support, runtime controls, and cleanup methods.
