const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const cards = E.cards();
const card = id => cards[id];
const ids = pile => pile.map(c => c.id).sort((a, b) => a - b);
const monthIds = month => [0, 1, 2, 3].map(slot => (month - 1) * 4 + slot);
const otherMonth = (month, offset = 1) => (month - 1 + offset) % 12 + 1;

// Every fixture contains the 48 physical cards exactly once. The stock length
// also agrees with remaining hand plays plus compensating bomb passes.
function fixture({hand, floor, draw, opponentHand, wonMine = [], wonOther = [], stacks = {}, passes = [0, 0]}) {
  const supplied = [...hand, ...floor, draw, ...wonMine, ...wonOther, ...(opponentHand || [])];
  assert.equal(new Set(supplied).size, supplied.length, 'fixture has duplicate card ids');
  let available = cards.filter(c => !supplied.includes(c.id)).map(c => c.id);
  opponentHand = opponentHand || available.splice(0, hand.length + passes[0] - passes[1]);
  const stockCount = hand.length + opponentHand.length + passes[0] + passes[1];
  assert(stockCount >= 1);
  const deck = [draw, ...available.splice(0, stockCount - 1)];
  assert.equal(deck.length, stockCount);
  const g = E.create(() => 0.5);
  g.hands = [hand.map(card), opponentHand.map(card)];
  g.floor = floor.map(card);
  g.deck = deck.map(card);
  g.players = g.players.map((player, seat) => ({
    ...player, won: (seat ? [...wonOther, ...available] : wonMine).map(card),
    go: 0, threshold: 100, shaken: [], bombed: [], passes: passes[seat], gukjinPi: false
  }));
  Object.assign(g, {turn: 0, phase: 'play', pending: null, stacks: {...stacks}, turnContext: null,
    lastTurns: [], log: '', winner: null, result: null});
  conservation(g);
  return g;
}

function conservation(g) {
  const locations = [...g.hands[0], ...g.hands[1], ...g.floor, ...g.deck,
    ...g.players[0].won, ...g.players[1].won, ...(g.pending ? [g.pending.card] : [])];
  assert.equal(locations.length, 48, 'there must be exactly 48 physical cards, including a pending card');
  assert.deepEqual(ids(locations), cards.map(c => c.id), 'no card is duplicated or lost');
  for (const c of locations) {
    assert.equal(c.month, card(c.id).month);
    assert.equal(c.type, card(c.id).type);
  }
}

function act(g, action) { E.act(g, g.turn, action); conservation(g); }
function lost(before, after) { const remaining = new Set(after.map(c => c.id)); return before.filter(c => !remaining.has(c.id)); }
function play(id) { return {type: 'play', id}; }
function choose(id) { return {type: 'choose', id}; }
function spare(excluded, month) { return cards.find(c => c.month !== month && !excluded.includes(c.id)).id; }

test('all twelve months form a three-card ppeok without capturing or changing any card', () => {
  for (let month = 1; month <= 12; month++) {
    const [held, target, draw] = monthIds(month);
    const sentinel = monthIds(otherMonth(month))[0];
    const extra = spare([held, target, draw, sentinel], month);
    const g = fixture({hand: [held, extra], floor: [target, sentinel], draw});
    const before = JSON.stringify(g.players.map(p => p.won));
    act(g, play(held));
    assert.deepEqual(ids(g.floor.filter(c => c.month === month)), [held, target, draw]);
    assert.equal(g.stacks[month], 0, `month ${month}: ppeok owner`);
    assert.equal(JSON.stringify(g.players.map(p => p.won)), before);
    assert.equal(g.lastTurns[0].played[0].id, held);
    assert.equal(g.lastTurns[0].drawn.id, draw);
  }
});

