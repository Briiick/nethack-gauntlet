"""Map every NetHack monster to a rig family, proportions, colours and gear.

Reads include/monsters.h so the roster always matches the engine build.
"""
import re

from sdf import Material

CLR = {
    'CLR_BLACK': '#3a3444', 'CLR_RED': '#b8342c', 'CLR_GREEN': '#3f8a3c', 'CLR_BROWN': '#8a5e34', 'CLR_BLUE': '#3a58c0',
    'CLR_MAGENTA': '#9a3aa8', 'CLR_CYAN': '#3aa0b0', 'CLR_GRAY': '#9a9aa6', 'NO_COLOR': '#9a9aa6', 'CLR_ORANGE': '#e07a2a',
    'CLR_BRIGHT_GREEN': '#6ad04a', 'CLR_YELLOW': '#e8c840', 'CLR_BRIGHT_BLUE': '#5a8af0', 'CLR_BRIGHT_MAGENTA': '#d050e0',
    'CLR_BRIGHT_CYAN': '#60e0e8', 'CLR_WHITE': '#e8e8ec',
    'HI_DOMESTIC': '#e8e8ec', 'HI_LORD': '#9a3aa8', 'HI_ZAP': '#5a8af0', 'HI_METAL': '#3aa0b0', 'HI_GOLD': '#e8c840',
    'HI_PAPER': '#e8e8ec', 'HI_WOOD': '#8a5e34', 'HI_CLOTH': '#8a5e34', 'HI_LEATHER': '#8a5e34', 'HI_GLASS': '#60e0e8',
    'HI_SILVER': '#9a9aa6', 'HI_COPPER': '#e8c840', 'HI_MINERAL': '#9a9aa6',
}
SIZE = {'MZ_TINY': 0.8, 'MZ_SMALL': 0.92, 'MZ_MEDIUM': 1.0, 'MZ_HUMAN': 1.0, 'MZ_LARGE': 1.25, 'MZ_HUGE': 1.5, 'MZ_GIGANTIC': 1.7}


def parse_monsters(path, tile_c=None):
    """Monsters in engine order. Entries compiled out with #if 0 are dropped by
    aligning to the engine's own list (from the generated src/tile.c)."""
    mons = _parse(path)
    if tile_c is None:
        import os
        tile_c = os.path.join(os.path.dirname(os.path.dirname(path)), 'src', 'tile.c')
    eng = {}
    for m in re.finditer(r'monsters.txt:\d+ male (.+?) \(mnum=(\d+)\)', open(tile_c).read()):
        eng.setdefault(int(m.group(2)), m.group(1))
    order = [eng[i] for i in sorted(eng)]
    out, j = [], 0
    for name in order:
        alts = {name.split(' {')[0]} | set(re.findall(r'\{(.+?)\}', name))
        while j < len(mons) and not (alts & set(mons[j]['names'])):
            j += 1
        if j >= len(mons):
            raise ValueError('monster not found in monsters.h: ' + name)
        out.append(mons[j]); j += 1
    return out


def _parse(path):
    text = open(path).read()
    blocks = re.split(r'\n\s*MON\(', text)[1:]
    out = []
    for b in blocks:
        m = re.match(r'NAMS?\(([^)]*)\),\s*(S_\w+)', b)
        if not m:
            continue
        names = [n.strip().strip('"') for n in m.group(1).split(',')]
        cls = m.group(2)
        size = re.search(r'SIZ\(\s*\d+,\s*\d+,\s*\w+,\s*(MZ_\w+)\)', b)
        color = re.search(r',\s*\d+,\s*((?:CLR|HI|NO)_\w+),\s*\w+\)', b)
        flags = re.findall(r'\bM[123]_\w+', b)
        out.append({'name': names[0], 'fname': names[1] if len(names) > 1 else names[0], 'names': names, 'cls': cls,
                    'size': size.group(1) if size else 'MZ_HUMAN', 'color': CLR.get(color.group(1) if color else 'NO_COLOR', '#9a9aa6'),
                    'flags': set(flags)})
    return out


def shade(hex_color, k):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(c * k))) for c in (r, g, b))


