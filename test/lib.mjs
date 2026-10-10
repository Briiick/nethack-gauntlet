// Shared helpers for the browser tests: read what the game is waiting for, answer prompts.

export const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function harness(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const key = async (k) => { await page.keyboard.press(k); await wait(50); };

  const state = () => page.evaluate(() => {
    const g = window.__nhg?.game, ui = window.__nhg?.ui;
    const vis = (s) => { const e = document.querySelector(s); return e && !e.hidden && e.offsetParent !== null ? e : null; };
    const modal = vis('#modal');
    return {
      waiting: g?.waiting || null, over: !!g?.over, calls: g?.calls || 0,
      prompt: vis('#prompt')?.innerText || '', compass: !!vis('#compass'), more: !!vis('#more'),
      inv: !!(modal && modal.querySelector('.bg-inv')), menu: !!(modal && modal.querySelector('.panel.menu')),
      menuTitle: modal?.querySelector('.panel.menu h2')?.innerText || '',
      text: !!(modal && modal.querySelector('.panel.text')),
      getline: modal?.querySelector('.panel.getline input:not(#ext-input)') ? (modal.querySelector('.panel.getline label')?.innerText || 'getline') : '',
      ext: !!(modal && modal.querySelector('#ext-input')), gameover: !!vis('#gameover'),
      targeting: !!ui?.isTargeting, msgs: ui?.historyLog.length || 0,
    };
  });
  const msgsSince = (n) => page.evaluate((n) => window.__nhg.ui.historyLog.slice(n), n);

  function lineFor(q) {
    if (/wish/i.test(q)) return 'blessed +2 long sword';
    if (/level|depth/i.test(q)) return '2';
    if (/genocide|what (kind of )?monster|create/i.test(q)) return 'newt';
    if (/write|engrave|scribble|burn|melt/i.test(q)) return 'Elbereth';
    if (/count|how many|number/i.test(q)) return '1';
    if (/annotat|note/i.test(q)) return 'test note';
    if (/name|call/i.test(q)) return 'Fluffy';
    if (/file|lua|des\b/i.test(q)) return '';
    return 'x';
  }

  // Answer prompts until the engine waits for a command again. `policy` can override answers.
  async function settle({ maxSteps = 40, log = null, policy = {} } = {}) {
    let same = 0, lastCalls = -1, yes = 0, picked = 0, getposRounds = 0, seenMsgs = -1;
    const note = (x) => log && log.push(x);
    for (let i = 0; i < maxSteps; i++) {
      await wait(i < 3 ? 90 : 180);
      const s = await state();
      if (s.over || s.gameover) return 'over';
      if (s.calls === lastCalls && !s.waiting) { if (++same > 50) return 'hang'; continue; }
      same = 0; lastCalls = s.calls;
      if (s.more) { note('more'); await key('Escape'); continue; }
      if (s.getline) { note('getline:' + s.getline.slice(0, 60)); const a = (policy.line || lineFor)(s.getline); if (a) await page.keyboard.type(a); await key(a ? 'Enter' : 'Escape'); continue; }
      if (s.ext) { note('ext'); await key('Escape'); continue; }
      if (s.compass) { note('direction'); await key(policy.dir || 'l'); continue; }
      if (s.prompt) {
        note('yn:' + s.prompt.split('\n')[0].slice(0, 70));
        const custom = policy.yn && policy.yn(s.prompt);
        if (custom) { await key(custom); continue; }
        if (/quit|really|save|sure you want to (die|quit)|unrecognized|destroy|genocide|level teleport|no return|still climb/i.test(s.prompt) || yes > 1) await key('Escape');
        else {
          yes++;
          const letters = s.prompt.match(/\[([a-zA-Z$])[^\]]*\]/);
          const yn = /\[yn/.test(s.prompt) || /\ny\n/.test(s.prompt);
          await key(yn ? 'y' : letters ? letters[1] : 'Escape');
        }
        continue;
      }
      if (s.inv || s.menu) {
        note(s.inv ? 'inventory' : 'menu:' + s.menuTitle.slice(0, 40));
        if (policy.menu) { await policy.menu(s); continue; }
        if (picked++ < 1) {
          const ok = await page.evaluate(() => {
            const b = document.querySelector('#modal .bg-inv .grid [data-i], #modal .bg-inv .eq[data-i], #modal .panel.menu .item');
            if (!b) return false; b.click(); return true;
          });
          await wait(150);
          const t = await state();
          if (ok && (t.inv || t.menu)) await key('Enter');
        } else await key('Escape');
        continue;
      }
      if (s.text) { note('text'); await key('Escape'); continue; }
      if (s.waiting === 'shim_nh_poskey' || s.waiting === 'shim_nhgetch') {
        // only messages that arrived since we last answered a position prompt count
        if (seenMsgs < 0) seenMsgs = Math.max(0, s.msgs - 3);
        const recent = (await msgsSince(seenMsgs)).join(' ');
        if (s.targeting || /for instructions type a|where do you want|pick (an? |first |next )?(object|monster|location)|move the cursor/i.test(recent)) {
          seenMsgs = s.msgs;
          if (getposRounds++ < 3) { note('getpos'); for (const k of policy.getpos || ['l', '.']) await key(k); }
          else { note('getpos-cancel'); await key('Escape'); }
          continue;
        }
        if (s.targeting) { await key('Escape'); continue; }
        return 'ok';
      }
    }
    return 'timeout';
  }

  return { wait, key, state, msgsSince, settle };
}
