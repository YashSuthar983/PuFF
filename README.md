# PuFF

Interactive clouds, lettering, and storms for the web.

A dependency-free WebGL2 cloud library. **Text is one adapter**: the main renderer accepts a procedural atmosphere or a custom three-dimensional density field.

Licensed under [MIT](LICENSE).

- `CloudScene`: soft cloud layers, isolated puffs, storms, fog, smoke, custom volumes.
- `CloudText`: attach cloud lettering to semantic HTML, with one shared renderer per document.
- `CloudVolume`: turn the alpha of a canvas mask into puffy cloud lettering, logos, or silhouettes; includes wind, sweep, tap vapor, and recovery.
- `Lightning`: bounded discharge geometry with independent power, reach, branches, cadence, afterglow, and illumination. Used inside cloud volumes, with a Canvas 2D overlay available separately.
- `CloudTimes`: shared Dawn, Day, Noon, Dusk, and Night lighting palettes.
- `createDensityField`: sample your own density function into a WebGL-compatible voxel field.

The storm look is inspired by the supplied reference: blue-white light originates within the volume, optical depth dims it through vapor, and foreground clouds occlude the lightning channels. This is a real-time approximation; presets describe visual appearances, not meteorological simulations.

## Install

```sh
npm install @chartara/puff
```

Registry installation requires a published release. Until the first release, run `npm pack` in this checkout and install the resulting `.tgz` in your application with `npm install /path/to/chartara-puff-0.1.0.tgz`.

```js
import {CloudText, CloudScene} from '@chartara/puff';

const words = new CloudText(document.querySelector('h1'));
const sky = new CloudScene(document.querySelector('canvas'), {preset:'clouds'});
// When your page/component unmounts:
words.destroy();
sky.destroy();
```

This package is ESM-only. Named imports allow bundlers to remove unused renderers; there is no CommonJS `require()` entry. Module import is safe during server rendering, but instantiate renderers after the target DOM exists on the client. The runtime has no package dependencies.

For an SSR host, call this function from its client mount hook and register the returned cleanup with the host:

```js
import {CloudText} from '@chartara/puff';

function mountCloudText(element) {
  const words = new CloudText(element);
  return () => words.destroy();
}
```

The support target is current stable Chrome, Firefox, and Safari, including their mobile browsers. Rendering requires WebGL2, Canvas 2D, DOM Range, animation frames, and AbortController event listeners. Older browsers and embedded webviews are not a guaranteed support target. Keep a native HTML fallback; validate typography and performance on your actual devices. Automated browser tests use pinned Playwright engines and do not replace real-device testing.

## Develop and run the examples

From this folder:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/examples/` for the interactive feature gallery. It also opens directly from disk. No install is required to view it.

Development uses Node.js 22 or 24. Install the locked development tools and browser engines:

```sh
npm ci
npx playwright install chromium firefox webkit
npm --offline --no-update-notifier run check
```

`dist/puff.js` is generated from `src`, including automatically before packing. See [the design scope](DESIGN.md) for module boundaries and known limits, [the changelog](CHANGELOG.md) for pending changes, and [release steps](RELEASING.md) for owner decisions and publication.

`npm test` rebuilds the browser bundle before running the tests. The suite compiles and links the actual text, scene, and custom-density shaders through surfaceless EGL/GLES3 when a C compiler and EGL/GLES development libraries are available. It reports a skip otherwise. Run `PUFF_REQUIRE_GL=1 npm test` to require this check. Numerical tests cover weathering, recovery, frame cadence, and gesture completion. DOM/WebGL fixtures cover interaction and lifecycle; they do not measure browser or phone rendering performance.

`npm run check` runs its nested npm commands offline with update notifications disabled; install the development tools and browsers first. `npm run test:package` installs an actual tarball into a clean consumer, checks exports and TypeScript, and enforces production bundle-size limits. The consumer pack/install checks also run npm offline. `npm run test:browser` checks the installed package in Chromium; set `PUFF_BROWSER=firefox` or `webkit` to select another installed engine. CI covers all three. `PUFF_SOFTWARE_GL=1` lets the browser fixture use real software WebGL by relaxing only the accelerated-context requirement inside the test; it does not change the library's fallback policy. `PUFF_BROWSER_EXECUTABLE=/path/to/chrome` optionally selects a local Chromium executable.

## Cloud lettering on ordinary HTML

```html
<h1 class="cloud-word">Hello, sky.</h1>
<script src="/vendor/puff.js"></script>
<script>
  const words=new PuFF.CloudText('.cloud-word',{
    timeOfDay:'dawn',quality:'medium'
  });
  words.puff();
