"""Posable rigs built from SDF primitives. Every rig faces +z (south) in model space."""
import math

import numpy as np

from sdf import Box, Capsule, Disc, Ellipsoid, Octahedron, Sphere, Torus, rot_x, rot_z, rot_y


def _rotate_about(p, pivot, R):
    return pivot + R @ (np.asarray(p, float) - pivot)


def limb(shoulder, upper_dir, lower_dir, l1, l2, r1, r2, r3, mat, blend=0.6):
    """Two-segment limb from a joint, with direction vectors for each segment."""
    s = np.asarray(shoulder, float)
    e = s + np.asarray(upper_dir, float) / np.linalg.norm(upper_dir) * l1
    h = e + np.asarray(lower_dir, float) / np.linalg.norm(lower_dir) * l2
    return [Capsule(s, e, r1, r2, mat=mat, blend=blend), Capsule(e, h, r2, r3, mat=mat, blend=blend)], h


def bat_wing(P, root, sgn, ws, flap, mat, membrane, s, back_len=4.2, drop=0.6):
    """A bat/dragon wing held open: arm, two finger spars and a membrane between them.
    `drop` lowers the trailing corner so the membrane faces the camera more."""
    elbow = root + np.array([3.2 * sgn * ws, (2.6 + flap * 2.5) * ws, -1.0 * ws])
    tip = elbow + np.array([3.6 * sgn * ws, (1.6 + flap * 3) * ws, -2.6 * ws])
    back = root + np.array([(0.9 + drop * 0.5) * sgn * ws, -drop * ws, -back_len * ws])
    P.append(Capsule(root, elbow, 0.7 * s, 0.5 * s, mat=mat))
    P.append(Capsule(elbow, tip, 0.5 * s, 0.2 * s, mat=mat))
    for f in (0.35, 0.7):
        P.append(Capsule(elbow, tip + (back - tip) * f, 0.3 * s, 0.12 * s, mat=mat))
    for a, b, c in ((root, elbow, back), (elbow, tip, back)):
        ctr = (a + b + c) / 3
        u = b - a; v = c - a
        nrm = np.cross(u, v); nrm /= np.linalg.norm(nrm)
        x = u / np.linalg.norm(u); y = np.cross(nrm, x)
        ext = np.array([np.linalg.norm(u) * 0.62, max(abs(v @ y), 1.0) * 0.62, 0.25 * s])
        P.append(Ellipsoid(ctr, ext, membrane, R=np.stack([x, y, nrm], axis=1)))


def _head(P, g, s, head_c, hr):
    """Head, face, hair, hats and head-mounted extras for the humanoid rig.
    g['head_kind']: None (person), 'skull', 'mummy', 'flayer', 'bull'."""
    kind = g.get('head_kind')
    skin = g.get('head_mat', g['skin'])
    if kind == 'skull':
        P.append(Sphere(head_c + [0, 0.3 * s, -0.2 * s], hr * 0.95, 'bone', blend=0.3))
        P.append(Ellipsoid(head_c + [0, -1.9 * s, 0.9 * s], np.array([hr * 0.62, 1.3 * s, hr * 0.62]), 'bone', blend=0.5))   # jaw
        for sgn in (1, -1):
            P.append(Ellipsoid(head_c + [1.25 * sgn * s, 0.0, hr * 0.78], np.array([1.05, 1.1, 0.7]) * s, 'socket'))
            P.append(Sphere(head_c + [1.25 * sgn * s, 0.0, hr * 0.92], 0.5 * s, 'eye_glow'))
        P.append(Ellipsoid(head_c + [0, -1.0 * s, hr * 0.9], np.array([0.45, 0.6, 0.4]) * s, 'socket'))
        for k in (-1.5, -0.5, 0.5, 1.5):        # teeth
            P.append(Sphere(head_c + [k * 0.55 * s, -1.85 * s, hr * 0.84], 0.32 * s, 'glint'))
    elif kind == 'mummy':
        P.append(Sphere(head_c, hr, 'wrap', blend=0.4))
        for k, yy in enumerate((1.6, 0.6, -0.9, -1.9)):
            P.append(Torus(head_c + [0, yy * s, 0], hr * (0.95 - abs(yy) * 0.08), 0.32 * s, 'wrap_dark', R=rot_z(0.18 * (-1) ** k)))
        P.append(Ellipsoid(head_c + [0, -0.1 * s, hr * 0.82], np.array([2.4, 0.75, 0.6]) * s, 'socket'))
        for sgn in (1, -1):
            P.append(Sphere(head_c + [1.15 * sgn * s, -0.1 * s, hr * 0.95], 0.45 * s, 'eye_glow'))
    elif kind == 'flayer':                       # bulbous cranium, white eyes, a fringe of face tentacles
        P.append(Ellipsoid(head_c + [0, 1.0 * s, -0.6 * s], np.array([1.15, 1.3, 1.25]) * hr, skin, blend=0.6))
        for sgn in (1, -1):
            P.append(Ellipsoid(head_c + [1.35 * sgn * s, 0.2 * s, hr * 0.92], np.array([0.75, 0.55, 0.45]) * s, 'eye_white'))
        sw = g.get('_sway', 0.0)
        for k, (xx, ln) in enumerate(((-1.5, 4.6), (-0.5, 5.6), (0.5, 5.6), (1.5, 4.6))):
            a = head_c + [xx * s, -1.2 * s, hr * 0.75]
            m = a + [xx * 0.25 * s + sw * (1 if k % 2 else -1) * s, -ln * 0.55 * s, 1.0 * s]
            e = m + [-xx * 0.15 * s - sw * s, -ln * 0.45 * s, -0.2 * s]
            P.append(Capsule(a, m, 0.62 * s, 0.45 * s, mat=g.get('tentacle', skin), blend=0.3))
            P.append(Capsule(m, e, 0.45 * s, 0.2 * s, mat=g.get('tentacle', skin), blend=0.2))
    elif kind == 'bull':                         # minotaur: broad bovine head, muzzle, big horns
        P.append(Sphere(head_c + [0, 0.2 * s, -0.2 * s], hr * 1.05, skin, blend=0.4))
        P.append(Capsule(head_c + [0, -0.6 * s, 1.0 * s], head_c + [0, -1.6 * s, hr + 1.4 * s], 1.9 * s, 1.6 * s, mat=g.get('muzzle', skin), blend=0.6))
        for sgn in (1, -1):
            P.append(Sphere(head_c + [0.75 * sgn * s, -1.5 * s, hr + 2.6 * s], 0.42 * s, 'nose'))
            P.append(Sphere(head_c + [1.6 * sgn * s, 0.6 * s, hr * 0.78], 0.5 * s, 'eye_glow'))
            b = head_c + [hr * 0.85 * sgn, hr * 0.55, -0.2 * s]
            m1 = b + [2.4 * sgn * s, 0.4 * s, 0.4 * s]
            P.append(Capsule(b, m1, 0.9 * s, 0.65 * s, mat='bone'))
            P.append(Capsule(m1, m1 + [0.9 * sgn * s, 2.3 * s, 0.6 * s], 0.65 * s, 0.15 * s, mat='bone'))
            P.append(Capsule(head_c + [hr * 0.9 * sgn, 0.2 * s, -0.4 * s], head_c + [(hr + 1.6 * s) * sgn, -0.4 * s, -0.6 * s], 0.7 * s, 0.3 * s, mat=skin))
    else:
        P.append(Sphere(head_c, hr, skin, blend=0.4))
        for sgn in (1, -1):
            P.append(Ellipsoid(head_c + [1.25 * sgn * s, -0.1 * s, hr * 0.9], np.array([0.62, 0.9, 0.55]) * s, g.get('eyes', 'eye')))
        if g.get('hair'):
            P.append(Sphere(head_c + [0, 0.35 * s, -0.45 * s], hr * 1.05, g['hair'], blend=0.25,
                            cut=([0, 0.55, -1], -(0.55 * head_c[1] - head_c[2]) - 0.15 * hr)))
            if g.get('braids'):
                for sgn in (1, -1):
                    P.append(Capsule(head_c + [2.3 * sgn * s, -0.5 * s, -1.6 * s], head_c + [2.9 * sgn * s, -5.6 * s, -1.7 * s], 0.9 * s, 0.7 * s, mat=g['hair']))
        if g.get('glow_eyes'):
            for sgn in (1, -1):
                P.append(Sphere(head_c + [1.2 * sgn * s, 0.0, hr * 0.95], 0.6 * s, 'eye_glow'))
        if g.get('snout'):
            P.append(Capsule(head_c + [0, -0.6 * s, hr * 0.7], head_c + [0, -1.2 * s, hr * 0.7 + g['snout'] * s], 1.3 * s, 0.9 * s, mat=skin, blend=0.4))
            P.append(Sphere(head_c + [0, -1.1 * s, hr * 0.7 + g['snout'] * s + 0.4 * s], 0.55 * s, 'nose'))
    if g.get('beard'):
        P.append(Ellipsoid(head_c + [0, -2.2 * s, 1.6 * s], np.array([2.3, 2.6, 1.4]) * s, g['beard'], blend=0.6))
    if g.get('ears'):
        for sgn in (1, -1):
            if g['ears'] == 'round':
                P.append(Sphere(head_c + [2.9 * sgn * s, 1.9 * s, -0.3 * s], 1.1 * s, skin))
            else:
                P.append(Capsule(head_c + [3.0 * sgn * s, 0.3, 0], head_c + [4.6 * sgn * s, 1.8 * s, -0.4], 0.6 * s, 0.15 * s, mat=skin))

    hat = g.get('helmet')
    if hat == 'horned':
        P.append(Sphere(head_c + [0, 0.55 * s, -0.25], hr * 1.08, g['helm'], cut=([0, 1, 0.45], head_c[1] + 1.3 * s + 0.45 * (head_c[2] + hr * 0.2))))
        P.append(Ellipsoid(head_c + [0, 1.2 * s, -0.1], np.array([hr * 1.1, 0.55 * s, hr * 1.1]), g['helm_trim']))
        for sgn in (1, -1):
            b = head_c + [hr * 0.92 * sgn, 1.7 * s, -0.2]
            P.append(Capsule(b, b + [1.8 * sgn * s, 1.6 * s, -0.2], 0.95 * s, 0.7 * s, mat=g['horn']))
            P.append(Capsule(b + [1.8 * sgn * s, 1.6 * s, -0.2], b + [2.3 * sgn * s, 3.9 * s, -0.5], 0.7 * s, 0.2 * s, mat=g['horn']))
    elif hat == 'cap':
        P.append(Sphere(head_c + [0, 0.6 * s, -0.2], hr * 1.07, g['helm'], cut=([0, 1, 0], head_c[1] + 0.6 * s)))
    elif hat == 'hood':
        P.append(Sphere(head_c + [0, 0.45 * s, -0.7 * s], hr * 1.2, g['helm'], cut=([0, 0, -1], -(head_c[2] + hr * 0.45))))
        P.append(Capsule(head_c + [0, -1.2 * s, -0.8 * s], head_c + [0, -3.2 * s, -1.6 * s], hr * 0.9, hr * 1.1, mat=g['helm'], blend=0.6))
        if g.get('hood_peak'):                   # a tall pointed cowl
            P.append(Capsule(head_c + [0, 1.6 * s, -0.9 * s], head_c + [0, 5.0 * s, -2.6 * s], hr * 0.75, 0.2 * s, mat=g['helm'], blend=0.5))
    elif hat == 'pointed':
        P.append(Disc(head_c + [0, 1.4 * s, 0], [0, 1, 0], 5.0 * s, 0.35 * s, g['helm']))
        P.append(Capsule(head_c + [0, 1.5 * s, 0], head_c + [0.6, 7.5 * s, -1.4], 3.0 * s, 0.25 * s, mat=g['helm']))
    elif hat == 'crown':
        P.append(Ellipsoid(head_c + [0, 1.7 * s, 0], np.array([hr * 0.95, 0.9 * s, hr * 0.95]), g['helm']))
        for k in range(5):
            a = k / 5 * 2 * math.pi
            P.append(Capsule(head_c + [math.sin(a) * hr * 0.85, 1.9 * s, math.cos(a) * hr * 0.85], head_c + [math.sin(a) * hr * 0.9, 3.2 * s, math.cos(a) * hr * 0.9], 0.45 * s, 0.1 * s, mat=g['helm']))
    if g.get('horns'):
        hl = g.get('horn_len', 1.0)
        for sgn in (1, -1):
            b = head_c + [hr * 0.6 * sgn, hr * 0.7, -0.3 * s]
            P.append(Capsule(b, b + np.array([1.4 * sgn, 2.6, -0.8]) * s * hl, 0.75 * s * hl, 0.15 * s, mat=g['horns']))
    if g.get('tusks'):
        for sgn in (1, -1):
            b = head_c + [1.0 * sgn * s, -1.7 * s, hr * 0.85]
            P.append(Capsule(b, b + [0.3 * sgn * s, 1.0 * s, 0.4 * s], 0.35 * s, 0.1 * s, mat='bone'))


