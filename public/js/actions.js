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
      if (/\(in quiver/.test(t)) return { key: 'f', label: 'Fire' };
      if (/weapon in hands?|wielded\)|weapon in (right|left) hand/.test(t)) return null;   // already in hand
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

// Cast a known spell by its letter in the spell menu.
export function castSpell(ui, letter) {
  ui.answerNext([{ re: /spell to cast/i, key: letter, menu: true }]);
  ui.pushKey('Z'.charCodeAt(0));
}

export { CAT as itemKind };