test('all twelve months and both hand choices resolve ttadak to exactly four cards', () => {
  for (let month = 1; month <= 12; month++) for (const selectedSlot of [1, 2]) {
    const quartet = monthIds(month), [held, first, second, draw] = quartet;
    const sentinel = monthIds(otherMonth(month))[0];
    const g = fixture({hand: [held, spare([...quartet, sentinel], month)], floor: [first, second, sentinel], draw});
    const opponent = [...g.players[1].won];
    act(g, play(held));
    assert.equal(g.phase, 'choose');
    assert.equal(g.pending.source, 'hand');
    assert.deepEqual(ids(g.pending.options.map(card)), [first, second]);
    act(g, choose(quartet[selectedSlot]));
    assert.deepEqual(ids(g.players[0].won.filter(c => c.month === month)), quartet);
    assert(!g.floor.some(c => c.month === month));
    assert(!Object.hasOwn(g.stacks, month));
    assert.equal(lost(opponent, g.players[1].won).length, 1);
  }
});

test('an initial triple is captured whole but is not mistaken for a ppeok reward', () => {
  for (let month = 1; month <= 12; month++) {
    const quartet = monthIds(month), sentinel = monthIds(otherMonth(month))[0], draw = monthIds(otherMonth(month, 2))[0];
    const g = fixture({hand: [quartet[0], spare([...quartet, sentinel, draw], month)],
      floor: [...quartet.slice(1), sentinel], draw, stacks: {[month]: null}});
    const opponent = [...g.players[1].won];
    act(g, play(quartet[0]));
    assert.deepEqual(ids(g.players[0].won.filter(c => c.month === month)), quartet);
    assert.equal(lost(opponent, g.players[1].won).length, 0);
    assert(!Object.hasOwn(g.stacks, month));
  }
});

test('a hand or stock fourth card captures the entire ppeok and awards the correct owner bonus', () => {
  for (let month = 1; month <= 12; month++) for (const owner of [0, 1]) for (const source of ['hand', 'draw']) {
    const quartet = monthIds(month), sentinel = monthIds(otherMonth(month))[0], different = monthIds(otherMonth(month, 2))[0];
    const held = source === 'hand' ? quartet[0] : different;
    const draw = source === 'draw' ? quartet[0] : different;
    const extra = spare([...quartet, sentinel, different], month);
    const g = fixture({hand: [held, extra], floor: [...quartet.slice(1), sentinel], draw, stacks: {[month]: owner}});
    const opponent = [...g.players[1].won];
    act(g, play(held));
    assert.deepEqual(ids(g.players[0].won.filter(c => c.month === month)), quartet);
    assert.equal(lost(opponent, g.players[1].won).length, owner === 0 ? 2 : 1);
    assert(!Object.hasOwn(g.stacks, month));
    assert(!g.floor.some(c => c.month === month));
  }
});

test('two independent choice phases preserve all cards and capture only the selected pairs', () => {
  for (const handChoice of [1, 2]) for (const drawChoice of [5, 6]) {
    const g = fixture({hand: [0, 20], floor: [1, 2, 5, 6, 12], draw: 4});
    act(g, play(0));
    assert.equal(g.pending.source, 'hand');
    assert.equal(g.deck[0].id, 4, 'the stock stays hidden until the hand choice is committed');
    act(g, choose(handChoice));
    assert.equal(g.phase, 'choose');
    assert.equal(g.pending.source, 'draw');
    assert.deepEqual(g.pending.options.slice().sort((a, b) => a - b), [5, 6]);
    act(g, choose(drawChoice));
    assert.deepEqual(ids(g.players[0].won), [0, handChoice, 4, drawChoice].sort((a, b) => a - b));
    assert.deepEqual(ids(g.floor), [handChoice === 1 ? 2 : 1, drawChoice === 5 ? 6 : 5, 12]);
  }
});

test('the first player final hand takes the matched pair instead of creating a new ppeok', () => {
  for (let month = 1; month <= 12; month++) {
    const [held, target, draw] = monthIds(month), sentinel = monthIds(otherMonth(month))[0];
    const g = fixture({hand: [held], floor: [target, sentinel], draw});
    act(g, play(held));
    assert.equal(g.deck.length, 1, 'opponent still has a final turn');
    assert.equal(g.hands[0].length + g.players[0].passes, 0);
    assert.deepEqual(ids(g.players[0].won.filter(c => c.month === month)), [held, target]);
    assert.deepEqual(ids(g.floor.filter(c => c.month === month)), [draw]);
    assert(!Object.hasOwn(g.stacks, month));
  }
});