def humanoid(g, pose):
    """g: gear/proportions dict. pose: dict(walk=phase radians or None, attack=0..1 or None, breath=0..1).

    Extra options: head_kind (see _head), two_heads, no_legs (upper body only, for
    serpent-bodied demons), extra_arms (pairs of additional arms), wing_style='bat'."""
    P = []
    s = g.get('scale', 1.0)
    walk = pose.get('walk')
    atk = pose.get('attack')
    breath = pose.get('breath', 0.0)
    swing = math.sin(walk) * 0.55 if walk is not None else 0.0
    lift = abs(math.cos(walk)) * 0.5 if walk is not None else breath * 0.35
    hip_y = 9.0 * s * g.get('leg_len', 1.0) + g.get('hip_lift', 0.0)
    bob = lift
    stocky = g.get('stocky', 1.0)
    if g.get('no_legs'):
        swing *= 0.4

    # legs (thigh + shin + foot), swinging about the hips
    for side, sgn in (('L', 1), ('R', -1)):
        if g.get('no_legs'):
            break
        a = swing * sgn
        hip = np.array([2.1 * sgn * stocky, hip_y + bob, 0.0])
        knee_bend = max(0.0, -math.sin(walk + (0 if sgn > 0 else math.pi))) * 0.6 if walk is not None else 0.05
        thigh = np.array([0, -1, 0]) @ rot_x(-a).T
        shin = np.array([0, -1, 0]) @ rot_x(-a + knee_bend).T
        segs, foot = limb(hip, thigh, shin, 4.3 * s * g.get('leg_len', 1.0), 4.0 * s * g.get('leg_len', 1.0), 1.75 * s * stocky * g.get('thin', 1.0), 1.45 * s * stocky * g.get('thin', 1.0), 1.25 * s * stocky * g.get('thin', 1.0), g['legs'])
        P += segs
        P.append(Ellipsoid(foot + np.array([0, 0.1, 0.9]), np.array([1.35, 0.85, 2.0]) * s * stocky, g['boots']))
        P.append(Capsule(foot + np.array([0, 0.3, 0]), foot + np.array([0, 2.6 * s, 0.1 + a * 0.5]), 1.5 * s * stocky, 1.45 * s * stocky, mat=g['boots'], blend=0.4))

    # pelvis, torso, belt
    P.append(Ellipsoid([0, hip_y + 0.6 + bob, 0], np.array([3.5 * stocky, 2.2, 2.5]) * s, g['legs'], blend=0.8))
    hunch = g.get('hunch', 0)
    chest_y = hip_y + 4.4 * s * g.get('torso_len', 1.0) + bob + breath * 0.25 - hunch * s
    P.append(Ellipsoid([0, chest_y, 0.1 + hunch * 0.6 * s], np.array([4.1 * stocky * g.get('belly', 1.0), 3.9, 2.8 * g.get('belly', 1.0)]) * s, g['torso'], blend=1.2))
    if g.get('skirt'):
        P.append(Ellipsoid([0, hip_y + 0.2 + bob, 0.1], np.array([3.9 * stocky, 2.3, 2.9]) * s, g['skirt'], blend=0.5,
                           cut=([0, -1, 0], -(hip_y + 2.0 + bob))))
    if not g.get('no_belt'):
        P.append(Ellipsoid([0, hip_y + 1.9 + bob, 0.1], np.array([3.75 * stocky, 0.75, 2.75]) * s, g.get('belt', g['boots'])))
    if g.get('buckle'):
        P.append(Sphere([0, hip_y + 1.9 + bob, 2.65 * s], 0.65 * s, g['buckle']))
    if g.get('fur_ruff'):                        # shaggy shoulders for bugbears and the like
        P.append(Ellipsoid([0, chest_y + 2.0 * s, -0.4 * s + hunch * 0.8 * s], np.array([4.6 * stocky, 2.4, 3.2]) * s, g['fur_ruff'], blend=1.0))

    # cape hangs behind and sways with the walk
    if g.get('cape'):
        sway = swing * 0.35
        top = np.array([0, chest_y + 2.6 * s, -1.9 * s])
        P.append(Box(top + np.array([0, -5.6 * s, -0.9 * s + sway * -2]), np.array([4.0, 6.0, 0.45]) * s, g['cape'],
                     R=rot_x(0.16 + sway * 0.4), round_=0.4 * s))
        P.append(Capsule(top + [-3.6 * s, 0, 0.6], top + [3.6 * s, 0, 0.6], 1.0 * s, mat=g['cape'], blend=0.5))

    # arms: right arm (screen-left when facing south) holds the weapon
    shoulder_y = chest_y + 2.5 * s
    arm_sw = -swing * 0.8
    for sgn in (1, -1):
        sh = np.array([4.7 * sgn * stocky, shoulder_y, 0.0])
        if sgn == -1 and atk is not None:       # attack: wind up high and to the side, then cut across
            k = atk
            if k < 0.45:
                up = np.array([-0.7, 0.6, -0.2]); lo = np.array([-0.4, 0.9, 0.3])
            elif k < 0.75:
                up = np.array([-0.2, -0.1, 1.0]); lo = np.array([0.3, -0.1, 1.0])
            else:
                up = np.array([0.4, -0.7, 0.6]); lo = np.array([0.9, -0.5, 0.6])
        else:
            a = arm_sw * sgn
            up = np.array([0.12 * sgn, -1, 0]) @ rot_x(-a).T
            lo = np.array([0.05 * sgn, -1, 0.55]) @ rot_x(-a * 1.2).T
        segs, hand = limb(sh, up, lo, 3.6 * s * g.get('arm_len', 1.0), 3.3 * s * g.get('arm_len', 1.0), 1.35 * s * stocky * g.get('thin', 1.0), 1.2 * s * g.get('thin', 1.0), 1.1 * s * g.get('thin', 1.0), g['arms'])
        P += segs
        P.append(Sphere(hand, 1.2 * s, g.get('hands', g['skin'])))
        if g.get('claws'):
            for k in (-1, 0, 1):
                P.append(Capsule(hand + [k * 0.5 * s, -0.4 * s, 0.6 * s], hand + [k * 0.6 * s, -1.6 * s, 1.3 * s], 0.3 * s, 0.08 * s, mat=g['claws']))
        if g.get('pauldrons'):
            P.append(Ellipsoid(sh + [0.3 * sgn * s, 0.5 * s, 0], np.array([1.7, 1.3, 1.7]) * s, g['pauldrons']))
        if sgn == -1:
            weapon_hand, weapon_up, weapon_lo = hand, up, lo
        else:
            shield_hand, shield_lo = hand, lo
    # extra arm pairs (mariliths): fanned out below and behind the first pair, each with a blade
    for k in range(g.get('extra_arms', 0)):
        for sgn in (1, -1):
            ph = (walk or 0) + breath * 2 + k * 1.3 + (0 if sgn > 0 else 1.0)
            if atk is not None:
                ph += atk * 4
            sh = np.array([4.0 * sgn * stocky * s / 1.5, shoulder_y - (1.6 + k * 1.5) * s, -0.6 * s - k * 0.4 * s])
            up = np.array([1.0 * sgn, 0.25 - k * 0.45 + 0.3 * math.sin(ph), 0.35 + 0.2 * math.cos(ph)])
            lo = np.array([0.6 * sgn, 0.6 - k * 0.3, 0.8])
            segs, hand = limb(sh, up, lo, 3.2 * s, 3.0 * s, 1.1 * s, 1.0 * s, 0.9 * s, g['arms'])
            P += segs
            P.append(Sphere(hand, 1.0 * s, g.get('hands', g['skin'])))
            bd = np.array([0.3 * sgn, 1.0, 0.5]); bd /= np.linalg.norm(bd)
            P.append(Capsule(hand + bd * 0.8 * s, hand + bd * 6.5 * s, 0.5 * s, 0.15 * s, mat=g.get('blade', 'steel')))

    # head(s)
    hr = 3.6 * s * g.get('head', 1.0)
    hfwd = g.get('head_fwd', 1.4)
    head_c = np.array([0, chest_y + 6.9 * s - hunch * 0.8 * s, 0.35 + hunch * hfwd * s])
    if g.get('head_kind') == 'flayer':
        g = dict(g, _sway=math.sin(breath * math.pi * 2 + (walk or 0) * 2) * 0.5 + (math.sin(atk * math.pi) * 1.2 if atk is not None else 0))
    heads = [head_c]
    if g.get('two_heads'):
        heads = [head_c + [3.3 * s, -0.4 * s, 0], head_c + [-3.3 * s, -0.4 * s, 0]]
    for hc in heads:
        P.append(Capsule(hc - [0, 3.2 * s, 0.2], hc - [0, 1.5 * s, 0], 1.3 * s * g.get('neck_r', 1.0), mat=g.get('neck_mat', g['skin']), blend=0.5))
        _head(P, g, s, hc, hr)

    # shield on the off arm, facing outward
    sh_kind = g.get('shield')
    if sh_kind:
        c = shield_hand + np.array([1.4 * s, 0.6 * s, 0.4 * s])
        if sh_kind == 'round':
            P.append(Disc(c, [1, 0, 0.35], 3.6 * s, 0.45 * s, g['shield_rim']))
            P.append(Disc(c + [0.25, 0, 0.08], [1, 0, 0.35], 2.9 * s, 0.45 * s, g['shield_face']))
            P.append(Sphere(c + [0.9 * s, 0, 0.3], 0.85 * s, g['shield_rim']))
        else:
            P.append(Box(c + [0, -0.6, 0], np.array([0.45, 3.6, 2.6]) * s, g['shield_face'], R=rot_y(0.33), round_=0.4))

    # weapon in the main hand
    w = g.get('weapon')
    if w:
        d = (weapon_lo / np.linalg.norm(weapon_lo))
        grip = weapon_hand
        if atk is None:
            blade_dir = np.array([0.05, 0.85, 0.6])
        elif atk < 0.45:
            blade_dir = np.array([-0.3, 1.0, -0.4])
        elif atk < 0.75:
            blade_dir = np.array([0.9, 0.15, 0.9])
        else:
            blade_dir = np.array([1.0, -0.35, 0.2])
        blade_dir = blade_dir / np.linalg.norm(blade_dir)
        if w in ('sword', 'longsword'):
            L = 9.5 * s if w == 'longsword' else 8.0 * s
            P.append(Capsule(grip - blade_dir * 1.6 * s, grip + blade_dir * 0.6 * s, 0.45 * s, mat=g.get('grip', 'leather')))
            guard = np.cross(blade_dir, [0, 0, 1.0]); guard = guard / max(np.linalg.norm(guard), 1e-3) if np.linalg.norm(guard) > 1e-3 else np.array([1.0, 0, 0])
            P.append(Capsule(grip + blade_dir * 0.7 * s - guard * 1.6 * s, grip + blade_dir * 0.7 * s + guard * 1.6 * s, 0.42 * s, mat=g.get('guard', 'gold')))
            P.append(Capsule(grip + blade_dir * 1.0 * s, grip + blade_dir * L, 0.62 * s, 0.22 * s, mat=g.get('blade', 'steel')))
        elif w == 'spear':
            P.append(Capsule(grip - blade_dir * 5 * s, grip + blade_dir * 8 * s, 0.4 * s, mat='wood'))
            P.append(Capsule(grip + blade_dir * 8 * s, grip + blade_dir * 11 * s, 0.75 * s, 0.1 * s, mat='steel'))
        elif w == 'staff':
            P.append(Capsule(grip - blade_dir * 6 * s, grip + blade_dir * 8 * s, 0.5 * s, mat='wood'))
            P.append(Sphere(grip + blade_dir * 8.5 * s, 1.1 * s, g.get('orb', 'gem')))
        elif w == 'axe':
            P.append(Capsule(grip - blade_dir * 1.5 * s, grip + blade_dir * 7 * s, 0.45 * s, mat='wood'))
            side = np.cross(blade_dir, [0, 0, 1.0]); side = side / (np.linalg.norm(side) + 1e-6)
            P.append(Ellipsoid(grip + blade_dir * 6 * s + side * 1.4 * s, np.array([1.6, 1.9, 0.35]) * s, 'steel'))
        elif w == 'dagger':
            P.append(Capsule(grip + blade_dir * 0.6 * s, grip + blade_dir * 4.5 * s, 0.5 * s, 0.15 * s, mat='steel'))
        elif w == 'bow':
            P.append(Capsule(grip + [0, 4.5 * s, 0.6], grip + [0, -4.5 * s, 0.6], 0.35 * s, mat='wood'))
        elif w == 'pick':
            P.append(Capsule(grip - blade_dir * 1.5 * s, grip + blade_dir * 6 * s, 0.4 * s, mat='wood'))
            side = np.cross(blade_dir, [0, 0, 1.0]); side = side / (np.linalg.norm(side) + 1e-6)
            P.append(Capsule(grip + blade_dir * 6 * s - side * 2.6 * s, grip + blade_dir * 6 * s + side * 2.6 * s, 0.5 * s, 0.2 * s, mat='steel'))
    # robes reach the ground; wings, tails and horns for demons, angels and imps
    if g.get('robe') and not g.get('no_legs'):
        P.append(Capsule([0, hip_y + 3.0 * s + bob, 0], [0, 1.2 * s, 0.2], 3.4 * s * stocky, 4.6 * s * stocky, mat=g['robe'], blend=0.8))
    if g.get('wings') and g.get('wing_style') == 'bat':
        flap = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.3 + (math.sin(atk * math.pi) * 0.3 if atk is not None else 0)
        for sgn in (1, -1):
            root = np.array([1.6 * sgn * s, chest_y + 1.8 * s, -1.6 * s + hunch * 0.5 * s])
            bat_wing(P, root, sgn, g.get('wing_span', 1.0) * s, flap, g['wings'], g.get('membrane', g['wings']), s, back_len=1.8, drop=3.4)
    elif g.get('wings'):
        flap = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.35
        for sgn in (1, -1):
            root = np.array([1.4 * sgn * s, chest_y + 1.5 * s, -2.0 * s])
            tip = root + np.array([7.5 * sgn * s, (3.5 + flap * 4) * s, -2.5 * s])
            P.append(Capsule(root, tip, 0.8 * s, 0.3 * s, mat=g['wings']))
            P.append(Ellipsoid((root + tip) / 2 + np.array([0, -2.2 * s, -0.3 * s]), np.array([3.9, 3.0, 0.35]) * s, g.get('membrane', g['wings']),
                               R=rot_z(-0.5 * sgn - flap * sgn)))
    if g.get('tail'):
        tw = math.sin((walk or 0) * 2 + breath * 3) * 1.2
        P.append(Capsule([0, hip_y + bob, -2.0 * s], [tw * s, hip_y - 2.5 * s, -6.5 * s], 0.9 * s, 0.4 * s, mat=g['tail']))
        P.append(Sphere([tw * 1.2 * s, hip_y - 3.2 * s, -7.2 * s], 0.7 * s, g['tail']))
    return P


