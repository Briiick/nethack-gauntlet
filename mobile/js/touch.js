// Touch on the map, Pixel Dungeon style, all of it passed to NetHack as its own mouse actions:
//   tap           walk / travel there, attack or open what's next to you, or (on yourself) use
//                 the stairs, pick up, drink from a fountain, sit on a throne, or rest
//   hold          what's there, with Look, Travel, Fire that way, and (next to you) NetHack's own
//                 "What do you want to do?" menu (#therecmdmenu)
//   drag          look around (the view springs back when you act)
//   pinch         zoom
// While NetHack asks for a direction, a tap anywhere picks the direction from you to it; while it
// asks for a spot, a tap picks that spot.
const HOLD_MS = 420, SLOP = 12;
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const DIRS = { '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u', '-1,0': 'h', '0,0': '.', '1,0': 'l', '-1,1': 'b', '0,1': 'j', '1,1': 'n' };

export class Touch {
  constructor(ui, hud) {
    this.ui = ui; this.hud = hud; hud.touch = this; this.r = ui.renderer;
    this.pts = new Map(); this.g = null;
    const view = document.getElementById('view');
    view.style.touchAction = 'none';
    view.addEventListener('pointerdown', (e) => this.down(e));
    view.addEventListener('pointermove', (e) => this.move(e));
    view.addEventListener('pointerup', (e) => this.up(e));
    view.addEventListener('pointercancel', (e) => this.cancel(e));
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    // the view comes back to the hero when they move
    const setHero = this.r.setHero.bind(this.r);
    this.r.setHero = (x, y) => { const h = this.r.heroCell; if (!h || h.x !== x || h.y !== y) this.recentre(); setHero(x, y); };
    // trackpads and mice on tablets: wheel zooms
    view.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  // CSS pixels per map pixel
  scale() { const v = this.r.view; return v.clientWidth / this.r.vw; }

  down(e) {
    e.preventDefault();
    this.r.view.setPointerCapture?.(e.pointerId);
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 1) {
      this.g = { kind: 'tap', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now() };
      clearTimeout(this.holdT);
      this.holdT = setTimeout(() => this.hold(), HOLD_MS);
    } else if (this.pts.size === 2) {
      clearTimeout(this.holdT);
      const [a, b] = [...this.pts.values()];
      this.g = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: +this.ui.settings.zoom || 1.5 };
    }
  }

  move(e) {
    if (!this.pts.has(e.pointerId) || !this.g) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.g;
    if (g.kind === 'pinch' && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const want = g.z0 * d / Math.max(1, g.d0);
      const z = ZOOMS.reduce((best, v) => (Math.abs(v - want) < Math.abs(best - want) ? v : best), ZOOMS[0]);
      if (z !== +this.ui.settings.zoom) this.setZoom(z);
      return;
    }
    if (g.kind === 'tap' && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SLOP) { g.kind = 'pan'; clearTimeout(this.holdT); }
    if (g.kind === 'pan') {
      const k = this.scale();
      this.r.pan.x -= (e.clientX - g.lx) / k; this.r.pan.y -= (e.clientY - g.ly) / k;
      const lim = 80 * 24;   // never lose the map entirely
      this.r.pan.x = Math.max(-lim, Math.min(lim, this.r.pan.x)); this.r.pan.y = Math.max(-lim, Math.min(lim, this.r.pan.y));
      this.r.cam.x -= (e.clientX - g.lx) / k; this.r.cam.y -= (e.clientY - g.ly) / k;   // follow the finger exactly
      this.hud.panned(true);
    }
    g.lx = e.clientX; g.ly = e.clientY;
  }

  up(e) {
    this.pts.delete(e.pointerId);
    clearTimeout(this.holdT);
    const g = this.g;
    if (this.pts.size) return;   // a pinch ends when the last finger lifts
    this.g = null;
    if (g && g.kind === 'tap') this.tap(e.clientX, e.clientY);
  }
  cancel(e) { this.pts.delete(e.pointerId); clearTimeout(this.holdT); if (!this.pts.size) this.g = null; }

  recentre() { this.r.pan.x = 0; this.r.pan.y = 0; this.hud.panned(false); }

  setZoom(z) {
    this.ui.settings.zoom = z; this.ui.saveSettings();
    const before = this.scale();
    this.r.resize();
    // keep the same spot under the fingers' centre roughly where it was
    const k = this.scale() / before;
    this.r.cam.init = false;
    if (k !== 1) this.hud.flash(`${Math.round(z * 100)}%`);
  }
  zoomStep(d) {
    const i = ZOOMS.indexOf(+this.ui.settings.zoom);
    const z = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))];
    if (z !== +this.ui.settings.zoom) this.setZoom(z);
  }

  cell(x, y) { return this.r.screenToCell(x, y); }
  hero() { return this.ui.game?.hero || this.r.heroCell; }

  tap(x, y) {
    const ui = this.ui;
    if (ui.modal && !ui.dirFinish) return;
    if (!document.getElementById('more').hidden) { ui.pushKey(13); return; }
    const c = this.cell(x, y), h = this.hero();
    if (ui.dirFinish) {   // "In what direction?": the way from you to where you tapped
      const dx = c.x - h.x, dy = c.y - h.y;
      let sx = Math.sign(dx), sy = Math.sign(dy);
      if (Math.abs(dx) > 2 * Math.abs(dy)) sy = 0; else if (Math.abs(dy) > 2 * Math.abs(dx)) sx = 0;   // sloppy taps
      ui.dirFinish(DIRS[`${sx},${sy}`].charCodeAt(0));
      return;
    }
    if (!ui.waiter) return;
    if (!ui.waiter.allowClick) { ui.pushKey(27); return; }   // waiting for some key: a tap moves on
    if (!ui.isTargeting) this.recentre();
    this.click(c, ui.isTargeting ? 1 : 2);
  }

  hold() {
    const g = this.g, ui = this.ui;
    if (!g || g.kind !== 'tap') return;
    g.kind = 'held';
    if (ui.modal || !ui.waiter || !ui.waiter.allowClick || ui.dirFinish) return;
    try { navigator.vibrate?.(12); } catch (e) { /* no haptics */ }
    const c = this.cell(g.x0, g.y0);
    if (ui.isTargeting) { this.click(c, 1); return; }
    this.hud.spotSheet(c);
  }

  click(c, button) {
    const ui = this.ui;
    if (c.x < 0 || c.y < 0 || c.x >= 80 || c.y >= 21) return;
    const w = ui.waiter; ui.waiter = null;
    w({ click: { x: c.x, y: c.y, button } });
  }
}
