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


GOLEMS = {   # body, dark/trim, detail, detail colour, thickness, metal
    'straw golem': ('#d8b850', '#a88a34', 'straw', '#f0d878', 0.85, False),
    'paper golem': ('#ecebe4', '#b8b6aa', 'pages', '#d8d4c4', 0.85, False),
    'rope golem': ('#a0784a', '#6a4a2a', 'rope', '#c89a62', 0.85, False),
    'gold golem': ('#e0aa3a', '#a8761e', 'rivets', '#f8d878', 1.0, True),
    'leather golem': ('#8a5a34', '#5a3a20', 'stitch', '#2a1a10', 1.0, False),
    'wood golem': ('#8a6238', '#5a3e22', 'cracks', '#3a2614', 1.05, False),
    'flesh golem': ('#c88a7a', '#9a5a50', 'stitch', '#3a1a1a', 1.05, False),
    'clay golem': ('#b07a4a', '#7a5030', 'cracks', '#4a2e1a', 1.15, False),
    'stone golem': ('#8a8a90', '#5e5e66', 'cracks', '#34343c', 1.2, False),
    'glass golem': ('#8ad8e8', '#4aa0b8', 'cracks', '#e8fcff', 1.05, False),
    'iron golem': ('#6a7488', '#454c5c', 'rivets', '#9aa2b4', 1.2, True),
}


