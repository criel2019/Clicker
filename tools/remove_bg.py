from pathlib import Path
import numpy as np
import cv2
from PIL import Image

SRC_DIR = Path.cwd()
DST_ROOT = Path(r'C:\Users\User\Downloads\renpy-8.5.2-sdk\renpy-8.5.2-sdk\soul_chain_test\soul_chain_test\game\images\characters\seorin')

ALIASES = {
    'angry': 'angry',
    'dislike': 'dislike',
    'happy': 'happy',
    'not_interested': 'not_interested',
    'sad': 'sad',
    'smile': 'smile',
    'smug': 'smug',
    'startled': 'startled',
    'troubled': 'troubled',
}

_FACE_CASCADE = None


def imread_unicode(path):
    data = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_UNCHANGED)


def get_face_cascade():
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        haar_root = getattr(getattr(cv2, 'data', None), 'haarcascades', '')
        cascade = None
        if haar_root:
            xml = str(Path(haar_root) / 'haarcascade_frontalface_default.xml')
            cascade = cv2.CascadeClassifier(xml)
        if cascade is None or cascade.empty():
            _FACE_CASCADE = False
        else:
            _FACE_CASCADE = cascade
    return _FACE_CASCADE if _FACE_CASCADE is not False else None


def make_face_ellipse_mask(shape_hw, cx, cy, rx, ry, vis_mask):
    h, w = shape_hw
    y, x = np.ogrid[:h, :w]
    rx = max(float(rx), 1.0)
    ry = max(float(ry), 1.0)
    ellipse = (((x - float(cx)) / rx) ** 2 + ((y - float(cy)) / ry) ** 2) <= 1.0
    ellipse = cv2.GaussianBlur(ellipse.astype(np.float32), (0, 0), 6.0)
    ellipse = np.clip(ellipse, 0.0, 1.0)
    return (ellipse * vis_mask.astype(np.float32)).astype(np.float32)


def detect_face_protect_mask(fg, a):
    h, w = fg.shape[:2]
    vis = a > 0.15
    if not np.any(vis):
        return np.zeros((h, w), dtype=np.float32)

    rgb8 = (np.clip(fg, 0, 1) * 255 + 0.5).astype(np.uint8)
    gray = cv2.cvtColor(rgb8, cv2.COLOR_RGB2GRAY)

    ys, xs = np.where(vis)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw = float(x1 - x0 + 1)
    bh = float(y1 - y0 + 1)

    cx = x0 + 0.50 * bw
    cy = y0 + 0.19 * bh
    rx = max(18.0, min(bw * 0.16, bw * 0.11))
    ry = max(22.0, min(bh * 0.16, bh * 0.09))

    cascade = get_face_cascade()
    if cascade is not None:
        min_side = max(24, int(min(h, w) * 0.08))
        faces = cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(min_side, min_side)
        )
        if len(faces) > 0:
            best = max(faces, key=lambda f: (f[2] * f[3]) * (1.2 if (f[1] + 0.5 * f[3]) < (h * 0.65) else 1.0))
            x, y, fw, fh = [int(v) for v in best]
            cx = x + 0.5 * fw
            cy = y + 0.54 * fh
            rx = max(18.0, min(bw * 0.18, fw * 0.54))
            ry = max(22.0, min(bh * 0.16, fh * 0.66))

    mask = make_face_ellipse_mask((h, w), cx, cy, rx, ry, vis)
    yy, xx = np.ogrid[:h, :w]
    head_zone = (yy <= (y0 + 0.44 * bh)).astype(np.float32)
    head_zone = cv2.GaussianBlur(head_zone, (0, 0), 9.0)
    mask *= np.clip(head_zone, 0.0, 1.0)
    mask = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.2)
    mask = np.clip(mask, 0.0, 1.0)
    return mask


def estimate_bg(img_rgb):
    bd = 24
    edge = np.concatenate([
        img_rgb[:bd].reshape(-1, 3),
        img_rgb[-bd:].reshape(-1, 3),
        img_rgb[:, :bd].reshape(-1, 3),
        img_rgb[:, -bd:].reshape(-1, 3),
    ], axis=0)
    gdom = edge[:, 1] - np.maximum(edge[:, 0], edge[:, 2])
    edge_green = edge[gdom > np.percentile(gdom, 60)]
    if len(edge_green) < 100:
        edge_green = edge
    bg = np.median(edge_green, axis=0)
    d_edge = np.linalg.norm(edge_green - bg[None, :], axis=1)
    inlier = edge_green[d_edge < np.percentile(d_edge, 97)]
    if len(inlier) < 100:
        inlier = edge_green
    bg = np.median(inlier, axis=0)
    return bg.astype(np.float32), inlier.astype(np.float32)


