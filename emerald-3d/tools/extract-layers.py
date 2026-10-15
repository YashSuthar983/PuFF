#!/usr/bin/env python3
"""Cut the reference hero artwork into 2.5D layers for the Emerald 3D demo.

    python3 tools/extract-layers.py reference.png assets/plate [--rock cliff-render.png] [--award award-render.png]

Writes:
  plate.webp   the full backdrop (sky haze, mist, cliffs) with the UI copy, the glass award,
               and the floating cubes inpainted away. The live 3D award and cubes replace them.
  award.webp   RGBA cut-out of the reference award and its glow (the default award; ?award=3d uses the FBX).
  cliff.webp   RGBA cut-out of the dark rock below the ridge line, so it can slide in front of
               the award base and give parallax against the plate.
  cracks.webp  alpha mask of the green fissures, which pulses travel along.
  layers.json  normalized anchor points: where the award base and top sit on the plate, the
               cube centres, and the plate size. demo.js aligns the 3D camera to these.
Needs numpy and Pillow. Inpainting is a multi-scale diffusion fill: enough for soft mist and
dark sky, which is all that sits behind the removed elements.
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1672, 941   # the reference composition; every coordinate below is in these pixels

# Regions to remove from the plate (polygons / boxes in reference pixels), with a feather margin.
AWARD = [(292, 640), (318, 163), (368, 143), (604, 181), (642, 652), (636, 698), (588, 692)]
CUBES = [(40, 200, 205, 360), (1535, 630, 1672, 795)]
UI = [(28, 6, 1644, 88), (955, 280, 1535, 515), (930, 530, 1570, 685), (1005, 690, 1485, 775), (30, 820, 735, 928)]
# Ridge line (top edge of the rock) from left to right; the cliff layer lives below it.
RIDGE = [(0, 655), (60, 650), (100, 625), (140, 615), (175, 590), (200, 610), (250, 620), (300, 640), (640, 662),
         (680, 675), (720, 690), (760, 700), (800, 720), (840, 735), (880, 760), (920, 775), (960, 790), (1000, 805),
         (1050, 830), (1100, 850), (1150, 870), (1200, 895), (1250, 925), (1290, 941), (1672, 941)]
# Where the live award must land: the centre of its front-bottom edge and of its top.
ANCHORS = {'base': (455, 667), 'top': (462, 179), 'cubes': [(122, 280), (1600, 712)]}

def down(img, mask):
    """Masked 2x box downsample: returns (image, mask) where mask counts valid samples."""
    h, w = mask.shape[:2]; h2, w2 = h // 2 * 2, w // 2 * 2
    i = img[:h2, :w2] * mask[:h2, :w2, None]; m = mask[:h2, :w2]
    i = i[0::2, 0::2] + i[1::2, 0::2] + i[0::2, 1::2] + i[1::2, 1::2]
    m = m[0::2, 0::2] + m[1::2, 0::2] + m[0::2, 1::2] + m[1::2, 1::2]
    return i / np.maximum(m, 1e-6)[..., None], np.minimum(m, 1.)

def blur3(img):
    out = img.copy()
    out[1:] += img[:-1]; out[:-1] += img[1:]; out[:, 1:] += img[:, :-1]; out[:, :-1] += img[:, 1:]
    return out / 5.

def inpaint(img, hole, levels=7, iters=40):
    """Diffusion fill of `hole` (1 = missing): coarse-to-fine Jacobi smoothing constrained to known pixels."""
    pyramid = [(img, 1. - hole)]
    for _ in range(levels):
        if min(pyramid[-1][1].shape) < 4: break
        pyramid.append(down(*pyramid[-1]))
    base, m = pyramid[-1]
    fill = np.where(m[..., None] > 0, base, base[m > 0].mean(0) if (m > 0).any() else 0)
    for level in range(len(pyramid) - 1, -1, -1):
        img_l, m_l = pyramid[level]
        if level < len(pyramid) - 1:
            up = np.array(Image.fromarray((np.clip(fill, 0, 1) * 255).astype(np.uint8)).resize((m_l.shape[1], m_l.shape[0]), Image.BILINEAR)) / 255.
            fill = np.where(m_l[..., None] > 0, img_l, up)
        for _ in range(iters):
            fill = np.where(m_l[..., None] > 0, img_l, blur3(fill))
    return fill

def polygon_mask(shapes, feather=6):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for s in shapes:
        if len(s) == 4 and not isinstance(s[0], tuple): d.rectangle(s, fill=255)
        else: d.polygon(s, fill=255)
    if feather: m = m.filter(ImageFilter.MaxFilter(feather * 2 + 1))
    return np.array(m) / 255.

def lowpass(x, alpha, radius):
    """Alpha-weighted Gaussian blur, so transparent pixels do not bleed into the average."""
    k = np.exp(-.5 * (np.arange(-3 * radius, 3 * radius + 1) / radius) ** 2); k /= k.sum()
    def blur(c):   # separable, edge-padded
        c = np.pad(c, 3 * radius, mode='edge')
        c = np.apply_along_axis(lambda r: np.convolve(r, k, mode='valid'), 1, c)
        return np.apply_along_axis(lambda r: np.convolve(r, k, mode='valid'), 0, c)
    w = blur(alpha) + 1e-4
    return np.dstack([blur(x[..., i] * alpha) / w for i in range(x.shape[2])])

def ridge(alpha, threshold=.5, smooth=45):
    """Top edge of the opaque region per column, low-passed so only the overall silhouette remains."""
    solid = alpha > threshold
    top = np.where(solid.any(0), solid.argmax(0), H).astype(float)
    k = np.exp(-np.linspace(-2.5, 2.5, smooth * 2 + 1) ** 2); k /= k.sum()
    return np.convolve(np.pad(top, smooth, mode='edge'), k, mode='valid')

def fit_rock(path, stretch, ref, ref_alpha, below):
    """Bend a cliff render to the reference silhouette and relight it with the reference.

    Shape: stretch horizontally, then shift every column so the smoothed ridge line matches the
    reference's (the rock keeps its own jagged edge). Light: low frequencies (mist, green glow,
    shading) come from the reference, high frequencies (facets, chips, fissures) from the render.
    Where the reference shows mist in front of the rock, the layer turns transparent and the plate's
    mist shows instead."""
    src = Image.open(path).convert('RGBA')
    src = src.resize((round(src.width * W / src.width * stretch), H), Image.LANCZOS).crop((0, 0, W, H)) if src.size[1] == H else src.resize((round(W * stretch), H), Image.LANCZOS).crop((0, 0, W, H))
    s = np.array(src) / 255.; rock, ra = s[..., :3], s[..., 3]
    # Per column, stretch vertically so the smoothed ridge lands on the reference's; the bottom stays put.
    rt, et = ridge(ref_alpha * below, .35), ridge(ra)
    ys = np.arange(H)[:, None].astype(float)
    src_y = et[None, :] + (ys - rt[None, :]) * (H - et[None, :]) / np.maximum(H - rt[None, :], 1)
    yi = np.clip(np.round(src_y).astype(int), 0, H - 1); xi = np.broadcast_to(np.arange(W), (H, W))
    shifted, sa = rock[yi, xi], np.where(src_y >= -2, ra[yi, xi], 0)
    radius = 10
    detail = shifted - lowpass(shifted, sa, radius)
    light = lowpass(ref, np.maximum(sa, .05), radius)
    out = np.clip(light + detail * 1.15, 0, 1)
    # Mist in front of the reference rock: smooth (little local contrast) and not black. Rock is busy.
    lum = ref @ np.array([.3, .59, .11]); one = np.ones_like(lum)
    mean = lowpass(lum[..., None], one, 3)[..., 0]; var = lowpass(((lum - mean) ** 2)[..., None], one, 3)[..., 0]
    smooth = np.clip(1 - np.sqrt(var) / .025, 0, 1); grey = np.clip((lowpass(lum[..., None], one, 6)[..., 0] - .06) / .08, 0, 1)
    mist = lowpass((smooth * grey)[..., None], one, 4)[..., 0]
    alpha = np.clip(sa * (1 - np.clip(mist * 1.9, 0, 1)), 0, 1)
    return out, alpha

def text_strokes(x):
    """Bright engraving strokes over their local background (white top-hat)."""
    from scipy import ndimage
    return np.clip(x - ndimage.grey_opening(x, size=9), 0, 1)

def register_award(ref_lum, src_lum):
    """Homography from reference pixels to award-render pixels, found by matching the engraving.
    Seeded from a few hand-picked letter positions, refined by maximizing normalized cross-correlation."""
    from scipy import ndimage, optimize
    x0, y0, x1, y1 = 365, 225, 585, 640                       # the award's front face in the reference
    yy, xx = np.mgrid[y0:y1, x0:x1]; X = np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    pairs = [((474, 268), (554, 415)), ((472, 349), (558, 620)), ((475, 533), (564, 1085)), ((475, 605), (570, 1253)),
             ((400, 349), (365, 618)), ((553, 349), (752, 625)), ((390, 533), (360, 1080)), ((560, 533), (768, 1090))]
    A, b = [], []
    for (x, y), (u, v) in pairs:
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; b += [u, v]
    p = np.linalg.lstsq(np.array(A, float), np.array(b, float), rcond=None)[0]
    H = lambda q: np.array([[q[0], q[1], q[2]], [q[3], q[4], q[5]], [q[6], q[7], 1.]])
    scale = np.array([1e-3, 1e-3, .5, 1e-3, 1e-3, .5, 1e-6, 1e-6])
    for blur in (4, 2):
        R = ndimage.gaussian_filter(text_strokes(ref_lum), blur)[yy, xx]; S = ndimage.gaussian_filter(text_strokes(src_lum), blur); Rc = R - R.mean()
        def cost(q):
            U = H(p + q * scale) @ X; w = ndimage.map_coordinates(S, [U[1] / U[2], U[0] / U[2]], order=1).reshape(xx.shape); wc = w - w.mean()
            return -(Rc * wc).sum() / np.sqrt((Rc * Rc).sum() * (wc * wc).sum() + 1e-9)
        res = optimize.minimize(cost, np.zeros(8), method='Powell', options={'maxiter': 4000, 'xtol': 1e-3, 'ftol': 1e-6})
        p = p + res.x * scale
    print('award registration: engraving correlation %.2f' % -res.fun)
    return H(p)

def fit_award(path, ref, halo):
    """Replace the reference award with a sharp render: warp the render onto the reference by its engraving,
    keep the render's detail (facets, lettering), take the soft lighting (green glow, tint) from the reference.
    Outside the award's silhouette the reference glow stays, so it sits in the scene as before."""
    from scipy import ndimage
    src = np.array(Image.open(path).convert('RGBA')) / 255.
    Hm = register_award(ref @ np.array([.3, .59, .11]), src[..., :3] @ np.array([.3, .59, .11]) * src[..., 3])
    yy, xx = np.mgrid[0:H, 0:W]; U = Hm @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)]); uv = [U[1] / U[2], U[0] / U[2]]
    warp = np.dstack([ndimage.map_coordinates(src[..., c] * (src[..., 3] if c < 3 else 1), uv, order=3, cval=0).reshape(H, W) for c in range(4)])
    sa = np.clip(warp[..., 3], 0, 1)
    solid = ndimage.binary_fill_holes(sa > .5)                  # the award's footprint, including its see-through face
    inside = np.clip(ndimage.gaussian_filter(solid.astype(float), 1.), 0, 1)
    # Behind the see-through face: the reference softened enough to lose its lettering.
    behind = np.dstack([ndimage.gaussian_filter(ref[..., c], 14) for c in range(3)])
    base = np.clip(warp[..., :3] + behind * (1 - sa[..., None]), 0, 1)
    one = np.ones((H, W))
    detail = base - lowpass(base, one, 4)
    lit = np.clip(lowpass(ref, one, 4) * .75 + lowpass(base, one, 4) * .25 + detail * 1.1, 0, 1)
    rgb = ref * (1 - inside[..., None]) + lit * inside[..., None]
    return rgb, np.maximum(halo, inside)