def _centaur_torso(P, g, s, body_c, L, pose):
    """A human upper body rising from the front of a horse body."""
    walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    hs = s * 0.92                                   # human parts are a touch smaller than the horse
    waist = body_c + np.array([0, 1.6 * s, 4.2 * L * s])
    chest = waist + np.array([0, 4.2 * hs + breath * 0.25, 0.5 * hs])
    P.append(Capsule(waist - [0, 0.8 * s, 0.8 * s], chest - [0, 1.0 * hs, 0], 2.9 * hs, 3.0 * hs, mat=g.get('torso', 'skin'), blend=1.0))
    P.append(Ellipsoid(chest, np.array([3.6, 3.2, 2.4]) * hs, g.get('torso', 'skin'), blend=1.0))
    if g.get('belt'):
        P.append(Ellipsoid(waist + [0, 0.3 * s, 0.2 * s], np.array([3.2, 0.7, 2.6]) * hs, g['belt']))
    sh_y = chest[1] + 2.0 * hs
    for sgn in (1, -1):
        sh = np.array([3.9 * sgn * hs, sh_y, chest[2]])
        if sgn == -1 and atk is not None:       # thrust the spear
            up = np.array([-0.3, 0.2 + 0.4 * (1 - atk), 0.6 + atk]); lo = np.array([0.0, 0.1, 1.0])
        else:
            sw = math.sin(walk or 0) * 0.4 * sgn
            up = np.array([0.25 * sgn, -1, 0.15 + sw]); lo = np.array([0.0, -0.4, 1.0])
        segs, hand = limb(sh, up, lo, 3.3 * hs, 3.0 * hs, 1.25 * hs, 1.1 * hs, 1.0 * hs, g.get('arms', 'skin'))
        P += segs
        P.append(Sphere(hand, 1.1 * hs, 'skin'))
        if sgn == -1:
            whand = hand
    # spear held upright, tipped forward when attacking
    sd = np.array([0.1, 1.0, 0.35]) if atk is None else np.array([0.05, 0.25 - atk * 0.2, 1.0])
    sd = sd / np.linalg.norm(sd)
    P.append(Capsule(whand - sd * 6 * hs, whand + sd * 8 * hs, 0.4 * hs, mat='wood'))
    P.append(Capsule(whand + sd * 8 * hs, whand + sd * 10.8 * hs, 0.75 * hs, 0.1 * hs, mat='steel'))
    hc = chest + np.array([0, 5.6 * hs, 0.5 * hs])
    P.append(Capsule(hc - [0, 3.2 * hs, 0.2], hc - [0, 1.5 * hs, 0], 1.2 * hs, mat='skin', blend=0.5))
    hr = 3.2 * hs
    P.append(Sphere(hc, hr, 'skin', blend=0.4))
    for sgn in (1, -1):
        P.append(Ellipsoid(hc + [1.15 * sgn * hs, -0.1 * hs, hr * 0.9], np.array([0.6, 0.85, 0.5]) * hs, 'eye'))
    P.append(Sphere(hc + [0, 0.35 * hs, -0.5 * hs], hr * 1.06, g.get('hair', 'hair'), blend=0.25,
                    cut=([0, 0.55, -1], -(0.55 * hc[1] - hc[2]) - 0.15 * hr)))
    P.append(Capsule(hc + [0, -0.5 * hs, -2.4 * hs], hc + [0, -4.5 * hs, -3.0 * hs], 1.6 * hs, 1.0 * hs, mat=g.get('hair', 'hair')))   # pony-tail
    if g.get('beard'):
        P.append(Ellipsoid(hc + [0, -2.0 * hs, 1.5 * hs], np.array([2.1, 2.4, 1.3]) * hs, g['beard'], blend=0.6))