def key_base_v2(img_rgb):
    bg, inlier = estimate_bg(img_rgb)
    r, g, b = img_rgb[..., 0], img_rgb[..., 1], img_rgb[..., 2]

    d = np.linalg.norm(img_rgb - bg[None, None, :], axis=2)
    d_in = np.linalg.norm(inlier - bg[None, :], axis=1)
    d0 = float(np.percentile(d_in, 99.7) + 0.004)
    d1 = d0 + 0.12
    x = np.clip((d - d0) / (d1 - d0), 0.0, 1.0)
    alpha = x * x * (3.0 - 2.0 * x)

    score = g - np.maximum(r, b)
    score_bg = float(bg[1] - max(bg[0], bg[2]))
    alpha_g = 1.0 - np.clip((score - 0.16) / max(1e-6, (score_bg - 0.16)), 0.0, 1.0)
    refine = (d < 0.42) & (score > 0.16)
    alpha = np.where(refine, np.minimum(alpha, alpha_g + 0.06), alpha)

    alpha_erode = cv2.erode(alpha.astype(np.float32), np.ones((3, 3), np.uint8), iterations=1)
    edge_band = (alpha > 0.0) & (alpha < 1.0)
    alpha = np.where(edge_band, 0.82 * alpha + 0.18 * alpha_erode, alpha)
    alpha_blur = cv2.GaussianBlur(alpha, (0, 0), sigmaX=0.7, sigmaY=0.7)
    alpha = np.where(edge_band, alpha_blur, alpha)
    alpha = np.clip(alpha, 0.0, 1.0)
    alpha[alpha < 0.002] = 0.0
    alpha[alpha > 0.998] = 1.0

    eps = 1e-4
    fg = (img_rgb - (1.0 - alpha[..., None]) * bg[None, None, :]) / np.maximum(alpha[..., None], eps)
    fg = np.clip(fg, 0.0, 1.0)

    core = (alpha >= 0.995).astype(np.uint8)
    core = cv2.erode(core, np.ones((3, 3), np.uint8), iterations=1)
    if core.sum() > 0:
        src = (1 - core).astype(np.uint8)
        _, labels = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.where(core == 1)
        coords = np.stack([ys, xs], axis=1)
        lbl = labels.copy()
        lbl[lbl < 1] = 1
        idx = np.clip(lbl - 1, 0, len(coords) - 1)
        ny = coords[idx, 0]
        nx = coords[idx, 1]
        core_rgb = fg[ny, nx]
        edge_weight = np.clip((0.95 - alpha) / 0.95, 0.0, 1.0)
        green_weight = np.clip((score - 0.10) / max(1e-6, (score_bg - 0.10)), 0.0, 1.0)
        blend_w = np.clip((edge_weight * green_weight) ** 0.7, 0.0, 1.0)
        blend_w *= (alpha > 0.0)
        fg = fg * (1.0 - blend_w[..., None]) + core_rgb * blend_w[..., None]

    edge_soft = (alpha > 0.0) & (alpha < 0.999)
    limit = np.maximum(fg[..., 0], fg[..., 2]) + (0.015 + 0.05 * alpha)
    fg[..., 1] = np.where(edge_soft, np.minimum(fg[..., 1], limit), fg[..., 1])
    fg[alpha == 0.0] = 0.0
    fg = np.clip(fg, 0.0, 1.0)
    return fg.astype(np.float32), alpha.astype(np.float32)


