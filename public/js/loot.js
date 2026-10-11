// Looting in one screen. NetHack's own way to use a chest takes a question and four menus:
//   "There is a chest here, loot it?"  ->  "Do what with the chest?" (look / take out / put in /
//   both...)  ->  "Take out what type of objects?"  ->  "Take out what?"  ->  (and again for
//   putting things in). Here the chest's contents and your pack sit side by side: mark what to
//   take and what to put in, press one button. Underneath, NetHack still asks every one of its
//   questions; this answers them with what you marked, so the game itself is unchanged.
//
// The same goes for the "what type of objects?" step when picking up or dropping several things:
// the item screens already sort by kind, so it is answered with "All types".
import { lootScreen } from './container.js';

const PICK_ONE = 1, PICK_ANY = 2;
const ALL = (it) => ({ ident: it.ident, count: -1 });
const CONTAINER = /^(piletop )?(large box|chest|ice box|bag \/)/;

export function isContainerGlyphName(n) { return CONTAINER.test(n || ''); }
// a container named in text NetHack printed ("You see here a large box.")
const CONTAINER_TEXT = /\b(large box|chest|ice box|oilskin sack|sack|bag of holding|bag of tricks|bag)\b/;
export function containerInText(t) { return ((t || '').match(CONTAINER_TEXT) || [])[1] || ''; }

export class Looting {
  constructor(game) { this.game = game; this.reset(); }
  get ui() { return this.game.ui; }
  get on() { return this.ui.settings.quickLoot !== false; }

  // back at the command prompt: nothing carries over to the next command
  reset() { this.plan = null; this.abort = false; this.container = ''; }

  // "There is a chest here, loot it?" -> yes (you asked to loot); after Cancel, no more containers
  yn(query) {
    if (!this.on || !/^There (is|are) .+ here,? loot (it|them)\?/i.test(query)) return null;
    return this.abort ? 113 /* q */ : 121 /* y */;
  }

  // A menu NetHack is about to show: a Promise of the answer when this handles it, else undefined.
  menu(menu, how) {
    if (!this.on) return undefined;
    const p = (menu.prompt || '').trim();
    const items = menu.items.filter((it) => !it.header && it.ident !== 0);
    const find = (re) => items.find((it) => re.test(it.text));

    // "Do what with the chest?": both (take out, then put in) when that's possible
    if (how === PICK_ONE && find(/^Look inside /)) {
      this.container = (p.match(/^Do what with (.+?)\?$/) || p.match(/^(.+?) is empty\./) || [])[1] || 'the container';
      this.plan = null;
      const pick = find(/^(both; )?take out, then put in$/) || find(/^take .* out$/) || find(/^put .* in$/);
      return pick ? Promise.resolve([ALL(pick)]) : undefined;
    }

    // "<Take out / Put in / Pick up / Drop> what type of objects?": all of them
    if (how === PICK_ANY && /what type of (objects|items)\?$/i.test(p)) {
      const all = find(/^All types$/);
      if (!all) return undefined;
      if (/^Put in/i.test(p) && this.plan && (this.plan.cancel || !this.plan.put.length)) return Promise.resolve([]);   // nothing to put in
      return Promise.resolve([ALL(all)]);
    }

    // "Take out what?": the loot screen, contents on one side and your pack on the other
    if (how === PICK_ANY && /^Take out what\?$/.test(p)) {
      const pack = this.packItems();
      return lootScreen(this.ui, { title: this.container, contents: items, pack, canTake: true, canPut: pack.some((e) => !e.locked) })
        .then((r) => {
          if (!r) { this.plan = { put: [], cancel: true }; this.abort = true; return null; }
          this.plan = { put: r.put };
          return items.filter((it) => r.take.includes(it.ident)).map(ALL);
        });
    }

    // "Put in what?": what was marked on the loot screen, or (an empty container) the screen now
    if (how === PICK_ANY && /^Put in what\?$/.test(p)) {
      if (this.plan) {
        const put = this.plan.put; this.plan = null;
        return Promise.resolve(items.filter((it) => put.includes(it.ch)).map(ALL));
      }
      const pack = items.map((it) => ({ it, locked: false }));
      return lootScreen(this.ui, { title: this.container, contents: [], pack, canTake: false, canPut: true, empty: true })
        .then((r) => {
          if (!r) { this.abort = true; return null; }
          return items.filter((it) => r.put.includes(it.ch)).map(ALL);
        });
    }
    return undefined;
  }

  // your pack as NetHack last listed it; what you're wearing can't go in a container (NetHack says so)
  packItems() {
    const out = []; let cat = '';
    for (const it of this.game.inventory || []) {
      if (it.header || it.ident === 0) { cat = it.text.trim(); continue; }
      const t = it.text.toLowerCase();
      const locked = /\((being worn|on (left|right) hand|on your eyes|over your eyes|embedded in your skin)/.test(t)
        || this.container && t.includes(this.container.replace(/^(the|your) /, ''));
      out.push({ it, cat, locked });
    }
    return out;
  }
}
