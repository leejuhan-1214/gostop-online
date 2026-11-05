const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),cards=E.cards();

// Every fixture assigns all 48 distinct physical cards to exactly one location.
function fixture({hand=[16],otherHand=[20],floor=[24],draw=28,won=[],otherWon=[],gukjinPi=false,otherGukjinPi=false,passes=0,phase='play'}={}){
  const assigned=[...hand,...otherHand,...floor,...won,...otherWon,draw];
  assert.equal(new Set(assigned).size,assigned.length,'Fixture repeats a card');
  const used=new Set(assigned),g=E.create();
  g.hands=[hand.map(id=>cards[id]),otherHand.map(id=>cards[id])];
  g.floor=floor.map(id=>cards[id]);g.deck=[cards[draw],...cards.filter(c=>!used.has(c.id))];
  g.players.forEach(p=>Object.assign(p,{won:[],go:0,threshold:7,shaken:[],bombed:[],passes:0,gukjinPi:false,ppeokCount:0}));
  Object.assign(g.players[0],{won:won.map(id=>cards[id]),gukjinPi,passes});
  Object.assign(g.players[1],{won:otherWon.map(id=>cards[id]),gukjinPi:otherGukjinPi});
  Object.assign(g,{turn:0,phase,pending:null,stacks:{},turnContext:null,lastTurns:[],winner:null,result:null});
  assertCards(g);return g;
}
function assertCards(g){
  const locations=[...g.hands[0],...g.hands[1],...g.floor,...g.deck,...g.players[0].won,...g.players[1].won,...(g.pending?.card?[g.pending.card]:[])];
  assert.equal(locations.length,48);assert.equal(new Set(locations.map(c=>c.id)).size,48);
}
const sixPointsWithGukjin=[0,8,28,1,5,9,2,3,6,7,10,11,14,15,32];
const almostSeven=[0,28,1,5,9,2,3,6,7,11,14,15,18,22];

test('a stolen gukjin already used as double-pi remains double-pi for its new owner',()=>{
  const g=fixture({hand:[2,6],otherHand:[8],floor:[12],draw:3,otherWon:[32],otherGukjinPi:true});
  E.act(g,0,{type:'play',id:2});
  assert(g.players[0].won.some(c=>c.id===32));assert.equal(g.players[0].gukjinPi,true);
  assert.equal(E.score(g.players[0]).counts.피,4);assert.equal(E.score(g.players[0]).counts.열,0);
  assert.equal(g.players[1].gukjinPi,false);assertCards(g);
});

test('a stolen gukjin remains pi even when its new owner has four animals',()=>{
  const g=fixture({hand:[2,6],otherHand:[8],floor:[24],draw:3,won:[4,12,16,20],otherWon:[32],otherGukjinPi:true});
  E.act(g,0,{type:'play',id:2});
  assert.equal(g.players[0].gukjinPi,true);assert.equal(E.score(g.players[0]).counts.피,4);
  assert.equal(E.score(g.players[0]).counts.열,4);assertCards(g);
});

test('reaching the threshold on the player\'s final personal turn stops even with stock left for the opponent',()=>{
  const g=fixture({hand:[10],otherHand:[12],floor:[8],draw:4,won:almostSeven});
  E.act(g,0,{type:'play',id:10});
  assert(g.deck.length>0);assert.equal(E.score(g.players[0]).total,7);
  assert.equal(g.phase,'end');assert.equal(g.winner,0);assert(g.result.total>=7);
  const before=JSON.stringify(g);assert.throws(()=>E.act(g,0,{type:'decision',choice:'go'}));assert.equal(JSON.stringify(g),before);assertCards(g);
});

test('bomb replacement passes still provide a future turn for a player with an empty hand',()=>{
  const g=fixture({hand:[10],otherHand:[12],floor:[8],draw:4,won:almostSeven,passes:1});
  E.act(g,0,{type:'play',id:10});
  assert.equal(g.hands[0].length,0);assert.equal(g.players[0].passes,1);assert.equal(g.phase,'decision');
  E.act(g,0,{type:'decision',choice:'go'});assert.equal(g.players[0].go,1);assert.equal(g.phase,'play');assert.equal(g.turn,1);assertCards(g);
});

test('switching gukjin can enter and leave the decision phase without playing an extra card',()=>{
  const g=fixture({hand:[16,17],otherHand:[20],floor:[24],draw:36,won:sixPointsWithGukjin});
  assert.equal(E.score(g.players[0]).total,6);
  E.act(g,0,{type:'gukjin'});assert.equal(E.score(g.players[0]).total,7);assert.equal(g.phase,'decision');assert.equal(g.decisionTiming,'before');
  E.act(g,0,{type:'gukjin'});assert.equal(E.score(g.players[0]).total,6);assert.equal(g.phase,'play');
  assert.deepEqual(g.hands[0].map(c=>c.id),[16,17]);assert.equal(g.turn,0);assertCards(g);
});