</script>
```

For this classic-script example, copy `node_modules/@chartara/puff/dist/puff.js` into your site's `/vendor/` assets. The bundle is also exported as `@chartara/puff/dist/puff.js` for tooling that copies or imports it for its `globalThis.PuFF` side effect. Normal ESM applications should use `import {CloudText} from '@chartara/puff'`.

The target can be a CSS selector, a single HTML element, or an iterable of elements. Use block or inline-block targets without nested cloud targets. Initially hidden targets are allowed and allocate their mask when shown. All instances in a document share one WebGL2 renderer, while each mask retains its own weathering, vapor, and formation state.

The original HTML stays in the document: headings, selection, links, keyboard navigation, and accessible text remain available. The canvas is decorative (`aria-hidden`) and cannot intercept clicks. Font changes, resizing, and text mutations rebuild the affected mask. The canvas follows DOM glyph positions, including wrapping, emphasis, spacing, and ordinary horizontal text. Generated pseudo-element content is not part of the mask; advanced ligatures and typography need browser-specific visual validation. Shadow DOM is currently rejected explicitly.

Text overlays are transparent. Supply any CSS background beneath them, independently of the cloud palette. The adapter temporarily sets relative positioning on static targets and stores a selection color; `destroy()` removes its canvas, observers, owned styles, and GPU layers. When WebGL2 is unavailable, or rendering fails, the native HTML remains visible and `onError` reports the failure.

### Content Security Policy

By default CloudText injects one shared stylesheet. For a host that disallows inline styles, load the exported stylesheet through your bundler (or copy it into your site's assets and use a permitted `<link rel="stylesheet">`), then disable injection on **every** CloudText instance:

```js
import '@chartara/puff/text.css';
import {CloudText} from '@chartara/puff';
const words = new CloudText('h1', {injectStyles:false});
```

Use a production CSS extraction pipeline that produces an external stylesheet allowed by your policy; a development bundler that injects style tags still needs its own CSP configuration. `injectStyles` is construction-only. The external stylesheet belongs to the host and remains loaded after `destroy()`.

```js
const words=new CloudText(document.querySelectorAll('[data-cloud]'),{
  timeOfDay:'night',cloudColor:'#dceaff',
  puffiness:1.2,formationDuration:1.6,padding:28,
  fps:30,idleFps:8,quality:'medium',
  adaptiveQuality:1,renderBudgetMs:12,minRenderScale:.5,
  trailStrength:1,scrollWind:.35,tapStrength:1,stirStrength:1,
  vaporDensity:.6,airStrength:1,
  lightColor:'#8edaff',lightPower:1,lightReach:180,lightHeight:70,
  physics:{recoveryRate:.9,vaporDissipation:1.15},
  onError:error=>console.warn(error.message)
});
words.setOptions({timeOfDay:'dusk',trailStrength:.5});
words.setText('New words',0); // explicitly replaces that target's inline content
words.puff();                // center puff on each attached element
words.puff(80,30,.7,target);  // CSS coordinates relative to one target
words.gust(.8);
words.setPlayMode(true);     // finger sweeping and hold-to-stir on target elements
words.setPlayMode(false);    // native touch scrolling and selection
words.setPaused(true);
words.refresh();             // request fresh masks after unusual layout changes
console.log(words.getPerformance());
words.destroy();
```

For application-owned gesture arbitration, set `pointerEvents:false` and forward events with `handlePointer('pointermove',event)` (also accepts `pointerdown`, `pointerup`, and `pointercancel`). Forwarded touch events sweep without generating an automatic tap; call `puff()` explicitly for taps. `stir(x,y,strength,target)` accepts the same element-local CSS coordinates as `puff()`. `reformOnEnter:true` makes returning text condense again, while recovering its density state offscreen. Defaults retain automatic input and preserve completed formation on return.

`setLighting({lit,shade,direction,glare,glareTint})` supplies host lighting without rebuilding masks. `setLights(lights)` accepts up to four light sources in viewport CSS coordinates, choosing the strongest overlapping source for each shallow text volume. Each light has `x`, `y`, `strength`, optional `height`, `reach` (CSS pixels), `radius` (scene units converted using viewport height), `color`, and `glow`. Updating sources redraws affected visible words; removing them clears previous illumination. A text volume still samples one local source per draw.

`setWind({x,y,strength})` supplies a continuous breeze using CSS-pixel velocity and strength 0–2; `setWind(null)` restores scroll-derived wind. This transient source is independent of the sky renderer and is not included in settings export.

Ordinary touch swipes retain native scrolling and never also produce a tap puff. Quick taps produce vapor. Finger sweeping and hold-to-stir are available in explicit play mode; pausing or disabling interactions exits that mode and restores native scrolling. Reduced-motion users receive a still, fully formed cloud. Offscreen elements skip rendering and keep cached state. On return, a single relaxation pass restores density and fades vapor for the elapsed time; formation also advances. It approximates hidden recovery without replaying advection frames. There is no simulation catch-up burst after a hidden tab returns.

The scheduler draws at most one text element per animation frame. `fps` is the requested active cadence per element, `idleFps` the resting cadence (0 disables idle animation); many visible elements share that budget and may render less frequently. Settled masks skip CPU advection while their GPU billows can still animate. Only visible elements allocate layers; the cache evicts old offscreen layers when it reaches 32 (visible layers are retained). An evicted element recreates its mask on return. `maskLimit` bounds each mask's longest side (default 2048); the quality profile caps render output independently.

Pointer redraws respect `fps`; configuration and layout changes can redraw immediately. Weathering continues until density and vapor settle within texture-byte precision, so slow recovery settings also work with `idleFps:0`. `recoveryRate:0` preserves the damaged lettering. Native touch swipes never generate sweep segments; completed mouse or play-mode strokes retain their drag state until drawn, even when released between frames.

`adaptiveQuality` uses measured CPU submission time, including the canvas copy, to adjust the per-element render scale between `minRenderScale` and 1, without recreating density or slowing formation. It gradually recovers with headroom. It is **not a GPU timer or whole-page FPS measurement**. Disable it for fixed resolution. `getPerformance()` reports shared renderer/cache/draw counts, owned element visibility, minimum owned render scale, last CPU submission time, and any rendering error. Real hardware benchmarks remain necessary.

`getOptions()` returns detached JSON-compatible options; callbacks are omitted. `CloudControls.text` exports the scalar metadata for building CloudText controls. Full physics metadata is in `CloudControls.volume`. Quality profiles for this mask adapter use 16/24/36 ray samples with 640/1000/1600px width ceilings, separately from the general scene renderer's profiles.

## A cloud scene

Classic script:

```html
<canvas id="sky" style="width:100%;height:100vh"></canvas>
<script src="/vendor/puff.js"></script>
<script>
  const sky = new PuFF.CloudScene(document.querySelector('#sky'), {
    preset: 'storm', quality: 'medium', color: '#8edaff'
  });