test('the personal final turn excludes jjok, ttadak and sweep steals even with stock left', () => {
  const scenarios = [
    {name: 'jjok', hand: [0], floor: [8], draw: 1},
    {name: 'ttadak', hand: [0], floor: [1, 2, 8], draw: 3, select: 1},
    {name: 'sweep', hand: [0], floor: [1, 4], draw: 5}
  ];
  for (const scenario of scenarios) {
    const g = fixture(scenario), opponent = [...g.players[1].won];
    act(g, play(scenario.hand[0]));
    if (scenario.select !== undefined) act(g, choose(scenario.select));
    assert.equal(g.deck.length, 1, scenario.name);
    assert.equal(lost(opponent, g.players[1].won).length, 0, scenario.name);
  }
});

test('a final-turn ppeok capture still transfers pi, but receives no extra sweep reward', () => {
  for (const owner of [0, 1]) {
    const g = fixture({hand: [0], floor: [1, 2, 3, 4], draw: 5, stacks: {1: owner}});
    const opponent = [...g.players[1].won];
    act(g, play(0));
    assert.equal(g.deck.length, 1);
    assert.equal(g.floor.length, 0);
    assert.equal(lost(opponent, g.players[1].won).length, owner === 0 ? 2 : 1);
    assert.deepEqual(ids(g.players[0].won.filter(c => c.month === 1)), [0, 1, 2, 3]);
  }
});

test('remaining bomb passes mean the last physical hand card is not the final turn', () => {
  const g = fixture({hand: [0], floor: [1, 8], draw: 2, passes: [1, 0]});
  act(g, play(0));
  assert.equal(g.hands[0].length, 0);
  assert.equal(g.players[0].passes, 1);
  assert.equal(g.stacks[1], 0);
  assert.deepEqual(ids(g.floor.filter(c => c.month === 1)), [0, 1, 2]);
});

test('a three-card bomb creates exactly two passes without losing physical cards', () => {
  const g = fixture({hand: [0, 1, 2, 20], floor: [3, 12], draw: 4});
  const turnsBefore = g.hands[0].length + g.players[0].passes;
  act(g, {type: 'bomb', month: 1});
  assert.deepEqual(ids(g.hands[0]), [20]);
  assert.equal(g.players[0].passes, 2);
  assert.equal(g.hands[0].length + g.players[0].passes, turnsBefore - 1);
  assert.deepEqual(ids(g.players[0].won.filter(c => c.month === 1)), [0, 1, 2, 3]);
  assert.equal(g.deck.length, g.hands.flat().length + g.players.reduce((n, p) => n + p.passes, 0));
});

test('hand and stock can collect two different ppeok stacks in one turn without losing either reward', () => {
  const g = fixture({hand: [0, 20], floor: [1, 2, 3, 5, 6, 7, 12], draw: 4, stacks: {1: 0, 2: 1}});
  const opponent = [...g.players[1].won];
  act(g, play(0));
  assert.deepEqual(ids(g.players[0].won.filter(c => c.month <= 2)), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(lost(opponent, g.players[1].won).length, 3);
  assert.deepEqual(g.stacks, {});
});

test('invalid actions leave every card, pending choice and turn field untouched', () => {
  const g = fixture({hand: [0, 20], floor: [1, 2, 5, 6, 12], draw: 4});
  const rejects = (seat, action) => {
    const before = JSON.stringify(g);
    assert.throws(() => E.act(g, seat, action));
    assert.equal(JSON.stringify(g), before);
    conservation(g);
  };
  rejects(1, play(0));
  rejects(0, play(47));
  rejects(0, {type: 'bomb', month: 1});
  rejects(0, {type: 'pass'});
  rejects(0, {type: 'decision', choice: 'stop'});
  act(g, play(0));
  rejects(0, choose(12));
  rejects(0, play(20));
  rejects(0, {type: 'shake', month: 1});
  act(g, choose(1));
  rejects(0, choose(2));
  rejects(1, choose(5));
  act(g, choose(5));
});