# Named demons and the Riders: distinctive heads, horns, wings and weapons. Each entry is
# (gear overrides, material overrides) applied on top of a horned, tailed, glowing-eyed base.
FLAME = Material('#ff8a1a', glow=True)
FLAME2 = Material('#ffd040', glow=True)
DEMONS = {
    'water demon': (dict(ears=True, claws='horn_dark', horn_len=0.7, wings=None, thin=0.9),
                    dict(skin='#3a6ab8', torso='#2a4a8a', legs='#22386a', arms='#3a6ab8')),
    'incubus': (dict(hair='hair', horn_len=0.8, wings='wings', wing_style='bat', wing_span=0.9, membrane='membrane', thin=0.9),
                dict(skin='#c87a6a', hair='#2a1418', torso='#4a1a2a', legs='#2a1418', wings='#5a1a2a', membrane='#7a2a3a')),
    'horned devil': (dict(horn_len=1.7, claws='horn_dark', weapon='spear', wings=None, hunch=0.5),
                     dict(skin='#8a3a24', torso='#6a2a1a', legs='#4a1a12', arms='#8a3a24')),
    'erinys': (dict(hair='hair', horns=None, wings='wings', weapon='longsword', thin=0.8),
               dict(skin='#c86a5a', hair='#1a1018', torso='#3a1a24', legs='#2a1018', wings='#3a2a34')),
    'barbed devil': (dict(claws='horn_dark', pauldrons='spike', fur_ruff='spike', wings=None, stocky=1.15),
                     dict(skin='#7a2a1a', torso='#5a1e14', legs='#4a1a10', spike='#2a2024')),
    'vrock': (dict(head_kind='vulture', wings='wings', claws='horn_dark', hunch=0.6, head=1.25, horns=None, tail=None, ruff='ruff', beak_mat='beakc', neck_r=0.8),
              dict(skin='#a88a7a', torso='#4a5a3a', legs='#3a4430', arms='#5a6a48', wings='#3a4430', ruff='#22281c', beakc='#d8c8a0')),
    'hezrou': (dict(head_kind='toad', claws='horn_dark', hunch=1.6, head_fwd=2.2, stocky=1.3, belly=1.35, arm_len=1.2, horns=None, wings=None, tail=None,
                    warts='warts', leg_len=0.85),
               dict(skin='#5a7a2e', torso='#4a6a26', legs='#3a5420', arms='#5a7a2e', muzzle='#d8c47a', warts='#3a4e1c')),
    'bone devil': (dict(head_kind='skull', thin=0.6, claws='bone', tail='bone', wings=None, horns=None),
                   dict(skin='#e0d6bc', torso='#c8bc9a', legs='#c8bc9a', arms='#e0d6bc', boots='#a89c7a')),
    'ice devil': (dict(claws='horn_dark', weapon='spear', wings=None, horn_len=1.2, thin=0.85, tail='tailc'),
                  dict(skin=Material('#b0d8f0', step=0.1), torso='#7ab0d8', legs='#5a90b8', arms='#a0c8e8', tailc='#7ab0d8', boots='#5a90b8')),
    'nalfeshnee': (dict(head_kind='boar', belly=1.5, stocky=1.3, wings='wings', wing_style='bat', wing_span=0.8, membrane='membrane', horns=None, claws='horn_dark'),
                   dict(skin='#8a5a46', torso='#6a3e30', legs='#4a2a20', arms='#8a5a46', muzzle='#c8907a', wings='#4a2a20', membrane='#6a3a3a')),
    'pit fiend': (dict(horn_len=1.6, wings='wings', wing_style='bat', wing_span=1.4, membrane='membrane', claws='horn_dark', stocky=1.15, weapon='flail'),
                  dict(skin='#b02a1a', torso='#7a1a12', legs='#5a140e', arms='#b02a1a', wings='#5a140e', membrane='#8a2a1a')),
    'sandestin': (dict(horns=None, wings=None, thin=0.85, tail=None, ears=True),
                  dict(skin='#8a8a9a', torso='#5a5a6a', legs='#4a4a58', arms='#8a8a9a')),
    'balrog': (dict(horn_len=1.5, wings='wings', wing_style='bat', wing_span=1.45, membrane='membrane', claws='horn_dark', stocky=1.2, weapon='whip',
                    whip_mat='flame', flame_crest='flame', flame_crest2='flame2', head=0.9),
               dict(skin='#4a1a10', torso='#3a120c', legs='#2a0e0a', arms='#4a1a10', wings='#2a0e0a', membrane=FLAME, flame=FLAME, flame2=FLAME2)),
    'Yeenoghu': (dict(head_kind='gnoll', horns=None, wings=None, tail='mane', thin=0.9, leg_len=1.1, weapon='flail', mane='mane', muzzle='muzzlec', claws='horn_dark'),
                 dict(skin='#b89a5a', torso='#6a4a2a', legs='#4a3420', arms='#b89a5a', mane='#3a2a1a', muzzlec='#2a2020')),
    'Orcus': (dict(horn_style='ram', horn_len=1.1, snout=1.6, wings='wings', wing_style='bat', wing_span=1.15, membrane='membrane', belly=1.4, stocky=1.15,
                   weapon='wand', claws='horn_dark', hunch=0.6),
              dict(skin='#6a6a58', torso='#4a4a3e', legs='#3a3a30', arms='#6a6a58', horns='#9a8a68', wings='#2a2a24', membrane='#3a3a34')),
    'Dispater': (dict(horn_len=0.9, wings=None, cape='cape', weapon='staff', orb='rod_tip', tail=None, thin=0.9),
                 dict(skin='#b05a44', torso=Material('#5a5a6a', metal=True), legs='#2a2a34', arms='#3a3a44', cape='#2a1420', rod_tip=Material('#8a8a9a', metal=True))),
    'Baalzebub': (dict(head_kind='fly', horns=None, tail=None, wings='wings', wing_style='insect', wing_span=1.2, membrane='wing_glass', thin=0.85, claws='horn_dark',
                       fly_eyes='fly_eyes', muzzle='muzzlec'),
                  dict(skin='#2a3428', torso='#24301e', legs='#1c2618', arms='#2a3428', fly_eyes=Material('#d8281a', glow=True), muzzlec='#4a4a3a')),
    'Asmodeus': (dict(horn_len=1.9, wings=None, cape='cape', weapon='staff', orb='ruby', thin=0.95),
                 dict(skin='#c0402a', torso='#3a1414', legs='#2a0e0e', arms='#c0402a', cape='#1a0808', ruby=Material('#ff2a3a', glow=True))),
    'Demogorgon': (dict(two_heads=True, head_spread=2.9, head_kind='baboon', head=0.85, tentacle_arms=True, horns=None, wings=None, stocky=1.2,
                        tail='skin', muzzle='muzzlec', suckers='suckerc', neck_r=1.2),
                   dict(skin='#4a7a6a', torso='#3a6a5a', legs='#2a4a40', arms='#5a8a7a', muzzlec='#c84a5a', suckerc='#e8b0b0')),
    'Death': (dict(head_kind='skull', robe='robe', helmet='hood', helm='robe', weapon='scythe', thin=0.65, horns=None, tail=None, wings=None, hands='bonec'),
              dict(robe='#1a1820', torso='#1a1820', arms='#1a1820', legs='#1a1820', bonec='#e0d6bc', skin='#e0d6bc')),
    'Pestilence': (dict(robe='robe', helmet='hood', helm='robe', weapon='staff', orb='gem_green', horns=None, tail=None, wings=None, belly=1.2),
                   dict(robe='#4a5a26', torso='#4a5a26', arms='#4a5a26', legs='#3a4a1e', skin='#a8b46a')),
    'Famine': (dict(head_kind='skull', thin=0.5, horns=None, tail=None, wings=None, hunch=0.8, cape='robe'),
               dict(robe='#5a4a3a', torso='#6a5a48', arms='#d8ccb0', legs='#5a4a3a', skin='#d8ccb0')),
    'mail daemon': (dict(helmet='cap', helm='helmc', wings='wings', wing_style='bat', wing_span=0.8, membrane='membrane'),
                    dict(skin='#3a58c0', torso='#2a3a8a', legs='#22306a', helmc='#2a3a8a', wings='#22306a', membrane='#3a58c0')),
    'djinni': (dict(no_legs=True, smoke_tail='smoke', smoke_tail2='smoke2', horns=None, tail=None, wings=None, helmet='cap', helm='turban', torso='skin', stocky=1.1),
               dict(skin='#d8a840', smoke='#c8a040', smoke2='#e8cc70', turban='#e8e8f0')),
}