</script>
```

Or ES modules:

```js
import {CloudScene, createDensityField} from '@chartara/puff';
const sky = new CloudScene(canvas, {preset:'clouds', shape:'sphere'});
```

Size the canvas with CSS. The renderer observes size changes; `resize(width,height)` sets explicit dimensions in CSS pixels. By default it owns its animation loop and pointer listeners. Hover mode uses mouse movement and touch placement for discharge origins without capturing touch or preventing scrolling. Random mode works independently of a cursor. Lightning is initially enabled only by the storm preset. `StormClouds` is a convenience subclass defaulting to that preset.

`interactive`, `autoStart`, `densityShader`, `powerPreference`, and `failIfMajorPerformanceCaveat` are construction-only. Changing them through `setOptions` or `setTimeOfDay` throws; use `start()` / `stop()` for scheduling and construct a new scene to change input ownership or context settings. Unchanged construction values from a saved `getOptions()` object may be reapplied.

`setOptions({preset:'fog'})` applies that preset's density, ambient light, exposure, colors, and lightning default. Other values in the same patch override the preset. `shape:'layer'` fills the sky; `'sphere'` confines procedural clouds to an isolated puff.

| Setting | Range / meaning |
| --- | --- |
| `coverage` | 0–1, vapor density/coverage |
| `detail` | 0–2, procedural billow erosion |
| `ambient` | 0–2, soft ambient illumination |
| `exposure` | 0.3–3, output brightness |
| `drift` | 0–2, animation speed |
| `cloudColor`, `background` | `#rrggbb` or normalized RGB array |
| `quality` | auto (default): cpu on software WebGL, low on phones / tablets / ≤4 GB or ≤4 cores, medium otherwise; cpu: 10 ray steps / 30fps / 480px with 8 rendering bands; low: 20 / 15 / 800px; medium: 40 / 24 / 1280px; high: 64 / 30 / 1920px |
| `resolutionScale` | 0.1–2, render pixel multiplier within the resolution ceiling |
| `color` | internal lightning color |
| `lightningPower` | 0–2; 0 disables discharges |
| `boltReach` | 40–500 CSS pixels |
| `branches` | 0–8 |
| `interval`, `afterglow` | 600–30000ms, 100–2000ms |
| `cloudGlow` | 0–2, cloud illumination independent of visible bolt strength |