def back_rocks(specs, plate, keep_out):
    """Distant rock silhouettes for depth. Each is scaled and placed, then hazed toward the plate: tinted to the
    local sky/mist colour and faded where the plate is bright fog, so it reads as standing behind the mist."""
    from scipy import ndimage
    layer = np.zeros((H, W, 4))
    for spec in specs:
        path, scale, fx, fy = spec.rsplit(':', 3); scale, fx, fy = float(scale), float(fx), float(fy)
        im = Image.open(path).convert('RGBA'); bb = im.getbbox(); im = im.crop(bb)
        im = im.resize((max(1, round(im.width * scale * W / 1672)), max(1, round(im.height * scale * W / 1672))), Image.LANCZOS)
        canvas = Image.new('RGBA', (W, H)); canvas.alpha_composite(im, (round(fx * W), round(fy * H) - im.height))
        r = np.array(canvas) / 255.; ra = r[..., 3:]
        layer[..., :3] = layer[..., :3] * (1 - ra) + r[..., :3] * ra; layer[..., 3:] = layer[..., 3:] + ra * (1 - layer[..., 3:])
    one = np.ones((H, W)); haze = lowpass(plate, one, 18)
    lum = haze @ np.array([.3, .59, .11]); fog = np.clip((lum - .1) / .22, 0, 1)
    rgb = layer[..., :3] * .5 + haze * .5
    alpha = layer[..., 3] * (1 - fog * .85) * .9 * (1 - keep_out)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reference'); ap.add_argument('out', nargs='?', default=os.path.join(os.path.dirname(__file__), '..', 'assets', 'plate'))
    ap.add_argument('--quality', type=int, default=88)
    ap.add_argument('--rock', help='transparent cliff image (same 1672x941 frame) whose detail replaces the reference rock')
    ap.add_argument('--award', help='sharp transparent award render; registered onto the reference award by its engraving')
    ap.add_argument('--back', action='append', default=[], metavar='PNG:SCALE:X:Y', help='distant rock behind the mist: transparent PNG, scale, and where its bottom-left lands (fractions of the frame); repeatable, one layer each, farthest first')
    ap.add_argument('--rock-stretch', type=float, default=1.05, help='horizontal stretch applied to --rock before fitting')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    src = Image.open(a.reference).convert('RGB')
    if src.size != (W, H): src = src.resize((W, H), Image.LANCZOS)
    img = np.array(src) / 255.

    # The award's glow halo goes too (wide margin); otherwise the fill smears it into a blurry ghost trophy.
    hole = np.clip(polygon_mask([AWARD], feather=38) + polygon_mask(CUBES) + polygon_mask(UI), 0, 1)
    plate = inpaint(img, hole)
    # Keep the award's own glow on the mist (it is part of the look) by blending the fill softly at the edge.
    soft = np.array(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))) / 255.
    plate = img * (1 - soft[..., None]) + plate * soft[..., None]
    Image.fromarray((np.clip(plate, 0, 1) * 255 + .5).astype(np.uint8)).save(os.path.join(a.out, 'plate.webp'), 'WEBP', quality=a.quality, method=6)

    # The award itself, cut from the reference with its glow: the original pixels over a region a little larger
    # than the hole filled in the plate, so stacked on the plate it restores the reference exactly.
    award = np.array(Image.fromarray((polygon_mask([AWARD], feather=46) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))) / 255.
    rgb_award = img
    if a.award:
        rgb_award, award = fit_award(a.award, img, award)
    Image.fromarray((np.dstack([rgb_award, award]) * 255 + .5).astype(np.uint8), 'RGBA').save(os.path.join(a.out, 'award.webp'), 'WEBP', quality=92, method=6)

    # Cliff cut-out: dark pixels below the ridge, feathered; green fissures (bright) stay semi-transparent
    # over the identical plate pixels, so the layer offset never shows a hard edge.
    ridge = Image.new('L', (W, H), 0); ImageDraw.Draw(ridge).polygon(RIDGE + [(W, H), (0, H)], fill=255)
    below = np.array(ridge.filter(ImageFilter.GaussianBlur(14))) / 255.
    lum = plate @ np.array([.3, .59, .11]); green = plate[..., 1] - np.maximum(plate[..., 0], plate[..., 2])
    dark = np.clip((.5 - lum) / .32, 0, 1) ** .8
    alpha = np.clip(below * np.maximum(dark, np.clip(green * 2.5, 0, 1)), 0, 1)
    alpha = np.array(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.
    rgb = np.clip(plate, 0, 1)
    if a.rock:
        rgb, alpha = fit_rock(a.rock, a.rock_stretch, img, alpha, below)
    cliff = np.dstack([rgb, alpha])
    Image.fromarray((cliff * 255 + .5).astype(np.uint8), 'RGBA').save(os.path.join(a.out, 'cliff.webp'), 'WEBP', quality=a.quality, method=6)

    # Crack mask: the thin green fissures in the rock (green excess minus its local blur, so the broad glow
    # around the award base drops out). White with the mask in alpha, for a canvas 'destination-in' cut.
    src = rgb if a.rock else plate
    excess = np.clip(src[..., 1] - np.maximum(src[..., 0], src[..., 2]), 0, 1)
    local = np.array(Image.fromarray((excess * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))) / 255.
    veins = np.clip((excess - local * .85 - .015) / .12, 0, 1) * (alpha if a.rock else below)
    veins = np.array(Image.fromarray((veins * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.8))) / 255.
    rgba = np.dstack([np.ones((H, W, 3)), veins])
    Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA').save(os.path.join(a.out, 'cracks.webp'), 'WEBP', quality=a.quality, method=6)

    # Each distant rock is its own layer (back-1.webp, back-2.webp, …) so each can sit at its own parallax depth.
    for i, spec in enumerate(a.back, 1):
        back = back_rocks([spec], np.clip(plate, 0, 1), 0)
        Image.fromarray((back * 255 + .5).astype(np.uint8), 'RGBA').save(os.path.join(a.out, 'back-%d.webp' % i), 'WEBP', quality=a.quality, method=6)

    layers = {'width': W, 'height': H, 'base': [ANCHORS['base'][0] / W, ANCHORS['base'][1] / H], 'top': [ANCHORS['top'][0] / W, ANCHORS['top'][1] / H],
              'cubes': [[x / W, y / H] for x, y in ANCHORS['cubes']]}
    json.dump(layers, open(os.path.join(a.out, 'layers.json'), 'w'), indent=1)
    for name in sorted(os.listdir(a.out)): print(name, os.path.getsize(os.path.join(a.out, name)))

if __name__ == '__main__':
    main()
