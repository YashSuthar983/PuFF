# Emerald 3D: the Point Blank award hero

A recreation of the Point Blank "Student Community of the Year" hero. By default it is **2.5D**: the cliff and mist come from the reference artwork as image layers, and the floating cubes, the green pulses, and the drifting mist with lightning are rendered live in WebGL2 on top. Add `?cliff=3d` for the fully computed version, where the rock is ray-marched as well.

## 2.5D layers (default)

From back to front:

| Layer | Source | Parallax |
|---|---|---|
| `assets/plate/plate.webp` | The reference artwork with the UI, award (and its glow halo), and cubes inpainted away: sky, mist, cliff | least |
| Back mist | Cloud Kit `CloudScene` with **lightning**: every pulse fires a green strike at the thin edge of a fog bank | |
| `assets/plate/back.webp` | Distant rock (the ridge and the three columns) hazed behind the fog | |
| `assets/plate/award.webp` | The sharp crystal award render registered onto the reference award, with the reference's glow (default). It brightens with each pulse. `?award=3d` renders the FBX model live instead | |
| Cubes | Live WebGL2 (`#world`), plus the FBX award when `?award=3d` | |
| `assets/plate/cliff.webp` | The rock in front of the award base: a cliff render bent to the reference ridge line and relit with the reference (see below) | |
| Crack glow | Canvas cut by `assets/plate/cracks.webp`: each pulse runs outward from the award base along the fissures; the pointer lights cracks near it | |
| Front mist | Cloud Kit `CloudScene` | most |

`demo.js` fits the plate to the screen (cover on landscape; on portrait the award is centred near the top) and aims the 3D camera so the award's base lands exactly on the plate's anchor point (`world.setAnchor`). Pointer movement and a slow idle drift slide each layer by a few pixels for depth. Keep shifts small; large ones would reveal the flat layers.

### Cliff layer from a render

`--rock` takes a transparent cliff render in the same 1672×941 frame and fits it to the reference: it stretches it horizontally (`--rock-stretch`, default 1.05), then stretches each column vertically so its smoothed ridge line lands on the reference's. Its fine detail (facets, chips, fissures) is kept, its low-frequency lighting is replaced by the reference's (mist, green glow, shading), and where the reference shows fog in front of the rock the layer turns transparent so the plate's fog shows. The current layer uses *Jagged Basalt Cliff Extension*, whose ridge already matches the reference's within a few percent:

```sh
python3 tools/extract-layers.py reference.png assets/plate \
  --rock "Jagged Basalt Cliff Extension-2.png" \
  --award "Crystal FOSS Awards 2026 Trophy.png" \
  --back "Jagged basalt ridge with green fissures-3.png:.62:.5:1.0" \
  --back "Three jagged basalt cliff columns-1.png:.36:.77:1.0"
```

- `--award`: a sharp award render. It is registered onto the reference award by matching the engraving (a homography refined by cross-correlation), so the lettering lands letter for letter. Its facets and text are kept, and its soft lighting (green glow and tint) comes from the reference. Takes about a minute.
- `--back PNG:SCALE:X:Y`: distant rock behind the mist (`back.webp`, between the plate and the back mist). SCALE is relative to the 1672 px frame; X,Y is where the cut-out's bottom-left lands, as fractions of the frame. Each rock is hazed toward the plate and fades where the plate shows fog. Repeatable.

Without `--rock` the cliff is cut straight from the reference.

### Award model

The award is `Untitled.fbx` (a glass body with faceted sides plus a faceplate quad carrying the engraving image), converted with Blender:

```sh
blender -b --python tools/convert-trophy.py -- Untitled.fbx assets/trophy
```

