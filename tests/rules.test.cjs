const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const E=require('../engine.js'),all=E.cards(),pick=id=>all[id];
function fixture({played,floor,draw,otherWon=[]}){
  const reserved=new Set([played,...floor,draw,...otherWon]);const available=all.filter(c=>!reserved.has(c.id));const extra=available.shift(),opponent=available.shift();
  const g=E.create();g.hands=[[pick(played),extra],[opponent]];g.floor=floor.map(pick);g.deck=[pick(draw),...available];
  g.players.forEach(p=>{p.won=[];p.go=0;p.threshold=7;p.shaken=[];p.bombed=[];p.passes=0;p.gukjinPi=false;});g.players[1].won=otherWon.map(pick);g.turn=0;g.phase='play';g.pending=null;g.stacks={};g.turnContext=null;g.lastTurns=[];g.winner=null;g.result=null;return g;
}
test('48 physical cards match the independently documented month, type and unmodified SVG',()=>{
  const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/cards/verification.json'),'utf8'));assert.equal(all.length,48);assert.equal(new Set(all.map(c=>c.id)).size,48);
  const words={광:'Hikari',열:'Tane',띠:'Tanzaku',피:'Kasu'};
  for(const c of all){const id=`m${String(c.month).padStart(2,'0')}-${String(c.id%4+1).padStart(2,'0')}`,entry=metadata.assets.find(x=>x.cardId===id);assert(entry,id);assert(entry.title.includes(words[c.type]),id);const bytes=fs.readFileSync(path.join(__dirname,`../assets/cards/${id}.svg`));assert.equal(crypto.createHash('sha1').update(bytes).digest('hex'),entry.sha1,id);}
  assert.equal(pick(10).month,3);assert.equal(pick(10).type,'피');assert.equal(pick(8).type,'광');assert.equal(pick(12).name,'흑싸리');assert.match(pick(24).name,/적싸리/);
});
test('every month and hand-card type captures a field card only if its month is equal',()=>{
  for(let month=1;month<=12;month++)for(let fieldMonth=1;fieldMonth<=12;fieldMonth++)for(let slot=0;slot<4;slot++){
    const played=(month-1)*4+slot,target=(fieldMonth-1)*4+(month===fieldMonth?(slot+1)%4:0);const rest=[...Array(12)].map((_,i)=>i+1).filter(n=>n!==month&&n!==fieldMonth);const draw=(rest[0]-1)*4,filler=(rest[1]-1)*4;
    const g=fixture({played,floor:[target,filler],draw});E.act(g,0,{type:'play',id:played});const got=new Set(g.players[0].won.map(c=>c.id));
    assert.equal(got.has(played),month===fieldMonth,`hand ${played} floor ${target}`);assert.equal(got.has(target),month===fieldMonth,`hand ${played} floor ${target}`);assert(!got.has(draw));
    for(const record of g.lastTurns[0].captures)if(record.source!=='bonus')assert.equal(new Set(record.cards.map(c=>c.month)).size,1);
  }
});
test('a cherry pi never changes into a gwang; a matching field gwang is separately captured',()=>{
  const g=fixture({played:10,floor:[8,24],draw:12});E.act(g,0,{type:'play',id:10});const got=g.players[0].won;assert.equal(got.find(c=>c.id===10).type,'피');assert.equal(got.find(c=>c.id===8).type,'광');assert.equal(E.score(g.players[0]).counts.광,1);assert.deepEqual(g.lastTurns[0].captures[0].cards.map(c=>c.id),[10,8]);
});
test('a separately flipped April card can capture April while the played March card remains on the field',()=>{
  const g=fixture({played:10,floor:[12,24],draw:13});E.act(g,0,{type:'play',id:10});assert(g.floor.some(c=>c.id===10));assert(g.players[0].won.some(c=>c.id===12));assert(g.players[0].won.some(c=>c.id===13));const t=g.lastTurns[0];assert.equal(t.played[0].id,10);assert.equal(t.drawn.id,13);assert.equal(t.captures[0].source,'draw');assert.deepEqual(t.captures[0].cards.map(c=>c.id),[13,12]);
});
test('selection rejects an unrelated month',()=>{
  const g=fixture({played:10,floor:[8,9,12],draw:16});E.act(g,0,{type:'play',id:10});assert.equal(g.phase,'choose');assert.deepEqual(g.pending.options,[8,9]);assert.throws(()=>E.act(g,0,{type:'choose',id:12}));assert.equal(g.phase,'choose');E.act(g,0,{type:'choose',id:8});assert.deepEqual(g.lastTurns[0].captures[0].cards.map(c=>c.id),[10,8]);
});
test('a ppeok keeps three identities on the field and the fourth captures the stack',()=>{
  const g=fixture({played:10,floor:[8,24],draw:9});const i=g.deck.findIndex(c=>c.id===11);assert(i>=0);g.hands[1].push(g.deck.splice(i,1)[0]);E.act(g,0,{type:'play',id:10});assert.deepEqual(g.floor.filter(c=>c.month===3).map(c=>c.id).sort((a,b)=>a-b),[8,9,10]);assert.equal(g.stacks[3],0);assert.deepEqual(g.lastTurns[0].captures,[]);assert.equal(g.lastTurns[0].played[0].id,10);assert.equal(g.lastTurns[0].drawn.id,9);E.act(g,1,{type:'play',id:11});assert.deepEqual(g.players[1].won.filter(c=>c.month===3).map(c=>c.id).sort((a,b)=>a-b),[8,9,10,11]);
});
test('a fixed sequence eventually exercises total wins with a seven-point result',()=>{
  let found=0;for(let seed=1;seed<=1000&&found<2;seed++){let x=seed;const rng=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/2**32);const g=E.create(rng);if(g.phase==='end'){found++;if(g.winner!==null){assert.equal(g.result.reason,'총통');assert.equal(g.result.total,7);}else assert.equal(g.result,null);}}
  assert(found>0,'No total occurred in seeded deals');
});
test('scoring uses actual bright, bird, ribbon, double-pi and gukjin identities',()=>{
  const score=ids=>E.score({won:ids.map(pick)});
  assert.equal(score([0,8,28]).total,3);assert.equal(score([0,8,44]).total,2);assert.equal(score([0,8,28,40]).total,4);assert.equal(score([0,8,28,40,44]).total,15);
  assert.equal(score([4,12,29]).total,5);assert.equal(score([1,5,9]).total,3);assert.equal(score([21,33,37]).total,3);assert.equal(score([13,17,25]).total,3);
  assert.equal(score([2,3,6,7,10,11,14,15,41]).counts.피,10);assert.equal(E.score({won:[pick(32)],gukjinPi:true}).counts.피,2);
});
test('go bonus and multiplier use the same declared calculation',()=>{
  const g=fixture({played:20,floor:[24],draw:28});g.players[0].won=[0,8,28,1,5,9,2,3,6,7,10,11,14,15,41].map(pick);g.players[1].won=[pick(18)];g.players[0].go=3;g.players[0].shaken=[1];g.players[0].bombed=[1];g.players[1].go=1;g.phase='decision';E.act(g,0,{type:'decision',choice:'stop'});assert.equal(g.result.base,7);assert.equal(g.result.goBonus,3);assert.equal(g.result.total,320);assert.equal(g.result.multipliers.filter(x=>x.name.includes('흔들기')).length,1);
});
test('card identity and category stay unchanged across complete games',()=>{
  for(let run=0;run<500;run++){const g=E.create();let steps=0;while(g.phase!=='end'&&steps++<100){const cards=[...g.hands[0],...g.hands[1],...g.floor,...g.deck,...g.players[0].won,...g.players[1].won,...(g.pending?[g.pending.card]:[])];assert.equal(cards.length,48);assert.equal(new Set(cards.map(c=>c.id)).size,48);for(const c of cards){assert.equal(c.month,pick(c.id).month);assert.equal(c.type,pick(c.id).type);}if(g.phase==='play')E.act(g,g.turn,{type:'play',id:g.hands[g.turn][0].id});else if(g.phase==='choose')E.act(g,g.turn,{type:'choose',id:g.pending.options[0]});else E.act(g,g.turn,{type:'decision',choice:run%2?'stop':'go'});}assert.equal(g.phase,'end');}
});