The profile is a starting point. `raySteps` (4–96), `resolutionLimit` (256–4096), `pixelRatio` (0.5–2), and `fps` (4–60) are independent overrides. Resolution also respects the GPU renderbuffer limit. Selecting a quality profile applies all its rendering defaults; overrides in the same patch win. Pick a profile instead of `auto` to choose it manually.

Without a usable GPU, browsers that still offer WebGL draw it in software on the CPU (SwiftShader, llvmpipe). `auto` detects that from the renderer name and uses `cpu`. If WebGL2 is unavailable, construction throws (`CloudScene requires WebGL2.`) and the page should keep its fallback. Performance depends on the browser, renderer, scene, and resolution; measure on the devices you support.

`CloudControls.scene`, `.lightning`, `.text`, and `.volume` export the complete scalar control metadata: labels, groups, ranges, steps, and defaults. Build your own editor from this metadata instead of duplicating engine limits.

```js
sky.setOptions({
  quality:'high', raySteps:72, fps:24,
  density:1.2, noiseScale:.8, softness:.12, erosion:.08,
  extinction:3.8, shadowStrength:2.5, lightIntensity:1.1,
  offset:[0,.2,0], scale:[1.2,1,1],
  windDirection:[.03,0,.01], lightDirection:[-.5,.6,.3],
  viewScale:4, volumeDepth:5.2, shapeRadius:1.8
});
const saved=JSON.stringify(sky.getOptions());
sky.setOptions(JSON.parse(saved));
```

`getOptions()` returns a detached JSON-compatible configuration, excluding callbacks. It does not serialize current particles, elapsed time, or uploaded voxel bytes. Restore custom fields separately. `beforeRender`, `onFrame`, `onStrike`, `onError`, `onContextLost`, and `onContextRestored` callbacks let a host update inputs before each scheduled frame, observe renders and discharges, or respond to shader/context events. `pauseWhenHidden:true` uses an `IntersectionObserver` to suspend scheduling while the canvas is offscreen without changing `running`. `start`, `stop`, `render`, and `setPaused` let it choose who owns scheduling.