This writes `assets/trophy/trophy.js` (`window.EmeraldTrophyModel`, about 100 KB, with the faceplate embedded so `file://` works). The model is turned Y-up, centred, scaled to 3 units tall, with the faceplate side toward the camera. `world.js` rasterizes it after the traced pass with a depth buffer (the traced pass writes ray distance, so rock in `?cliff=3d` hides it correctly) and shades it with the same glass code. Refraction leaves the body at the nearest of its face planes, which is exact for convex bodies and close for this one (its faceted sides bulge by up to 0.08 units). The engraving is the faceplate image. Without `trophy.js`, the built-in tapered slab is ray-marched instead. The pose is `TROPHY_ROT` in `world.js`: left side face showing, tilted clockwise, leaning back, as in the reference.

Regenerate the layers from a new reference: `python3 tools/extract-layers.py reference.png assets/plate`, then copy the numbers from `assets/plate/layers.json` into `PLATE` in `demo.js` (the test checks they match). The region coordinates in the script (`AWARD`, `CUBES`, `UI`, `RIDGE`, `ANCHORS`) are for the 1672×941 reference.

## Fully computed mode (`?cliff=3d`)

Every part of the scene is rendered live; there are no artwork images:

| Layer | How it is made |
|---|---|
| Glass award | Ray-traced, tapered, chamfered slab: Fresnel reflection, refraction in and out (with total internal reflection), absorption, edge-lit rims, parallax fracture sheets, engraved inscription from a canvas texture |
| Rock cliff | Signed-distance cliff traced from the reference silhouette (seat under the award, stepped drop to the right), displaced by faceted noise **and a real height map**; GGX shading with the map's normal/roughness, desaturated to wet basalt; green fissures follow the texture's dark crevices, densest at the base |
| Floating cubes | Analytic ray–box intersection each frame; edges glow and the cubes slowly tumble |
| Mist | Two Cloud Kit `CloudScene` layers (behind and in front of the rock) with custom `densityShader` masks, lit by the award base, the pointer, and pulses |

## Rock surface maps

Tried in order, so the cliff always has a surface:

1. `assets/rock/`: **Rock Face 03** scan from Poly Haven (CC0; credits in `assets/rock/SOURCE.md`), converted by `tools/convert-rock.py`.
2. `assets/rock-generated/`: **our own** maps from `tools/generate-rock-texture.py`. These are angular Voronoi plates with tilted faces, fractal detail, and crack grooves; tileable, deterministic (`--seed`), numpy + Pillow. This is the backup if the scan is missing or fails to load.
3. No maps: the shader's built-in procedural stone.

Each folder has `embedded-maps.js` with data-URL copies so the maps also work from `file://`. Compare with `?cliff=3d&maps=scan`, `&maps=generated`, or `&maps=none`. The status badge says which one is live. To regenerate: `python3 tools/generate-rock-texture.py assets/rock-generated --seed 7`.

## Run

