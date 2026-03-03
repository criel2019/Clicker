"""
Generate missing game assets with OpenAI image model.

Requirements:
- OPENAI_API_KEY environment variable
- pip install openai pillow
"""

from __future__ import annotations

import argparse
import base64
import io
import time
import urllib.request
from pathlib import Path

from PIL import Image
from openai import OpenAI


ROOT = Path(__file__).resolve().parents[1]


CHAR_SIZE = (832, 1248)
GOBLIN_SIZE = (256, 256)
PORTRAIT_SIZE = (256, 256)
TINY_GOD_SIZE = (96, 96)
SCENE_BG_SIZE = (1024, 1536)


CHAR_STYLE = (
    "clean anime-inspired fantasy character design, full-body standing pose, "
    "centered composition, high detail line art, soft cel shading, "
    "no text, no watermark, transparent background, isolated subject only"
)

PORTRAIT_STYLE = (
    "anime-inspired fantasy portrait, bust-up character icon, centered composition, "
    "clean silhouette, high readability at small size, transparent background, "
    "isolated subject only, no text, no watermark"
)


ASSET_SPECS = [
    {
        "path": "assets/cg/baekho/child/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Baekho child form: a cute white tiger spirit child in Korean myth style, "
            "small guardian robes with tiger stripe motifs, bright amber eyes, "
            "gentle but brave expression. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/cg/baekho/youth/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Baekho youth form: a teenage white tiger guardian warrior, "
            "light armor with claw motifs, agile posture, silver-white hair and tiger ears, "
            "confident expression. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/cg/baekho/adult/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Baekho adult form: a powerful white tiger guardian, "
            "ornate mythic armor, calm and commanding stance, "
            "regal aura with subtle wind-like energy accents. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/cg/hwangryong/child/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Hwangryong child form: a small golden dragon spirit child, "
            "playful expression, tiny horns, flowing robe with dragon-scale patterns, "
            "warm golden palette. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/cg/hwangryong/youth/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Hwangryong youth form: a young golden dragon guardian, "
            "athletic body, dragon-scale shoulder armor, determined expression, "
            "elegant mythic design with glowing golden accents. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/cg/hwangryong/adult/standing_main.png",
        "size": "1024x1536",
        "resize": CHAR_SIZE,
        "prompt": (
            "Hwangryong adult form: a majestic golden dragon guardian ruler, "
            "ornate ceremonial armor, long flowing hair, imposing but benevolent aura, "
            "mythic East-Asian fantasy style. " + CHAR_STYLE
        ),
    },
    {
        "path": "assets/ui/monsters/golden_goblin.png",
        "size": "1024x1024",
        "resize": GOBLIN_SIZE,
        "prompt": (
            "Golden goblin mascot sprite for a clicker game, "
            "cute mischievous goblin with gold coins and crown-like headpiece, "
            "front-facing and readable at small size, cartoon style, "
            "transparent background, isolated subject only, no text, no watermark"
        ),
    },
    {
        "path": "assets/ui/beasts/cheongryong_portrait.png",
        "size": "1024x1024",
        "resize": PORTRAIT_SIZE,
        "prompt": (
            "Cheongryong spirit portrait icon, blue dragon-themed guardian youth with azure hair and horn accents. "
            + PORTRAIT_STYLE
        ),
    },
    {
        "path": "assets/ui/beasts/baekho_portrait.png",
        "size": "1024x1024",
        "resize": PORTRAIT_SIZE,
        "prompt": (
            "Baekho spirit portrait icon, white tiger-themed guardian with white hair, tiger ears, and amber eyes. "
            + PORTRAIT_STYLE
        ),
    },
    {
        "path": "assets/ui/beasts/jujak_portrait.png",
        "size": "1024x1024",
        "resize": PORTRAIT_SIZE,
        "prompt": (
            "Jujak spirit portrait icon, vermilion phoenix-themed guardian with fiery red hair and feather motifs. "
            + PORTRAIT_STYLE
        ),
    },
    {
        "path": "assets/ui/beasts/hyeonmu_portrait.png",
        "size": "1024x1024",
        "resize": PORTRAIT_SIZE,
        "prompt": (
            "Hyeonmu spirit portrait icon, black tortoise-serpent themed guardian with emerald accents and calm expression. "
            + PORTRAIT_STYLE
        ),
    },
    {
        "path": "assets/ui/beasts/hwangryong_portrait.png",
        "size": "1024x1024",
        "resize": PORTRAIT_SIZE,
        "prompt": (
            "Hwangryong spirit portrait icon, golden dragon-themed guardian with noble regal expression and luminous accents. "
            + PORTRAIT_STYLE
        ),
    },
    {
        "path": "assets/ui/misc/tiny_god.png",
        "size": "1024x1024",
        "resize": TINY_GOD_SIZE,
        "prompt": (
            "Tiny benevolent deity mascot icon for fantasy game UI, cute floating mini god with soft golden light. "
            "transparent background, isolated subject only, no text, no watermark"
        ),
    },
    {
        "path": "assets/story/bg/orphanage.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, old orphanage interior at dusk, warm lantern glow, wooden floor, "
            "empty room, painterly fantasy style, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/market.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, bustling old fantasy market street at evening, hanging lanterns, "
            "stalls and cloth awnings, cinematic composition, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/forest.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, deep mystical forest at night, moonlight through trees, subtle fog, "
            "fantasy painterly style, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/ocean.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, calm moonlit ocean shore with dark waves and distant horizon, "
            "dramatic sky, painterly style, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/mountain.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, high mountain pass under cold twilight sky, rugged rocks and wind, "
            "cinematic fantasy matte painting, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/home.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, quiet traditional home interior at night, warm light, calm mood, "
            "fantasy-era Korean inspired style, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/battlefield.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, ruined battlefield after clash, smoke and embers in dark red sky, "
            "dramatic painterly style, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/temple.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, ancient mystical temple hall with glowing runes and pillars, "
            "purple-blue sacred ambience, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/alley.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, narrow old city alley at night, wet stones and dim lights, "
            "noir fantasy mood, no characters, no text"
        ),
    },
    {
        "path": "assets/story/bg/sky.png",
        "size": "1024x1536",
        "resize": SCENE_BG_SIZE,
        "prompt": (
            "Atmospheric story background, vast night sky with drifting clouds and starlight, "
            "dreamlike fantasy mood, no characters, no text"
        ),
    },
]


