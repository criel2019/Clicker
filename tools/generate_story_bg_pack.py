"""
Generate a fallback story atmosphere background pack without external APIs.
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "story" / "bg"
SIZE = (1024, 1536)


SCENES = {
    "orphanage": {"top": (26, 20, 16), "mid": (46, 34, 24), "bot": (26, 20, 16), "accent": (220, 165, 95)},
    "market": {"top": (28, 22, 16), "mid": (58, 42, 24), "bot": (28, 22, 16), "accent": (255, 168, 78)},
    "forest": {"top": (8, 14, 8), "mid": (14, 28, 14), "bot": (6, 10, 6), "accent": (90, 180, 100)},
    "ocean": {"top": (6, 10, 20), "mid": (10, 30, 62), "bot": (6, 10, 20), "accent": (95, 170, 235)},
    "mountain": {"top": (12, 12, 22), "mid": (20, 22, 40), "bot": (12, 12, 22), "accent": (138, 140, 182)},
    "home": {"top": (22, 18, 12), "mid": (36, 28, 18), "bot": (22, 18, 12), "accent": (242, 198, 126)},
    "battlefield": {"top": (22, 10, 10), "mid": (40, 16, 16), "bot": (22, 10, 10), "accent": (214, 78, 58)},
    "temple": {"top": (16, 10, 24), "mid": (30, 18, 42), "bot": (16, 10, 24), "accent": (168, 132, 222)},
    "alley": {"top": (10, 10, 14), "mid": (20, 20, 28), "bot": (10, 10, 14), "accent": (120, 124, 150)},
    "sky": {"top": (10, 12, 30), "mid": (18, 24, 54), "bot": (10, 12, 30), "accent": (156, 186, 255)},
}


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def tri_gradient(size: tuple[int, int], top: tuple[int, int, int], mid: tuple[int, int, int], bot: tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        if t < 0.5:
            k = t / 0.5
            c = tuple(lerp(top[i], mid[i], k) for i in range(3))
        else:
            k = (t - 0.5) / 0.5
            c = tuple(lerp(mid[i], bot[i], k) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def add_radial_glow(img: Image.Image, color: tuple[int, int, int], center: tuple[float, float], radius: float, strength: int) -> Image.Image:
    w, h = img.size
    cx = int(w * center[0])
    cy = int(h * center[1])
    r = int(min(w, h) * radius)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(color[0], color[1], color[2], strength))
    glow = glow.filter(ImageFilter.GaussianBlur(max(24, r // 3)))
    base = img.convert("RGBA")
    base.alpha_composite(glow)
    return base.convert("RGB")


def add_noise(img: Image.Image, amount: int = 16) -> Image.Image:
    w, h = img.size
    noise = Image.effect_noise((w, h), amount).convert("L")
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    return ImageChops.overlay(img, noise_rgb).convert("RGB")


def add_vignette(img: Image.Image, strength: int = 130) -> Image.Image:
    w, h = img.size
    vignette = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(vignette)
    draw.ellipse((-w * 0.1, -h * 0.1, w * 1.1, h * 1.1), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(220))
    dark = Image.new("RGB", (w, h), (0, 0, 0))
    darkened = Image.blend(img, dark, strength / 255.0)
    return Image.composite(img, darkened, vignette)


def add_particles(img: Image.Image, color: tuple[int, int, int], count: int, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        x = rnd.randint(0, w - 1)
        y = rnd.randint(0, h - 1)
        r = rnd.randint(1, 3)
        a = rnd.randint(16, 58)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(color[0], color[1], color[2], a))
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    base = img.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


def generate_scene(name: str, cfg: dict[str, tuple[int, int, int]], seed: int) -> Image.Image:
    rnd = random.Random(seed)
    img = tri_gradient(SIZE, cfg["top"], cfg["mid"], cfg["bot"])
    img = add_radial_glow(img, cfg["accent"], (rnd.uniform(0.22, 0.78), rnd.uniform(0.22, 0.74)), rnd.uniform(0.22, 0.42), rnd.randint(36, 78))
    img = add_radial_glow(img, tuple(min(255, c + 26) for c in cfg["accent"]), (rnd.uniform(0.18, 0.82), rnd.uniform(0.18, 0.86)), rnd.uniform(0.12, 0.26), rnd.randint(20, 48))
    img = add_particles(img, cfg["accent"], count=110 if name in {"sky", "temple", "forest"} else 72, seed=seed + 9)
    img = add_noise(img, amount=13)
    img = add_vignette(img, strength=122)
    return img


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i, (name, cfg) in enumerate(SCENES.items(), start=1):
        out_path = OUT_DIR / f"{name}.png"
        img = generate_scene(name, cfg, seed=1000 + i * 17)
        img.save(out_path, format="PNG")
        print(f"generated: {out_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
