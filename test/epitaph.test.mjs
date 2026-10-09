// Unit test for the game-over cause of death: node test/epitaph.test.mjs
import assert from 'node:assert/strict';
import { epitaph } from '../public/js/epitaph.js';
const rip = ['                       ----------', '                      /          \\', '                     /    REST    \\', '                    /      IN      \\',
  '                   /     PEACE      \\', '                  /                  \\', '                  |      Tester      |', '                  |       0 Au       |',
  '                  |   killed by a    |', '                  |    sewer rat     |', '                  |                  |', '                  |       2026       |', '                 *|     *  *  *      | *'];
assert.equal(epitaph(rip, []), 'Killed by a sewer rat.');
const rip2 = rip.slice(); rip2[8] = '                  |  killed by the   |'; rip2[9] = '                  |  Wizard of Yendor|';
assert.equal(epitaph(rip2, []), 'Killed by the Wizard of Yendor.');
assert.equal(epitaph(['1 15 Tester-Pri-Hum-Mal-Cha died in The Dungeons', 'of Doom on level 2.  Killed by a jackal.'], []), 'Killed by a jackal.');
assert.equal(epitaph([], ['You hit the dwarf!', 'The dwarf swings his dwarvish mattock.', 'The dwarf hits!', 'You die...']), 'Killed by a dwarf.');
assert.equal(epitaph([], ['The owlbear hits!', 'You die...']), 'Killed by an owlbear.');
assert.equal(epitaph([], ['You feel weaker.', 'You die...']), null);
console.log('epitaph: all cases pass');