### Backgrounds and time palettes

The background is optional, independent of cloud shape and atmosphere:

```js
const clouds=new CloudScene(canvas,{
  preset:'clouds',shape:'sphere',transparent:true,timeOfDay:'dawn'
});
clouds.setTimeOfDay('night');
clouds.setOptions({backgroundOpacity:.25}); // blend a little sky behind the vapor
clouds.setOptions({transparent:true});       // alpha overlay over your own HTML
```

`backgroundOpacity` ranges 0–1, default 1; `transparent:true` is shorthand for 0 and `false` for 1. Explicit `backgroundOpacity` in the same patch wins. The WebGL canvas supports alpha; partial opacity produces a real cloud alpha channel rather than a painted background. Put your own background beneath it with CSS. Lightning contributes alpha even in otherwise clear sky. Mask clouds already have transparent output.

`CloudTimes` exports immutable palettes (`dawn`, `day`, `noon`, `dusk`, `night`; `sunset` aliases dusk). `setTimeOfDay` changes colors, ambient illumination, and light direction; other options in the same call override that palette. It does not change cloud shape, density, lightning mode, or background opacity. `timeOfDay:'custom'` keeps the current colors. Palettes create no sun, moon, stars, timers, or automatic cycle. The gallery has independent Time palette and Transparent background controls and dedicated demonstration frames.

### Performance controls

The renderer still samples density at every ray step, but interpolates between nearby lighting calculations for `shadowStride` samples (default 3). This reduces repeated shadow marches; set it to 1 for full lighting sampling, or increase it for faster, less precise lighting. Mask clouds accept the same `shadowStride` constructor option.

`octaves` (1–4), `selfShadow` (0–1), `lightSamples` (0–2), and `maxLights` (0–3) control separate shader costs. `amortize` (1–16) spreads a cloud frame across horizontal bands and blends completed frames; 1 draws whole frames. Larger values reduce work per animation frame at the cost of visible motion and lighting delay. The first frame is drawn whole, and three render textures hold the completed and in-progress frames.

`adaptiveQuality:1` is enabled by default. Where `EXT_disjoint_timer_query_webgl2` is supported, completed GPU timing queries adjust render resolution toward `gpuBudgetMs` (default 12ms), down to `minRenderScale` (default 0.5), then gradually restore it when there is headroom. Queries are asynchronous and bounded; the renderer never waits for a GPU result. Devices without the extension (software WebGL, most phones) use the frame cadence instead: frames that arrive well after their slot (`fps`) lower the resolution, and a sustained on-time cadence restores it by 5% every 24 drawn frames. Cadence also reflects other page work, so it is a coarser signal than GPU timing. Set `adaptiveQuality:0` for a manual, fixed resolution (`resolutionScale`). These settings have controls in Effects and the gallery inspector.

Automatic scaling changes only the render pixels, preserving simulation time, ray samples, interaction coordinates, and authored options. `sky.getPerformance()` reports `{gpuTimingAvailable,gpuMs,frameMs,renderScale,width,height,software,profile,contextLost}`; `gpuMs` is an average of completed draw timings and `frameMs` the average interval between drawn frames (without GPU timing), neither a whole-page FPS measurement. `software` is true on a software renderer; `profile` is the quality in use; `contextLost` indicates whether the WebGL context is currently lost. The gallery uses one shared sky renderer and one mask renderer; only the selected visible frame animates, and normal-quality previews use CSS pixel resolution instead of extra device pixels.

```js
sky.setOptions({shadowStride:3,adaptiveQuality:1,gpuBudgetMs:12,minRenderScale:.5});
console.log(sky.getPerformance());
```

### Lightning modes

- `random`: occasional flashes, with independent randomized positions and waits. The default base interval is 7 seconds; randomness 0.7 varies waits approximately 4.55–9.45 seconds.
- `hover`: use the pointer as the origin, with the configured cadence.
- `manual`: emit only after `strike()` / `trigger()`.
- `off`: disable both automatic and requested flashes.