From the project root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/cloud-library/emerald-3d/`. It also opens directly from disk: the rock maps fall back to their embedded data-URL copies.

## How it stays fast

The ray-traced pass is expensive, so it runs **once**, not every frame. `world.js` bakes colour, normals/depth, and an effects mask (fissure and glass-glow strength) into a G-buffer. Baking happens in bounded horizontal strips over several frames. This limits submitted work; it does not guarantee a strip fits the frame budget on every device. A small preview appears immediately; its pixel count also respects the active strip budget. A cheap composite pass then runs every frame:

- pulses travel through the fissures as a ring outward from the award base,
- the pointer acts as a moving light, glinting off the wet rock using the stored normals,
- the glass rims breathe,
- the cubes are traced analytically.

The scene re-bakes only on resize, quality change, accent change, or once web fonts arrive (to redraw the engraving). The previous image stays visible until the new one is complete.

## Interaction

- Move the pointer: a soft light follows it across the rock, its cracks, and the mist; the layers shift for parallax.
- Click or tap the scene: an energy pulse runs through the cracks and lightning strikes in the mist. A random pulse also fires every 7–13 s.
- `?strike=x,y` fires a strike at a screen point after 1 s (live mode only: paused mist has no lightning).
- Bottom-right panel: accent (Emerald / Ice / Ember: the scene relights and the UI accent follows), mist density, quality, pulse, pause.
- `prefers-reduced-motion` starts paused.

Inspection stills: `?still` bakes synchronously and freezes. Add `&pointer=.45,.8` for a pointer light, `&wave=1.6` for a pulse ring, and `&quality=high`.

## API (`world.js`)

```js
const world=new EmeraldWorld(canvas,{quality:'medium',accent:'#3dff3a',rock:false,inscription:{name:'Point Blank'}}); // rock:true traces the cliff too
world.render(dt);              // call per frame; also advances progressive baking
world.setAccent('#4fc8ff');    // relight (re-bake)
world.setQuality('high');
world.setInscription({footer:'INDIAFOSS 2026'});
world.setPointer(x,y,strength); // normalized screen coordinates
world.setAnchor({x:.27,y:.7,height:.5}); // pin the award base to a screen point (2.5D); null = responsive camera
world.setCubes([{at:[.07,.3],depth:2.4,size:.05,blur:.12,spin:[0,0,0]}]);
world.pulse();
world.anchors();               // projected award base/top/centre, for lighting other layers
world.finish();                // bake synchronously
world.destroy();
```

## Limits

- 2.5D mode uses the reference artwork itself for the cliff and mist, so it matches the reference closely but is tied to that composition. The plate is about 50 KB and the cliff cut-out about 95 KB.

- The award, rock, and camera are tuned to the reference composition. Changing the layout means editing the constants in `world.js` (the `TROPHY` position/rotation, the ridge profile `PX`/`PY`).
- The glass is traced through a single slab; it does not see the floating cubes or the Cloud Kit mist in its refraction. The mist behind shows through where the refracted ray reaches open sky.
- Verified with headless Chrome (SwiftShader) screenshots, the real ES3 shader compiler in the test suite, and a WebGL stub lifecycle test. Frame rates on real phones and integrated GPUs have not been measured.

## Device performance policy

**Auto** now chooses hardware-aware profiles. Power saver caps the host loop at 15 fps, uses one smaller mist layer, constrains the world target to 360,000 pixels / 800 px long edge, and limits each bake strip to 18,000 pixels. Balanced and Full retain two mist layers with larger bounded targets. One host clock drives the world and mist; there are no independent mist RAF loops. Offscreen/hidden scenes stop scheduling.

Without usable acceleration, with a known software renderer, or with data saver / reduced motion in Auto, the demo restores all artwork layers and allocates no live scene buffers. This also applies to `?cliff=3d`, so fallback does not leave a blank cliff/award.

Open **Scene & device preview** at the bottom right (bottom centre on phones) to compare device categories:

| Device category | Preview |
|---|---|
| Auto — this device | Detects a conservative profile and can reduce effects after sustained slow frames |
| No GPU — static artwork | Artwork fallback; no live lighting, mist or parallax, and no WebGL probing |
| Low-spec phone / laptop | Low detail, one mist layer, no parallax, 15 fps cap |
| Integrated GPU / everyday | Medium detail, two mist layers, lighting and parallax, 30 fps cap |
| High-end GPU / full effects | Highest detail, two mist layers, lighting and parallax, 30 fps cap |

These apply the actual rendering presets on the current screen; they do **not** emulate another device's speed or viewport. A cap is not a promised frame rate. Hardware availability is still checked: a device without usable acceleration stays on static artwork even when a live category is selected, with an explanation in the panel. Quality remains an independent override within the selected profile's buffer limits.

Selections reload the scene and remain in the URL as `?render=auto|low|balanced|high|static`. Existing cliff/award/map parameters are preserved; any inspection `quality` parameter is cleared so the selected category starts with its own defaults. The panel opens automatically for an explicit preset. For example, compare `?cliff=3d&render=low` with `?cliff=3d&render=high`, or choose Auto to restore detection.

Auto can step down after sustained slow frame cadence and ultimately release the live scene for artwork. See the [performance audit](../PERFORMANCE.md) for the actual software-rendering measurements, G-buffer estimates, and remaining physical-device testing. The older native-resolution descriptions above apply when the standalone world API has no host-supplied limits; the demo now supplies them.
