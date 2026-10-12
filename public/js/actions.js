// The natural action for an item, as NetHack commands: used by double-click in the inventory and
// by the quickbar. Each action types NetHack's own command key and answers its "What do you want
// to ...?" question with the item's letter, so the game itself is unchanged.

const CAT = (c) => (/weapon/i.test(c) ? 'weapon' : /armou?r/i.test(c) ? 'armor' : /comestible/i.test(c) ? 'food'
  : /scroll/i.test(c) ? 'scroll' : /spellbook/i.test(c) ? 'book' : /potion/i.test(c) ? 'potion' : /ring/i.test(c) ? 'ring'
    : /wand/i.test(c) ? 'wand' : /tool/i.test(c) ? 'tool' : /amulet/i.test(c) ? 'amulet' : /gem|stone/i.test(c) ? 'gem' : /coin/i.test(c) ? 'coin' : 'other');

// item: { text, cat } (cat = the inventory heading it was listed under, e.g. "Potions")
export function verbFor(item) {
  const t = (item.text || '').toLowerCase(), c = CAT(item.cat || '');
  const worn = /\((being worn|on (left|right) hand|in use|on your eyes|over your eyes)/.test(t);
  switch (c) {
    case 'potion': return { key: 'q', label: 'Drink' };
    case 'scroll': return { key: 'r', label: 'Read' };
    case 'book': return { key: 'r', label: 'Study' };
    case 'wand': return { key: 'z', label: 'Zap' };
    case 'food': return { key: 'e', label: 'Eat' };
    case 'ring': case 'amulet': return worn ? { key: 'R', label: 'Remove' } : { key: 'P', label: 'Put on' };
    case 'armor': return worn ? { key: 'T', label: 'Take off' } : { key: 'W', label: 'Wear' };
    case 'weapon':
      if (/\((in quiver|at the ready)/.test(t)) return { key: 'f', label: 'Fire' };   // (quivered non-ammo is "at the ready")
      if (/\((weapon in |wielded in |tethered to |wielded\))/.test(t)) return null;   // already in hand
      if (/\(alternate weapon/.test(t)) return { key: 'x', label: 'Swap to' };
      return { key: 'w', label: 'Wield' };
    case 'tool':
      if (/blindfold|towel|lenses/.test(t)) return worn ? { key: 'R', label: 'Remove' } : { key: 'P', label: 'Put on' };
      return { key: 'a', label: 'Apply' };
    case 'gem': return { key: 't', label: 'Throw' };
    default: return null;
  }
}

// Type the command and pre-answer "What do you want to <verb>?" with the item's letter.
export function useItem(ui, item, verb = verbFor(item)) {
  if (!verb || !item.ch) return false;
  ui.answerNext([{ re: /^(What|Which) /, key: String.fromCharCode(item.ch) }]);
  ui.pushKey(verb.key.charCodeAt(0));
  return true;
}

// ---- two weapons at once, by NetHack's own rule (wield.c, can_twoweapon): a role (or form) that
// attacks with two weapons, a one-handed melee weapon in each hand and no shield. A cursed off-hand
// weapon would be dropped, so that's out too. NetHack still has the last word.
const ONE_WEAPON_ROLE = /^(caveman|cavewoman|healer|monk|priest|priestess|ranger|wizard)$/;
const TWO_HANDED = /two-handed|tsurugi|long samurai sword|battle-axe|double-headed axe|mattock|broad pick|quarterstaff|^staff\b|partisan|ranseur|spetum|glaive|halberd|bardiche|voulge|fauchard|guisarme|lucern hammer|bec de corbin|polearm|poleaxe|pole cleaver|pole sickle|pruning hook/;
const NOT_MELEE = /\bbow\b|crossbow|\bsling\b|\byumi\b|arrow|\bya\b|\bbolts?\b|\bdarts?\b|shuriken|throwing star|boomerang/;
const bare = (t) => t.toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/^(a|an|the|\d+)\s+/, '').replace(/\b(uncursed|blessed|cursed|[+-]\d+)\s+/g, '');
const oneHanded = (it) => !!it && CAT(it.cat || '') === 'weapon' && !TWO_HANDED.test(bare(it.text)) && !NOT_MELEE.test(bare(it.text));
const cursed = (it) => /\bcursed\b/.test(it.text) && !/\buncursed\b/.test(it.text);

// The commands that put item in the off hand and start fighting with both, or null when NetHack
// wouldn't allow it. eq: what's in hand, { main, off, alt } -> { ch, text, cat } (from equipmentOf).
export function offhandPlan(ui, item, eq) {
  const hero = ui.renderer && [...ui.renderer.actors.values()].find((a) => a.hero);
  if (hero && ONE_WEAPON_ROLE.test(ui.renderer.monsterName(hero))) return null;
  const twoOn = !!eq.off && CAT(eq.off.cat || '') === 'weapon';
  if (eq.off && !twoOn) return null;                                    // a shield
  if (!oneHanded(eq.main) || cursed(eq.main) || !oneHanded(item) || cursed(item)) return null;
  const toggle = { ext: 'twoweapon' };
  if (eq.alt && eq.alt.text === item.text) return [toggle];             // already the swap weapon
  if (eq.alt && cursed(eq.alt)) return null;                            // swapping would weld it to the hand
  const wield = (ch) => ({ keys: 'w', answers: [{ re: /wield/i, key: String.fromCharCode(ch) }] });
  // wield it, swap so it's the second weapon, wield the first one again (pushweapon does that itself)
  return [...(twoOn ? [toggle] : []), wield(item.ch), { keys: 'x' },
    ...(ui.settings && ui.settings.game && ui.settings.game.pushweapon ? [] : [wield(eq.main.ch)]), toggle];
}

// Cast a known spell by its letter in the spell menu.
export function castSpell(ui, letter) {
  ui.answerNext([{ re: /spell to cast/i, key: letter, menu: true }]);
  ui.pushKey('Z'.charCodeAt(0));
}

export { CAT as itemKind };