def centaur(g, pose):
    """Horse body with a human torso, arms, head and spear in place of the horse's neck."""
    return quadruped(dict(g, centaur=True), pose)


def quadruped(g, pose):
    """Dogs, cats, horses and the like. g: colours and proportions."""
    P = []
    s = g.get('scale', 1.0)
    L = g.get('length', 1.0)
    walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    leg_h = g.get('leg', 4.2) * s
    body_y = leg_h + 2.0 * s + (abs(math.cos(walk)) * 0.5 if walk is not None else breath * 0.3)
    lunge = (math.sin(atk * math.pi) * 2.5 * s) if atk is not None else 0.0
    body_c = np.array([0, body_y, lunge * 0.4])
    P.append(Ellipsoid(body_c, np.array([2.5 * g.get('girth', 1.0), 2.4 * g.get('girth', 1.0), 5.0 * L]) * s, g['body'], blend=1.2))
    if g.get('belly'):
        P.append(Ellipsoid(body_c + [0, -1.1 * s, 0.3], np.array([2.0, 1.5, 4.0 * L]) * s, g['belly'], blend=0.8))
    # legs at four corners, diagonal pairs move together
    lr = g.get('leg_r', 1.0)
    sprawl = g.get('sprawl', 0.0)          # lizards: elbows out to the sides
    for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        ph = 0 if (sx * sz) > 0 else math.pi
        a = math.sin(walk + ph) * 0.6 if walk is not None else 0.0
        hip = body_c + [1.5 * sx * s * g.get('hip_w', 1.0), -0.8 * s, 3.3 * sz * L * s]
        foot_dir = np.array([0, -1, 0]) @ rot_x(-a).T
        if sprawl:
            segs, foot = limb(hip, np.array([sprawl * sx, -0.35, 0]) @ rot_y(a * sx * 0.8).T, [0.15 * sx, -1, 0.1 * sz], leg_h * 0.6, leg_h * 0.75, 1.0 * s * lr, 0.8 * s * lr, 0.7 * s * lr, g['legs'], blend=0.5)
        else:
            segs, foot = limb(hip, foot_dir, foot_dir + [0, 0, -0.15 * sz], leg_h * 0.55, leg_h * 0.55, 1.1 * s * lr, 0.8 * s * lr, 0.75 * s * lr, g['legs'], blend=0.5)
        P += segs
        if g.get('hooves'):
            P.append(Capsule(foot + [0, 0.1, 0], foot + [0, 0.9 * s, 0], 0.95 * s * lr, 0.85 * s * lr, mat=g['hooves']))
        else:
            P.append(Ellipsoid(foot + [0, 0.2, 0.4], np.array([0.85, 0.55, 1.1]) * s * lr, g.get('paws', g['legs'])))
    if g.get('centaur'):
        _centaur_torso(P, g, s, body_c, L, pose)
    else:
        head_up = g.get('head_up', 3.2) * s
        head_c = body_c + np.array([0, head_up, 5.0 * L * s + (1.4 + g.get('neck', 0.0)) * s + lunge])
        neck_r = g.get('neck_r', 1.0)
        P.append(Capsule(body_c + [0, 1.0 * s, 3.8 * L * s], head_c - [0, 0.6 * s, 0.8 * s], 1.9 * s * neck_r, 1.5 * s * neck_r, mat=g['body'], blend=1.0))
        if g.get('mane'):
            n0 = body_c + [0, 2.2 * s, 3.4 * L * s]; n1 = head_c + [0, 1.6 * s, -1.0 * s]
            for k in range(5):
                t = k / 4
                P.append(Sphere(n0 + (n1 - n0) * t + [0, 0.3 * s, -0.5 * s], (1.0 - 0.15 * t) * s * neck_r, g['mane'], blend=0.4))
        if g.get('hump'):
            P.append(Ellipsoid(body_c + [0, 2.0 * s, 2.4 * L * s], np.array([2.5 * g.get('girth', 1.0), 2.0, 2.6]) * s, g.get('hump_mat', g['body']), blend=1.2))
        hr = g.get('head', 2.4) * s
        P.append(Sphere(head_c, hr, g.get('head_mat', g['body']), blend=0.6))
        snout = g.get('snout', 2.4) * s
        drop = g.get('snout_drop', 0.0) * s
        sn_end = head_c + [0, -0.9 * s - drop, 1.2 * s + snout]
        P.append(Capsule(head_c + [0, -0.5 * s, 1.2 * s], sn_end, 1.3 * s * g.get('snout_r', 1.0), 0.85 * s * g.get('snout_r', 1.0), mat=g.get('muzzle', g['body']), blend=0.5))
        P.append(Sphere(sn_end + [0, 0.4 * s, 0.5 * s], 0.65 * s, g.get('nose', 'nose')))
        if atk is not None and atk > 0.3:
            P.append(Capsule(head_c + [0, -1.6 * s, 1.5 * s], sn_end + [0, -0.9 * s, -0.2 * s], 0.5 * s, mat='mouth'))
        for sgn in (1, -1):
            P.append(Sphere(head_c + [1.15 * sgn * s, 0.5 * s, hr * 0.78], 0.5 * s, g.get('eyes', 'eye')))
            ear = g.get('ears', 'pointed')
            if g.get('horns') == 'ox':           # musk-ox / bull: out, down, then up
                b = head_c + [1.3 * sgn * s, 1.3 * s, -0.4 * s]
                m1 = b + [2.0 * sgn * s, -0.6 * s, 0.2 * s]
                P.append(Capsule(b, m1, 0.9 * s, 0.7 * s, mat=g.get('horn_mat', 'bone')))
                P.append(Capsule(m1, m1 + [0.9 * sgn * s, 1.6 * s, 0.6 * s], 0.7 * s, 0.2 * s, mat=g.get('horn_mat', 'bone')))
            elif g.get('horns') == 'swept':      # dragons: long horns raked back
                b = head_c + [1.0 * sgn * s, 1.4 * s, -0.6 * s]
                P.append(Capsule(b, b + [0.9 * sgn * s, 1.6 * s, -3.4 * s], 0.65 * s, 0.12 * s, mat=g.get('horn_mat', 'bone')))
            if ear == 'horn':
                P.append(Capsule(head_c + [1.2 * sgn * s, 1.2 * s, -0.6 * s], head_c + [1.8 * sgn * s, 3.6 * s, -2.6 * s], 0.7 * s, 0.15 * s, mat='horn_dark'))
            if ear == 'pointed':
                P.append(Capsule(head_c + [1.3 * sgn * s, 1.4 * s, -0.3], head_c + [1.9 * sgn * s, 3.9 * s, -0.6], 0.95 * s, 0.15 * s, mat=g['body']))
            elif ear == 'round':
                P.append(Sphere(head_c + [1.7 * sgn * s, 1.9 * s, -0.4], 0.95 * s, g['body']))
        if g.get('horn'):
            P.append(Capsule(head_c + [0, 1.6 * s, 0.8 * s], head_c + [0, 4.6 * s, 2.4 * s], 0.55 * s, 0.1 * s, mat='gold'))
        if g.get('antennae'):
            for sgn in (1, -1):
                P.append(Capsule(head_c + [0.8 * sgn * s, 1.6 * s, 0.6 * s], head_c + [2.0 * sgn * s, 4.4 * s, 2.0 * s], 0.25 * s, 0.15 * s, mat=g['legs']))
    if g.get('wings') and g.get('wing_span', 1.0) > 1.0:
        # big bat-like wings held open
        flap = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.25 + (math.sin(atk * math.pi) * 0.4 if atk is not None else 0)
        for sgn in (1, -1):
            root = body_c + np.array([1.4 * sgn * s, 1.9 * s, 1.4 * s])
            bat_wing(P, root, sgn, g['wing_span'] * s, flap, g['wings'], g.get('membrane', g['wings']), s)
    elif g.get('wings'):
        flap = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.3
        for sgn in (1, -1):
            root = body_c + np.array([1.6 * sgn * s, 1.8 * s, 1.0 * s])
            tip = root + np.array([6.5 * sgn * s, (4.5 + flap * 4) * s, -3.0 * s])
            P.append(Capsule(root, tip, 0.7 * s, 0.25 * s, mat=g['wings']))
            P.append(Ellipsoid((root + tip) / 2 + np.array([0, -1.8 * s, 0]), np.array([3.6, 2.6, 0.3]) * s, g['wings'], R=rot_z(-0.6 * sgn - flap * sgn)))
    # tail
    tw = math.sin((walk or 0) * 2) * 0.6 if walk is not None else math.sin(breath * math.pi * 2) * 0.3
    tb = body_c + [0, 0.8 * s, -4.8 * L * s]
    tl = g.get('tail', 4.5) * s
    if g.get('tail_hang'):                   # horses: a full tail that falls from the rump
        P.append(Capsule(tb + [0, 0.6 * s, 0.3 * s], tb + [tw * 1.5, -tl * 0.45, -1.6 * s], 1.0 * s, 1.3 * s, mat=g.get('tail_mat', g['body']), blend=0.4))
        P.append(Capsule(tb + [tw * 1.5, -tl * 0.45, -1.6 * s], tb + [tw * 2.5, -tl * 0.95, -1.4 * s], 1.3 * s, 0.6 * s, mat=g.get('tail_tip', g.get('tail_mat', g['body']))))
        return P
    if g.get('tail_drag'):                   # lizards and crocodiles: thick tail lying along the ground
        tb2 = tb + [tw * 1.5, -(body_y - 1.4 * s) * 0.6, -tl * 0.5]
        P.append(Capsule(tb - [0, 0.4 * s, 0], tb2, 1.7 * s * g.get('girth', 1.0), 1.0 * s, mat=g.get('tail_mat', g['body']), blend=0.8))
        P.append(Capsule(tb2, tb2 + [tw * 3.0, -0.3 * s, -tl * 0.6], 1.0 * s, 0.25 * s, mat=g.get('tail_tip', g.get('tail_mat', g['body'])), blend=0.3))
        return P
    P.append(Capsule(tb, tb + [tw * 2.0, 1.4 * s, -tl * 0.6], 1.0 * s, 0.75 * s, mat=g.get('tail_mat', g['body']), blend=0.5))
    P.append(Capsule(tb + [tw * 2.0, 1.4 * s, -tl * 0.6], tb + [tw * 3.2, 1.2 * s, -tl], 0.75 * s, 0.35 * s, mat=g.get('tail_tip', g.get('tail_mat', g['body']))))
    return P


