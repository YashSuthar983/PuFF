# Cloud Kit: clouds for ordinary websites

Cloud Kit targets HTML, CSS, and JavaScript pages: portfolios, lettering, logos, interactive overlays, and atmospheric sections. A framework is optional. The library renders directly with WebGL2 and exposes independent ES modules plus a classic script bundle.

## What makes the library useful

- Cloud text and alpha masks with weathering, lifted vapor, recovery, and touch gestures.
- Arbitrary density fields and authored GPU density bodies; text is one shape adapter.
- Transparent overlays or a configurable background, independent of shape and atmosphere.
- Shared time palettes without requiring celestial objects or an automatic clock.
- Growing discharge paths, repeated pulses, and localized volumetric illumination.
- Rendering budgets and quality controls, independent of simulation and scrolling.
- A readable visual inspector with exported JSON and a separate demo for each feature.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `scene.js` | Render density, transmit/scatter light, composite alpha, control GPU resolution |
| `text.js` | Semantic HTML adapter, DOM mask measurement, shared layer scheduling, native gestures, and cleanup |
| `volume.js` | Mask-derived vapor and two-dimensional interaction/recovery simulation |
| `fields.js` | Author arbitrary voxel densities |
| `lightning.js` | Seeded bounded discharge geometry, pulses, and light reservoirs; host supplies its clock |
| `time.js` | Immutable sky and cloud lighting palettes; no rendering or scheduling |
| `config.js` | Public control metadata, defaults, and ranges |
| Portfolio/demo adapters | DOM layout, gestures, scrolling, inspector UI, and host scheduling |

The portfolio and inspector are examples, rather than requirements of the renderer. Applications can provide their own interaction handlers, voxel fields, light sources, colors, backgrounds, uniforms, and animation loop.

## Existing libraries and the standard to meet

[Drei Clouds](https://drei.docs.pmnd.rs/staging/cloud) uses instanced particles in React Three Fiber. Its documented API already provides seeded clouds, shape distribution, color, opacity, and animation.

[Takram Clouds](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds) provides volumetric geospatial clouds for Three.js, with temporal upscaling/filtering, cloud shadows, light shafts, and haze. Its plain Three.js API can also run on ordinary web pages.

Cloud Kit's opportunity is straightforward website integration and the specific interaction/authoring workflow above. Neither dependency freedom nor having extra sliders proves better visual quality or speed. Comparisons must use comparable scenes, resolutions, hardware, and quality.

## What is still required before claiming superiority

1. Real-browser desktop and phone benchmarks: GPU draw time, frame pacing, input latency, memory, initial load, scrolling, and sustained thermal behavior.
2. Visual comparisons at comparable render budgets, including storm scattering, alpha compositing, lettering, and moving lights.
3. Broader typography and DOM adapter validation: ligatures, transformed layouts, bidirectional text, Shadow DOM, and selectable semantic text across browsers. The first general adapter now ships as `CloudText`.
4. Optional performance strategies evaluated against their artifacts: cached noise/density, temporal reconstruction, and lightweight fallback renderers.
5. Browser context restoration and broader device coverage. Scene rendering currently stops on context loss; it does not rebuild all GPU resources automatically.

The current renderer uses a fixed orthographic camera. General fields are volumetric; mask text uses a shallow volume and a 2D simulation. Lighting is an artistic real-time approximation rather than a full multiple-scattering or fluid solver. These limits should remain clear in the API and demos.