test('choosing go after a before-turn gukjin decision still requires the same player to play their turn',()=>{
  const g=fixture({hand:[16,17],otherHand:[20],floor:[24],draw:36,won:sixPointsWithGukjin});
  const deck=g.deck.map(c=>c.id);
  E.act(g,0,{type:'gukjin'});E.act(g,0,{type:'decision',choice:'go'});
  assert.equal(g.phase,'play');assert.equal(g.turn,0);assert.equal(g.players[0].go,1);assert.equal(g.players[0].threshold,8);
  assert.deepEqual(g.hands[0].map(c=>c.id),[16,17]);assert.deepEqual(g.deck.map(c=>c.id),deck);assertCards(g);
});

test('lowering the score during an after-turn decision advances instead of granting another play',()=>{
  const g=fixture({hand:[16,17],otherHand:[20],floor:[24],draw:36,won:sixPointsWithGukjin,gukjinPi:true,phase:'decision'});g.decisionTiming='after';
  E.act(g,0,{type:'gukjin'});
  assert.equal(E.score(g.players[0]).total,6);assert.equal(g.phase,'play');assert.equal(g.turn,1);
  assert.deepEqual(g.hands[0].map(c=>c.id),[16,17]);assertCards(g);
});

test('newly captured gukjin chooses the scoring type before a final-turn win is evaluated',()=>{
  const won=sixPointsWithGukjin.filter(id=>id!==32);
  const g=fixture({hand:[32],otherHand:[20],floor:[33],draw:36,won});
  E.act(g,0,{type:'play',id:32});
  assert.equal(g.players[0].gukjinPi,true);assert.equal(E.score(g.players[0]).total,7);
  assert.equal(g.phase,'end');assert.equal(g.winner,0);assertCards(g);
});

test('newly captured gukjin stays an animal when both classifications score equally',()=>{
  const g=fixture({hand:[32,36],otherHand:[24],floor:[33],draw:28,won:[4,12,16,20,2,3,6,7,10,11,14,15]});
  E.act(g,0,{type:'play',id:32});assert.equal(g.players[0].gukjinPi,false);assert.equal(E.score(g.players[0]).total,1);assertCards(g);
});

test('final-turn automatic gukjin selection preserves a more valuable meongtta settlement',()=>{
  const g=fixture({hand:[32],otherHand:[40],floor:[33],draw:36,
    won:[4,12,16,20,24,29,2,3,6,7,10,11,14,15,18],otherWon:[0]});
  E.act(g,0,{type:'play',id:32});
  assert.equal(g.phase,'end');assert.equal(g.players[0].gukjinPi,false);
  assert.equal(g.result.base,8);assert.equal(g.result.total,16);
  assert(g.result.multipliers.some(m=>m.name==='멍따'));assertCards(g);
});

test('switching gukjin at the threshold with no future hand or pass automatically stops',()=>{
  const g=fixture({hand:[],otherHand:[20],floor:[24],draw:36,won:sixPointsWithGukjin});
  E.act(g,0,{type:'gukjin'});assert.equal(g.phase,'end');assert.equal(g.winner,0);assert.equal(g.result.base,7);assertCards(g);
});

test('shaking requires three held cards and no matching card on the floor',()=>{
  const blocked=fixture({hand:[0,1,2],otherHand:[8],floor:[3],draw:12});
  const before=JSON.stringify(blocked);assert.throws(()=>E.act(blocked,0,{type:'shake',month:1}));assert.equal(JSON.stringify(blocked),before);
  const allowed=fixture({hand:[0,1,2],otherHand:[8],floor:[4],draw:12});
  E.act(allowed,0,{type:'shake',month:1});assert.deepEqual(allowed.players[0].shaken,[1]);assert.equal(allowed.phase,'play');assertCards(allowed);
});

test('the third ppeok immediately wins seven points while the three physical cards remain stacked',()=>{
  const g=fixture({hand:[10,16],otherHand:[20],floor:[8,24],draw:9});g.players[0].ppeokCount=2;
  E.act(g,0,{type:'play',id:10});
  assert.equal(g.players[0].ppeokCount,3);assert.equal(g.phase,'end');assert.equal(g.winner,0);assert.equal(g.result.total,7);
  assert.deepEqual(g.floor.filter(c=>c.month===3).map(c=>c.id).sort((a,b)=>a-b),[8,9,10]);assertCards(g);
});

test('the chosen score profile adds every go and exempts an opponent with zero pi from pibak',()=>{
  const won=[0,8,28,1,5,9,2,3,6,7,10,11,14,15,41];
  const g=fixture({hand:[16],otherHand:[20],floor:[24],draw:36,won,otherWon:[40],phase:'decision'});g.players[0].go=3;
  E.act(g,0,{type:'decision',choice:'stop'});
  assert.equal(g.result.base,7);assert.equal(g.result.goBonus,3);assert.equal(g.result.total,20);
  assert(!g.result.multipliers.some(m=>m.name==='피박'));assertCards(g);
});