def floating_eye(g, pose):
    blink = pose.get('blink', 0.0)
    hover = pose.get('breath', 0.0) * 1.2
    c = np.array([0, 9.0 + hover, 0])
    P = [Sphere(c, 5.4, g['body'])]
    P.append(Sphere(c + [0, 0, 1.4], 4.4, g['sclera'], cut=([0, 0, 1], 3.0)))
    if blink < 0.5:
        P.append(Disc(c + [0, 0.2, 5.0], [0, 0, 1], 2.5, 0.5, g['iris']))
        P.append(Disc(c + [0, 0.2, 5.4], [0, 0, 1], 1.15, 0.4, 'pupil'))
        P.append(Sphere(c + [-0.9, 1.2, 5.6], 0.45, 'glint'))
    else:
        P.append(Ellipsoid(c + [0, 0.2, 4.6], np.array([3.6, 0.6, 0.6]), g['body']))
    for a in (0.6, 2.2, 3.9, 5.1):
        P.append(Capsule(c + [math.cos(a) * 4.2, math.sin(a) * 4.2 - 0.5, 2.6], c + [math.cos(a) * 2.4, math.sin(a) * 2.4, 4.6], 0.18, mat='vein'))
    if g.get('flames'):                              # flaming sphere: a crown of licking flames around the rim
        ph = pose.get('breath', 0.0) * math.pi * 2 + (pose.get('walk') or 0) * 2 + (pose.get('attack') or 0) * 4
        for k in range(10):
            a = k / 10 * 2 * math.pi
            h = 2.6 + 1.2 * math.sin(ph + k * 1.7)
            b = c + [math.cos(a) * 4.8, math.sin(a) * 4.8 + 0.6, -0.6]
            tip = b + [math.cos(a) * 1.2, h + max(0, math.sin(a)) * 1.5, -0.4]
            P.append(Capsule(b, tip, 1.3, 0.2, mat=g['flames'] if k % 2 else g.get('flames2', g['flames']), blend=0.5))
    return P


def insect(g, pose):
    """Ants, bees, spiders, beetles: segmented body on many thin legs."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    y = 3.2 * s + (abs(math.cos(walk)) * 0.3 if walk is not None else breath * 0.2)
    lunge = math.sin(atk * math.pi) * 2.0 * s if atk is not None else 0.0
    spider = g.get('spider')
    P.append(Ellipsoid([0, y + 0.6 * s, -3.6 * s], np.array([2.9, 2.4, 3.6]) * s * (1.25 if spider else 1), g['body'], blend=0.4))   # abdomen
    if not spider:
        P.append(Ellipsoid([0, y, 0.2 * s], np.array([1.6, 1.4, 2.0]) * s, g['body'], blend=0.4))                               # thorax
    P.append(Sphere([0, y + 0.2 * s, 2.6 * s + lunge], 1.9 * s, g.get('head_mat', g['body']), blend=0.4))
    for sgn in (1, -1):
        P.append(Sphere([0.9 * sgn * s, y + 0.8 * s, 4.1 * s + lunge], 0.55 * s, 'eye_glow' if spider else 'eye'))
        if not spider:
            P.append(Capsule([0.6 * sgn * s, y + 1.4 * s, 3.4 * s + lunge], [1.8 * sgn * s, y + 3.8 * s, 5.0 * s + lunge], 0.22 * s, 0.12 * s, mat=g['legs']))
            P.append(Capsule([0.7 * sgn * s, y - 0.4 * s, 4.0 * s + lunge], [0.3 * sgn * s, y - 0.8 * s, 5.0 * s + lunge], 0.35 * s, 0.15 * s, mat=g['legs']))
    n_legs = 4 if spider else 3
    for i in range(n_legs):
        z = (1.2 - i * 1.2) * s if not spider else (1.5 - i * 1.3) * s
        for sgn in (1, -1):
            ph = (i + (0 if sgn > 0 else 1)) % 2 * math.pi
            a = math.sin((walk or 0) + ph) * 0.5 if walk is not None else 0
            knee = np.array([3.3 * sgn * s, y + 2.0 * s, z + a * 1.5 * s])
            foot = np.array([4.8 * sgn * s, 0.3 * s, z + a * 2.5 * s - 0.6 * s])
            P.append(Capsule([0.8 * sgn * s, y, z], knee, 0.4 * s, 0.3 * s, mat=g['legs']))
            P.append(Capsule(knee, foot, 0.3 * s, 0.15 * s, mat=g['legs']))
    if g.get('wings'):
        flap = math.sin(breath * math.pi * 8 + (walk or 0) * 4) * 0.4
        for sgn in (1, -1):
            P.append(Ellipsoid([2.2 * sgn * s, y + 2.4 * s, -1.0 * s], np.array([2.6, 0.25, 3.4]) * s, 'wing_glass', R=rot_z(0.5 * sgn + flap * sgn)))
    if g.get('stripes'):
        for k in range(3):
            P.append(Ellipsoid([0, y + 0.6 * s, (-2.6 - k * 1.4) * s], np.array([3.0, 2.5, 0.35]) * s, g['stripes']))
    return P


def blob(g, pose):
    """Blobs, jellies, puddings, molds, lichens: a soft wobbling mass."""
    s = g.get('scale', 1.0); breath = pose.get('breath', 0.0); walk = pose.get('walk'); atk = pose.get('attack')
    squash = math.sin((walk or 0) * 2) * 0.15 if walk is not None else math.sin(breath * math.pi * 2) * 0.06
    if atk is not None:
        squash = -math.sin(atk * math.pi) * 0.25
    rx, ry = 5.2 * s * (1 + squash), 4.0 * s * (1 - squash)
    P = [Ellipsoid([0, ry * 0.9, 0], np.array([rx, ry, rx * 0.9]), g['body'], blend=0.8)]
    if g.get('piercer'):                          # a rocky cone, point up, eyes peering from the base
        h = 11.0 * s * (1 - squash * 0.5)
        P = [Capsule([0, 2.0 * s, 0], [0, h, 0], 4.0 * s * (1 + squash * 0.5), 0.3 * s, mat=g['body'], blend=0.5),
             Ellipsoid([0, 1.8 * s, 0], np.array([4.3, 1.9, 4.3]) * s * (1 + squash * 0.4), g['body'], blend=1.0)]
        for k, yy in enumerate((0.3, 0.55)):
            P.append(Torus([0, 2.0 * s + (h - 2.0 * s) * yy, 0], 4.0 * s * (1 - yy * 0.93) * 0.98, 0.32 * s, g.get('ridge', g['body'])))
        for sgn in (1, -1):
            P.append(Sphere([1.3 * sgn * s, 3.2 * s, 3.1 * s], 0.6 * s, 'eye_glow'))
        if atk is not None and atk > 0.3:
            P.append(Capsule([-1.0 * s, 1.9 * s, 3.9 * s], [1.0 * s, 1.9 * s, 3.9 * s], 0.4 * s, mat='mouth'))
        return P
    if g.get('mushroom'):
        P = [Capsule([0, 0.5 * s, 0], [0, 5.5 * s, 0], 1.6 * s, 1.3 * s, mat=g.get('stalk', 'bone')),
             Ellipsoid([0, 6.2 * s, 0], np.array([4.6, 2.2, 4.6]) * s, g['body'], cut=([0, 1, 0], 5.0 * s))]
        for k in range(5):
            a = k * 1.3
            P.append(Sphere([math.cos(a) * 2.6 * s, 7.3 * s, math.sin(a) * 2.6 * s], 0.55 * s, g.get('spots', 'bone')))
        return P
    for k in range(3):
        a = k * 2.1 + breath * 2
        P.append(Sphere([math.cos(a) * rx * 0.7, ry * 1.4, math.sin(a) * rx * 0.5], 1.4 * s, g['body'], blend=1.2))
    if g.get('eye_ring'):                         # Juiblex: many glowing eyes scattered over the mass
        for k in range(g['eye_ring']):
            a = k * 2.399 + 0.4
            h = 0.55 + 0.6 * ((k * 0.618) % 1)
            P.append(Sphere([math.sin(a) * rx * 0.62, ry * h * 1.25, math.cos(a) * rx * 0.62 + 0.6 * s], 0.55 * s, 'eye_glow'))
        for k in range(5):                           # drips and pseudopods
            a = k * 1.3 + breath * 0.8
            P.append(Capsule([math.cos(a) * rx * 0.9, ry * 0.5, math.sin(a) * rx * 0.85], [math.cos(a) * rx * 1.15, 0.3 * s, math.sin(a) * rx * 1.1],
                             1.0 * s, 0.6 * s, mat=g['body'], blend=1.0))
    elif g.get('eyes', True):
        for sgn in (1, -1):
            P.append(Sphere([1.6 * sgn * s, ry * 1.25, rx * 0.72], 0.6 * s, 'eye'))
    if g.get('core'):
        P.append(Sphere([0, ry * 0.8, 0.5 * s], 1.6 * s, g['core']))
    return P


def serpent(g, pose):
    """Snakes, worms, eels and nagas: a body of beads following a sine curve."""
    s = g.get('scale', 1.0); walk = pose.get('walk') or 0.0; atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    n = 9
    rise = math.sin(atk * math.pi) * 3 * s if atk is not None else 0.0
    for i in range(n):
        t = i / (n - 1)
        z = (4.0 - t * 10.0) * s
        x = math.sin(t * 5.0 + walk * 2 + breath * 2) * 2.2 * s * t
        r = (1.6 - t * 0.9) * s * g.get('girth', 1.0)
        y = r + (rise * (1 - t) ** 2 if i < 3 else 0)
        P.append(Sphere([x, y, z], r, g['body'] if i % 2 == 0 or not g.get('bands') else g['bands'], blend=1.0))
    head = np.array([0, 1.8 * s + rise + (g.get('rear', 0) * s), 5.2 * s])
    if g.get('naga'):
        head = head + [0, 6.0 * s, -1.0 * s]
        P.append(Capsule([0, 2.0 * s, 4.0 * s], head - [0, 2.6 * s, 0], 2.0 * s, 1.6 * s, mat=g.get('torso', g['body']), blend=1.0))
        P.append(Sphere(head, 2.6 * s, g.get('face', 'skin'), blend=0.4))
    elif g.get('hood'):                          # cobra: rears up and spreads a hood behind the head
        head = head + [0, 4.5 * s, -1.6 * s]
        P.append(Capsule([0, 1.6 * s, 3.4 * s], head - [0, 1.2 * s, 0.6 * s], 1.4 * s, 1.1 * s, mat=g['body'], blend=0.8))
        P.append(Ellipsoid(head + [0, -1.8 * s, -0.9 * s], np.array([3.4, 3.4, 0.6]) * s, g.get('hood_mat', g['body']), R=rot_x(-0.35), blend=0.6))
        P.append(Ellipsoid(head + [0, -1.9 * s, -0.3 * s], np.array([1.5, 2.4, 0.4]) * s, g.get('belly', g['body']), R=rot_x(-0.35), blend=0.3))
        P.append(Ellipsoid(head, np.array([1.5, 1.2, 2.1]) * s, g['body'], blend=0.6))
    else:
        P.append(Ellipsoid(head, np.array([1.7, 1.3, 2.3]) * s * g.get('girth', 1.0), g['body'], blend=0.6))
    for sgn in (1, -1):
        P.append(Sphere(head + [0.9 * sgn * s, 0.6 * s, 1.4 * s], 0.45 * s, 'eye_glow' if g.get('glow') else 'eye'))
    if atk is not None and atk > 0.3 and not g.get('naga'):
        P.append(Capsule(head + [0, -0.2 * s, 2.2 * s], head + [0.3 * s, -0.4 * s, 3.8 * s], 0.15 * s, mat='mouth'))
    return P


def winged(g, pose):
    """Bats and birds: a small body slung between beating wings, hovering."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); breath = pose.get('breath', 0.0); atk = pose.get('attack')
    flap = math.sin(((walk or 0) * 2) + breath * math.pi * 4)
    y = 9.0 * s + flap * 0.8 * s
    lunge = math.sin(atk * math.pi) * 2.5 * s if atk is not None else 0.0
    P = [Ellipsoid([0, y, lunge], np.array([2.0, 2.2, 2.6]) * s, g['body'], blend=0.6),
         Sphere([0, y + 1.6 * s, 1.8 * s + lunge], 1.7 * s, g['body'], blend=0.5)]
    for sgn in (1, -1):
        root = np.array([1.2 * sgn * s, y + 0.6 * s, lunge])
        if g.get('open_wings', True):           # wings spread wide so they read from every side
            bat_wing(P, root, sgn, 0.95 * s, flap * 0.9 - 0.6, g['wings'], g.get('membrane', g['wings']), 0.75 * s, back_len=1.4, drop=2.6)
        else:
            tip = root + np.array([6.5 * sgn * s, flap * 3.5 * s, -1.0 * s])
            P.append(Capsule(root, tip, 0.5 * s, 0.25 * s, mat=g['wings']))
            P.append(Ellipsoid((root + tip) / 2 + np.array([0, -1.2 * s, 0]), np.array([3.4, 1.8, 0.3]) * s, g.get('membrane', g['wings']),
                               R=rot_z(-flap * 0.5 * sgn)))
        P.append(Sphere([0.7 * sgn * s, y + 2.0 * s, 3.2 * s + lunge], 0.42 * s, 'eye_glow' if g.get('glow') else 'eye'))
        if g.get('ears'):
            P.append(Capsule([0.9 * sgn * s, y + 2.8 * s, 1.5 * s + lunge], [1.3 * sgn * s, y + 4.6 * s, 1.2 * s + lunge], 0.5 * s, 0.1 * s, mat=g['body']))
    if g.get('beak'):
        P.append(Capsule([0, y + 1.4 * s, 3.2 * s + lunge], [0, y + 0.9 * s, 4.6 * s + lunge], 0.6 * s, 0.1 * s, mat=g['beak']))
    return P


