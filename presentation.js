(()=>{'use strict';
const MONTHS=['송학','매화','벚꽃','흑싸리','난초','모란','적싸리','공산','국화','단풍','오동','비'];
const PLAYBACK_TIME_SCALE=2.5;
const format=value=>Number.isFinite(value)?new Intl.NumberFormat('ko-KR').format(value):'—';
let ui=null,epoch=0,resultData=null,resultKey='',rematchState={},rematchHandler=null,leaveHandler=null,rematchPending=false,leavePending=false;
const waits=new Map(),shownResults=new Set();
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function id(el,value){el.id=value;return el;}
function button(className,text,handler){const el=node('button',className,text);el.type='button';el.onclick=handler;return el;}
function ensure(){
  if(ui)return ui;
  const stage=id(node('section','fp-stage'),'fp-stage');stage.hidden=true;stage.setAttribute('role','status');stage.setAttribute('aria-live','polite');stage.setAttribute('aria-atomic','true');
  const stageKicker=node('div','fp-stage-kicker'),stageTitle=node('h2','fp-stage-title'),stageBody=node('div','fp-stage-body'),stageNote=node('div','fp-stage-note');
  stage.append(stageKicker,stageTitle,stageBody,stageNote);
  const result=id(node('dialog','fp-result'),'fp-result');result.setAttribute('aria-labelledby','fp-result-heading');result.setAttribute('aria-describedby','fp-result-summary');
  const content=node('div','fp-result-content'),resultKicker=node('div','fp-result-kicker'),heading=id(node('h2','fp-result-heading'),'fp-result-heading'),summary=id(node('p','fp-result-summary'),'fp-result-summary');
  const scoreBlock=node('div','fp-result-score-block'),scoreLabel=node('span','fp-result-label','최종 정산 점수'),score=id(node('strong','fp-result-score'),'fp-result-score');scoreBlock.append(scoreLabel,score);
  const delta=id(node('div','fp-result-delta'),'fp-result-delta'),details=node('p','fp-result-details'),players=node('div','fp-result-players'),rematchNote=id(node('p','fp-rematch-note'),'fp-rematch-note');rematchNote.setAttribute('role','status');
  const actions=node('div','fp-result-actions'),rematch=id(button('fp-result-primary','한 판 더',requestRematch),'fp-rematch'),leave=id(button('fp-result-secondary','로비로',requestLeave),'fp-result-leave');
  const close=id(button('fp-result-close','패 다시 보기',hideResult),'fp-result-close');
  actions.append(rematch,leave);content.append(resultKicker,heading,summary,scoreBlock,delta,details,players,rematchNote,actions,close);result.append(content);document.body.append(stage,result);
  ui={stage,stageKicker,stageTitle,stageBody,stageNote,result,resultKicker,heading,summary,score,delta,details,players,rematchNote,rematch,leave};return ui;
}
function nickname(profiles,seat,self){return profiles?.[seat]?.nickname||(seat===self?'나':'상대');}
function normalizeCard(card){if(Number.isInteger(card))card={id:card,month:Math.floor(card/4)+1};return card&&Number.isInteger(card.id)&&card.id>=0&&card.id<48?{...card,month:Math.floor(card.id/4)+1}:null;}
function cardNode(card,{back=false}={}){
  if(back){const el=node('div','fp-card fp-card-back','花');el.setAttribute('aria-label','뒤집기 전 패');return el;}
  const value=normalizeCard(card);if(!value)return null;
  const figure=node('figure','fp-card'),img=node('img');img.src=`assets/cards/m${String(value.month).padStart(2,'0')}-${String(value.id%4+1).padStart(2,'0')}.svg`;img.alt=`${value.month}월 ${MONTHS[value.month-1]}${value.type?' '+value.type:''}`;img.draggable=false;
  figure.append(img,node('figcaption','fp-card-month',`${value.month}월`));return figure;
}
function cardsInto(target,cards){const nodes=(cards||[]).map(card=>cardNode(card)).filter(Boolean);target.replaceChildren(...nodes);if(!nodes.length)target.append(node('span','fp-card-empty','없음'));}
function reducedMotion(){return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;}
function wait(ms,run){
  if(run!==epoch)return Promise.resolve(false);
  const duration=(reducedMotion()?Math.min(ms,200):ms)*PLAYBACK_TIME_SCALE;
  return new Promise(resolve=>{const timer=setTimeout(()=>{waits.delete(timer);resolve(run===epoch);},duration);waits.set(timer,resolve);});
}
function stopStage(){epoch++;for(const [timer,resolve] of waits){clearTimeout(timer);resolve(false);}waits.clear();if(ui)ui.stage.hidden=true;}
function cancel(){stopStage();hideResult();rematchPending=false;leavePending=false;}
function hideResult(){if(ui?.result.open)ui.result.close();}
function finalScore(data){return Number.isFinite(data.settlement?.score)?data.settlement.score:Number.isFinite(data.view?.result?.total)?data.view.result.total:data.view?.winner===null?0:null;}
function scoreDetails(view){
  const r=view?.result;if(!r)return '최종 점수에 따라 정산됩니다.';
  return [`기본 ${format(r.base)}점`,r.goBonus?`고 보너스 +${format(r.goBonus)}점`:'',...(r.multipliers||[]).map(item=>`${item.name} ×${format(item.factor)}`)].filter(Boolean).join(' · ');
}
function renderResult(data){
  const e=ensure(),winner=data.view?.winner,self=data.seat,outcome=winner===null?'draw':winner===self?'win':'loss';
  e.result.setAttribute('data-outcome',outcome);
  e.resultKicker.textContent=outcome==='win'?'WIN':outcome==='loss'?'LOSS':'DRAW';
  e.heading.textContent=outcome==='win'?'승리!':outcome==='loss'?'패배':'무승부';
  e.summary.textContent=winner===null?'이번 판은 비겼어요.':`${nickname(data.profiles,winner,self)}의 승리${data.settlement?.reason==='forfeit'?' · 기권으로 종료':''}`;
  e.score.textContent=`${format(finalScore(data))}점`;
  const delta=data.settlement?.delta;e.delta.textContent=Number.isFinite(delta)?`${delta>0?'+':''}${format(delta)}코인`:'코인 정산 확인 중';
  e.delta.setAttribute('data-sign',delta>0?'positive':delta<0?'negative':'neutral');
  e.details.textContent=scoreDetails(data.view);
  const total=finalScore(data),mode=data.rematch?.mode||data.settlement?.mode;
  if(mode==='bot'&&outcome==='win'&&Number.isFinite(delta)&&Number.isFinite(total))e.details.textContent+=` · 봇 승리 보상 ${format(total)}점 → ${format(delta)}코인`;
  if(mode==='bot'&&delta<0)e.details.textContent+=' · 봇 패배는 가진 코인까지만 차감';
  e.players.replaceChildren(...[self,1-self].map(seat=>{const row=node('div','fp-result-player');row.append(node('span','fp-result-player-name',`${nickname(data.profiles,seat,self)}${seat===self?' (나)':''}`),node('strong','',`${format(data.view?.players?.[seat]?.score?.total)}점`));return row;}));
  renderRematch();
}
function showResult(data){
  if(!data?.view||data.view.phase!=='end')return;
  const nextKey=String(data.matchId??data.settlement?.matchId??data.view.matchId??'current-match');
  if(nextKey!==resultKey){resultKey=nextKey;rematchPending=false;leavePending=false;}
  resultData=data;rematchState={...(data.rematch||{}),seat:data.seat};renderResult(data);
  if(shownResults.has(nextKey))return;
  shownResults.add(nextKey);if(shownResults.size>30)shownResults.delete(shownResults.values().next().value);
  stopStage();const e=ensure();if(!e.result.open)e.result.showModal();
}
function openResult(){if(!resultData)return;renderResult(resultData);if(!ensure().result.open)ui.result.showModal();}
function setRematch(next){rematchState={...rematchState,...(next||{})};if(resultData)resultData={...resultData,rematch:rematchState};if(ui)renderRematch();}
function renderRematch(){
  if(!ui)return;
  const state=rematchState,self=state.seat??resultData?.seat??0,ready=state.ready||[],mine=Boolean(ready[self]),other=Boolean(ready[1-self]),bot=state.mode==='bot';
  ui.rematch.disabled=Boolean(rematchPending||leavePending||state.closed||state.blocked||(!bot&&mine));ui.leave.disabled=rematchPending||leavePending;
  ui.rematch.textContent=state.closed?'방이 종료됐어요':rematchPending?'신청 중...':bot?'봇과 한 판 더':mine?(other?'새 판 준비 중...':'상대 응답 기다리는 중'):other?'한 판 더 수락':'한 판 더';
  ui.rematchNote.textContent=state.closed?'상대가 나갔습니다. 로비에서 새 방을 만들어 주세요.':state.blocked|| (bot?'같은 난이도로 새 판을 시작합니다.':mine?(other?'두 사람 모두 준비됐어요.':'신청 완료! 상대가 수락하면 새 판을 시작합니다.'):other?'상대가 한 판 더 신청했어요.':'두 사람 모두 수락하면 새 판을 시작합니다.');
}
async function requestRematch(){
  if(!rematchHandler||!ui||ui.rematch.disabled)return;
  const key=resultKey;rematchPending=true;renderRematch();
  try{await rematchHandler();}catch(error){if(key===resultKey)ui.rematchNote.textContent=error.message||'다시 하기를 신청하지 못했습니다.';}
  finally{if(key===resultKey){rematchPending=false;const message=ui.rematchNote.textContent;renderRematch();if(message&&!message.includes('신청 중'))ui.rematchNote.textContent=message;}}
}
async function requestLeave(){
  if(!leaveHandler||!ui||ui.leave.disabled)return;
  const key=resultKey;leavePending=true;renderRematch();
  try{const left=await leaveHandler();if(key===resultKey){if(left!==false)hideResult();else ui.rematchNote.textContent='방에서 나가지 못했습니다. 다시 시도해 주세요.';}}
  catch(error){if(key===resultKey)ui.rematchNote.textContent=error.message||'방에서 나가지 못했습니다.';}
  finally{if(key===resultKey){leavePending=false;ui.leave.disabled=false;ui.rematch.disabled=Boolean(rematchPending||rematchState.closed||rematchState.blocked||(rematchState.mode!=='bot'&&rematchState.ready?.[rematchState.seat??resultData?.seat??0]));}}
}
async function playTurns(turns,seat,profiles){
  stopStage();const run=epoch,e=ensure();
  for(const turn of turns||[]){
    if(run!==epoch)return;
    const hasPlay=Boolean(turn.played?.length),hasDraw=Boolean(turn.drawn),events=(turn.events||[]).filter(value=>typeof value==='string');
    if(!hasPlay&&!hasDraw&&!events.length)continue;
    const mine=turn.seat===seat;e.stage.setAttribute('data-kind','turn');e.stage.setAttribute('data-self',String(mine));e.stage.setAttribute('data-step','played');
    e.stageKicker.textContent=mine?'내 차례':'상대 차례';e.stageTitle.textContent=nickname(profiles,turn.seat,seat);e.stageNote.textContent='';e.stageNote.setAttribute('data-event','');
    const play=node('div','fp-turn-part'),draw=node('div','fp-turn-part'),played=node('div','fp-stage-cards'),drawn=node('div','fp-stage-cards');
    play.append(node('span','fp-step-label','낸 패'),played);draw.append(node('span','fp-step-label','뒤집은 패'),drawn);draw.setAttribute('data-kind','draw');
    const columns=node('div','fp-turn-columns');
    if(hasPlay){cardsInto(played,turn.played);columns.append(play);}
    if(hasDraw){drawn.append(cardNode(null,{back:true}));columns.append(draw);}
    columns.setAttribute('data-columns',String(Number(hasPlay)+Number(hasDraw)));columns.hidden=!hasPlay&&!hasDraw;
    e.stageBody.replaceChildren(columns);e.stage.hidden=false;
    if(hasPlay){e.stageNote.textContent='손패를 냈습니다.';if(!await wait(500,run))return;}
    if(hasDraw){e.stage.setAttribute('data-step','drawn');cardsInto(drawn,[turn.drawn]);e.stageNote.textContent='더미에서 한 장을 뒤집었습니다.';if(!await wait(500,run))return;}
    if(events.length){
      e.stage.setAttribute('data-step','event');e.stageNote.textContent=events.join(' · ');
      e.stageNote.setAttribute('data-event',events.some(value=>value.includes('뻑'))?'ppuk':'special');
      if(!await wait(650,run))return;
    }
  }
  if(run===epoch)e.stage.hidden=true;
}
async function showOpening(opening,seat,profiles){
  if(!opening?.rounds?.length)return;
  stopStage();const run=epoch,e=ensure();
  e.stage.setAttribute('data-kind','opening');e.stageKicker.textContent='선 결정';e.stageTitle.textContent='섯다로 선 정하기';e.stage.hidden=false;
  for(let index=0;index<opening.rounds.length;index++){
    if(run!==epoch)return;
    const round=opening.rounds[index];e.stageNote.setAttribute('data-event','opening');e.stageNote.textContent=opening.rounds.length>1?`${index+1}번째 뽑기`:'두 장을 공개합니다.';
    const rows=[seat,1-seat].map(player=>{const box=node('div','fp-opening-player'),name=node('strong','fp-opening-name',`${nickname(profiles,player,seat)}${player===seat?' (나)':''}`),cards=node('div','fp-stage-cards'),label=node('div','fp-opening-rank','패 공개 중');cards.append(cardNode(null,{back:true}),cardNode(null,{back:true}));box.append(name,cards,label);box.setAttribute('data-player',String(player));return{box,cards,label,player};});
    const hands=node('div','fp-opening-hands');hands.append(...rows.map(row=>row.box));e.stageBody.replaceChildren(hands);
    if(!await wait(700,run))return;
    for(const row of rows){cardsInto(row.cards,round.hands?.[row.player]);row.label.textContent=round.labels?.[row.player]||'패 공개';}
    if(!await wait(1800,run))return;
    for(const row of rows)row.box.classList.toggle('is-winner',round.winner===row.player);
    e.stageNote.textContent=round.winner===null?`무승부 · 다시 뽑습니다${round.reason?' · '+round.reason:''}`:`${nickname(profiles,round.winner??opening.winner,seat)} 선!${round.reason?' · '+round.reason:''}`;
    if(!await wait(2500,run))return;
  }
  if(run===epoch)e.stage.hidden=true;
}
globalThis.FlowerPresentation={showResult,hideResult,openResult,showOpening,playTurns,cancel,setRematch,onRematch(fn){rematchHandler=fn;},onLeave(fn){leaveHandler=fn;}};
})();
