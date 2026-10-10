// Hotkey audit for the modern controls (no browser needed): no key does two things, every key the
// action bar and help show really triggers that action, and nothing rebinds NetHack's own
// movement keys (hjklyubn), which keep working in both schemes.
globalThis.addEventListener = () => {};
const { ACTIONS, KEY_ACTION, DIR_KEYS, MODERN_HELP } = await import('../public/js/controls.js');
const fail = [];
const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);

// 1. one meaning per key
const seen = new Map();
for (const k of Object.keys(DIR_KEYS)) seen.set(norm(k), 'move ' + DIR_KEYS[k]);
for (const [k, a] of Object.entries(KEY_ACTION)) {
  if (seen.has(norm(k))) fail.push(`"${k}" is both ${seen.get(norm(k))} and ${a}`);
  seen.set(norm(k), a);
}
// 2. the keys the action bar shows do what the bar says
const shown = new Map();
for (const [id, , key] of ACTIONS) {
  if (shown.has(key)) fail.push(`action bar shows "${key}" for both ${shown.get(key)} and ${id}`);
  shown.set(key, id);
  const k = key === 'Space' ? ' ' : key;
  if (['Ctrl+S', '?'].includes(key)) continue;   // handled before the scheme (save) / passed to NetHack (help)
  if (KEY_ACTION[norm(k)] !== id) fail.push(`action bar says ${key} = ${id}, but ${key} does ${KEY_ACTION[norm(k)] || 'nothing'}`);
}
// 3. NetHack's own movement keys are never rebound
for (const k of 'hjklyubn') if (KEY_ACTION[k]) fail.push(`"${k}" (NetHack movement) is rebound to ${KEY_ACTION[k]}`);
// 4. the help names each bound key
const help = MODERN_HELP.map(([, h]) => h).join(' ').replace(/<[^>]+>/g, '');
for (const k of Object.keys(KEY_ACTION)) {
  const label = k === ' ' ? 'Space' : k === '.' ? '.' : k.length === 1 ? k.toUpperCase() : k;
  if (!help.includes(label)) fail.push(`help never mentions ${label} (${KEY_ACTION[k]})`);
}
if (fail.length) { console.error('FAIL hotkeys:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log(`hotkeys: ${seen.size} modern keys, no conflicts; action bar and help match the bindings`);