def mix(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(int(x + (y - x) * t) for x, y in zip(ca, cb))


SKIN = ['#e0a27c', '#c98a62', '#a86a48', '#7a4e34']

ROLES = {
    'archeologist': dict(helmet='fedora', torso='#9a7a4a', legs='#6a5a3a', weapon='pick', hat='#7a5a32'),
    'barbarian': dict(torso='#7a4a2a', legs='#5a3a24', weapon='axe', stocky=1.15, hair='#3a2418', beard='#3a2418'),
    'caveman': dict(torso='#8a6a3a', legs='#8a6a3a', weapon='club', hair='#4a2e1a', beard='#4a2e1a'),
    'healer': dict(torso='#e6e2d4', legs='#6a8a5a', robe='#e6e2d4', weapon='staff', orb='gem_green'),
    'knight': dict(helmet='cap', helm='steel', torso='plate', legs='plate', arms='plate', weapon='longsword', shield='kite', shield_face='#2a4a9a', pauldrons='steel'),
    'monk': dict(torso='#c87a2a', legs='#c87a2a', robe='#c87a2a', hair=None),
    'priest': dict(helmet='hood', helm='#5a4a6a', torso='#5a4a6a', robe='#5a4a6a', weapon='mace'),
    'ranger': dict(helmet='hood', helm='#3a5a32', torso='#4a6a3a', legs='#5a4a32', cape='#3a5a32', weapon='bow'),
    'rogue': dict(helmet='hood', helm='#2a2a34', torso='#3a3440', legs='#2a2a34', cape='#2a2430', weapon='dagger'),
    'samurai': dict(helmet='kabuto', helm='#9a2a22', torso='#9a2a22', legs='#2a2a34', weapon='katana', pauldrons='#9a2a22'),
    'tourist': dict(torso='#e0508a', legs='#5a8ad0', hat='#e8d070', helmet='fedora', weapon='camera'),
    'valkyrie': dict(helmet='horned', helm='steel', helm_trim='gold', torso='mail', legs='mail', arms='mail', skirt='#2f4fb0',
                     cape='#24409a', hair='#e8c060', braids=True, shield='round', shield_face='#7a2a22', shield_rim='gold',
                     weapon='longsword', pauldrons='steel', buckle='gold'),
    'wizard': dict(helmet='pointed', helm='#3a3a9a', torso='#3a3a9a', robe='#3a3a9a', weapon='staff', beard='#d8d8e0', orb='gem'),
}


def spec(mon, idx):
    """Return (rig name, gear dict, extra materials dict) for one monster."""
    n, c, col = mon['name'], mon['cls'], mon['color']
    s = SIZE.get(mon['size'], 1.0)
    F = mon['flags']
    mats = {}

    def hum(**kw):
        g = dict(skin='skin', legs='legs', torso='torso', arms='arms', boots='boots', belt='leather', hair='hair', helm='helm',
                 helm_trim='gold', horn='bone', shield_face='shield', shield_rim='steel', eyes='eye')
        g.update(kw)
        return g

    base_skin = SKIN[idx % len(SKIN)]
    mats.update(legs=shade(col, 0.6), torso=col, arms=shade(col, 0.8), boots='#4a3020', hair='#5a3a22', helm='#8a90a0',
                shield='#6a3a2a', skin=base_skin)
    role = next((r for r in ROLES if n.startswith(r) or n.replace('woman', 'man') == r or n in ('cavewoman', 'priestess') and r in ('caveman', 'priest')), None)
    if c == 'S_HUMAN' and role:
        g = hum(scale=1.5)
        for k, v in ROLES[role].items():
            if isinstance(v, str) and v.startswith('#'):
                mats[k] = v; g[k] = k
            elif k == 'orb':
                g['orb'] = v
            elif v is None:
                g[k] = None
            else:
                g[k] = v
        if role == 'valkyrie':
            mats.update(mail=Material('#6a7488', metal=True), skin='#d9956c'); g.update(torso='mail', legs='mail', arms='mail')
        if role == 'knight':
            mats.update(plate=Material('#9aa2b4', metal=True)); g.update(torso='plate', legs='plate', arms='plate')
        if g.get('helmet') in ('fedora',):
            g['helmet'] = 'cap'; mats['helm'] = mats.get('hat', '#7a5a32')
        if g.get('weapon') in ('mace', 'club'):
            g['weapon'] = 'staff'
        if g.get('weapon') == 'katana':
            g['weapon'] = 'longsword'
        if g.get('weapon') == 'camera':
            g['weapon'] = None
        if g.get('helmet') == 'kabuto':
            g['helmet'] = 'horned'; g['horn'] = 'gold'
        return 'humanoid', g, mats

    if c in ('S_HUMAN', 'S_HUMANOID', 'S_ELF', 'S_GNOME', 'S_KOBOLD', 'S_ORC', 'S_GIANT', 'S_OGRE', 'S_TROLL', 'S_DEMON',
             'S_VAMPIRE', 'S_ZOMBIE', 'S_MUMMY', 'S_WRAITH', 'S_LICH', 'S_ANGEL', 'S_LEPRECHAUN', 'S_NYMPH', 'S_KOP',
             'S_QUANTMECH', 'S_GOLEM', 'S_GHOST', 'S_IMP', 'S_YETI', 'S_UMBER', 'S_XORN', 'S_ELEMENTAL', 'S_ZRUTY', 'S_CENTAUR'):
        g = hum(scale=1.5 * s)
        if c == 'S_GNOME':
            g.update(scale=1.05, helmet='pointed', head=1.15, beard='beard', weapon='dagger'); mats.update(helm=col, beard='#d8d4cc', torso=shade(col, .9), skin='#c98a62')
        elif c == 'S_KOBOLD':
            g.update(scale=1.0, snout=2.2, ears=True, weapon='spear', head=1.1, hair=None, glow_eyes=True)
            mats.update(skin=mix(col, '#a8502a', .45), torso='#4a5a2a', legs='#3a3020', arms=mix(col, '#a8502a', .45))
        elif c == 'S_ORC':
            g.update(scale=1.4 * s, tusks=True, stocky=1.15, hunch=0.8, weapon='axe', ears=True); mats.update(skin=mix(col, '#6a8a3a', .45), torso='#5a4a3a', legs='#3a3028')
        elif c == 'S_ELF':
            g.update(ears=True, thin=0.85, weapon='longsword', cape='cape', hair='hair'); mats.update(cape=shade(col, .7), hair='#e8d8a0', skin='#ecc4a0')
        elif c == 'S_GIANT' or c == 'S_OGRE' or c == 'S_TROLL':
            g.update(scale=min(1.95, 1.5 * s), stocky=1.25, belly=1.2, hunch=1.0, weapon='staff', beard='beard' if c == 'S_GIANT' else None)
            mats.update(skin=mix(col, base_skin, .45), torso='#6a4a2a', beard='#5a3a22')
            if c == 'S_TROLL':
                g.update(arm_len=1.25, snout=1.2, glow_eyes=True, weapon=None); mats.update(skin=mix(col, '#4a6a3a', .5))
        elif c == 'S_DEMON':
            g.update(horns='horns', tail='skin', wings='wings' if s >= 1.0 else None, glow_eyes=True, weapon='staff' if 'lord' in n else None)
            mats.update(skin=mix(col, '#8a2a22', .5), horns='#2a2024', wings=shade(mix(col, '#5a1a1a', .5), .7), torso=shade(col, .5), legs=shade(col, .5))
        elif c in ('S_ZOMBIE', 'S_MUMMY'):
            g.update(hunch=0.9, arm_len=1.1, glow_eyes=c == 'S_MUMMY'); mats.update(skin=mix(col, '#7a8a6a', .5), torso='#5a5a4a' if c == 'S_ZOMBIE' else '#c8bc9a', legs='#4a4a3a')
            if c == 'S_MUMMY':
                g.update(torso='wrap', legs='wrap', arms='wrap'); mats['wrap'] = '#c8bc9a'
        elif c in ('S_WRAITH', 'S_GHOST'):
            g.update(robe='robe', helmet='hood', glow_eyes=True); mats.update(robe='#3a3a4a' if c == 'S_WRAITH' else '#c8d0e0', helm='#2a2a34' if c == 'S_WRAITH' else '#c8d0e0')
        elif c == 'S_LICH':
            g.update(robe='robe', thin=0.7, glow_eyes=True, helmet='crown', weapon='staff'); mats.update(skin='#d8d0b8', robe=shade(col, .8), helm='#e8c840')
        elif c == 'S_VAMPIRE':
            g.update(cape='cape', glow_eyes=True, weapon=None); mats.update(cape='#2a0a14', skin='#d8c8c0', torso='#2a2a34')
        elif c == 'S_ANGEL':
            g.update(wings='wings', robe='robe', weapon='longsword'); mats.update(wings='#f0f0ff', robe='#e8e8f4', hair='#f0e0a0')
        elif c == 'S_NYMPH':
            g.update(thin=0.8, hair='hair'); mats.update(hair=col, torso=mix(col, '#ffffff', .4))
        elif c == 'S_LEPRECHAUN':
            g.update(scale=0.95, helmet='cap', beard='beard'); mats.update(helm='#2a7a2a', torso='#2a7a2a', beard='#c86a2a')
        elif c == 'S_KOP':
            g.update(helmet='cap', weapon='staff'); mats.update(helm='#2a3a8a', torso='#2a3a8a')
        elif c == 'S_GOLEM':
            g.update(stocky=1.3, belly=1.1, head=0.9); mats.update(skin=col, torso=col, legs=col, arms=col)
        elif c == 'S_ELEMENTAL':
            g.update(stocky=1.4, glow_eyes=True, scale=1.7); mats.update(skin=col, torso=col, legs=col, arms=col)
        elif c == 'S_IMP':
            g.update(scale=0.95, horns='horns', tail='skin', ears=True, glow_eyes=True); mats.update(skin=mix(col, '#a03a2a', .4), horns='#2a2024')
        elif c == 'S_YETI':
            g.update(hunch=1.2, arm_len=1.3, stocky=1.2, head=0.95); mats.update(skin=col, torso=col, legs=col, arms=col)
        elif c == 'S_UMBER' or c == 'S_XORN':
            g.update(stocky=1.4, glow_eyes=True, horns='horns'); mats.update(skin=col, torso=col, legs=col, arms=col, horns='#2a2024')
        elif c == 'S_CENTAUR':
            return 'quadruped', dict(body='body', legs='body', scale=1.3, length=1.1, leg=6, head=1.6, snout=0.6, ears='round', tail=6, centaur=True), {**mats, 'body': '#8a5e34'}
        if 'dwarf' in n:
            g.update(scale=1.1, stocky=1.3, beard='beard', helmet='cap', weapon='pick' if 'lord' not in n else 'axe'); mats.update(beard='#8a4a22', helm='#8a90a0', torso=col)
        if 'hobbit' in n:
            g.update(scale=1.0, head=1.1); mats.update(torso='#3a7a3a')
        if any(k in n for k in ('lord', 'king', 'leader', 'ruler')):
            g['helmet'] = 'crown'; mats['helm'] = '#e8c840'
        if any(k in n for k in ('priest', 'shaman', 'wizard', 'mage')) and c != 'S_GNOME':
            g.update(robe='robe', weapon='staff'); mats.setdefault('robe', col)
        if 'soldier' in n or 'sergeant' in n or 'lieutenant' in n or 'captain' in n or 'watch' in n:
            g.update(helmet='cap', weapon='spear', shield='kite'); mats.update(helm='#7a8070', torso='#5a6a4a')
        if 'shopkeeper' in n or 'guard' in n or 'oracle' in n:
            g.update(robe='robe' if 'oracle' in n else None, weapon=None if 'shopkeeper' in n else 'staff')
        if 'ettin' in n:
            g['head'] = 1.1
        if 'skeleton' in n:
            g.update(thin=0.55, glow_eyes=True); mats.update(skin='#e0d6bc', torso='#e0d6bc', legs='#e0d6bc', arms='#e0d6bc')
        g.setdefault('weapon', None)
        return 'humanoid', g, mats

    if c in ('S_DOG', 'S_FELINE', 'S_QUADRUPED', 'S_UNICORN', 'S_RODENT', 'S_RUSTMONST', 'S_LIZARD', 'S_COCKATRICE', 'S_DRAGON', 'S_JABBERWOCK', 'S_CROCODILE'):
        g = dict(body='body', legs='legs', belly='belly', muzzle='body', tail_mat='body', tail_tip='tip', scale=1.5 * s, ears='pointed')
        mats.update(body=col, legs=shade(col, .78), belly=mix(col, '#e8dcc0', .45), tip=shade(col, .55))
        if c == 'S_DOG':
            g.update(length=0.95, girth=1.3, head=2.8, snout=2.6, eyes='eye_glow')
            if 'jackal' in n or 'coyote' in n: mats.update(body='#9a6a3a', legs='#5e3e22', tip='#5e3e22', belly='#d6bc8c')
            if 'fox' in n: mats.update(body='#c0602a', belly='#f0e0c8', tip='#f0e0c8')
            if 'wolf' in n or 'warg' in n: g.update(girth=1.5, head=3.0)
            if 'hell hound' in n: g.update(eyes='eye_glow'); mats.update(body='#7a1a14')
        elif c == 'S_FELINE':
            g.update(length=0.9, girth=1.15, head=2.6, snout=0.9, leg=3.6, tail=6.0)
            if 'kitten' in n or 'housecat' in n or n == 'large cat': mats.update(body='#d07a34', belly='#f4e8d4', legs='#b8622a')
            if 'tiger' in n: mats.update(body='#e08a2a')
        elif c == 'S_RODENT':
            g.update(scale=1.5 * s, length=0.85, girth=1.2, leg=2.4, head=2.5, snout=1.6, ears='round', tail=5.0)
        elif c in ('S_LIZARD', 'S_CROCODILE'):
            g.update(leg=1.8, girth=1.0, length=1.2, head=2.2, snout=2.6, ears=None, tail=8.0, head_up=1.4)
        elif c == 'S_COCKATRICE':
            g.update(leg=3.6, girth=1.0, length=0.7, head=2.0, snout=1.0, ears=None, tail=3.0, muzzle='beak'); mats['beak'] = '#e8b040'
        elif c in ('S_DRAGON', 'S_JABBERWOCK'):
            g.update(scale=1.45, girth=1.5, length=1.25, head=2.6, snout=3.0, ears='horn', tail=9.0, wings='wings', eyes='eye_glow')
            mats.update(wings=shade(col, .7))
        elif c == 'S_UNICORN':
            g.update(leg=6.0, girth=1.2, length=1.1, head=2.2, snout=2.0, ears='pointed', tail=5.0, horn=True)
        elif c == 'S_RUSTMONST':
            g.update(leg=3.4, girth=1.4, head=2.4, snout=1.2, antennae=True)
        elif c == 'S_QUADRUPED':
            g.update(leg=4.8, girth=1.5, length=1.1, head=2.8, snout=2.4, ears='round', tail=3.0)
            if 'horse' in n or 'pony' in n or 'warhorse' in n: g.update(leg=6.0, girth=1.2, ears='pointed', snout=2.8, tail=5.0)
        if 'pony' in n or 'horse' in n:
            g.update(leg=6.0, girth=1.2, ears='pointed', snout=2.8, tail=5.0)
        return 'quadruped', g, mats

    if c in ('S_ANT', 'S_SPIDER', 'S_XAN'):
        g = dict(body='body', legs='legs', scale=1.2 * s, spider=c == 'S_SPIDER' or 'centipede' in n)
        mats.update(body=col, legs=shade(col, .6))
        if 'bee' in n:
            g.update(wings=True, stripes='stripe'); mats.update(body='#e8c030', stripe='#2a2420')
        if 'grid bug' in n:
            g.update(scale=0.8)
        return 'insect', g, mats

    if c in ('S_BLOB', 'S_JELLY', 'S_PUDDING', 'S_FUNGUS', 'S_PIERCER', 'S_TRAPPER', 'S_MIMIC'):
        g = dict(body='body', scale=1.3 * s, eyes=c not in ('S_FUNGUS',))
        mats.update(body=col)
        if c == 'S_FUNGUS' and ('mold' in n or 'lichen' in n or 'mushroom' in n or 'shrieker' in n or 'violet' in n):
            g.update(mushroom='mold' in n or 'shrieker' in n or 'violet' in n, spots='spots'); mats['spots'] = mix(col, '#ffffff', .6)
        if c == 'S_JELLY':
            mats['body'] = Material(col, glow=False); g['core'] = 'core'; mats['core'] = shade(col, .7)
        return 'blob', g, mats

    if c in ('S_EYE', 'S_LIGHT'):
        if n == 'floating eye':
            return 'floating_eye', dict(body='body', sclera='sclera', iris='iris'), dict(body='#6a9ad8', sclera='#eef2ff', iris='#2a7ae0')
        g = dict(body='body', sclera='sclera', iris='iris')
        mats.update(body=Material(col, glow=c == 'S_LIGHT'), sclera='#f0f0f4', iris=shade(col, .6))
        return 'floating_eye', g, mats

    if c in ('S_SNAKE', 'S_WORM', 'S_EEL', 'S_NAGA', 'S_WORM_TAIL'):
        g = dict(body='body', bands='bands', scale=1.4 * s, girth=1.0 if c != 'S_WORM' else 1.5, naga=c == 'S_NAGA', glow=c == 'S_NAGA')
        mats.update(body=col, bands=shade(col, .7), torso=col, face='#c89a6a')
        return 'serpent', g, mats

    if c == 'S_BAT':
        g = dict(body='body', wings='wings', scale=1.3 * s, ears='bat' in n, beak=None if 'bat' in n else 'beak', glow='vampire' in n)
        mats.update(body=col, wings=shade(col, .7), beak='#e8b040')
        return 'winged', g, mats

    if c == 'S_VORTEX':
        return 'vortex', dict(body='body', body2='body2', scale=1.2 * s), dict(body=Material(col, glow='fire' in n or 'energy' in n), body2=mix(col, '#ffffff', .35))

    # anything else: a humanoid in the monster's colour
    return 'humanoid', hum(scale=1.5 * s, weapon=None), mats