def _download_url(url: str) -> bytes:
    with urllib.request.urlopen(url) as response:  # nosec B310
        return response.read()


def _extract_image_bytes(image_item) -> bytes:
    b64_json = getattr(image_item, "b64_json", None)
    if b64_json:
        return base64.b64decode(b64_json)
    image_url = getattr(image_item, "url", None)
    if image_url:
        return _download_url(image_url)
    raise RuntimeError("No image payload found in API response.")


def generate_one(client: OpenAI, model: str, prompt: str, size: str, retries: int = 3) -> bytes:
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = client.images.generate(
                model=model,
                prompt=prompt,
                size=size,
                background="transparent",
                output_format="png",
            )
            return _extract_image_bytes(resp.data[0])
        except Exception as exc:  # pragma: no cover
            last_err = exc
            if attempt < retries:
                wait_sec = 1.5 * attempt
                print(f"  retry {attempt}/{retries} after error: {exc}")
                time.sleep(wait_sec)
    raise RuntimeError(f"Image generation failed: {last_err}") from last_err


def save_png(raw: bytes, output_path: Path, resize_to: tuple[int, int]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGBA")
        if resize_to:
            img = img.resize(resize_to, Image.Resampling.LANCZOS)
        img.save(output_path, format="PNG")


def run(model: str, overwrite: bool) -> int:
    client = OpenAI()
    for spec in ASSET_SPECS:
        rel_path = Path(spec["path"])
        out_path = ROOT / rel_path
        if out_path.exists() and not overwrite:
            print(f"[skip] {rel_path.as_posix()} (exists)")
            continue

        print(f"[gen ] {rel_path.as_posix()}")
        raw = generate_one(client, model=model, prompt=spec["prompt"], size=spec["size"])
        save_png(raw, out_path, spec["resize"])

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    return run(model=args.model, overwrite=args.overwrite)


if __name__ == "__main__":
    raise SystemExit(main())
