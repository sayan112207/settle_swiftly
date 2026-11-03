"""Regenerates the raster brand assets in public/ from the "last entry" mark.

    python scripts/generate-brand-assets.py path/to/SourceSerif4[opsz,wght].ttf

Writes favicon.ico, apple-touch-icon.png, icon-192/512(.maskable).png and
og-image.png. favicon.svg is hand-maintained next to them and uses the same
geometry; if the mark changes, change it in both places.

Needs Pillow only. The font is used for the og-image wordmark and is not
committed. Drawing happens at 8x and is downsampled for anti-aliasing.
"""

import io
import math
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parent.parent / "public"

GREEN = "#087A52"
CREAM = "#FCFCFA"
INK = "#111111"
MUTED = "#686863"
SS = 8  # supersampling factor

# The mark on the 48u grid: four ledger rules (x0, x1, y) and the tick.
RULES = [(6, 38, 6), (6, 30, 14), (6, 36, 22), (6, 26, 30)]
RULE_W = 3
TICK = [(6, 37), (10, 43), (23, 33.5)]
TICK_W = 3.5

# The 16px cut: separate pixel-grid drawing, not a downscale of the 48u art.
RULES16 = [(1, 13, 2), (1, 10, 6), (1, 12, 10)]
RULE16_W = 2
TICK16 = [(1, 12.5), (3, 15), (8.5, 11)]
TICK16_W = 1.75


def _offset_polyline(points, half):
    """Outline of a mitered open polyline as a single polygon."""
    n = len(points)
    left, right = [], []
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[1][0] - x, points[1][1] - y
            norms = [(-dy, dx)]
        elif i == n - 1:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
            norms = [(-dy, dx)]
        else:
            a = (x - points[i - 1][0], y - points[i - 1][1])
            b = (points[i + 1][0] - x, points[i + 1][1] - y)
            norms = [(-a[1], a[0]), (-b[1], b[0])]
        units = [(nx / math.hypot(nx, ny), ny / math.hypot(nx, ny)) for nx, ny in norms]
        mx = sum(u[0] for u in units)
        my = sum(u[1] for u in units)
        # Miter vector length: half / cos(theta/2) = half / dot(mean_unit, unit).
        mlen = math.hypot(mx, my)
        mx, my = mx / mlen, my / mlen
        scale = half / (mx * units[0][0] + my * units[0][1])
        left.append((x + mx * scale, y + my * scale))
        right.append((x - mx * scale, y - my * scale))
    return left + right[::-1]


def draw_mark(draw, ox, oy, scale, rules, rule_w, tick, tick_w, fill):
    """Draws the mark with its grid origin at (ox, oy), `scale` px per unit."""
    for x0, x1, y in rules:
        draw.rectangle(
            [ox + x0 * scale, oy + (y - rule_w / 2) * scale,
             ox + x1 * scale, oy + (y + rule_w / 2) * scale],
            fill=fill,
        )
    pts = [(ox + x * scale, oy + y * scale) for x, y in tick]
    draw.polygon(_offset_polyline(pts, tick_w * scale / 2), fill=fill)


def tile(size, radius_frac, mark16=False):
    """Green tile with the cream mark at the spec's 62.5% of the tile."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * radius_frac, fill=GREEN)
    if mark16:
        # Native 1:1 pixel-grid cut, nudged right so it sits inside the tile.
        draw_mark(d, 1.5 * SS, -0.5 * SS, SS, RULES16, RULE16_W, TICK16, TICK16_W, CREAM)
    else:
        mark = s * 0.625
        k = mark / 48
        draw_mark(d, (s - mark) / 2, (s - mark) / 2, k, RULES, RULE_W, TICK, TICK_W, CREAM)
    return img.resize((size, size), Image.LANCZOS)


def maskable(size):
    """Full-bleed tile; the mark sits well inside the 80% safe zone."""
    s = size * SS
    img = Image.new("RGBA", (s, s), GREEN)
    d = ImageDraw.Draw(img)
    mark = s * 0.5
    draw_mark(d, (s - mark) / 2, (s - mark) / 2, mark / 48, RULES, RULE_W, TICK, TICK_W, CREAM)
    return img.resize((size, size), Image.LANCZOS)


def og_image(font_path):
    w, h = 1200, 630
    s = SS
    img = Image.new("RGB", (w * s, h * s), CREAM)
    d = ImageDraw.Draw(img)

    def font(px, wght):
        f = ImageFont.truetype(str(font_path), int(px * s))
        f.set_variation_by_axes([wght, 36])  # [Weight, Optical Size]
        return f

    mark_px = 150
    k = mark_px / 48 * s
    left, top = 120 * s, 150 * s
    draw_mark(d, left, top, k, RULES, RULE_W, TICK, TICK_W, GREEN)

    f_word = font(92, 600)
    d.text((left + (mark_px + 36) * s, top + 12 * s), "Settle Swiftly", font=f_word, fill=INK)

    f_tag = font(52, 400)
    d.text((120 * s, 400 * s), "Send the invoice.", font=f_tag, fill=INK)
    d.text((120 * s, 468 * s), "We chase the payment.", font=f_tag, fill=GREEN)

    d.rectangle([0, (h - 14) * s, w * s, h * s], fill=GREEN)
    return img.resize((w, h), Image.LANCZOS)


def write_ico(path, images):
    """Writes a multi-image ICO of PNG entries.

    Pillow's ICO writer resizes the first image to every requested size, which
    would replace the hand-cut 16px drawing with a downscale, so the container
    is written directly.
    """
    blobs = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        blobs.append((img.width, img.height, buf.getvalue()))
    out = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    for w, h, data in blobs:
        out += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.write_bytes(out + b"".join(d for _, _, d in blobs))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    font_path = Path(sys.argv[1])

    sizes = {16: tile(16, 0.14, mark16=True), 32: tile(32, 0.2), 48: tile(48, 0.2)}
    write_ico(PUBLIC / "favicon.ico", [sizes[16], sizes[32], sizes[48]])
    # Square and opaque: iOS applies its own corner mask.
    tile(180, 0).convert("RGB").save(PUBLIC / "apple-touch-icon.png")
    tile(192, 0.2).save(PUBLIC / "icon-192.png")
    tile(512, 0.2).save(PUBLIC / "icon-512.png")
    maskable(512).convert("RGB").save(PUBLIC / "icon-512-maskable.png")
    og_image(font_path).save(PUBLIC / "og-image.png", optimize=True)
    print("wrote brand assets to", PUBLIC)


if __name__ == "__main__":
    main()
