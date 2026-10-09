"""Posable rigs built from SDF primitives. Every rig faces +z (south) in model space."""
import math

import numpy as np

from sdf import Box, Capsule, Disc, Ellipsoid, Sphere, rot_x, rot_z, rot_y


def _rotate_about(p, pivot, R):
    return pivot + R @ (np.asarray(p, float) - pivot)


def limb(shoulder, upper_dir, lower_dir, l1, l2, r1, r2, r3, mat, blend=0.6):
    """Two-segment limb from a joint, with direction vectors for each segment."""
    s = np.asarray(shoulder, float)
    e = s + np.asarray(upper_dir, float) / np.linalg.norm(upper_dir) * l1
    h = e + np.asarray(lower_dir, float) / np.linalg.norm(lower_dir) * l2
    return [Capsule(s, e, r1, r2, mat=mat, blend=blend), Capsule(e, h, r2, r3, mat=mat, blend=blend)], h


def humanoid(g, pose):
    """g: gear/proportions dict. pose: dict(walk=phase radians or None, attack=0..1 or None, breath=0..1)."""
    P = []
    s = g.get('scale', 1.0)
    walk = pose.get('walk')
    atk = pose.get('attack')
    breath = pose.get('breath', 0.0)
    swing = math.sin(walk) * 0.55 if walk is not None else 0.0
    lift = abs(math.cos(walk)) * 0.5 if walk is not None else breath * 0.35
    hip_y = 9.0 * s * g.get('leg_len', 1.0)
    bob = lift
    stocky = g.get('stocky', 1.0)

    # legs (thigh + shin + foot), swinging about the hips
    for side, sgn in (('L', 1), ('R', -1)):
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
    chest_y = hip_y + 4.4 * s * g.get('torso_len', 1.0) + bob + breath * 0.25 - g.get('hunch', 0) * s
    P.append(Ellipsoid([0, chest_y, 0.1 + g.get('hunch', 0) * 0.6 * s], np.array([4.1 * stocky * g.get('belly', 1.0), 3.9, 2.8 * g.get('belly', 1.0)]) * s, g['torso'], blend=1.2))
    if g.get('skirt'):
        P.append(Ellipsoid([0, hip_y + 0.2 + bob, 0.1], np.array([3.9 * stocky, 2.3, 2.9]) * s, g['skirt'], blend=0.5,
                           cut=([0, -1, 0], -(hip_y + 2.0 + bob))))
    P.append(Ellipsoid([0, hip_y + 1.9 + bob, 0.1], np.array([3.75 * stocky, 0.75, 2.75]) * s, g.get('belt', g['boots'])))
    if g.get('buckle'):
        P.append(Sphere([0, hip_y + 1.9 + bob, 2.65 * s], 0.65 * s, g['buckle']))

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
        if g.get('pauldrons'):
            P.append(Ellipsoid(sh + [0.3 * sgn * s, 0.5 * s, 0], np.array([1.7, 1.3, 1.7]) * s, g['pauldrons']))
        if sgn == -1:
            weapon_hand, weapon_up, weapon_lo = hand, up, lo
        else:
            shield_hand, shield_lo = hand, lo

    # head, face, hair
    head_c = np.array([0, chest_y + 6.9 * s - g.get('hunch', 0) * 0.8 * s, 0.35 + g.get('hunch', 0) * 1.4 * s])
    P.append(Capsule(head_c - [0, 3.2 * s, 0.2], head_c - [0, 1.5 * s, 0], 1.3 * s, mat=g['skin'], blend=0.5))
    hr = 3.6 * s * g.get('head', 1.0)
    thin = g.get('thin', 1.0)
    P.append(Sphere(head_c, hr, g['skin'], blend=0.4))
    if g.get('beard'):
        P.append(Ellipsoid(head_c + [0, -2.2 * s, 1.6 * s], np.array([2.3, 2.6, 1.4]) * s, g['beard'], blend=0.6))
    if g.get('hair'):
        P.append(Sphere(head_c + [0, 0.35 * s, -0.45 * s], hr * 1.05, g['hair'], blend=0.25,
                        cut=([0, 0.55, -1], -(0.55 * head_c[1] - head_c[2]) - 0.15 * hr)))
        if g.get('braids'):
            for sgn in (1, -1):
                P.append(Capsule(head_c + [2.3 * sgn * s, -0.5 * s, -1.6 * s], head_c + [2.9 * sgn * s, -5.6 * s, -1.7 * s], 0.9 * s, 0.7 * s, mat=g['hair']))
    for sgn in (1, -1):
        P.append(Ellipsoid(head_c + [1.25 * sgn * s, -0.1 * s, hr * 0.9], np.array([0.62, 0.9, 0.55]) * s, g.get('eyes', 'eye')))
    if g.get('ears'):
        for sgn in (1, -1):
            P.append(Capsule(head_c + [3.0 * sgn * s, 0.3, 0], head_c + [4.6 * sgn * s, 1.8 * s, -0.4], 0.6 * s, 0.15 * s, mat=g['skin']))

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
    elif hat == 'pointed':
        P.append(Disc(head_c + [0, 1.4 * s, 0], [0, 1, 0], 5.0 * s, 0.35 * s, g['helm']))
        P.append(Capsule(head_c + [0, 1.5 * s, 0], head_c + [0.6, 7.5 * s, -1.4], 3.0 * s, 0.25 * s, mat=g['helm']))
    elif hat == 'crown':
        P.append(Ellipsoid(head_c + [0, 1.7 * s, 0], np.array([hr * 0.95, 0.9 * s, hr * 0.95]), g['helm']))

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
    if g.get('robe'):
        P.append(Capsule([0, hip_y + 3.0 * s + bob, 0], [0, 1.2 * s, 0.2], 3.4 * s * stocky, 4.6 * s * stocky, mat=g['robe'], blend=0.8))
    if g.get('wings'):
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
    if g.get('horns'):
        for sgn in (1, -1):
            b = head_c + [hr * 0.6 * sgn, hr * 0.7, -0.3 * s]
            P.append(Capsule(b, b + [1.4 * sgn * s, 2.6 * s, -0.8 * s], 0.75 * s, 0.15 * s, mat=g['horns']))
    if g.get('tusks'):
        for sgn in (1, -1):
            b = head_c + [1.0 * sgn * s, -1.7 * s, hr * 0.85]
            P.append(Capsule(b, b + [0.3 * sgn * s, 1.0 * s, 0.4 * s], 0.35 * s, 0.1 * s, mat='bone'))
    if g.get('snout'):
        P.append(Capsule(head_c + [0, -0.6 * s, hr * 0.7], head_c + [0, -1.2 * s, hr * 0.7 + g['snout'] * s], 1.3 * s, 0.9 * s, mat=g['skin'], blend=0.4))
        P.append(Sphere(head_c + [0, -1.1 * s, hr * 0.7 + g['snout'] * s + 0.4 * s], 0.55 * s, 'nose'))
    if g.get('glow_eyes'):
        for sgn in (1, -1):
            P.append(Sphere(head_c + [1.2 * sgn * s, 0.0, hr * 0.95], 0.6 * s, 'eye_glow'))
    return P


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
    for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        ph = 0 if (sx * sz) > 0 else math.pi
        a = math.sin(walk + ph) * 0.6 if walk is not None else 0.0
        hip = body_c + [1.5 * sx * s, -0.8 * s, 3.3 * sz * L * s]
        foot_dir = np.array([0, -1, 0]) @ rot_x(-a).T
        segs, foot = limb(hip, foot_dir, foot_dir + [0, 0, -0.15 * sz], leg_h * 0.55, leg_h * 0.55, 1.1 * s, 0.8 * s, 0.75 * s, g['legs'], blend=0.5)
        P += segs
        P.append(Ellipsoid(foot + [0, 0.2, 0.4], np.array([0.85, 0.55, 1.1]) * s, g.get('paws', g['legs'])))
    # neck and head
    head_up = g.get('head_up', 3.2) * s
    if g.get('centaur'):
        g = dict(g, head=0.01, snout=0.01, ears=None)
    head_c = body_c + np.array([0, head_up, 5.0 * L * s + 1.4 * s + lunge])
    P.append(Capsule(body_c + [0, 1.0 * s, 3.8 * L * s], head_c - [0, 0.6 * s, 0.8 * s], 1.9 * s, 1.5 * s, mat=g['body'], blend=1.0))
    hr = g.get('head', 2.4) * s
    P.append(Sphere(head_c, hr, g['body'], blend=0.6))
    snout = g.get('snout', 2.4) * s
    P.append(Capsule(head_c + [0, -0.5 * s, 1.2 * s], head_c + [0, -0.9 * s, 1.2 * s + snout], 1.3 * s, 0.85 * s, mat=g.get('muzzle', g['body']), blend=0.5))
    P.append(Sphere(head_c + [0, -0.5 * s, 1.2 * s + snout + 0.5 * s], 0.65 * s, g.get('nose', 'nose')))
    if atk is not None and atk > 0.3:
        P.append(Capsule(head_c + [0, -1.6 * s, 1.5 * s], head_c + [0, -1.9 * s, 1.0 * s + snout], 0.5 * s, mat='mouth'))
    for sgn in (1, -1):
        P.append(Sphere(head_c + [1.15 * sgn * s, 0.5 * s, hr * 0.78], 0.5 * s, g.get('eyes', 'eye')))
        ear = g.get('ears', 'pointed')
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
    if g.get('wings'):
        flap = math.sin((walk or 0) * 2 + breath * math.pi * 2) * 0.3
        for sgn in (1, -1):
            root = body_c + np.array([1.6 * sgn * s, 1.8 * s, 1.0 * s])
            tip = root + np.array([6.5 * sgn * s, (4.5 + flap * 4) * s, -3.0 * s])
            P.append(Capsule(root, tip, 0.7 * s, 0.25 * s, mat=g['wings']))
            P.append(Ellipsoid((root + tip) / 2 + np.array([0, -1.8 * s, 0]), np.array([3.6, 2.6, 0.3]) * s, g['wings'], R=rot_z(-0.6 * sgn - flap * sgn)))
    if g.get('centaur'):
        chest = body_c + np.array([0, 3.6 * s, 4.0 * s])
        P.append(Ellipsoid(chest, np.array([2.6, 3.2, 2.0]) * s, 'skin', blend=0.8))
        P.append(Sphere(chest + [0, 4.4 * s, 0.4 * s], 2.4 * s, 'skin'))
        for sgn in (1, -1):
            P.append(Capsule(chest + [2.6 * sgn * s, 1.5 * s, 0], chest + [3.2 * sgn * s, -2.5 * s, 1.5 * s], 0.9 * s, 0.7 * s, mat='skin'))
            P.append(Sphere(chest + [0.9 * sgn * s, 4.5 * s, 2.2 * s], 0.4 * s, 'eye'))
    # tail
    tw = math.sin((walk or 0) * 2) * 0.6 if walk is not None else math.sin(breath * math.pi * 2) * 0.3
    tb = body_c + [0, 0.8 * s, -4.8 * L * s]
    tl = g.get('tail', 4.5) * s
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
    if g.get('eyes', True):
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
    s = g.get('scale', 1.0); breath = pose.get('breath', 0.0); walk = pose.get('walk') or 0.0
    P = []
    for i in range(7):
        t = i / 6
        a = t * 7 + breath * 6 + walk * 3
        r = (1.0 + t * 4.2) * s
        P.append(Ellipsoid([math.cos(a) * 0.8 * s, (1.0 + t * 12) * s, math.sin(a) * 0.8 * s], np.array([r, 1.0 * s, r]), g['body'] if i % 2 else g.get('body2', g['body']), blend=1.0))
    return P
