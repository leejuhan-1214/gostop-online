const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

function seeded(seed) {
  let value = seed;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function actionFor(g, random, includeToggles = true) {
  const hand = g.hands[g.turn], player = g.players[g.turn];
  if (g.phase === 'choose') {
    return {type: 'choose', id: g.pending.options[Math.floor(random() * g.pending.options.length)]};
  }
  if (g.phase === 'decision') {
    if (includeToggles && player.won.some(c => c.id === 32) && random() < 0.07) return {type: 'gukjin'};
    return {type: 'decision', choice: random() < 0.68 ? 'go' : 'stop'};
  }
  assert.equal(g.phase, 'play', 'a continuing game must expose a legal action phase');
  const options = hand.map(c => ({type: 'play', id: c.id}));
  if (player.passes) options.push({type: 'pass'});
  if (includeToggles && player.won.some(c => c.id === 32) && random() < 0.1) options.push({type: 'gukjin'});
  for (const month of new Set(hand.map(c => c.month))) {
    if (hand.filter(c => c.month === month).length !== 3) continue;
    const floorCount = g.floor.filter(c => c.month === month).length;
    if (floorCount === 1) options.push({type: 'bomb', month}, {type: 'bomb', month});
    if (floorCount === 0 && !player.shaken.includes(month) && !player.bombed.includes(month)) {
      options.push({type: 'shake', month});
    }
  }
  assert(options.length, 'a player cannot be left without a card or bomb pass');
  return options[Math.floor(random() * options.length)];
}

function assertState(g) {
  assert.equal(E.validate(g), true);
  // A hand choice has removed the played card but has not flipped stock yet.
  const owedDraws = g.hands.flat().length + g.players.reduce((sum, p) => sum + p.passes, 0)
    + (g.pending?.source === 'hand' ? 1 : 0);
  assert.equal(g.deck.length, owedDraws, 'stock must equal the remaining hand plays and bomb passes');
  for (const seat of [0, 1]) {
    const view = E.view(g, seat);
    assert.equal(view.otherHandCount, g.hands[1 - seat].length);
    assert.deepEqual(view.hand.map(c => c.id), g.hands[seat].map(c => c.id));
    assert(!('deck' in view), 'the public view must not disclose the stock order');
    assert(!('hands' in view), 'the public view must not disclose both hands');
  }
}

function step(g, action) {
  const beforeStock = g.deck.map(c => c.id);
  E.act(g, g.turn, action);
  assertState(g);
  if (['shake', 'gukjin', 'decision'].includes(action.type)) {
    assert.deepEqual(g.deck.map(c => c.id), beforeStock, 'a declaration or scoring choice must not consume stock');
  }
  if (g.pending?.source === 'hand') {
    assert.deepEqual(g.deck.map(c => c.id), beforeStock, 'stock must stay hidden until the hand-pair choice is committed');
  }
}

test('seeded complete games preserve cards and finish across mixed legal actions', t => {
  const simulations = Number(process.env.GOSTOP_SIMULATIONS || 1000);
  assert(Number.isSafeInteger(simulations) && simulations > 0, 'GOSTOP_SIMULATIONS must be a positive integer');
  const actions = {}, results = {};
  for (let seed = 1; seed <= simulations; seed++) {
    const random = seeded(seed), g = E.create(random);
    assertState(g);
    let moves = 0;
    try {
      while (g.phase !== 'end') {
        assert(++moves < 160, 'the game did not finish within its bounded action budget');
        const action = actionFor(g, random);
        step(g, action);
        actions[action.type] = (actions[action.type] || 0) + 1;
      }
    } catch (error) {
      error.message = `seed ${seed}, move ${moves}, phase ${g.phase}: ${error.message}`;
      throw error;
    }
    const result = g.result?.reason || (g.winner === null ? 'draw' : 'score');
    results[result] = (results[result] || 0) + 1;
  }
  if (simulations >= 1000) {
    for (const kind of ['play', 'choose', 'decision', 'gukjin', 'shake', 'bomb', 'pass']) {
      assert(actions[kind] > 0, `the seeded run must exercise ${kind}`);
    }
  }
  t.diagnostic(JSON.stringify({simulations, actions, results}));
});

function legacyShape(g, version) {
  // These are compatibility shapes generated from valid current states, not a
  // claim to execute a bundled historical rules engine. The public repository
  // intentionally needs no deployment/backend checkout to run this suite.
  const old = JSON.parse(JSON.stringify(g));
  old.rulesVersion = version;
  delete old.threePpeok;
  delete old.decisionTiming;
  for (const p of old.players) {
    delete p.shakenCards;
    delete p.ppeokCount;
  }
  if (old.turnContext) {
    delete old.turnContext.finalTurn;
    delete old.turnContext.gukjinWasOwned;
    delete old.turnContext.gukjinTransferred;
    if (version === 2) {
      delete old.turnContext.played;
      delete old.turnContext.drawn;
      delete old.turnContext.captures;
    }
  }
  if (version === 2) delete old.lastTurns;
  return old;
}

test('v2/v3 compatibility shapes continue through play, both pair choices and decisions', t => {
  const snapshots = new Map(['play', 'choose:hand', 'choose:draw', 'decision'].map(key => [key, []]));
  for (let seed = 1; seed <= 500 && [...snapshots.values()].some(list => list.length < 4); seed++) {
    const random = seeded(seed), g = E.create(random);
    let moves = 0;
    while (g.phase !== 'end' && ++moves < 100) {
      const phase = g.phase + (g.pending ? ':' + g.pending.source : '');
      const list = snapshots.get(phase);
      if (list && list.length < 4) list.push(JSON.parse(JSON.stringify(g)));
      // Avoid before-turn gukjin decisions, which were absent in old versions.
      step(g, actionFor(g, random, false));
    }
  }
  let continued = 0;
  for (const [phase, states] of snapshots) {
    assert.equal(states.length, 4, `missing deterministic ${phase} states`);
    for (const version of [2, 3]) for (let index = 0; index < states.length; index++) {
      const g = legacyShape(states[index], version), random = seeded(version * 1000 + index);
      assertState(g);
      let moves = 0;
      try {
        while (g.phase !== 'end') {
          assert(++moves < 100, 'a migrated game must finish');
          step(g, actionFor(g, random, false));
          assert.equal(g.rulesVersion, 4);
          assert.equal(g.threePpeok, false, 'missing historical ppeok counts must not cause an invented three-ppeok win');
        }
      } catch (error) {
        error.message = `v${version} ${phase} fixture ${index}, move ${moves}: ${error.message}`;
        throw error;
      }
      continued++;
    }
  }
  t.diagnostic(`${continued} compatibility states continued to completion`);
});