`randomness` ranges 0–1 and varies timing by up to ±50%; `variation` ranges 0–1 and varies brightness and duration. `seed` reproduces the random sequence. An unchanged setting does not restart the cooldown. Power, reach, branches, afterglow, and cloud glow stay independent. Storm is the only built-in atmosphere that enables lightning by default.

Discharges extend along their main path and delayed branches. Each subsequent pulse traverses those paths again; up to three moving light reservoirs illuminate different cloud regions, then decay softly. The renderer evaluates these lights inside its existing volume pass, with density-dependent absorption and foreground occlusion, rather than adding fullscreen flash layers.

| Pulse setting | Meaning |
| --- | --- |
| `propagation` | 50–900ms, time to travel along a path |
| `pulseCount` | 1–6 discharges per strike |
| `pulseSpacing` | 40–500ms, randomized spacing between pulses |
| `glowDecay` | 80–1500ms, fade of each illuminated region |
| `glowSpread` | 0.05–2, regional illumination radius in scene units |

The actor uses the same setting names via `configure`. Travel, pulses, and decay are captured when a strike starts; adjustments apply to the next strike. Spread and overall glow update live. The shader budgets remain three lights and 32 visible channel segments, with at most two concurrent strikes. These are artistic lighting effects, not electrical or fluid simulations.

The standalone actor accepts `new Lightning(canvasOrNull,{mode:'random',seed:42,interval:7000})`. Its target callback receives `(reach,origin)`; target positions should be chosen around that origin. Supply `source.bounds={x,y,width,height}` for random origins in your coordinate system. `getState()` reports settings and `nextStrikeIn`.

### Shared mask layers

For custom hosts, one `CloudVolume` can keep independent masks without additional WebGL contexts:

```js
const renderer=new CloudVolume({sharedBuffer:true});
const layer=renderer.createLayer(maskCanvas,{scale:80,puffiness:1});
const frame=renderer.renderLayer(layer,dt,false,pointer,{
  formation:.8,renderScale:.75,simulate:true
});
ctx.drawImage(frame.canvas,frame.x,frame.y,frame.width,frame.height,0,0,width,height);
renderer.gustLayer(layer,.8);
renderer.recoverLayer(layer,elapsedOffscreenSeconds);
renderer.releaseLayer(layer);
renderer.destroy();
```

Layer handles are opaque and belong to their renderer. Copy the returned staging region immediately before another layer renders. `formation` controls the condensation texture (0–1); `renderScale` controls pixels (0.25–1). The returned `settled` flag lets hosts stop scheduling physics when no weathering remains. `simulate:false` advances visual time without advection for settled masks; pending gust or recovery changes still upload. Configure lighting, point lights, trail strength, and physics on the renderer before each layer render. `recoverLayer()` performs a bounded, analytic recovery pass using the current physics settings and honors outstanding recovery delays. `destroy()` releases every remaining layer and owned simulation buffers.

### Your own GPU density

Provide a GLSL **function body** when constructing a scene. It receives world-space `vec3 p`; existing noise helpers, the 3D texture, and standard uniforms are available. `cloudBase(p)` delegates to the built-in procedural/voxel density, including its transforms.

```js
const sky=new CloudScene(canvas,{
  densityShader:`
    return cloudBase(p) * uAmount;
  `,
  uniforms:{uAmount:.7},
  onStrike:event=>console.log(event.source,event.duration)
});
sky.setUniforms({uAmount:.9});
```

Custom uniforms accept a finite scalar or 1–4 component vector and must use unique `u`-prefixed names. Changing their values reuses the compiled program. Density code is a construction-time choice; create a new scene to replace it. A custom body decides which standard density controls to use; the lighting and rendering controls still operate on its output. The framed gallery includes an authored GPU density example.

