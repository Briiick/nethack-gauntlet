import math, sys, time
import numpy as np
from PIL import Image
from sdf import Material, render
from rigs import humanoid, quadruped, floating_eye
from materials import mats

VALK = dict(skin='skin', legs='mail', torso='mail', arms='mail', boots='boots', belt='leather', buckle='gold',
            skirt='tunic', cape='cape', hair='hair', braids=True, helmet='horned', helm='steel', helm_trim='gold',
            horn='horn', shield='round', shield_face='shield', shield_rim='gold', weapon='longsword', pauldrons='steel')
VM = mats(skin='#d9956c', mail=Material('#6a7488', metal=True),  tunic='#2f4fb0', cape='#24409a', boots='#5a3a24', hair='#e8c060', horn='#efe6d2', shield='#7a2a22')
JACK = dict(body='fur', legs='fur_dark', belly='belly', muzzle='fur', tail_mat='fur', tail_tip='fur_dark', ears='pointed', length=0.95, girth=1.35, head=2.8, snout=2.6, leg=4.0)
JM = mats(fur='#9a6a3a', belly='#d6bc8c', fur_dark='#5e3e22')

def sheet(rows, scale=6):
    h = len(rows); w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w * 32, h * 32), (40, 40, 52, 255))
    for y, r in enumerate(rows):
        for x, a in enumerate(r):
            im.alpha_composite(Image.fromarray(a, 'RGBA'), (x * 32, y * 32))
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)

t0 = time.time()
dirs = [0, math.pi / 2, math.pi, -math.pi / 2]
rows = []
rows.append([render(humanoid(VALK, {'breath': 0}), VM, facing=d) for d in dirs])
rows.append([render(humanoid(VALK, {'walk': ph}), VM, facing=math.pi / 2) for ph in (0, math.pi / 2, math.pi, 3 * math.pi / 2)])
rows.append([render(humanoid(VALK, {'attack': k}), VM, facing=d) for k, d in ((0.2, 0), (0.6, 0), (0.95, 0), (0.6, math.pi / 2))])
rows.append([render(quadruped(JACK, {'breath': 0}), JM, facing=d) for d in dirs])
print('render time', time.time() - t0)
sheet(rows).save(sys.argv[1])
