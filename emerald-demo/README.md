# The Emerald Experiment

A separate local landing-page demo inspired by the supplied Point Blank screenshot: clear glass, white and green rim light, a dark rock ridge, and neutral layered mist. The portfolio is unchanged.

## Run

Open [index.html](index.html) directly, or serve the project root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/cloud-library/emerald-demo/`. For local-file viewing, the rock renderer loads embedded data-URL maps so its texture reads do not depend on an HTTP origin. Normal HTTP viewing loads the separate image maps. The scene footer identifies live 3D rendering or artwork fallback.

## Lighting controls

The normal-font Atmosphere panel exposes the whole lighting rig:

- Rim: horizontal/vertical position, depth, strength, spread, and accent color.
- Fill: position, depth, strength, spread, and independent color.
- Pointer: enable, strength, depth, spread, and easing.
- Mist: material color, ambient illumination, exposure, absorption, shadow depth, light intensity/falloff, light direction, and shadow sample spacing.
- Pulses: power, reach, branches, propagation, count, spacing, fade, afterglow, glow strength/spread, interval, timing randomness, and strength variation.
- Manual pulse position, random emission zone, randomized color variation, and a reproducible 32-bit seed.
- Cliff height, depth, turn, and tilt, plus rock scan normal detail, roughness multiplier, and albedo. The **3D cliff** control group starts open.

Modes are **Randomized** (default), Manual, On hover, and Off. The default irregular interval is nine seconds; there is no full-image brightness animation or exposed bolt overlay. The native `Lightning` actor supplies up to three moving light reservoirs; the strongest local reservoir joins the rig's two fixed lights. The GPU budget stays at three active lights and at most two live discharges.

**Randomize lighting** creates a bounded variation of the rig and rhythm. **New pulse seed** changes the random sequence. **Get settings / Apply settings** exports or imports every lighting control, color, seed, mode, atmosphere setting, and quality. Invalid configuration is rejected before changing the scene. Reset restores the reference-inspired defaults.

Short phone taps send pulses; swipes retain native scrolling. Pausing clears pulses while leaving inspection controls active. Reduced motion starts paused. Offscreen rendering and pulse advancement stop together; returning does not replay hidden flashes.

## Scanned rock surfaces

As agreed, the demo uses the local **Dark Rock** scanned material by Amal Kumar / [Poly Haven](https://polyhaven.com/a/dark_rock), released under [CC0](https://polyhaven.com/license). This material is **not Quixel Megascans**. The download contains a PBR texture set rather than a photogrammetry mesh.

`native-rocks.js` creates a connected 3D cliff with a ledge, a steep front face, perspective projection, and 6,450 vertices / 12,288 triangles, using the scan's albedo, OpenGL normal, roughness, and displacement maps. A native WebGL2 shader evaluates diffuse/specular response to the same lights as the mist. It uses no Three.js or framework, and does not add another animation loop: the cloud frame callback drives both renderers.

The rock buffer is capped at 700 / 1,100 / 1,600 pixels wide for Low / Medium / High quality. Geometry and textures upload once; resizing only changes the framebuffer when dimensions change. One Cloud Kit context renders mist and one lightweight mesh context renders rock surfaces. The glass and floating cubes remain artwork, so their baked reflections retain emerald lighting.

The four image maps and their embedded copies contain the same scan data. The source maps and attribution are in [assets/rocks/SOURCE.md](assets/rocks/SOURCE.md). The asset adapter can accept acquired Megascans PBR maps later:

```sh
python3 cloud-library/emerald-demo/tools/import-rock-material.py \
  --albedo /path/to/basecolor.jpg \
  --normal /path/to/normal_gl.png \
  --roughness /path/to/roughness.png \
  --height /path/to/displacement.png \
  --name 'Your acquired rock material' \
  --source-url 'Your asset source URL' \
  --license 'License at acquisition'
```

This replaces material maps on the generated cliff and regenerates the embedded maps used for local-file preview; it does not import source meshes. The optional offline converter needs Pillow, and ImageMagick for EXR. The website itself needs no installation. No asset downloads, purchases, or account access happen in this workflow.

## Artwork and fallback

[assets/emerald-scene-live.webp](assets/emerald-scene-live.webp) is the glass-and-mist artwork prepared without baked rocks. It was edited with the built-in image-generation tool; the exact prompt is saved in [artwork-prompt-live.txt](artwork-prompt-live.txt). Earlier variants remain alongside it.

The scene switches to this background after the native rock textures are ready. If WebGL or texture loading fails, it retains [assets/emerald-scene-v2.webp](assets/emerald-scene-v2.webp), which includes the original rock artwork. Unavailable controls are disabled when cloud rendering is unavailable.

## Verification

`npm test --prefix cloud-library` includes controller checks for every control group, random/manual/hover/off options, seeds, bounded light/pulse counts, material routing, settings validation, phone taps versus swipes, reduced motion, pause, offscreen suspension, cleanup, and fallback. All actual mist and rock shader pairs compile/link in surfaceless EGL/GLES3 when available.

The native rock shader was also drawn with the real scan textures in software GL and visually inspected with its artwork background. This is renderer validation, not a browser screenshot or hardware performance benchmark. Browser layout and device performance still need visual inspection because the environment blocks Chrome's crashpad socket.

## Device performance policy

The Rendering selector now defaults to **Auto**. Constrained hardware starts power saver (15 fps ceiling, smaller mist samples/buffers, 256 px scan maps, and a 3,072-triangle cliff). Hardware acceleration unavailable, known software rendering, data saver, or reduced motion use the artwork fallback. Explicit live choices still require accelerated WebGL2.

Auto also downgrades after sustained slow cadence; it frees the live renderers when switching to artwork. The initial textures and framebuffers have explicit caps, and the light-upload buffers are reused. Earlier native material/mesh dimensions above describe the full-detail path. See the [performance audit](../PERFORMANCE.md) for measured software-GL costs, profile limits, and hardware-testing limits.
