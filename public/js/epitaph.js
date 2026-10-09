// Work out what killed the hero from NetHack's end-of-game text, for the game-over screen.

const CAUSE = /\b(killed by|died of|choked on|petrified by|turned to stone|starved|drowned|burned by|crushed|squished|dissolved|zapped|caught|went to heaven|ascended|escaped)\b/i;

// The tombstone is ASCII art: "|    killed by a   |" then "|    sewer rat     |" ... "|       2026       |"
function fromTombstone(lines) {
  const inner = (l) => (/\|.*\|/.test(l) ? l.replace(/^[^|]*\|/, '').replace(/\|[^|]*$/, '').trim() : null);
  for (let i = lines.length - 1; i >= 0; i--) {
    const c = inner(lines[i]);
    if (!c || !CAUSE.test(c)) continue;
    const parts = [c];
    for (let j = i + 1; j < lines.length; j++) {
      const n = inner(lines[j]);
      if (!n || /^\d{3,4}$/.test(n)) break;
      parts.push(n);
    }
    return parts.join(' ').replace(/\s+/g, ' ');
  }
  return null;
}

// Score list line: "... died in The Dungeons of Doom on level 2.  Killed by a sewer rat."
function fromScore(lines) {
  const text = lines.join(' ').replace(/\s+/g, ' ');
  const re = /\b(killed by|died of|choked on|petrified by|turned to stone by|starved to death|drowned in|burned by|crushed to death by|squished under|dissolved in)\b([^.!]*)/gi;
  let m, cause = null;
  while ((m = re.exec(text))) cause = (m[1] + m[2]).trim();
  return cause && cause.split(' ').length > 2 ? cause : null;
}

// Last resort: whoever was hitting us just before "You die..."
function fromMessages(log) {
  const i = log.map((m) => /^you die/i.test(m)).lastIndexOf(true);
  if (i < 0) return null;
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
    const m = log[j].match(/^The (.+?) (hits|bites|stings|kicks|butts|claws|touches|swings|thrusts|squeezes|gores|stabs|slashes|whips|smites|zaps|breathes|spits|explodes|engulfs|digests)\b/i);
    if (m) return `killed by ${/^[aeiou]/i.test(m[1]) ? 'an' : 'a'} ${m[1]}`;
  }
  return null;
}

export function epitaph(text, log) {
  const c = fromTombstone(text) || fromScore(text) || fromMessages(log);
  return c ? c.replace(/^./, (x) => x.toUpperCase()).replace(/\.?$/, '.') : null;
}