def vortex(g, pose):
    """A twisting funnel: stacked rings widening upward, wound with a spiral band and flecks."""
    s = g.get('scale', 1.0); breath = pose.get('breath', 0.0); walk = pose.get('walk') or 0.0; atk = pose.get('attack')
    spin = breath * 6 + walk * 3 + (atk or 0) * 5
    P = []
    n = 8
    for i in range(n):
        t = i / (n - 1)
        a = t * 5 + spin
        r = (0.6 + t * t * 3.6 + t * 1.0) * s
        P.append(Torus([math.cos(a) * 0.9 * s * t, (1.0 + t * 12.0) * s, math.sin(a) * 0.9 * s * t], r, (0.65 + t * 0.55) * s,
                       g['body'] if i % 2 else g.get('body2', g['body']), blend=0.7))
    for k in range(22):                              # two spiral bands winding up the funnel
        t = (k % 11) / 10
        a = t * 3.2 * math.pi + spin * 1.5 + (math.pi if k >= 11 else 0)
        r = (1.0 + t * t * 3.8 + t * 1.0) * s + 0.5 * s
        P.append(Sphere([math.cos(a) * r, (0.8 + t * 12.0) * s, math.sin(a) * r], (0.5 + t * 0.4) * s, g.get('band', g.get('body2', g['body']))))
    for k in range(5):                               # flecks flung off the rim
        a = k * 1.256 + spin * 2
        P.append(Sphere([math.cos(a) * 6.4 * s, (9.0 + (k % 3) * 1.6) * s, math.sin(a) * 6.4 * s], 0.5 * s, g.get('fleck', g['body'])))
    return P