`sky.strike(x,y)` requests a flash at canvas-local CSS coordinates. `setPaused(true)` freezes drift and clears automatic lightning. `start()` / `stop()` control scheduling; `destroy()` deletes GPU objects and releases the WebGL context via `WEBGL_lose_context`. Constructing a new `CloudScene` on the same `<canvas>` (including React `StrictMode` double-mount) automatically restores the context; note that WebGL context creation attributes passed to `getContext` are ignored when reusing an existing canvas context. Where `KHR_parallel_shader_compile` is available, shader compilation is non-blocking and `sky.ready` (also on `CloudVolume`) resolves once the initial program links; `render()` returns `false` until ready, and asynchronous compile failures reject `ready`, invoke `onError`, and leave the scene inert. Hidden tabs (and offscreen canvases when `pauseWhenHidden:true`) stop scheduling and resume without simulation catch-up. Reduced-motion preferences pause automatic motion. Context loss suspends rendering (`onContextLost`), and `webglcontextrestored` automatically rebuilds GPU resources, re-uploads any custom density field, and resumes (`onContextRestored`).

## Any cloud shape

Use a density function returning 0 (empty) through 1 (dense). Sample coordinates run from -1 to +1, and the returned bytes are ordered **x fastest, then y, then z**. Positive y is up in the volume; positive z faces the viewer.

```js
const ring = createDensityField((x,y,z) => {
  const distance = Math.hypot(Math.hypot(x,y)-0.58, z);
  return Math.max(0, (0.23-distance)/0.08);
}, {width:64, height:64, depth:64});
sky.setDensityField(ring.data, {...ring, extent:[2,2,2]});
// extent contains half extents in scene units.
// Return to the procedural atmosphere:
sky.clearDensityField();
```

You can instead upload your own `Uint8Array` with exact matching dimensions. Dimensions must fit the GPU's 3D texture limit. The helper limits each axis to 2–256. `setDensityField` uploads only when called: changing light, scrolling, and rendering reuse the existing texture. `detail` erodes the billows and `drift` moves their fine vapor texture for both procedural and custom fields. Set detail to 0 to render a custom field without erosion. Animate custom geometry with your own sampler and subsequent uploads; the procedural `shape` option applies only when no custom field is active. Coverage and lighting apply to both.

## Custom lighting and a host-owned loop

```js
const sky = new CloudScene(canvas, {
  preset:'storm', interactive:false, autoStart:false, lightning:false
});
sky.setSources([
  {x:300, y:180, depth:0, strength:1, color:'#ff90d4'}
]);
sky.render(2.5, 1/60); // time in seconds, dt for lightning evolution
```

`setSources(lights, segments)` accepts up to three lights and 32 channels. Positions use canvas-local CSS pixels; depth uses scene units (front is +2.6, back is -2.6). Sources combine with automatic lightning, with external entries taking priority within those budgets. Segments have `{a:{x,y}, b:{x,y}, strength, color}` and lie at depth zero behind the front vapor. Drawn channels inherit their selected color, with pale cores. The full scene can use an opaque, partially transparent, or absent background. Lights optionally include a `radius` in scene units (default 1). `CloudVolume` supplies transparent mask clouds for compositing.

## Text, logos, and 2D masks

The volume adapter takes **any alpha mask**, not text-specific strings. Create the mask using your chosen font, draw a logo or image silhouette, or paint an arbitrary canvas shape. Await fonts before measuring lettering.

```js
import {CloudVolume} from '@chartara/puff';
const mask=document.createElement('canvas');
mask.width=900; mask.height=360;
const ctx=mask.getContext('2d');
ctx.font='italic bold 150px Georgia';ctx.fillStyle='white';
ctx.fillText('Cloud',120,220);
const text=new CloudVolume({gridSize:240,raySteps:24});
text.setMask(mask,{scale:150,puffiness:1});
document.body.append(text.canvas);
text.render(1/60,false,{active:false,segments:[]});
```

