"""App icon (desktop/resources/icon.png): the Valkyrie sprite on a torch-lit stone tile.

Usage: python3 tools/make_icon.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024


def main():
    sheet = Image.open(ROOT / 'public/assets/actors/342.png').convert('RGBA')   # valkyrie
    hero = sheet.crop((0, 0, 48, 48))
    hero = hero.crop(hero.getbbox())

    # rounded stone plate with a warm glow from below-left
    bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    plate = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    m, r = 72, 200
    for i in range(S - 2 * m):
        t = i / (S - 2 * m)
        c = (int(34 + 20 * (1 - t)), int(28 + 14 * (1 - t)), int(30 + 8 * (1 - t)), 255)
        d.line([(m, m + i), (S - m, m + i)], fill=c)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, S - m, S - m), r, fill=255)
    bg.paste(plate, (0, 0), mask)

    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for k in range(40, 0, -1):
        rr = 12 * k
        a = int(5 + 2.2 * (40 - k))
        gd.ellipse((S / 2 - rr, S * 0.62 - rr * 0.8, S / 2 + rr, S * 0.62 + rr * 0.8), fill=(255, 150, 60, min(a, 90)))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    bg = Image.alpha_composite(bg, Image.composite(glow, Image.new('RGBA', (S, S)), mask))

    # floor flagstones
    fl = ImageDraw.Draw(bg)
    for row in range(3):
        y = int(S * 0.72) + row * 56
        off = (row % 2) * 70
        for x in range(m - 140 + off, S - m, 140):
            fl.rounded_rectangle((x + 6, y + 6, x + 134, y + 50), 10, outline=(80, 66, 56, 120), width=4)
    bg.putalpha(Image.fromarray(np.minimum(np.array(bg.getchannel('A')), np.array(mask))))   # keep the corners clear

    # shadow and sprite, scaled up crisply
    scale = int(min(560 / hero.height, 560 / hero.width))
    big = hero.resize((hero.width * scale, hero.height * scale), Image.NEAREST)
    x = (S - big.width) // 2
    y = int(S * 0.80) - big.height
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((S / 2 - big.width * 0.42, S * 0.80 - 30, S / 2 + big.width * 0.42, S * 0.80 + 30), fill=(0, 0, 0, 150))
    bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(10)))
    bg.alpha_composite(big, (x, y))

    # gold rim
    rim = ImageDraw.Draw(bg)
    rim.rounded_rectangle((m, m, S - m, S - m), r, outline=(200, 154, 72, 255), width=14)
    rim.rounded_rectangle((m + 14, m + 14, S - m - 14, S - m - 14), r - 14, outline=(90, 62, 30, 255), width=6)

    out = ROOT / 'desktop/resources/icon.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    bg.save(out)
    print('wrote', out)


if __name__ == '__main__':
    main()
