(function(root){
'use strict';
const MONTHS=['송학','매화','벚꽃','흑싸리','난초','모란','홍싸리','공산','국화','단풍','오동','비'];
const TYPES=[['광','띠','피','피'],['열','띠','피','피'],['광','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['광','열','피','피'],['열','띠','피','피'],['열','띠','피','피'],['광','피','피','피'],['광','열','띠','피']];
const DOUBLE_PI=new Set([41,47]);
const cards=()=>TYPES.flatMap((ts,m)=>ts.map((type,i)=>({id:m*4+i,month:m+1,name:MONTHS[m],type})));
function shuffle(a,rng=Math.random){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const piValue=c=>c.type==='피'?(DOUBLE_PI.has(c.id)?2:1):0;
function score(p){
  const counts={광:0,열:0,띠:0,피:0},ids=new Set(p.won.map(c=>c.id));
  for(const c of p.won){if(c.id===32&&p.gukjinPi)counts.피+=2;else if(c.type==='피')counts.피+=piValue(c);else counts[c.type]++;}
  const parts=[];const add=(name,n)=>{if(n>0)parts.push({name,points:n});};
  add('광',counts.광===3?(ids.has(44)?2:3):counts.광===4?4:counts.광>=5?15:0);
  add('열끗',Math.max(0,counts.열-4));add('띠',Math.max(0,counts.띠-4));add('피',Math.max(0,counts.피-9));
  for(const [name,set,points] of [['고도리',[4,12,29],5],['홍단',[1,5,9],3],['청단',[21,33,37],3],['초단',[13,17,25],3]])if(set.every(id=>ids.has(id)))add(name,points);
  return {total:parts.reduce((n,x)=>n+x.points,0),counts,parts};
}
function create(rng=Math.random){
  let deck,hands,floor;
  for(let attempts=0;attempts<100;attempts++){
    deck=shuffle(cards(),rng);hands=[deck.splice(0,10),deck.splice(0,10)];floor=deck.splice(0,8);
    if(![...hands,floor].some(zone=>MONTHS.some((_,i)=>zone.filter(c=>c.month===i+1).length===4)))break;
  }
  const stacks={};for(let m=1;m<=12;m++)if(floor.filter(c=>c.month===m).length===3)stacks[m]=null;
  return {rulesVersion:2,hands,floor,deck,players:[{won:[],go:0,threshold:7,shaken:[],bombed:[],passes:0,gukjinPi:false},{won:[],go:0,threshold:7,shaken:[],bombed:[],passes:0,gukjinPi:false}],turn:0,phase:'play',pending:null,stacks,turnContext:null,log:'방장이 먼저 시작합니다.',winner:null,result:null};
}
function stackEvent(g,month){const owner=g.stacks[month];delete g.stacks[month];g.turnContext.events.push({name:owner===g.turn?'자뻑':'뻑 먹기',steal:owner===g.turn?2:1,stack:true});}
function capture(g,c,ids){
  if(ids.length===3)stackEvent(g,c.month);
  const taken=[];for(const id of ids){const i=g.floor.findIndex(x=>x.id===id);if(i<0)throw Error('바닥패를 찾을 수 없습니다.');taken.push(g.floor.splice(i,1)[0]);}
  g.players[g.turn].won.push(c,...taken);g.turnContext.captured+=1+ids.length;
}
function stealPi(g,amount){
  const opponent=g.players[1-g.turn],receiver=g.players[g.turn],other=opponent.won,mine=receiver.won;let stolen=0;
  while(amount>0){let i=other.findIndex(c=>c.type==='피'&&piValue(c)===1);if(i<0)i=other.findIndex(c=>c.type==='피'||(c.id===32&&opponent.gukjinPi));if(i<0)break;const c=other.splice(i,1)[0],value=c.id===32?2:piValue(c);if(c.id===32){opponent.gukjinPi=false;receiver.gukjinPi=false;}mine.push(c);stolen++;amount-=value;}
  return stolen;
}
function finishTurn(g){
  const ctx=g.turnContext,last=g.deck.length===0;
  if(!last&&ctx.captured&&g.floor.length===0)ctx.events.push({name:'싹쓸이',steal:1});
  for(const event of ctx.events){if(!last||event.stack)event.stolen=stealPi(g,event.steal);}
  const eventText=ctx.events.map(e=>e.name+(e.stolen?` · 피 ${e.stolen}장 가져옴`:''));
  g.log=eventText.length?eventText.join(' / '):ctx.log||'차례를 마쳤습니다.';g.turnContext=null;
  const p=g.players[g.turn],s=score(p).total;if(s>=p.threshold){g.phase='decision';g.log+=` · ${s}점! 고 또는 스톱을 선택하세요.`;return;}advance(g);
}
function advance(g){
  g.pending=null;if(!g.deck.length){g.phase='end';g.winner=null;g.result=null;g.log='나가리! 패를 모두 썼지만 스톱한 사람이 없습니다.';return;}
  g.turn=1-g.turn;g.phase='play';if(!g.log)g.log='차례가 넘어갑니다.';
}
function drawCard(g,draw,playedWasUnmatched=false){
  if(!draw){finishTurn(g);return;}
  const matches=g.floor.filter(x=>x.month===draw.month);
  if(matches.length===0){g.floor.push(draw);finishTurn(g);return;}
  if(matches.length===2){g.phase='choose';g.pending={card:draw,source:'draw',options:matches.map(x=>x.id)};return;}
  capture(g,draw,matches.map(x=>x.id));
  if(playedWasUnmatched)g.turnContext.events.push({name:'쪽',steal:1});
  finishTurn(g);
}
function afterHand(g,c,selectedId){
  const matches=g.floor.filter(x=>x.month===c.month),draw=g.deck.shift()||null;
  if(matches.length===3){capture(g,c,matches.map(x=>x.id));drawCard(g,draw);return;}
  if(matches.length===2&&draw&&draw.month===c.month){capture(g,c,matches.map(x=>x.id));g.players[g.turn].won.push(draw);g.turnContext.captured++;g.turnContext.events.push({name:'따닥',steal:1});finishTurn(g);return;}
  if(matches.length===1&&draw&&draw.month===c.month){g.floor.push(c,draw);g.stacks[c.month]=g.turn;g.turnContext.events.push({name:'뻑! 세 장이 바닥에 쌓였습니다',steal:0});finishTurn(g);return;}
  if(matches.length){const target=matches.length===1?matches[0].id:selectedId;if(!matches.some(x=>x.id===target))throw Error('짝지을 바닥패를 선택하세요.');capture(g,c,[target]);drawCard(g,draw);return;}
  g.floor.push(c);drawCard(g,draw,!!draw&&draw.month===c.month);
}
function resultFor(g,seat){
  const winner=g.players[seat],loser=g.players[1-seat],a=score(winner),b=score(loser),multipliers=[];
  const bonus=winner.go===1?1:winner.go===2?2:0;if(winner.go>=3)multipliers.push({name:`${winner.go}고`,factor:2**(winner.go-2)});
  for(const month of new Set([...winner.shaken,...winner.bombed]))multipliers.push({name:`${month}월 흔들기·폭탄`,factor:2});
  if(a.counts.광>=3&&b.counts.광===0)multipliers.push({name:'광박',factor:2});
  if(a.counts.피>=10&&b.counts.피>=1&&b.counts.피<=7)multipliers.push({name:'피박',factor:2});
  if(a.counts.열>=7)multipliers.push({name:'멍따',factor:2});
  if(loser.go>0)multipliers.push({name:'고박',factor:2});
  return {base:a.total,goBonus:bonus,multipliers,total:(a.total+bonus)*multipliers.reduce((n,x)=>n*x.factor,1)};
}
function act(g,seat,a){
  if(!g||g.phase==='end'||seat!==g.turn||!a||typeof a.type!=='string')throw Error('지금은 행동할 수 없습니다.');
  if(a.type==='gukjin'&&g.phase==='play'){
    const p=g.players[seat];if(!p.won.some(c=>c.id===32))throw Error('가져온 국진이 없습니다.');p.gukjinPi=!p.gukjinPi;g.log=`국진을 ${p.gukjinPi?'쌍피':'열끗'}로 사용합니다.`;return;
  }
  if(a.type==='shake'&&g.phase==='play'){
    const p=g.players[seat],month=a.month;if(!Number.isInteger(month)||g.hands[seat].filter(c=>c.month===month).length!==3||p.shaken.includes(month)||p.bombed.includes(month))throw Error('흔들 수 있는 패가 아닙니다.');p.shaken.push(month);g.log=`${month}월 흔들기! 같은 달 세 장을 공개했습니다.`;return;
  }
  if(a.type==='bomb'&&g.phase==='play'){
    const p=g.players[seat],month=a.month,held=g.hands[seat].filter(c=>c.month===month),matches=g.floor.filter(c=>c.month===month);if(!Number.isInteger(month)||held.length!==3||matches.length!==1)throw Error('폭탄을 낼 수 없습니다.');
    g.hands[seat]=g.hands[seat].filter(c=>c.month!==month);p.bombed.push(month);p.passes+=2;g.turnContext={captured:0,events:[{name:'폭탄',steal:1}],log:'폭탄!'};capture(g,held[0],[matches[0].id]);p.won.push(held[1],held[2]);g.turnContext.captured+=2;drawCard(g,g.deck.shift()||null);return;
  }
  if(a.type==='pass'&&g.phase==='play'){
    const p=g.players[seat];if(p.passes<1)throw Error('뒤집기 기회가 없습니다.');p.passes--;g.turnContext={captured:0,events:[],log:'폭탄 뒤집기'};drawCard(g,g.deck.shift()||null);return;
  }
  if(a.type==='play'&&g.phase==='play'){
    const i=g.hands[seat].findIndex(c=>c.id===a.id);if(i<0)throw Error('손패를 찾을 수 없습니다.');const c=g.hands[seat].splice(i,1)[0];g.turnContext={captured:0,events:[],log:`${c.month}월 ${c.name} 패를 냈습니다.`};
    const matches=g.floor.filter(x=>x.month===c.month);if(matches.length===2){g.phase='choose';g.pending={card:c,source:'hand',options:matches.map(x=>x.id)};return;}afterHand(g,c);return;
  }
  if(a.type==='choose'&&g.phase==='choose'){
    if(!g.pending.options.includes(a.id))throw Error('바닥패를 선택해 주세요.');const p=g.pending;g.pending=null;
    if(p.source==='hand')afterHand(g,p.card,a.id);else{capture(g,p.card,[a.id]);finishTurn(g);}return;
  }
  if(a.type==='decision'&&g.phase==='decision'&&['go','stop'].includes(a.choice)){
    if(a.choice==='stop'){g.phase='end';g.winner=seat;g.result=resultFor(g,seat);g.log=`스톱! 최종 ${g.result.total}점으로 승리했습니다.`;}else{const p=g.players[seat];p.go++;p.threshold=score(p).total+1;g.log=`${p.go}고! 게임을 계속합니다.`;advance(g);}return;
  }
  throw Error('올바르지 않은 행동입니다.');
}
function view(g,seat){return {hand:g.hands[seat],otherHandCount:g.hands[1-seat].length,floor:g.floor,stacks:g.stacks,deckCount:g.deck.length,players:g.players.map(p=>({won:p.won,go:p.go,score:score(p),shaken:p.shaken,bombed:p.bombed,passes:p.passes,gukjinPi:p.gukjinPi})),turn:g.turn,phase:g.phase,pending:g.pending,log:g.log,winner:g.winner,result:g.result};}
const api={cards,shuffle,score,create,act,view,piValue};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoStop=api;
})(typeof window!=='undefined'?window:globalThis);