def _special(n, c, col, s, mats, hum):
    """Monsters whose body plan differs from their class default. Returns (rig, g, mats) or None."""
    if c == 'S_CENTAUR':
        horse = {'plains centaur': ('#a07446', '#d8c09a'), 'forest centaur': ('#5a3c24', '#3f8a3c'), 'mountain centaur': ('#4a8a96', '#2a6a7a')}[n]
        mats.update(body=horse[0], legs=shade(horse[0], .8), belly=mix(horse[0], '#e8dcc0', .3), vest=horse[1], hair={'plains centaur': '#6a4422', 'forest centaur': '#2a1a10', 'mountain centaur': '#d8d8e0'}[n],
                    hoof='#2a2020', skin='#d09670' if n != 'mountain centaur' else '#c8a090', beard='#d8d8e0')
        g = dict(body='body', legs='legs', belly='belly', scale=1.5 * s, length=1.05, leg=6.2, leg_r=1.25, girth=1.3, tail=5.0, tail_hang=True, hooves='hoof',
                 tail_mat='hair', tail_tip='hair', torso='vest' if n != 'plains centaur' else 'skin', arms='skin', hair='hair', belt='leather', big=True,
                 beard='beard' if n == 'mountain centaur' else None)
        return 'centaur', g, mats
    if c == 'S_NAGA':
        hatch = 'hatchling' in n
        face = {'red': '#d89070', 'black': '#a07a6a', 'golden': '#e0a878', 'guardian': '#c8a070'}[n.split()[0]]
        mats.update(body=col if n.split()[0] != 'black' else '#2a2630', bands=shade(col, .7) if n.split()[0] != 'black' else '#4a4450',
                    belly=mix(col, '#f0e6c8', .5), face=face, crest=shade(col, .85) if n.split()[0] != 'black' else '#3a3444')
        if n.startswith('golden'): mats.update(crest=Material('#e0aa3a', metal=True))
        g = dict(body='body', bands='bands', belly='belly', face='face', crest='crest', glow=True,
                 scale=(1.5 if hatch else 2.0), girth=1.0, rise=(6.5 if hatch else 8.5), big=not hatch)
        return 'naga', g, mats
    if c == 'S_GREMLIN':
        if n == 'gremlin':
            g = hum(scale=1.05, hunch=0.8, ears=True, glow_eyes=True, hair=None, claws='horn_dark', weapon=None, no_belt=True, head=1.15, thin=0.8)
            mats.update(skin='#4a8a3c', torso='#3e7a34', legs='#356a2c', arms='#4a8a3c', boots='#356a2c')
            return 'humanoid', g, mats
        winged = n == 'winged gargoyle'
        stone = '#7a7a86' if not winged else '#7a7088'
        g = hum(scale=1.55, hunch=1.6, stocky=1.15, horns='horns', horn_len=1.3, glow_eyes=True, hair=None, claws='horn_dark', weapon=None,
                no_belt=True, tail='skin', head_fwd=1.8, arm_len=1.15)
        mats.update(skin=Material(stone, step=0.1), torso=stone, legs=shade(stone, .85), arms=stone, boots=shade(stone, .75), horns='#3a3440',
                    hands=stone)
        if winged:
            g.update(wings='wings', wing_style='bat', wing_span=1.15, membrane='membrane')
            mats.update(wings=shade(stone, .7), membrane='#5a4a6a')
        return 'humanoid', g, mats
    if n in ('mind flayer', 'master mind flayer'):
        master = n.startswith('master')
        g = hum(scale=1.5, head_kind='flayer', head=1.0, robe='robe', hair=None, weapon=None, thin=0.85, cape='cape' if master else None,
                tentacle='tentacle', hands='skin', fingers='skin', arms='sleeve')
        mats.update(skin='#c070c0', tentacle='#a04ea8', robe='#3a2448' if not master else '#5a1a4a', torso='#4a2e5a' if not master else '#6a2a5a',
                    arms='#4a2e5a' if not master else '#6a2a5a', cape='#2a1030', sleeve='#6a4a80' if not master else '#8a3a7a')
        return 'humanoid', g, mats
    if n == 'Wizard of Yendor':
        g = hum(scale=1.55, robe='robe', helmet='hood', hood_peak=True, helm='hood', cape='cape', weapon='staff', orb='orb', hair=None,
                glow_eyes=True, beard='beard', thin=0.9)
        mats.update(robe='#8a2a9a', torso='#8a2a9a', arms='#7a2488', hood='#6a1a7a', cape='#3a0e44', skin='#c8b0a0', beard='#e0e0e8',
                    orb=Material('#ff5a3a', glow=True))
        return 'humanoid', g, mats
    if n == 'Juiblex':
        g = dict(body='body', scale=2.55, eye_ring=11, big=True, core='core')
        mats.update(body=Material('#5ab83a', step=0.1), core='#2a6a1a')
        return 'blob', g, mats
    if n in ('marilith', 'Geryon'):
        mar = n == 'marilith'
        up = hum(scale=1.25 if mar else 1.45, horns='horns', glow_eyes=True, hair='hair' if mar else None, weapon='longsword', extra_arms=2 if mar else 0,
                 wings='wings' if not mar else None, wing_style='bat', wing_span=1.1, membrane='membrane', no_belt=True, thin=0.85 if mar else 1.0,
                 beard='beard' if not mar else None)
        if mar:
            mats.update(skin='#c8604a', torso='#8a2a22', arms='#c8604a', legs='#8a2a22', hair='#2a1418', horns='#2a2024', body='#8a3424', bands='#5a2018', belly='#d8a070')
        else:
            mats.update(skin='#9a5a8a', torso='#5a2a5a', arms='#9a5a8a', legs='#5a2a5a', horns='#2a2024', wings='#4a1e4a', membrane='#6a2a5a', beard='#2a1a2a',
                        body='#5a3a6a', bands='#3a2448', belly='#a888a8')
        g = dict(body='body', bands='bands', belly='belly', scale=1.2 if mar else 1.5, girth=1.1, rise=8.0, upper=up, big=True)
        return 'naga', g, mats
    if c == 'S_DEMON' and n in DEMONS:
        g = hum(scale=1.5 * s, horns='horns', tail='skin', glow_eyes=True, hair=None, weapon=None, wings='wings' if s >= 1.0 else None)
        mats.update(skin=mix(col, '#8a2a22', .5), horns='#2a2024', wings=shade(mix(col, '#5a1a1a', .5), .7), torso=shade(col, .5), legs=shade(col, .5))
        kw, mm = DEMONS[n]
        g.update(kw); mats.update(mm)
        if g.get('helmet') == 'hood' and g.get('helm') == 'robe':
            g['helm'] = 'robe'
        return 'humanoid', g, mats
    if n == 'jellyfish':
        mats.update(body=Material('#4a7ae0', step=0.1), inner='#8ab0f8', rim='#3a58c0', arms='#7aa0f0', tentacles='#9ab8f8', spots='#e890c8')
        return 'jellyfish', dict(body='body', inner='inner', rim='rim', arms='arms', tentacles='tentacles', spots='spots', scale=1.55, alpha=0.9), mats
    if n == 'couatl':                             # feathered serpent with bright wings
        mats.update(body='#3aa04a', bands='#e0c040', wingc='#3ab0a0', membrane='#6ad07a', crest='#e84a3a')
        return 'serpent', dict(body='body', bands='bands', wings='wingc', membrane='membrane', crest='crest', scale=1.9, girth=1.0, rear=2.5, glow=True, big=True), mats
    if n in ('piranha', 'shark'):
        if n == 'piranha':
            mats.update(body='#7a7a6a', belly='#d8402a', fins='#5a5a4e')
            return 'fish', dict(body='body', belly='belly', fins='fins', scale=1.35, teeth=True, depth=1.25, eyes='eye_glow', yaw=0.95), mats
        mats.update(body='#7a8494', belly='#e8e8ec', fins='#5a6474')
        return 'fish', dict(body='body', belly='belly', fins='fins', scale=1.5, length=1.4, teeth=True, dorsal=1.5, big=True, yaw=0.95), mats
    if c == 'S_ELEMENTAL':
        if n == 'air elemental':
            return 'vortex', dict(body='body', body2='body2', band='band', fleck='fleck', scale=1.65, big=True, eyes='eye_glow'), dict(
                body=Material('#c8dcf0', step=0.08), body2=Material('#eef6ff', step=0.08), band=Material('#a0c0e0', step=0.08), fleck=Material('#ffffff', glow=True))
        if n == 'earth elemental':
            mats.update(body=Material('#7a6a52', step=0.1), dark='#4a3e30', detail='#2a2218', head_mat='#6a5a46')
            return 'golem', dict(body='body', dark='dark', detail='cracks', detail_mat='detail', head_mat='head_mat', thick=1.35, scale=1.75, big=True), mats
        fire = n == 'fire elemental'
        g = hum(scale=1.7, stocky=1.3, glow_eyes=True, hair=None, weapon=None, no_legs=True, no_belt=True, smoke_tail='tail1', smoke_tail2='tail2',
                flame_crest='crest1', flame_crest2='crest2', torso='skin', arms='skin', big=True)
        if fire:
            mats.update(skin=Material('#e8601a', glow=True), tail1=FLAME, tail2=FLAME2, crest1=FLAME, crest2=FLAME2, eye_glow=Material('#fff0a0', glow=True))
        else:
            mats.update(skin=Material('#3a7ad0', step=0.1), tail1='#2a62b8', tail2='#5a9ae8', crest1='#8ac0f8', crest2='#e0f0ff')
            g['alpha'] = 0.88
        return 'humanoid', g, mats
    if n == 'kraken':
        mats.update(body='#b8442c', body2='#9a3424', suckers='#f0c8a8')
        return 'tentacled', dict(body='body', body2='body2', suckers='suckers', scale=1.65, big=True), mats
    if c == 'S_COCKATRICE':
        if n == 'chickatrice':
            mats.update(body='#f0d040', wingc='#e0b828')
            return 'bird', dict(body='body', wings='wingc', scale=1.1, leg=2.0, head=2.0, plump=1.15), mats
        mats.update(body=col if n == 'cockatrice' else '#c84a2a', wingc=shade(col if n == 'cockatrice' else '#c84a2a', .8), comb='#d02a2a', tail='#6a8a3a' if n == 'cockatrice' else '#8a2a1a')
        return 'bird', dict(body='body', wings='wingc', comb='comb', serpent_tail='tail', scale=1.5, leg=3.2, eyes='eye_glow' if n == 'pyrolisk' else 'eye'), mats
    if c == 'S_PIERCER':
        mats.update(body=Material(col if n != 'rock piercer' else '#8a8a92', metal=n == 'iron piercer', glow=False), ridge=shade(col, .75))
        if n == 'glass piercer': mats['body'] = Material('#c8f0f8', glow=False, step=0.1)
        return 'blob', dict(body='body', ridge='ridge', piercer=True, scale=1.5 * s), mats
    if c == 'S_GOLEM':
        body, dk, det, dcol, th, metal = GOLEMS.get(n, (col, shade(col, .7), None, col, 1.0, False))
        mats.update(body=Material(body, metal=metal), dark=Material(dk, metal=metal), detail=dcol)
        if n == 'glass golem':
            mats.update(body=Material(body, step=0.1), dark=Material(dk, step=0.1), detail=Material(dcol, glow=True))
        return 'golem', dict(body='body', dark='dark', detail=det, detail_mat='detail', thick=th, scale=1.5 * s * (0.95 if th < 1 else 1.0), big=True), mats
    if c == 'S_YETI':
        fur, face, chest = {'monkey': ('#8a6a4a', '#d8b08a', '#b89068'), 'ape': ('#6a4a30', '#8a6a52', '#4a3428'), 'owlbear': ('#7a5434', '#c8a878', '#9a7450'),
                            'yeti': ('#e8e8ec', '#7a8aa8', '#d0d4dc'), 'carnivorous ape': ('#2e2a30', '#6a5a5a', '#3a3438'), 'sasquatch': ('#7a6a5a', '#4a3a30', '#6a5a4a')}[n]
        mats.update(fur=fur, face=face, chest=chest, beakc='#d8c070', claw='#2a2024')
        g = dict(body='fur', face='face', chest='chest', hands='face', scale=1.5 * s * (0.8 if n == 'monkey' else 0.88), big=s > 1)
        if n == 'owlbear': g.update(beak='beakc', claws='claw', hands='fur')
        if n in ('yeti', 'sasquatch'): g.update(claws='claw', eyes='eye_glow' if n == 'yeti' else 'eye')
        if n == 'carnivorous ape': g.update(eyes='eye_glow')
        return 'gorilla', g, mats
    if n == 'kitten' or n == 'housecat' or n == 'large cat':
        return None
    return None


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
    special = _special(n, c, col, s, mats, hum)
    if special:
        return special
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
            if c == 'S_GIANT':                    # tunic in the giant's colour, bare arms, hair that contrasts with the face
                hair = {'stone giant': '#4a4a52', 'hill giant': '#3a2616', 'fire giant': '#e8501a', 'frost giant': '#e8f0ff', 'storm giant': '#2a3a6a',
                        'titan': '#e8d070', 'giant': '#6a2a1a'}.get(n, '#5a3a22')
                g.update(hunch=0.4, arms='skin', orb='steel')
                mats.update(skin=mix(base_skin, col, .25), torso=shade(col, .8), legs='#4a3420', hair=hair, beard=hair, belt='#3a2414')
                if n == 'frost giant': mats.update(skin='#c8d4e8')
                if n == 'fire giant': mats.update(skin='#b8603a')
            if c == 'S_OGRE':                     # bald, tusked, hide-clad
                g.update(hunch=0.6, hair=None, tusks=True, arms='skin', ears=True, weapon='staff', orb='wood')
                mats.update(skin=mix(col, '#d0a070', .6), torso='#3e2a18', legs='#2e2014', boots='#2a1c12')
            if c == 'S_TROLL':
                g.update(arm_len=1.25, snout=1.2, glow_eyes=True, weapon=None, hair=None, ears=True, arms='skin', claws='horn_dark', hunch=0.7, head=1.1, tusks=True)
                mats.update(skin=mix(col, '#5a8a3a', .45), hair='#1e2216', torso='#3a2e22', legs='#3a2e22')
        elif c == 'S_DEMON':
            g.update(horns='horns', tail='skin', wings='wings' if s >= 1.0 else None, glow_eyes=True, weapon='staff' if 'lord' in n else None, hair=None)
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
            g.update(scale=0.95, horns='horns', tail='skin', ears=True, glow_eyes=True, hair=None); mats.update(skin=mix(col, '#a03a2a', .4), horns='#2a2024')
            if n == 'tengu':                      # long-nosed crow goblin
                g.update(snout=2.4, horns=None, tail=None, wings='wings', wing_span=0.7); mats.update(wings='#2a2630')
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
        if 'ettin' in n:                          # two heads on broad shoulders
            g.update(head=0.95, two_heads=True, stocky=1.35)
            if n == 'ettin': mats.update(torso='#3a58c0', legs='#2a3a7a', skin='#7a8ad0', arms='#7a8ad0'); g.update(beard=None, hair=None, ears=True, tusks=True)
        if 'skeleton' in n:
            g.update(thin=0.55, glow_eyes=True, head_kind='skull', hair=None); mats.update(skin='#e0d6bc', torso='#e0d6bc', legs='#e0d6bc', arms='#e0d6bc')
        if c == 'S_MUMMY':
            g.update(head_kind='mummy', hair=None, beard=None, helmet=None); mats.update(skin='#c8bc9a', hands='#c8bc9a', boots='#a89c7a')
            g['hands'] = 'skin'
        if c == 'S_ZOMBIE' and 'skeleton' not in n:
            mats.update(skin=Material(mix(col, '#8aa078', .7), step=0.085, hue=0.5), hair='#2a2a20', torso=mix('#5a5a4a', col, .25), boots='#3a3428')
            g.update(glow_eyes=True, beard=None)
            if n == 'ghoul':
                g.update(hair=None, thin=0.8, head_kind='skull', hunch=1.3); mats.update(skin='#8a8a8e', torso='#3a3440', legs='#2a2630', arms='#8a8a8e')
        if c == 'S_LICH':
            g.update(head_kind='skull', hair=None, helmet='crown' if n in ('master lich', 'arch-lich') else 'hood', hood_peak=n == 'lich')
            mats.update(helm='#e8c840' if n in ('master lich', 'arch-lich') else shade(col, .6), hands='#e0d6bc', robe=shade(col, .8), torso=shade(col, .65))
            g['hands'] = 'hands'
            if n == 'demilich': g.update(helmet=None)
        if c == 'S_WRAITH' and n == 'barrow wight':
            g.update(head_kind='skull', hair=None, helmet=None, weapon='longsword')
        if n == 'minotaur':
            g.update(head_kind='bull', hair=None, beard=None, weapon='axe', head=1.05, hunch=0.6, stocky=1.3)
            mats.update(skin='#6a4428', torso='#6a4428', arms='#6a4428', legs='#3a2618', boots='#2a1c14', muzzle='#8a6a50')
            g['muzzle'] = 'muzzle'
        if n == 'bugbear':                        # big, furry, hunched goblinoid
            g.update(scale=1.7, hunch=1.4, fur_ruff='fur', ears='round', snout=1.0, glow_eyes=True, hair=None, weapon='staff', orb='steel', arm_len=1.15, no_belt=True)
            mats.update(skin='#8a5e34', torso='#7a5230', fur='#6a4628', legs='#5a3a22', arms='#7a5230', boots='#4a3020')
        if n == 'zruty':                          # huge hulking monstrosity
            g.update(scale=1.95, big=True, stocky=1.4, hunch=1.6, belly=1.3, arm_len=1.35, snout=1.4, tusks=True, glow_eyes=True, hair=None, claws='horn_dark',
                     no_belt=True, horns='horns', head=0.95, fur_ruff='fur')
            mats.update(skin='#5a4030', torso='#4a3424', fur='#3a2a1e', legs='#3a2a1e', arms='#5a4030', boots='#2a1e16', horns='#d8ccb0')
        if n == 'shade':
            g.update(alpha=0.7, hair=None); mats.update(robe='#16141c', helm='#100e14', skin='#16141c')
        if n == 'stalker':
            g.update(alpha=0.45, stocky=1.1, glow_eyes=True, hair=None); mats.update(skin=Material('#c8e0f0', glow=False, step=0.12), torso='#b8d0e8', legs='#a8c0e0', arms='#c8e0f0', boots='#a8c0e0')
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
            if n == 'werewolf': mats.update(body='#7a5434', legs='#5a3c24', tip='#3e2a1a', belly='#a88a64')
            if 'hell hound' in n: g.update(eyes='eye_glow'); mats.update(body='#7a1a14')
        elif c == 'S_FELINE':
            g.update(length=0.9, girth=1.15, head=2.6, snout=0.9, leg=3.6, tail=6.0)
            if 'kitten' in n or 'housecat' in n or n == 'large cat':
                mats.update(body='#ece8e0', belly='#fbf8f2', legs='#d4cfc6', tip='#bdb6ac', nose='#d87a8a')
                g['nose'] = 'nose'
            if 'tiger' in n: mats.update(body='#e08a2a')
        elif c == 'S_RODENT':
            g.update(scale=1.5 * s, length=0.85, girth=1.2, leg=2.4, head=2.5, snout=1.6, ears='round', tail=5.0)
        elif c in ('S_LIZARD', 'S_CROCODILE'):
            g.update(leg=1.7, sprawl=1.1, hip_w=1.2, girth=1.2, length=1.15, head=2.0, snout=2.4, ears=None, tail=9.0, head_up=1.0, tail_drag=True,
                     eyes='eye_glow' if n == 'salamander' else 'eye')
            if 'crocodile' in n: g.update(snout=4.2, snout_r=0.95, girth=1.35, length=1.4)
            if n in ('newt', 'gecko'): g.update(girth=1.0)
            mats.update(belly=mix(col, '#e8dcc0', .3))
        elif c in ('S_DRAGON', 'S_JABBERWOCK'):
            adult = 'baby' not in n
            g.update(scale=(2.2 if adult else 1.45), girth=1.5, length=1.25, head=2.6, snout=3.0, ears=None, horns='swept', tail=9.0, wings='wings', eyes='eye_glow',
                     neck=1.0 if adult else 0.0, head_up=4.2 if adult else 3.2, wing_span=1.2 if adult else 1.0)
            if adult: g.update(tail=6.5, membrane='membrane'); mats['membrane'] = shade(col, .55)
            if adult: g.update(big=True)
            if c == 'S_JABBERWOCK': g.update(scale=2.3, big=True, neck=2.0, head_up=5.5, snout=2.4, horns=None, ears='pointed')
            mats.update(wings=shade(col, .7), horn='#e8dcc4')
            g['horn_mat'] = 'horn'
        elif c == 'S_UNICORN':
            g.update(leg=6.5, leg_r=1.25, girth=1.3, length=1.15, head=1.7, snout=3.0, snout_drop=1.4, snout_r=0.95, head_up=5.6, neck=0.4,
                     ears='pointed', tail=5.0, horn=True, mane='mane', tail_hang=True, hooves='hoof', tail_mat='mane', tail_tip='mane')
            mats.update(mane=shade(col, .55) if col != '#3a3444' else '#1a1820', hoof='#3a2a20')
            if n in ('pony', 'horse', 'warhorse'):
                g['horn'] = False
                mats.update(body={'pony': '#9a6a3a', 'horse': '#7a4a2a', 'warhorse': '#5a3a24'}[n], legs={'pony': '#8a5a30', 'horse': '#6a3e22', 'warhorse': '#4a2e1c'}[n],
                            mane='#2a1a14', belly={'pony': '#b88a5a', 'horse': '#94623a', 'warhorse': '#6a4a30'}[n])
            if n == 'pony': g.update(leg=5.2, girth=1.3, head_up=4.6)
            if n == 'white unicorn': mats.update(mane='#e8dcc0')
        elif c == 'S_RUSTMONST':
            g.update(leg=3.4, girth=1.4, head=2.4, snout=1.2, antennae=True)
        elif c == 'S_QUADRUPED':
            g.update(leg=4.8, girth=1.5, length=1.1, head=2.8, snout=2.4, ears='round', tail=3.0)
            if n == 'rothe':     # shaggy musk-ox: low head, hooked horns, shoulder hump
                g.update(leg=4.0, leg_r=1.3, girth=1.3, length=1.25, head=2.3, snout=1.7, snout_r=1.15, snout_drop=0.8, head_up=0.4, ears=None,
                         horns='ox', hump=True, hump_mat='shag', tail=1.5, hooves='hoof', eyes='eye_glow')
                mats.update(body='#6a4628', legs='#4a301c', shag='#4a3220', belly='#7a5634', hoof='#2a1e18', horn='#d8ccb0')
                g['horn_mat'] = 'horn'
            if n == 'wumpus':    # big squat round beast with a broad snout
                g.update(leg=3.4, leg_r=1.5, girth=1.55, length=1.3, head=3.0, snout=2.0, snout_r=1.4, snout_drop=0.5, head_up=1.2, ears='round', hump=True, tail=2.6, eyes='eye_glow')
                mats.update(body='#3a9aa8', legs='#2a7480', belly='#7ac8c8')
            if n == 'mumak':     # trunk, big ears
                g.update(snout=4.2, snout_drop=3.4, snout_r=0.85, head=3.0, head_up=3.6, leg_r=1.6, ears='round')
        return 'quadruped', g, mats

    if c in ('S_ANT', 'S_SPIDER', 'S_XAN'):
        g = dict(body='body', legs='legs', scale=1.4 * s, spider=c == 'S_SPIDER' or 'centipede' in n)
        mats.update(body=col, legs=shade(col, .6))
        if n in ('scorpion', 'Scorpius'):
            g.update(scorpion=True, claw='claw', sting='sting'); mats.update(claw=shade(col, .85), sting='#2a2024')
            if n == 'Scorpius': g.update(scale=2.1, big=True); mats.update(body='#6a2a8a', legs='#4a1a5a', claw='#7a3a9a')
        if n.endswith('bee'):                     # not the giant beetle
            g.update(wings=True, stripes='stripe'); mats.update(body='#e8c030', stripe='#2a2420')
        if n == 'giant beetle':                   # glossy black carapace
            mats.update(body=Material('#3a3448', metal=True), legs='#241e2a')
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
        if n == 'flaming sphere':
            g.update(flames='flame', flames2='flame2'); mats.update(body=Material('#d8401c', glow=True), flame=Material('#ff9a1a', glow=True), flame2=Material('#ffe048', glow=True), iris='#6a0a04')
        return 'floating_eye', g, mats

    if c in ('S_SNAKE', 'S_WORM', 'S_EEL', 'S_NAGA', 'S_WORM_TAIL'):
        g = dict(body='body', bands='bands', scale=1.4 * s, girth=1.0 if c != 'S_WORM' else 1.5, naga=c == 'S_NAGA', glow=c == 'S_NAGA')
        mats.update(body=col, bands=shade(col, .7), torso=col, face='#c89a6a')
        if n == 'cobra':
            g.update(hood=True, hood_mat='hoodc', belly='bellyc', scale=1.7); mats.update(hoodc=shade(col, .85), bellyc='#e8d8a8')
        return 'serpent', g, mats

    if c == 'S_BAT':
        g = dict(body='body', wings='wings', scale=1.55 * s, ears='bat' in n, beak=None if 'bat' in n else 'beak', glow='vampire' in n)
        if 'bat' in n:                            # bats: big scalloped wings spread wide so they read at sprite size
            g.update(scale=1.75 * s, bat_wings=1.0, yaw_side=0.8)
        mats.update(body=col, wings=shade(col, .7), beak='#e8b040', membrane=shade(col, .5) if col != '#3a3444' else '#5a2a3a')
        g['membrane'] = 'membrane'
        if n == 'raven': mats.update(membrane='#2a2632', wings='#3a3444')
        return 'winged', g, mats

    if c == 'S_VORTEX':
        if n == 'fog cloud':
            return 'blob', dict(body='body', scale=1.3, eyes=False), dict(mats, body=Material('#b8bcc8', step=0.08))
        glow = 'fire' in n or 'energy' in n
        band = {'dust vortex': '#5a3a1e', 'ice vortex': '#ffffff', 'energy vortex': '#e8f4ff', 'steam vortex': '#ffffff', 'fire vortex': '#ff5a1a'}.get(n, mix(col, '#ffffff', .6))
        fleck = {'dust vortex': '#4a3220', 'ice vortex': '#a8e8ff', 'energy vortex': '#ffffff', 'fire vortex': '#ff4a1a'}.get(n, band)
        if n == 'fire vortex': col = '#f0a020'
        return 'vortex', dict(body='body', body2='body2', band='band', fleck='fleck', scale=1.2 * s), dict(
            body=Material(col, glow=glow), body2=Material(mix(col, '#ffffff', .35), glow=glow), band=Material(band, glow=glow or n == 'ice vortex'), fleck=Material(fleck, glow=glow))

    # anything else: a humanoid in the monster's colour
    return 'humanoid', hum(scale=1.5 * s, weapon=None), mats