def key_extreme_from_base(fg, a):
    fg = fg.copy().astype(np.float32)
    a = a.copy().astype(np.float32)

    mask = (a > 0.02).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == main)
        keep = cv2.dilate(keep.astype(np.uint8), np.ones((11, 11), np.uint8), iterations=1).astype(bool)
        a = np.where(keep, a, 0.0)
        fg = np.where(keep[..., None], fg, 0.0)

    fg_bin = (a > 1e-4).astype(np.uint8)
    d = cv2.distanceTransform(fg_bin, cv2.DIST_L2, 3)
    ring4 = (a > 0) & (d <= 4.0)
    ring8 = (a > 0) & (d <= 8.0)
    ring12 = (a > 0) & (d <= 12.0)

    core = ((a >= 0.999) & (d >= 18.0)).astype(np.uint8)
    if core.sum() < 2000:
        core = ((a >= 0.999) & (d >= 14.0)).astype(np.uint8)
    if core.sum() < 500:
        core = ((a >= 0.999) & (d >= 10.0)).astype(np.uint8)
    if core.sum() < 100:
        core = (a >= 0.999).astype(np.uint8)
    core = cv2.erode(core, np.ones((5, 5), np.uint8), iterations=1)

    if core.sum() > 0:
        src = (1 - core).astype(np.uint8)
        _, labels2 = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.where(core == 1)
        coords = np.stack([ys, xs], axis=1)
        idx = np.clip(labels2 - 1, 0, len(coords) - 1)
        ny = coords[idx, 0]
        nx = coords[idx, 1]
        core_rgb = fg[ny, nx]

        lum = 0.299 * fg[..., 0] + 0.587 * fg[..., 1] + 0.114 * fg[..., 2]
        clum = 0.299 * core_rgb[..., 0] + 0.587 * core_rgb[..., 1] + 0.114 * core_rgb[..., 2]
        core_match = np.clip(core_rgb * (lum[..., None] / np.maximum(clum[..., None], 1e-4)), 0.0, 1.0)

        w = np.zeros_like(a)
        w += np.clip((12.0 - d) / 12.0, 0.0, 1.0) * 0.85
        w += np.clip((8.0 - d) / 8.0, 0.0, 1.0) * 0.55
        w += np.clip((4.0 - d) / 4.0, 0.0, 1.0) * 0.35
        w *= ring12
        w = np.where(ring4, np.maximum(w, 0.98), w)
        w = np.clip(w, 0.0, 1.0)
        fg = fg * (1.0 - w[..., None]) + core_match * w[..., None]

    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    neutral = np.stack([lum, lum, lum], axis=-1)
    w_neu = np.zeros_like(a)
    w_neu += np.clip((8.0 - d) / 8.0, 0.0, 1.0) * 0.90
    w_neu += np.clip((12.0 - d) / 12.0, 0.0, 1.0) * 0.35
    w_neu *= ring12
    w_neu = np.where(ring4, np.maximum(w_neu, 0.95), w_neu)
    w_neu = np.clip(w_neu, 0.0, 1.0)
    fg = fg * (1.0 - w_neu[..., None]) + np.clip(neutral * 0.90, 0.0, 1.0) * w_neu[..., None]

    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    rb_mid = 0.5 * (r + b)
    cap = np.minimum(np.maximum(r, b), rb_mid + 0.0002)
    fg[..., 1] = np.where(ring12, np.minimum(g, cap), g)

    lum = 0.299 * fg[..., 0] + 0.587 * fg[..., 1] + 0.114 * fg[..., 2]
    neutral2 = np.stack([lum, lum, lum], axis=-1)
    chroma_kill = np.clip((10.0 - d) / 10.0, 0.0, 1.0) * 0.55
    chroma_kill *= ring12
    fg = fg * (1.0 - chroma_kill[..., None]) + neutral2 * chroma_kill[..., None]

    a1 = cv2.erode(a.astype(np.float32), np.ones((3, 3), np.uint8), iterations=1)
    a2 = cv2.erode(a1.astype(np.float32), np.ones((3, 3), np.uint8), iterations=1)
    a3 = cv2.erode(a2.astype(np.float32), np.ones((3, 3), np.uint8), iterations=1)
    a_new = a.copy()
    m = ring4
    a_new[m] = 0.35 * a[m] + 0.35 * a1[m] + 0.20 * a2[m] + 0.10 * a3[m]
    m = ring8 & (~ring4)
    a_new[m] = 0.72 * a[m] + 0.20 * a1[m] + 0.08 * a2[m]
    m = ring12 & (~ring8)
    a_new[m] = 0.88 * a[m] + 0.12 * a1[m]
    a_new[ring12 & (a_new < 0.14)] = 0.0
    a_new = cv2.GaussianBlur(a_new, (0, 0), 0.55)
    a_new = np.clip(a_new, 0.0, 1.0)
    a_new[a_new < 0.015] = 0.0
    a_new[a_new > 0.998] = 1.0

    d2 = cv2.distanceTransform((a_new > 1e-4).astype(np.uint8), cv2.DIST_L2, 3)
    ring12b = (a_new > 0) & (d2 <= 12.0)
    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    fg[..., 1] = np.where(ring12b, np.minimum(g, np.maximum(r, b) + 0.0001), g)

    fg = np.clip(fg, 0.0, 1.0)
    fg[a_new == 0.0] = 0.0

    mask2 = (a_new > 0.02).astype(np.uint8)
    num2, labels3, stats2, _ = cv2.connectedComponentsWithStats(mask2, connectivity=8)
    if num2 > 1:
        main2 = 1 + int(np.argmax(stats2[1:, cv2.CC_STAT_AREA]))
        keep2 = (labels3 == main2)
        keep2 = cv2.dilate(keep2.astype(np.uint8), np.ones((7, 7), np.uint8), iterations=1).astype(bool)
        a_new = np.where(keep2, a_new, 0.0)
        fg = np.where(keep2[..., None], fg, 0.0)

    return fg.astype(np.float32), a_new.astype(np.float32)