def naga(g, pose):
    """Nagas, mariliths, Geryon: a long snake body coiled on the ground that rises in
    front into a human head (g['face']) or a humanoid upper body (g['upper'] gear dict)."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    gi = g.get('girth', 1.0)
    ph = (walk or 0.0) * 0.5 + breath * 0.6
    cz = -2.6 * s
    # coil: a little over one and a half turns spiralling inward, tail tip on top
    n = 22
    for i in range(n):
        t = i / (n - 1)
        a = math.pi / 2 + t * 2 * math.pi * 1.55 + ph * (0.25 if walk is not None else 0.0)
        R = (4.6 - 3.2 * t) * s
        r = (2.0 - 1.45 * t) * s * gi
        y = r + 1.3 * s * gi * min(1.0, max(0.0, (t - 0.62) / 0.1))      # inner turn rides on the outer one
        P.append(Sphere([math.cos(a) * R * 1.05, y, cz + math.sin(a) * R], r, g['body'] if (i // 2) % 2 == 0 or not g.get('bands') else g['bands'], blend=0.9))
    # rising fore-body
    sway = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.8 * s
    lunge = math.sin(atk * math.pi) * 3.0 * s if atk is not None else 0.0
    rise = g.get('rise', 9.0) * s
    base = np.array([0, 2.0 * s * gi, cz + 4.6 * s])
    mid = base + np.array([sway * 0.5, rise * 0.45, 1.2 * s + lunge * 0.4])
    top = base + np.array([sway, rise, 0.4 * s + lunge])
    P.append(Capsule(base, mid, 2.0 * s * gi, 1.8 * s * gi, mat=g['body'], blend=1.0))
    P.append(Capsule(mid, top, 1.8 * s * gi, 1.5 * s * gi, mat=g['body'], blend=1.0))
    if g.get('belly'):
        for k in range(4):
            t = (k + 0.5) / 4
            p = base + (mid - base) * (t * 2) if t < 0.5 else mid + (top - mid) * (t * 2 - 1)
            P.append(Ellipsoid(p + [0, 0, 1.25 * s * gi], np.array([1.4, 1.0, 0.7]) * s * gi, g['belly']))
    if g.get('upper'):                             # demon torso on the snake
        u = dict(g['upper'])
        us = u.get('scale', 1.0)
        u.update(no_legs=True, leg_len=0.0, hip_lift=top[1] - 0.6 * us)
        up = humanoid(u, pose)
        sh = np.array([top[0], 0, top[2]])
        for p in up:                               # slide the upper body onto the end of the snake
            for attr in ('c', 'a', 'b'):
                if hasattr(p, attr):
                    setattr(p, attr, getattr(p, attr) + sh)
            if p.cut is not None:
                ax, off = p.cut
                p.cut = (ax, off + float(np.dot(np.asarray(ax, float), sh)))
        return P + up
    # human head framed by a crest/hood in the body colour
    hc = top + np.array([0, 2.9 * s, 0.9 * s])
    hr = 2.6 * s
    P.append(Ellipsoid(hc + [0, 0.5 * s, -1.9 * s], np.array([hr * 1.45, hr * 1.2, hr * 0.45]), g.get('crest', g['body']), blend=0.3))
    P.append(Sphere(hc, hr, g.get('face', 'skin'), blend=0.4))
    P.append(Sphere(hc + [0, 0.7 * s, -0.5 * s], hr * 1.02, g.get('hair', g.get('crest', g['body'])), blend=0.2,
                    cut=([0, 1, -0.9], (hc[1] + 0.9 * s) - 0.9 * hc[2])))
    for sgn in (1, -1):
        P.append(Sphere(hc + [0.95 * sgn * s, 0.1 * s, hr * 0.86], 0.5 * s, 'eye_glow' if g.get('glow') else 'eye'))
    P.append(Sphere(hc + [0, -0.7 * s, hr * 0.98], 0.32 * s, g.get('face', 'skin')))
    if atk is not None and atk > 0.3:
        P.append(Capsule(hc + [-0.5 * s, -1.2 * s, hr * 0.85], hc + [0.5 * s, -1.2 * s, hr * 0.85], 0.35 * s, mat='mouth'))
    return P


def _bar(P, top, R, half, mat, round_=0.5):
    """A box hanging from `top` along the local -y axis of rotation R."""
    P.append(Box(top + R @ np.array([0, -half[1], 0]), np.asarray(half, float), mat, R=R, round_=round_))
    return top + R @ np.array([0, -2 * half[1], 0])


def golem(g, pose):
    """Golems: a blocky, heavy-limbed figure built from rounded boxes. g['detail']
    adds the material's look: straw tufts, rope bindings, stitches, cracks, rivets."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    m = g['body']; dk = g.get('dark', m)
    swing = math.sin(walk) * 0.45 if walk is not None else 0.0
    bob = abs(math.cos(walk)) * 0.4 if walk is not None else breath * 0.3
    th = g.get('thick', 1.0)
    hip_y = 7.6 * s
    for sgn in (1, -1):
        R = rot_x(-swing * sgn)
        hip = np.array([1.9 * sgn * s * th, hip_y + bob, 0])
        foot = _bar(P, hip, R, np.array([1.55 * th, 3.6, 1.6 * th]) * s, m, 0.5 * s)
        P.append(Box(foot + [0, 0.5 * s, 0.6 * s], np.array([1.8 * th, 0.8, 2.3]) * s, dk, round_=0.4 * s))
    P.append(Box([0, hip_y + 0.9 * s + bob, 0], np.array([3.4 * th, 1.4, 2.3 * th]) * s, dk, round_=0.6 * s))
    chest_y = hip_y + 5.0 * s + bob + breath * 0.2
    P.append(Box([0, chest_y, 0.2 * s], np.array([4.4 * th, 3.8, 2.9 * th]) * s, m, R=rot_x(0.08), round_=1.0 * s))
    shoulder_y = chest_y + 2.6 * s
    for sgn in (1, -1):
        sh = np.array([5.3 * sgn * s * th, shoulder_y, 0.1 * s])
        P.append(Sphere(sh + [0, 0.4 * s, 0], 2.1 * s * th, dk, blend=0.3))
        if sgn == -1 and atk is not None:           # overhead hammer-fist
            ang = 2.6 - atk * 3.4
            R = rot_x(ang) @ rot_z(-0.15)
        else:
            R = rot_x(swing * sgn * 0.9) @ rot_z(0.12 * sgn)
        elbow = _bar(P, sh, R, np.array([1.35 * th, 2.3, 1.35 * th]) * s, m, 0.5 * s)
        hand = _bar(P, elbow, R @ rot_x(-0.25), np.array([1.25 * th, 2.1, 1.25 * th]) * s, m, 0.5 * s)
        P.append(Box(hand + R @ np.array([0, -0.6 * s, 0]), np.array([1.6, 1.5, 1.6]) * s * th, dk, R=R, round_=0.6 * s))
    head_c = np.array([0, chest_y + 5.0 * s, 0.9 * s])
    P.append(Box(head_c, np.array([2.2, 2.2, 2.1]) * s, g.get('head_mat', m), round_=0.7 * s))
    P.append(Box(head_c + [0, 0.6 * s, 1.5 * s], np.array([2.3, 0.45, 0.7]) * s, dk, round_=0.3 * s))     # brow
    for sgn in (1, -1):
        P.append(Sphere(head_c + [0.95 * sgn * s, -0.1 * s, 2.05 * s], 0.5 * s, g.get('eyes', 'eye_glow')))
    det = g.get('detail')
    if det == 'straw':
        for k, (x, y, z, dx, dy) in enumerate(((2.2, 1.6, 0.5, 1.6, 2.0), (-2.4, 1.2, 0.3, -1.8, 1.6), (0.6, 2.4, -0.4, 0.4, 2.6),
                                               (-0.8, 2.3, 0.6, -0.6, 2.4), (4.4, -3.0, 0.4, 1.4, -1.6), (-4.4, -3.2, 0.2, -1.2, -1.8))):
            b = (head_c if k < 4 else np.array([0, chest_y, 0])) + np.array([x, y, z]) * s
            P.append(Capsule(b, b + np.array([dx, dy, 0.3]) * s, 0.35 * s, 0.1 * s, mat=g.get('detail_mat', dk)))
    elif det == 'rope':
        for yy in (-2.2, -0.4, 1.4):
            P.append(Torus([0, chest_y + yy * s, 0.2 * s], 4.0 * s * th, 0.45 * s, g.get('detail_mat', dk), squash=(1.12, 0.75)))
    elif det == 'stitch':
        P.append(Capsule([1.2 * s, chest_y + 3.2 * s, 3.1 * s * th], [-1.6 * s, chest_y - 2.6 * s, 3.1 * s * th], 0.22 * s, mat=g.get('detail_mat', 'socket')))
        for k in range(5):
            t = k / 4
            c = np.array([1.2 - 2.8 * t, 3.2 - 5.8 * t, 3.15 * th]) * s + [0, chest_y, 0]
            P.append(Capsule(c + [-0.6 * s, -0.25 * s, 0], c + [0.6 * s, 0.25 * s, 0], 0.16 * s, mat=g.get('detail_mat', 'socket')))
        P.append(Capsule(head_c + [-1.6 * s, 1.0 * s, 2.15 * s], head_c + [1.4 * s, 1.3 * s, 2.15 * s], 0.18 * s, mat=g.get('detail_mat', 'socket')))
    elif det == 'cracks':
        for a, b in (((1.6, 2.6), (0.4, 0.6)), ((0.4, 0.6), (1.2, -1.4)), ((-2.4, 1.2), (-1.0, -0.6))):
            P.append(Capsule(np.array([a[0], a[1], 3.0 * th]) * s + [0, chest_y, 0], np.array([b[0], b[1], 3.0 * th]) * s + [0, chest_y, 0], 0.2 * s, mat=g.get('detail_mat', 'socket')))
    elif det == 'rivets':
        for x in (-3.2, 3.2):
            for y in (-2.4, 0.0, 2.4):
                P.append(Sphere([x * s * th, chest_y + y * s, 3.0 * s * th], 0.45 * s, g.get('detail_mat', dk)))
        P.append(Box([0, chest_y + 0.2 * s, 3.0 * s * th], np.array([0.5, 3.2, 0.2]) * s, dk, round_=0.2 * s))
    elif det == 'pages':
        for k, (x, y) in enumerate(((-2.0, 1.4), (1.8, 0.2), (-1.0, -1.8), (2.2, 2.4))):
            P.append(Box([x * s, chest_y + y * s, 3.0 * s * th], np.array([1.4, 0.9, 0.12]) * s, g.get('detail_mat', dk), R=rot_z(0.3 * (-1) ** k), round_=0.1 * s))
    return P