Call `render(dt,paused,pointer)` from your own loop. `pointer` may supply velocity, swept segments `{ax,ay,bx,by}`, and effects `{kind:'puff'|'stir',x,y,strength}` in mask pixels. `trailStrength`, `vaporDensity`, and `airStrength` remain independent. `gust(strength)` sends wind through the mask; density gathers back. For a movable light, set `pointLight={x,y,height,power,reach,color:[r,g,b],glow}`, mark `dirty=true`, and render. Lighting never changes cloud density. `destroy()` releases adapter-owned GPU objects; an externally supplied formation texture remains caller-owned.

For a continuous direct-mask breeze, set `environmentWind={x,y,strength}` using mask-pixel velocity, mark `dirty=true`, and keep rendering while it is active. Set it to `null` to remove the source. CloudText hosts should use `setWind()` with CSS-pixel velocity instead.

Time, coordinates, and strengths must be finite, with nonnegative `dt`. A zero-time draw leaves physics unchanged. Visual time advances by `dt`; each physics step is capped at 0.25 seconds to bound movement after a delayed frame. Each draw handles the most recent 64 sweep segments and 8 effects. Queued segments still apply after `active` becomes false, so retain them through a normal release and clear them on cancellation. Mark segments with `down:true` to retain drag strength after release. Settled direct masks skip simulation and density uploads automatically.

The examples gallery includes presets, an isolated puff, a custom ring, text sweeping, and separate sliders for scene and lightning settings. The reusable library has no résumé, navigation, scroll controller, or portfolio DOM dependencies.


## Configurable mask physics

```js
const cloud=new CloudVolume({
  gridSize:360, raySteps:32, renderWidth:1600, renderHeight:1000,
  physics:{recoveryRate:.9,vaporDissipation:1.15,brushSize:1,weathering:1,puffDuration:1.8}
});
cloud.configure({recoveryRate:.5,brushSize:1.4});
const options=cloud.getOptions();
```

`configure()` changes recovery, vapor dissipation/lifetime, sweep size/erosion, tap duration, retained letter density, and released vapor capacity without resetting density. Trail strength, vapor density, and air strength are independent public properties. Mask geometry, render limits, and ray detail use `VolumeOptions`; call `setMask` after changing mask construction options. Text and logo layout remain the host's choice.

## Examples

The repository's `examples/` feature gallery has fourteen individual frames: soft clouds, storms/lightning, fog, smoke, an isolated puff, a ring, a heart, lettering, an arbitrary alpha mask, movable lighting, weather/recovery, transparent overlays, time palettes, and authored GLSL density. Play one frame and adjust its settings in the inspector. The gallery shares one scene renderer and one mask renderer; initial previews are rendered in sequence. It uses only this library's public API.

The examples stay in the repository and are excluded from the npm tarball. Use the development server above from a repository checkout.

`setPointer(x,y)` places a pointer programmatically in canvas-local coordinates; `clearPointer()` deactivates it and `clearLightning()` removes live discharges. `CloudVolume.lighting` accepts explicit lit/shade RGB colors, light direction, glare, and glare tint for your own mask palette.

Current GPU budgets are three light sources and 32 bolt segments per scene; lightning retains at most two live strikes. These bounds prevent unbounded work. The renderer approximates volumetric light transport and does not reproduce full physical multiple scattering.

## Constrained devices

`CloudText` requests an accelerated renderer and leaves native HTML visible if the browser rejects it. The document caches that initial renderer failure, so many text owners do not repeatedly probe for WebGL. Direct scene/mask adapters expose `failIfMajorPerformanceCaveat` and `powerPreference` at construction; hosts choose their own fallback. These are context-creation options, not live uniform settings. The default framebuffer does not allocate unused depth storage for fullscreen cloud passes. Note that privacy-focused browsers such as Brave randomize `navigator.deviceMemory` and `navigator.hardwareConcurrency` for fingerprinting protection (for example reporting 4 GB or fewer cores on a desktop), so `quality:'auto'` may select `'low'` unless an explicit `quality` profile is supplied.