def apply_skinprotected_cover(fg, a, face_mask=None):
    h, w, _ = fg.shape
    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    vis_th = 0.45
    vis = (a > vis_th).astype(np.uint8)
    d_in = cv2.distanceTransform(vis, cv2.DIST_L2, 3)

    comp_black = fg * a[..., None]
    spill = comp_black[..., 1] - np.maximum(comp_black[..., 0], comp_black[..., 2])
    spill_w = np.clip((spill - 0.002) / 0.028, 0.0, 1.0)

    luma = 0.299 * r + 0.587 * g + 0.114 * b
    mx = np.maximum.reduce([r, g, b])
    mn = np.minimum.reduce([r, g, b])
    chroma = mx - mn

    rgb8 = (np.clip(fg, 0, 1) * 255 + 0.5).astype(np.uint8)
    hsv = cv2.cvtColor(rgb8, cv2.COLOR_RGB2HSV).astype(np.float32)
    H = hsv[..., 0] * 2.0
    S = hsv[..., 1] / 255.0
    V = hsv[..., 2] / 255.0

    skin_cand = (
        (a > 0.35) & (V > 0.22) & (V < 1.00) &
        (S > 0.03) & (S < 0.55) &
        (chroma > 0.02) & (chroma < 0.50) &
        (r >= g - 0.05) & (g >= b - 0.08) &
        (r > 0.22) & (luma > 0.22) &
        (((H >= 0) & (H <= 55)) | ((H >= 330) & (H <= 360)))
    )
    skin_cand &= ~((luma < 0.22) & (chroma < 0.12))
    skin_cand &= ~(spill > 0.03)

    Y, X = np.ogrid[:h, :w]
    spatial_allow = (Y < int(h * 0.58)) | ((Y > int(h * 0.34)) & (Y < int(h * 0.68)))
    skin_cand &= spatial_allow

    skin_u8 = skin_cand.astype(np.uint8)
    skin_u8 = cv2.morphologyEx(skin_u8, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    skin_u8 = cv2.morphologyEx(skin_u8, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=1)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(skin_u8, connectivity=8)
    keep = np.zeros_like(skin_u8)
    for i in range(1, num):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 20 or area > 60000:
            continue
        keep[labels == i] = 1

    skin_mask = cv2.dilate(keep, np.ones((11, 11), np.uint8), iterations=1)
    skin_mask = cv2.GaussianBlur(skin_mask.astype(np.float32), (0, 0), 1.2)
    skin_mask = np.clip(skin_mask, 0.0, 1.0)

    # face mask disabled: use skin mask only
    protect = np.clip(skin_mask, 0.0, 1.0)
    protect = np.clip(protect, 0.0, 1.0)

    edge_w = np.clip((8.5 - d_in) / 8.5, 0.0, 1.0) * (vis > 0)
    edge_w2 = np.clip((3.0 - d_in) / 3.0, 0.0, 1.0) * (vis > 0)
    dark_w = np.clip((0.52 - luma) / 0.42, 0.0, 1.0)
    semi_w = np.clip((0.90 - a) / 0.55, 0.0, 1.0)

    cover = np.zeros_like(a)
    cover += edge_w * (0.78 * spill_w)
    cover += edge_w * (0.24 * dark_w * semi_w)
    cover += edge_w2 * (0.14 * dark_w)

    strong_green = (spill > 0.02) & (d_in <= 6.0) & (vis > 0)
    cover = np.where(strong_green, np.maximum(cover, 0.52 * np.clip((6.0 - d_in) / 6.0, 0.0, 1.0) + 0.18), cover)

    cover *= (1.0 - 0.97 * protect)
    cover = np.where((protect > 0.2) & (spill > 0.03), np.minimum(cover + 0.10 * spill_w, 0.22), cover)
    cover = np.clip(cover, 0.0, 0.84)
    cover = cv2.GaussianBlur(cover.astype(np.float32), (0, 0), 0.35)
    cover = np.clip(cover, 0.0, 0.84)

    bg_vis = 1 - vis
    od = cv2.distanceTransform(bg_vis, cv2.DIST_L2, 3)
    out_mask = np.clip((0.8 - od) / 0.8, 0.0, 1.0) * (bg_vis > 0)
    out_mask = cv2.GaussianBlur(out_mask.astype(np.float32), (0, 0), 0.18)
    under_a = np.clip(out_mask * 0.10, 0.0, 0.10)

    stroke_rgb = np.array([0.07, 0.07, 0.075], dtype=np.float32)
    sub_pm = fg * a[..., None]
    under_pm = stroke_rgb[None, None, :] * under_a[..., None]
    base_pm = sub_pm + under_pm * (1.0 - a[..., None])
    base_a = a + under_a * (1.0 - a)

    cover_pm = stroke_rgb[None, None, :] * (cover * a)[..., None]
    final_pm = cover_pm + base_pm * (1.0 - cover[..., None])
    final_a = base_a

    final_rgb = np.zeros_like(fg)
    nz = final_a > 1e-6
    final_rgb[nz] = final_pm[nz] / final_a[nz, None]
    final_rgb = np.clip(final_rgb, 0.0, 1.0)

    r2, g2, b2 = final_rgb[..., 0], final_rgb[..., 1], final_rgb[..., 2]
    band = (cover > 0.025) & (protect < 0.8)
    final_rgb[..., 1] = np.where(band, np.minimum(g2, np.maximum(r2, b2) + 0.0007), g2)
    final_rgb = np.clip(final_rgb, 0.0, 1.0)
    final_rgb[final_a == 0.0] = 0.0
    return final_rgb.astype(np.float32), final_a.astype(np.float32)


def apply_local_patch(base_rgb, base_a, patch_rgb, patch_a, face_mask=None):
    h, w = base_a.shape
    vis_th = 0.45
    vis = (base_a > vis_th).astype(np.uint8)
    d_in = cv2.distanceTransform(vis, cv2.DIST_L2, 3)

    b_comp = base_rgb * base_a[..., None]
    spill = b_comp[..., 1] - np.maximum(b_comp[..., 0], b_comp[..., 2])

    prob = (vis > 0) & (d_in <= 12.0) & (spill > 0.004)
    prob_strong = (vis > 0) & (d_in <= 10.0) & (spill > 0.012)
    prob = prob | prob_strong

    # face mask disabled
    face_ellipse = np.zeros_like(base_a, dtype=bool)
    prob &= ~face_ellipse

    rr, gg, bb = base_rgb[..., 0], base_rgb[..., 1], base_rgb[..., 2]
    luma = 0.299 * rr + 0.587 * gg + 0.114 * bb
    mx = np.maximum.reduce([rr, gg, bb])
    mn = np.minimum.reduce([rr, gg, bb])
    chroma = mx - mn
    skinish = (
        (base_a > 0.35) &
        (rr >= gg - 0.05) & (gg >= bb - 0.08) &
        (rr > 0.22) & (luma > 0.24) &
        (chroma > 0.02) & (chroma < 0.45) &
        (spill < 0.02)
    )
    bright_neutral = (luma > 0.78) & (chroma < 0.16) & (spill < 0.02)
    prob &= ~(skinish | bright_neutral)

    prob_u8 = prob.astype(np.uint8)
    prob_u8 = cv2.morphologyEx(prob_u8, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    prob_u8 = cv2.dilate(prob_u8, np.ones((5, 5), np.uint8), iterations=1)
    mask_soft = cv2.GaussianBlur(prob_u8.astype(np.float32), (0, 0), 1.1)
    mask_soft = np.clip(mask_soft, 0.0, 1.0)

    spill_w = np.clip((spill - 0.004) / 0.050, 0.0, 1.0)
    edge_w = np.clip((12.0 - d_in) / 12.0, 0.0, 1.0) * (vis > 0)
    blend_w = mask_soft * (0.40 + 0.60 * np.maximum(spill_w, edge_w * 0.5))
    blend_w = np.clip(blend_w, 0.0, 1.0)
    blend_w = np.where(prob_strong, np.maximum(blend_w, 0.72), blend_w)
    blend_w = np.where(d_in > 9.0, np.minimum(blend_w, 0.65), blend_w)

    b_pm = base_rgb * base_a[..., None]
    p_pm = patch_rgb * patch_a[..., None]
    out_pm = b_pm * (1.0 - blend_w[..., None]) + p_pm * blend_w[..., None]
    out_a = base_a * (1.0 - blend_w) + patch_a * blend_w

    out_rgb = np.zeros_like(base_rgb)
    nz = out_a > 1e-6
    out_rgb[nz] = out_pm[nz] / out_a[nz, None]
    out_rgb = np.clip(out_rgb, 0.0, 1.0)

    out_comp = out_rgb * out_a[..., None]
    out_spill = out_comp[..., 1] - np.maximum(out_comp[..., 0], out_comp[..., 2])
    residual = (blend_w > 0.08) & (out_spill > 0.004) & (d_in <= 10.0) & (~face_ellipse)
    res_u8 = cv2.dilate(residual.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1)
    res_mask = cv2.GaussianBlur(res_u8.astype(np.float32), (0, 0), 0.9)
    res_mask = np.clip(res_mask * np.clip((out_spill - 0.004) / 0.03, 0.0, 1.0), 0.0, 0.65)

    stroke_rgb = np.array([0.065, 0.065, 0.07], dtype=np.float32)
    out_pm2 = out_rgb * out_a[..., None]
    cover_pm = stroke_rgb[None, None, :] * (res_mask * out_a)[..., None]
    out_pm2 = cover_pm + out_pm2 * (1.0 - res_mask[..., None])
    out_rgb2 = np.zeros_like(out_rgb)
    out_rgb2[nz] = out_pm2[nz] / out_a[nz, None]
    out_rgb2 = np.clip(out_rgb2, 0.0, 1.0)

    r2, g2, b2 = out_rgb2[..., 0], out_rgb2[..., 1], out_rgb2[..., 2]
    patch_band = (blend_w > 0.06) | (res_mask > 0.03)
    out_rgb2[..., 1] = np.where(patch_band, np.minimum(g2, np.maximum(r2, b2) + 0.0007), g2)
    out_rgb2 = np.clip(out_rgb2, 0.0, 1.0)
    out_rgb2[out_a == 0.0] = 0.0
    return out_rgb2.astype(np.float32), out_a.astype(np.float32)


def apply_hard_alpha_mask_green_kill(fg, a, alpha_th=0.16, green_margin=0.02):
    a_pre = np.clip(a.astype(np.float32), 0.0, 1.0)

    # threshold + step(0/1) + 1px erosion
    mask = (a_pre >= float(alpha_th)).astype(np.uint8)
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)
    mask_bool = mask > 0

    # final alpha is hard mask
    a_new = mask_bool.astype(np.float32)
    fg_new = fg.astype(np.float32).copy()

    # outside mask: remove all green-dominant pixels
    gdom = fg_new[..., 1] - np.maximum(fg_new[..., 0], fg_new[..., 2])
    kill_green = (~mask_bool) & (gdom > float(green_margin))
    fg_new[kill_green] = 0.0

    # keep output strictly inside mask
    fg_new[~mask_bool] = 0.0
    fg_new = np.clip(fg_new, 0.0, 1.0)
    return fg_new.astype(np.float32), a_new.astype(np.float32)


def process_frame_bgr(frame_bgr):
    img_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    base_rgb, base_a = key_base_v2(img_rgb)
    balanced_rgb, balanced_a = apply_skinprotected_cover(base_rgb, base_a, face_mask=None)
    patch_rgb, patch_a = key_extreme_from_base(base_rgb, base_a)
    final_rgb, final_a = apply_local_patch(
        balanced_rgb, balanced_a, patch_rgb, patch_a, face_mask=None
    )
    final_rgb, final_a = apply_hard_alpha_mask_green_kill(final_rgb, final_a, alpha_th=0.16, green_margin=0.02)
    return np.dstack([
        (np.clip(final_rgb[..., 0], 0, 1) * 255 + 0.5).astype(np.uint8),
        (np.clip(final_rgb[..., 1], 0, 1) * 255 + 0.5).astype(np.uint8),
        (np.clip(final_rgb[..., 2], 0, 1) * 255 + 0.5).astype(np.uint8),
        (np.clip(final_a, 0, 1) * 255 + 0.5).astype(np.uint8),
    ])


def process_frame(img_rgb):
    frame_bgr = cv2.cvtColor(
        (np.clip(img_rgb, 0, 1) * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR
    )
    return process_frame_bgr(frame_bgr)