def gorilla(g, pose):
    """Apes, yetis, owlbears: hunched, barrel-chested, long arms knuckling the ground."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    fur = g['body']; face = g.get('face', fur)
    sw = math.sin(walk) * 0.45 if walk is not None else 0.0
    bob = abs(math.cos(walk)) * 0.4 if walk is not None else breath * 0.35
    hip = np.array([0, 6.0 * s + bob, -2.2 * s])
    for sgn in (1, -1):                              # short bent legs
        h = hip + [2.2 * sgn * s, 0, 0]
        segs, foot = limb(h, np.array([0.15 * sgn, -0.7, 0.75]) @ rot_x(-sw * sgn).T, np.array([0, -1, -0.35]) @ rot_x(-sw * sgn).T, 3.6 * s, 3.4 * s, 2.0 * s, 1.6 * s, 1.3 * s, fur, blend=0.8)
        P += segs
        P.append(Ellipsoid(foot + [0, 0.3 * s, 0.9 * s], np.array([1.4, 0.8, 2.0]) * s, g.get('hands', face)))
    P.append(Ellipsoid(hip + [0, 0.8 * s, 0], np.array([3.6, 3.0, 3.0]) * s, fur, blend=1.2))
    chest = np.array([0, 10.0 * s + bob + breath * 0.3, 0.6 * s])
    P.append(Ellipsoid(chest, np.array([5.0, 4.0, 3.6]) * s, fur, R=rot_x(-0.5), blend=1.4))
    P.append(Ellipsoid(chest + [0, -0.8 * s, 2.0 * s], np.array([3.2, 2.8, 1.6]) * s, g.get('chest', face), R=rot_x(-0.5), blend=0.8))
    sh_y = chest[1] + 2.0 * s
    for sgn in (1, -1):
        sh = np.array([4.6 * sgn * s, sh_y, chest[2] + 0.4 * s])
        P.append(Sphere(sh, 2.4 * s, fur, blend=1.0))
        if atk is not None:                         # rear up and smash both fists down
            k = atk
            up = np.array([0.3 * sgn, 1.0 - k * 1.6, 0.4 + k * 0.6]); lo = np.array([0.0, 1.0 - k * 2.2, 0.6 + k * 0.3])
        else:
            a = -sw * sgn * 1.1
            up = np.array([0.35 * sgn, -1, 0.35]) @ rot_x(-a).T; lo = np.array([0.05 * sgn, -1, 0.15]) @ rot_x(-a).T
        segs, hand = limb(sh, up, lo, 4.6 * s, 4.4 * s, 1.9 * s, 1.6 * s, 1.4 * s, fur, blend=0.7)
        P += segs
        P.append(Sphere(hand, 1.6 * s, g.get('hands', face), blend=0.3))
        if g.get('claws'):
            for k in (-1, 0, 1):
                P.append(Capsule(hand + [k * 0.6 * s, -0.4 * s, 1.0 * s], hand + [k * 0.7 * s, -1.2 * s, 2.2 * s], 0.32 * s, 0.08 * s, mat=g['claws']))
    hc = chest + np.array([0, 4.0 * s, 3.4 * s])
    hr = 2.7 * s * g.get('head', 1.0)
    P.append(Sphere(hc, hr, fur, blend=0.8))
    if g.get('beak'):                               # owlbear: feathered disc face and a hooked beak
        P.append(Ellipsoid(hc + [0, 0.2 * s, hr * 0.6], np.array([2.6, 2.4, 1.0]) * s, face))
        P.append(Capsule(hc + [0, -0.2 * s, hr * 0.9], hc + [0, -1.6 * s, hr * 0.9 + 1.6 * s], 0.9 * s, 0.2 * s, mat=g['beak']))
        for sgn in (1, -1):
            P.append(Sphere(hc + [1.15 * sgn * s, 0.6 * s, hr * 0.98], 0.6 * s, 'eye_glow'))
            P.append(Capsule(hc + [1.6 * sgn * s, 1.6 * s, 0], hc + [2.4 * sgn * s, 3.4 * s, -0.6 * s], 0.8 * s, 0.15 * s, mat=fur))
    else:
        P.append(Ellipsoid(hc + [0, -0.7 * s, hr * 0.62], np.array([2.0, 1.6, 1.3]) * s, face, blend=0.5))       # muzzle
        P.append(Ellipsoid(hc + [0, 0.9 * s, hr * 0.62], np.array([2.4, 0.6, 0.9]) * s, fur, blend=0.3))        # brow ridge
        for sgn in (1, -1):
            P.append(Sphere(hc + [0.95 * sgn * s, 0.25 * s, hr * 0.86], 0.45 * s, g.get('eyes', 'eye')))
            P.append(Sphere(hc + [0.45 * sgn * s, -0.7 * s, hr * 0.62 + 1.25 * s], 0.3 * s, 'nose'))
        if atk is not None and atk > 0.3:
            P.append(Capsule(hc + [-0.8 * s, -1.6 * s, hr * 0.8], hc + [0.8 * s, -1.6 * s, hr * 0.8], 0.4 * s, mat='mouth'))
    return P


def bird(g, pose):
    """Cockatrices, chickatrices: a plump bird on two legs with a beak, comb, stubby
    wings and (for the cockatrice) a scaly serpent tail."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    leg = g.get('leg', 3.0) * s
    bob = abs(math.sin(walk)) * 0.5 * s if walk is not None else breath * 0.3
    peck = math.sin(atk * math.pi) if atk is not None else 0.0
    body = np.array([0, leg + 2.6 * s + bob, 0])
    for sgn in (1, -1):
        a = math.sin((walk or 0) + (0 if sgn > 0 else math.pi)) * 0.6 if walk is not None else 0
        hip = body + [1.1 * sgn * s, -1.2 * s, 0.2 * s]
        foot = np.array([1.1 * sgn * s, 0.2 * s, 0.4 * s + a * 1.5 * s])
        P.append(Capsule(hip, foot, 0.45 * s, 0.3 * s, mat=g.get('legs_mat', 'beak')))
        for k in (-1, 0, 1):
            P.append(Capsule(foot, foot + [k * 0.7 * s, 0, 1.1 * s], 0.25 * s, 0.15 * s, mat=g.get('legs_mat', 'beak')))
    P.append(Ellipsoid(body, np.array([2.6, 2.5, 3.0]) * s * g.get('plump', 1.0), g['body'], blend=1.0))
    if g.get('breast'):
        P.append(Ellipsoid(body + [0, -0.4 * s, 1.4 * s], np.array([2.0, 1.9, 1.6]) * s, g['breast'], blend=0.6))
    hc = body + np.array([0, 2.9 * s - peck * 2.0 * s, 2.0 * s + peck * 2.2 * s])
    hr = g.get('head', 1.7) * s
    P.append(Capsule(body + [0, 1.0 * s, 1.0 * s], hc, 1.4 * s, 1.1 * s, mat=g['body'], blend=0.8))
    P.append(Sphere(hc, hr, g.get('head_mat', g['body']), blend=0.6))
    beak_open = 0.4 * s if atk is not None and atk > 0.3 else 0.0
    P.append(Capsule(hc + [0, -0.1 * s + beak_open * 0.5, hr * 0.8], hc + [0, -0.4 * s, hr + 1.4 * s], 0.7 * s, 0.12 * s, mat='beak'))
    if beak_open:
        P.append(Capsule(hc + [0, -0.6 * s, hr * 0.8], hc + [0, -1.2 * s, hr + 1.0 * s], 0.5 * s, 0.1 * s, mat='beak'))
    for sgn in (1, -1):
        P.append(Sphere(hc + [0.95 * sgn * s, 0.35 * s, hr * 0.72], 0.4 * s, g.get('eyes', 'eye')))
    if g.get('comb'):
        for k in range(3):
            P.append(Sphere(hc + [0, hr * 0.9 + (0.25 if k == 1 else 0) * s, (0.6 - k * 0.7) * s], 0.62 * s, g['comb']))
        P.append(Ellipsoid(hc + [0, -1.4 * s, hr * 0.7], np.array([0.4, 0.75, 0.4]) * s, g['comb']))     # wattle
    flap = (math.sin(breath * math.pi * 4) * 0.15 if walk is None else math.sin(walk * 2) * 0.3) + peck * 0.9
    for sgn in (1, -1):                            # stubby wings on the flanks, they lift when it attacks
        P.append(Ellipsoid(body + [2.3 * sgn * s, 0.5 * s + flap * 1.2 * s, -0.4 * s], np.array([0.5, 1.8, 2.6]) * s, g.get('wings', g['body']),
                           R=rot_z(-(0.25 + flap) * sgn) @ rot_x(0.3), blend=0.3))
    if g.get('serpent_tail'):
        tw = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 1.2 * s
        a = body + [0, 0.4 * s, -2.4 * s]
        b = a + [tw * 0.5, -1.4 * s, -2.6 * s]
        c = b + [tw, -0.6 * s, -2.8 * s]
        d = c + [tw * 1.6, 0.8 * s, -1.6 * s]
        P.append(Capsule(a, b, 1.3 * s, 1.0 * s, mat=g['serpent_tail'], blend=0.6))
        P.append(Capsule(b, c, 1.0 * s, 0.7 * s, mat=g['serpent_tail'], blend=0.4))
        P.append(Capsule(c, d, 0.7 * s, 0.25 * s, mat=g['serpent_tail'], blend=0.3))
    else:
        for k in (-1, 0, 1):
            P.append(Ellipsoid(body + [k * 0.8 * s, 1.0 * s, -2.8 * s], np.array([0.5, 1.4, 0.4]) * s, g.get('wings', g['body']), R=rot_x(0.7) @ rot_z(k * 0.3)))
    return P


def tentacled(g, pose):
    """Krakens and other cephalopods: a domed mantle, big eyes and a ring of curling tentacles."""
    s = g.get('scale', 1.0); walk = pose.get('walk'); atk = pose.get('attack'); breath = pose.get('breath', 0.0)
    P = []
    t0 = (walk or 0) * 1.0 + breath * math.pi * 2
    lift = math.sin(atk * math.pi) if atk is not None else 0.0
    mc = np.array([0, 6.5 * s + breath * 0.3 * s, -1.4 * s])
    P.append(Ellipsoid(mc + [0, 1.6 * s, -1.6 * s], np.array([4.0, 5.2, 4.2]) * s, g['body'], R=rot_x(-0.45), blend=1.2))
    P.append(Ellipsoid(mc + [0, -1.4 * s, 0.6 * s], np.array([4.2, 2.8, 3.8]) * s, g['body'], blend=1.0))
    for sgn in (1, -1):
        P.append(Sphere(mc + [2.6 * sgn * s, 0.2 * s, 3.0 * s], 1.25 * s, 'eye_white'))
        P.append(Sphere(mc + [2.8 * sgn * s, 0.1 * s, 4.0 * s], 0.6 * s, 'pupil'))
    n = 8
    for i in range(n):
        a = (i + 0.5) / n * 2 * math.pi
        dx, dz = math.sin(a), math.cos(a)
        front = dz > 0.3
        raise_ = lift * (1.6 if front else 0.4)
        pts = []
        for k in range(6):
            t = k / 5
            curl = math.sin(t * 3.0 + t0 + i) * 1.4 * t
            r = (2.6 + t * 7.0) * s
            px = dx * r + dz * curl * s
            pz = -1.4 * s + dz * r - dx * curl * s
            py = max(0.0, (1.0 - t) * 3.0 * s) + 0.6 * s + raise_ * math.sin(t * math.pi) * 6 * s + (t * t * 1.5 * s if not front else 0)
            pts.append(np.array([px, py, pz]))
        for k in range(5):
            P.append(Capsule(pts[k], pts[k + 1], (1.5 - k * 0.27) * s, (1.5 - (k + 1) * 0.27) * s, mat=g['body'] if k % 2 == 0 else g.get('body2', g['body']), blend=0.5))
        P.append(Sphere(pts[2] + [0, -0.5 * s, 0], 0.5 * s, g.get('suckers', 'bone')))
    return P
