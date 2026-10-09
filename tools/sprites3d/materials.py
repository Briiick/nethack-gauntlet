from sdf import Material

BASE = {
    'skin': Material('#e0a27c', step=0.085, hue=0.5), 'eye': Material('#1a1420', detail=True), 'eye_glow': Material('#ffd040', glow=True),
    'steel': Material('#aeb6c8', metal=True), 'gold': Material('#e0aa3a', metal=True), 'wood': Material('#7a5232'),
    'leather': Material('#6a4428'), 'gem': Material('#60c0ff', glow=True), 'nose': Material('#241818'),
    'mouth': Material('#8a1a24'), 'pupil': Material('#0a0812', detail=True), 'glint': Material('#ffffff', glow=True),
    'vein': Material('#c03050'), 'horn_dark': Material('#2a2024'), 'gem_green': Material('#5ae07a', glow=True), 'bone': Material('#e6dcc4', step=0.09), 'wing_glass': Material('#cfe6ff', glow=True),
}


def mats(**extra):
    m = dict(BASE)
    for k, v in extra.items():
        if k == 'skin' and not isinstance(v, Material):
            v = Material(v, step=0.085, hue=0.5)
        m[k] = v if isinstance(v, Material) else Material(v)
    return m
