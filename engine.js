(function(root){
'use strict';
const MONTHS=['송학','매화','벚꽃','흑싸리','난초','모란','홍싸리(적싸리)','공산','국화','단풍','오동','비'];
const TYPES=[['광','띠','피','피'],['열','띠','피','피'],['광','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['열','띠','피','피'],['광','열','피','피'],['열','띠','피','피'],['열','띠','피','피'],['광','피','피','피'],['광','열','띠','피']];
const DOUBLE_PI=new Set([41,47]);
const cards=()=>TYPES.flatMap((ts,m)=>ts.map((type,i)=>({id:m*4+i,month:m+1,name:MONTHS[m],type})));
const copy=value=>JSON.parse(JSON.stringify(value));
const piValue=c=>c.type==='피'?(DOUBLE_PI.has(c.id)?2:1):0;
const remaining=(g,seat)=>g.hands[seat].length+g.players[seat].passes;
function shuffle(a,rng=Math.random){
  a=a.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function score(p){
  const counts={광:0,열:0,띠:0,피:0},ids=new Set(p.won.map(c=>c.id)),parts=[];
  for(const c of p.won){
    if(c.id===32&&p.gukjinPi)counts.피+=2;
    else if(c.type==='피')counts.피+=piValue(c);
    else counts[c.type]++;
  }
  const add=(name,n)=>{if(n>0)parts.push({name,points:n});};
  add('광',counts.광===3?(ids.has(44)?2:3):counts.광===4?4:counts.광>=5?15:0);
  add('열끗',Math.max(0,counts.열-4));
  add('띠',Math.max(0,counts.띠-4));
  add('피',Math.max(0,counts.피-9));
  for(const [name,set,points] of [['고도리',[4,12,29],5],['홍단',[1,5,9],3],['청단',[21,33,37],3],['초단',[13,17,25],3]]){
    if(set.every(id=>ids.has(id)))add(name,points);
  }
  return {total:parts.reduce((n,x)=>n+x.points,0),counts,parts};
}
function player(){
  return {won:[],go:0,threshold:7,shaken:[],shakenCards:[],bombed:[],passes:0,gukjinPi:false,ppeokCount:0};
}
function create(rng=Math.random){
  let deck,hands,floor,valid=false;
  for(let attempt=0;attempt<100;attempt++){
    deck=shuffle(cards(),rng);hands=[deck.splice(0,10),deck.splice(0,10)];floor=deck.splice(0,8);
    if(!MONTHS.some((_,i)=>floor.filter(c=>c.month===i+1).length===4)){valid=true;break;}
  }
  // A pathological injected RNG must never start an impossible four-card floor.
  if(!valid)throw Error('바닥패를 나눌 수 없습니다. 다시 시작해 주세요.');
  const stacks={};
  for(let m=1;m<=12;m++)if(floor.filter(c=>c.month===m).length===3)stacks[m]=null;
  const g={rulesVersion:4,threePpeok:true,hands,floor,deck,players:[player(),player()],turn:0,phase:'play',
    pending:null,stacks,turnContext:null,decisionTiming:null,lastTurns:[],log:'방장이 먼저 시작합니다.',winner:null,result:null};
  const totals=hands.map(hand=>MONTHS.findIndex((_,i)=>hand.filter(c=>c.month===i+1).length===4)+1);
  if(totals[0]&&totals[1]){g.phase='end';g.log='양쪽 모두 총통! 무승부입니다.';}
  else if(totals[0]||totals[1]){
    const seat=totals[0]?0:1;specialWin(g,seat,'총통');
    g.log=totals[seat]+'월 총통! 같은 월 네 장으로 7점 승리했습니다.';
  }
  return g;
}
function specialWin(g,seat,reason){
  g.phase='end';g.winner=seat;g.pending=null;g.decisionTiming=null;
  g.result={base:7,goBonus:0,multipliers:[],total:7,reason};
  g.log=reason+'! 7점으로 승리했습니다.';
}
function resultFor(g,seat){
  const winner=g.players[seat],loser=g.players[1-seat],a=score(winner),b=score(loser),multipliers=[];
  if(winner.go>=3)multipliers.push({name:winner.go+'고',factor:2**(winner.go-2)});
  for(const month of new Set([...winner.shaken,...winner.bombed]))multipliers.push({name:month+'월 흔들기·폭탄',factor:2});
  if(a.counts.광>=3&&b.counts.광===0)multipliers.push({name:'광박',factor:2});
  if(a.counts.피>=10&&b.counts.피>=1&&b.counts.피<=7)multipliers.push({name:'피박',factor:2});
  if(a.counts.열>=7)multipliers.push({name:'멍따',factor:2});
  if(loser.go>0)multipliers.push({name:'고박',factor:2});
  return {base:a.total,goBonus:winner.go,multipliers,
    total:(a.total+winner.go)*multipliers.reduce((n,x)=>n*x.factor,1)};
}
function stop(g,automatic=false){
  g.phase='end';g.winner=g.turn;g.result=resultFor(g,g.turn);g.pending=null;g.decisionTiming=null;
  g.log=(automatic?'마지막 차례 자동 스톱! ':'스톱! ')+'최종 '+g.result.total+'점으로 승리했습니다.';
}
function advance(g){
  g.pending=null;g.decisionTiming=null;
  if(!g.deck.length||(!remaining(g,0)&&!remaining(g,1))){
    g.phase='end';g.winner=null;g.result=null;g.log='나가리! 추가 점수 없이 모든 차례가 끝났습니다.';return;
  }
  g.turn=1-g.turn;g.phase='play';
}
function beginTurn(g,played,log){
  g.pending=null;g.decisionTiming=null;
  g.turnContext={played,drawn:null,captures:[],captured:0,events:[],log,
    finalTurn:remaining(g,g.turn)===0,gukjinWasOwned:g.players[g.turn].won.some(c=>c.id===32)};
}
function event(g,name,steal=0,stack=false){
  g.turnContext.events.push({name,steal,stack});
}
function capture(g,c,ids,source){
  const taken=ids.map(id=>g.floor.find(x=>x.id===id));
  if(!ids.length||new Set(ids).size!==ids.length||taken.some(x=>!x||x.month!==c.month))throw Error('같은 월의 바닥패만 가져올 수 있습니다.');
  if(ids.length===3){
    const owner=g.stacks[c.month];
    delete g.stacks[c.month];
    // An initial triple has owner=null and is not a ppeok made by either player.
    if(owner===0||owner===1)event(g,owner===g.turn?'자뻑':'뻑 먹기',owner===g.turn?2:1,true);
  }
  const removed=new Set(ids);
  g.floor=g.floor.filter(x=>!removed.has(x.id));
  g.players[g.turn].won.push(c,...taken);
  g.turnContext.captured+=1+taken.length;
  g.turnContext.captures.push({source,cards:[c,...taken]});
}
function stealPi(g,amount){
  const other=g.players[1-g.turn],mine=g.players[g.turn],taken=[];
  let points=0;
  while(amount>0){
    let i=other.won.findIndex(c=>piValue(c)===1);
    if(i<0)i=other.won.findIndex(c=>piValue(c)===2||(c.id===32&&other.gukjinPi));
    if(i<0)break;
    const c=other.won.splice(i,1)[0],value=c.id===32?2:piValue(c);
    if(c.id===32){other.gukjinPi=false;mine.gukjinPi=true;g.turnContext.gukjinTransferred=true;}
    mine.won.push(c);taken.push(c);points+=value;amount-=value;
  }
  return {cards:taken,points};
}
function checkScore(g,timing){
  if(score(g.players[g.turn]).total<g.players[g.turn].threshold)return false;
  if(!remaining(g,g.turn)||!g.deck.length){stop(g,true);return true;}
  g.phase='decision';g.decisionTiming=timing;
  g.log+=' · '+score(g.players[g.turn]).total+'점! 고 또는 스톱을 선택하세요.';
  return true;
}
function finishTurn(g){
  const ctx=g.turnContext,p=g.players[g.turn];
  if(!ctx.finalTurn&&ctx.captured&&g.floor.length===0)event(g,'싹쓸이',1);
  for(const item of ctx.events){
    if(item.steal>0&&(!ctx.finalTurn||item.stack)){
      const transfer=stealPi(g,item.steal);
      item.stolen=transfer.cards.length;item.piPoints=transfer.points;
      if(transfer.cards.length)ctx.captures.push({source:'bonus',cards:transfer.cards});
    }
  }
  // On first acquisition, choose the higher base score. On the final turn,
  // compare eligible settlements as well so a switch cannot lose 멍따.
  if(!ctx.gukjinWasOwned&&!ctx.gukjinTransferred&&p.won.some(c=>c.id===32)){
    const alternative={...p,gukjinPi:!p.gukjinPi};
    const currentScore=score(p).total,alternateScore=score(alternative).total;
    if(ctx.finalTurn&&currentScore>=p.threshold&&alternateScore>=p.threshold){
      const previous=p.gukjinPi,total=resultFor(g,g.turn).total;
      p.gukjinPi=alternative.gukjinPi;
      if(resultFor(g,g.turn).total<=total)p.gukjinPi=previous;
    }else if(alternateScore>currentScore)p.gukjinPi=alternative.gukjinPi;
  }
  const eventText=ctx.events.map(e=>e.name+(e.stolen?' · 피 '+e.piPoints+'개분 ('+e.stolen+'장) 가져옴':''));
  g.log=eventText.length?eventText.join(' / '):ctx.log;
  g.lastTurns=(g.lastTurns||[]).concat({seat:g.turn,played:ctx.played,drawn:ctx.drawn,captures:ctx.captures,
    events:ctx.events.map(e=>e.name),finalTurn:ctx.finalTurn}).slice(-2);
  g.turnContext=null;g.pending=null;
  if(g.threePpeok!==false&&p.ppeokCount>=3){specialWin(g,g.turn,'삼뻑');return;}
  if(!checkScore(g,'after'))advance(g);
}
function resolveDraw(g,draw,unmatchedHand=false){
  if(!draw){finishTurn(g);return;}
  g.turnContext.drawn=draw;
  const matches=g.floor.filter(c=>c.month===draw.month);
  if(!matches.length){g.floor.push(draw);finishTurn(g);return;}
  if(matches.length===2){
    g.phase='choose';g.pending={source:'draw',card:draw,options:matches.map(c=>c.id)};return;
  }
  capture(g,draw,matches.map(c=>c.id),'draw');
  if(unmatchedHand&&!g.turnContext.finalTurn)event(g,'쪽',1);
  finishTurn(g);
}
function resolveHand(g,c,selectedId){
  const matches=g.floor.filter(x=>x.month===c.month);
  if(matches.length===2&&!matches.some(x=>x.id===selectedId))throw Error('짝지을 바닥패를 선택하세요.');
  const draw=g.deck.shift()||null,ctx=g.turnContext;
  ctx.drawn=draw;
  if(matches.length===3){
    capture(g,c,matches.map(x=>x.id),'hand');resolveDraw(g,draw);return;
  }
  if(matches.length===2&&draw&&draw.month===c.month){
    // Resolve the chosen hand pair and the flipped pair separately.
    capture(g,c,[selectedId],'hand');
    capture(g,draw,[matches.find(x=>x.id!==selectedId).id],'draw');
    if(!ctx.finalTurn)event(g,'따닥',1);
    finishTurn(g);return;
  }
  if(matches.length===1&&draw&&draw.month===c.month&&!ctx.finalTurn){
    g.floor.push(c,draw);g.stacks[c.month]=g.turn;g.players[g.turn].ppeokCount++;
    event(g,'뻑! '+c.month+'월 세 장이 바닥에 쌓였습니다');
    finishTurn(g);return;
  }
  if(matches.length){
    capture(g,c,[matches.length===1?matches[0].id:selectedId],'hand');
    resolveDraw(g,draw);return;
  }
  g.floor.push(c);
  resolveDraw(g,draw,!!draw&&draw.month===c.month);
}
function normalize(g){
  // Existing v2/v3 rooms keep their cards and pending choices. Historical ppeok
  // counts were not stored, so the new three-ppeok win starts only in new rooms.
  if(g.rulesVersion!==4){g.threePpeok=false;g.rulesVersion=4;}
  for(const p of g.players){
    p.shaken=p.shaken||[];p.shakenCards=p.shakenCards||[];p.bombed=p.bombed||[];
    p.passes=p.passes||0;p.ppeokCount=p.ppeokCount||0;
  }
  g.stacks=g.stacks||{};g.lastTurns=g.lastTurns||[];
  if(g.turnContext){
    const ctx=g.turnContext;
    if(ctx.finalTurn===undefined)ctx.finalTurn=remaining(g,g.turn)===0;
    ctx.played=ctx.played||(g.pending?.source==='hand'?[g.pending.card]:[]);
    if(ctx.drawn===undefined)ctx.drawn=g.pending?.source==='draw'?g.pending.card:null;
    ctx.captures=ctx.captures||[];ctx.events=ctx.events||[];
    if(ctx.gukjinWasOwned===undefined)ctx.gukjinWasOwned=g.players[g.turn].won.some(c=>c.id===32);
  }
}
function applyAction(g,seat,a){
  if(g.phase==='end'||seat!==g.turn||!a||typeof a.type!=='string')throw Error('지금은 행동할 수 없습니다.');
  const p=g.players[seat];
  if(a.type==='gukjin'&&(g.phase==='play'||g.phase==='decision')){
    if(!p.won.some(c=>c.id===32))throw Error('가져온 국진이 없습니다.');
    const decision=g.phase==='decision',timing=g.decisionTiming||'after';
    p.gukjinPi=!p.gukjinPi;g.log='국진을 '+(p.gukjinPi?'쌍피':'열끗')+'로 사용합니다.';
    if(!checkScore(g,decision?timing:'before')&&decision){
      if(timing==='before'){g.phase='play';g.decisionTiming=null;}else advance(g);
    }
    return;
  }
  if(a.type==='shake'&&g.phase==='play'){
    const month=a.month,held=g.hands[seat].filter(c=>c.month===month);
    if(!Number.isInteger(month)||held.length!==3||g.floor.some(c=>c.month===month)||p.shaken.includes(month)||p.bombed.includes(month))throw Error('바닥에 같은 월이 없는 손패 세 장만 흔들 수 있습니다.');
    p.shaken.push(month);p.shakenCards.push(...held);
    g.log=month+'월 흔들기! 같은 월 손패 세 장을 공개했습니다.';return;
  }
  if(a.type==='bomb'&&g.phase==='play'){
    const month=a.month,held=g.hands[seat].filter(c=>c.month===month),matches=g.floor.filter(c=>c.month===month);
    if(!Number.isInteger(month)||held.length!==3||matches.length!==1)throw Error('폭탄을 낼 수 없습니다.');
    g.hands[seat]=g.hands[seat].filter(c=>c.month!==month);p.bombed.push(month);p.passes+=2;
    beginTurn(g,held,'폭탄!');event(g,'폭탄',1);
    capture(g,held[0],[matches[0].id],'hand');p.won.push(held[1],held[2]);
    g.turnContext.captured+=2;g.turnContext.captures[0].cards.push(held[1],held[2]);
    resolveDraw(g,g.deck.shift()||null);return;
  }
  if(a.type==='pass'&&g.phase==='play'){
    if(p.passes<1)throw Error('뒤집기 기회가 없습니다.');
    p.passes--;beginTurn(g,[],'폭탄 뒤집기');resolveDraw(g,g.deck.shift()||null);return;
  }
  if(a.type==='play'&&g.phase==='play'){
    const i=g.hands[seat].findIndex(c=>c.id===a.id);
    if(i<0)throw Error('손패를 찾을 수 없습니다.');
    const c=g.hands[seat].splice(i,1)[0];beginTurn(g,[c],c.month+'월 '+c.name+' 패를 냈습니다.');
    const matches=g.floor.filter(x=>x.month===c.month);
    if(matches.length===2){g.phase='choose';g.pending={source:'hand',card:c,options:matches.map(x=>x.id)};return;}
    resolveHand(g,c);return;
  }
  if(a.type==='choose'&&g.phase==='choose'){
    if(!g.pending||!g.pending.options.includes(a.id))throw Error('선택 가능한 바닥패를 골라 주세요.');
    const pending=g.pending;g.pending=null;
    if(pending.source==='hand')resolveHand(g,pending.card,a.id);
    else{capture(g,pending.card,[a.id],'draw');finishTurn(g);}
    return;
  }
  if(a.type==='decision'&&g.phase==='decision'&&['go','stop'].includes(a.choice)){
    if(a.choice==='stop'||!remaining(g,seat)||!g.deck.length){stop(g,a.choice==='go');return;}
    const timing=g.decisionTiming||'after';
    p.go++;p.threshold=score(p).total+1;g.log=p.go+'고! 게임을 계속합니다.';
    if(timing==='before'){g.phase='play';g.decisionTiming=null;}else advance(g);
    return;
  }
  throw Error('올바르지 않은 행동입니다.');
}
function act(g,seat,a){
  if(!g||![0,1].includes(seat))throw Error('지금은 행동할 수 없습니다.');
  // Validate and resolve on a copy: a rejected choice must not consume a card,
  // reveal stock, change ownership, or partially advance the turn.
  const next=copy(g);normalize(next);applyAction(next,seat,a);
  for(const key of Object.keys(g))delete g[key];
  Object.assign(g,next);
}
function view(g,seat){
  const ctx=g.turnContext;
  return {rulesVersion:g.rulesVersion,ruleRevision:4,threePpeok:g.threePpeok!==false&&g.rulesVersion===4,
    hand:g.hands[seat],otherHandCount:g.hands[1-seat].length,floor:g.floor,stacks:g.stacks,deckCount:g.deck.length,
    players:g.players.map(p=>({won:p.won,go:p.go,score:score(p),shaken:p.shaken,shakenCards:p.shakenCards||[],
      bombed:p.bombed,passes:p.passes,gukjinPi:p.gukjinPi,ppeokCount:p.ppeokCount||0})),
    turn:g.turn,phase:g.phase,pending:g.pending,
    canGo:remaining(g,g.turn)>0&&g.deck.length>0,decisionTiming:g.decisionTiming||null,
    inTurn:ctx?{played:ctx.played||[],drawn:ctx.drawn,captures:ctx.captures||[]}:null,
    lastTurns:g.lastTurns||[],log:g.log,winner:g.winner,result:g.result};
}
function validate(g){
  const locations=[...g.hands.flat(),...g.floor,...g.deck,...g.players.flatMap(p=>p.won),...(g.pending?[g.pending.card]:[])];
  const canonical=cards();
  if(locations.length!==48||new Set(locations.map(c=>c.id)).size!==48)throw Error('48장 보존 오류');
  for(const c of locations)if(!canonical[c.id]||c.month!==canonical[c.id].month||c.type!==canonical[c.id].type)throw Error('패 정체성 오류');
  for(const [month,owner] of Object.entries(g.stacks||{})){
    if(![null,0,1].includes(owner)||g.floor.filter(c=>c.month===Number(month)).length!==3)throw Error('쌓인 패 상태 오류');
  }
  if(g.phase==='choose'&&(!g.pending||g.pending.options.length!==2||g.pending.options.some(id=>!g.floor.some(c=>c.id===id&&c.month===g.pending.card.month))))throw Error('선택 대기 상태 오류');
  return true;
}
const api={cards,shuffle,score,create,act,view,piValue,validate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoStop=api;
})(typeof window!=='undefined'?window:globalThis);
