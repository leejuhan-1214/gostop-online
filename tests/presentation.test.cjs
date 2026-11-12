const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../presentation.js'),'utf8'),cards=require('../engine.js').cards();
const tick=()=>new Promise(setImmediate),profiles=[{id:'one',nickname:'첫사람'},{id:'two',nickname:'둘째사람'}];
function client({reduced=false}={}){
  const timers=new Map();let timerId=0;
  function element(tag){
    const classes=new Set();let ownText='';
    return{tagName:tag,children:[],attributes:{},hidden:false,open:false,disabled:false,id:'',
      get className(){return [...classes].join(' ');},set className(value){classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(name=>classes.add(name));},
      get textContent(){return ownText+this.children.map(child=>child.textContent).join('');},set textContent(value){ownText=String(value);this.children=[];},
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      setAttribute(name,value){this.attributes[name]=value;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){ownText='';this.children=nodes;},showModal(){this.open=true;},close(){this.open=false;}};
  }
  const body=element('body'),sandbox={document:{body,createElement:element},Intl,matchMedia:()=>({matches:reduced}),setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,sandbox);
  const all=(root=body)=>[root,...root.children.flatMap(child=>all(child))];
  return{api:sandbox.FlowerPresentation,body,timers,all,get:id=>all().find(el=>el.id===id),byClass:name=>all().filter(el=>el.classList.contains(name)),async next(){const [id,timer]=timers.entries().next().value||[];assert(timer,'a presentation delay must be pending');timers.delete(id);timer.fn();await tick();},async drain(){for(let i=0;timers.size;i++){assert(i<50,'presentation must finish');await this.next();}}};
}
function endData({matchId='first',seat=0,winner=0,score=28,delta=28,mode='online'}={}){
  return{matchId,seat,profiles,view:{phase:'end',winner,players:[{score:{total:7}},{score:{total:3}}],result:{base:7,goBonus:0,multipliers:[{name:'광박',factor:4}],total:score}},settlement:{matchId,score,delta,reason:winner===null?'draw':'score'},rematch:{ready:[false,false],closed:false,mode}};
}
test('results show Korean win/loss/draw, final score and actual settled coins including bot loss caps',()=>{
  const c=client();assert.equal(c.body.children.length,0);
  c.api.showResult(endData());assert.equal(c.get('fp-result-heading').textContent,'승리!');assert.equal(c.get('fp-result-score').textContent,'28점');assert.equal(c.get('fp-result-delta').textContent,'+28코인');assert.equal(c.get('fp-result').open,true);
  for(const reward of [14,28,56]){c.api.showResult(endData({matchId:'reward-'+reward,mode:'bot',delta:reward}));assert.equal(c.get('fp-result-score').textContent,'28점');assert.equal(c.get('fp-result-delta').textContent,`+${reward}코인`);assert.match(c.byClass('fp-result-details')[0].textContent,new RegExp(`28점 → ${reward}코인`));}
  c.api.showResult(endData({matchId:'capped',winner:1,score:40,delta:-3,mode:'bot'}));
  assert.equal(c.get('fp-result-heading').textContent,'패배');assert.equal(c.get('fp-result-score').textContent,'40점');assert.equal(c.get('fp-result-delta').textContent,'-3코인');assert.match(c.byClass('fp-result-details')[0].textContent,/가진 코인까지만/);
  c.api.showResult(endData({matchId:'draw',winner:null,score:0,delta:0}));assert.equal(c.get('fp-result-heading').textContent,'무승부');assert.equal(c.get('fp-result-delta').textContent,'0코인');
  assert.equal(c.get('fp-result').attributes['aria-labelledby'],'fp-result-heading');
});
test('polling and rematch updates do not reopen a dismissed result; explicit open and a new match do',()=>{
  const c=client(),data=endData();c.api.showResult(data);c.api.hideResult();
  c.api.setRematch({ready:[false,true]});c.api.showResult({...data,rematch:{ready:[false,true],mode:'online'}});assert.equal(c.get('fp-result').open,false);
  c.api.openResult();assert.equal(c.get('fp-result').open,true);assert.equal(c.get('fp-rematch').textContent,'한 판 더 수락');
  c.api.cancel();assert.equal(c.get('fp-result').open,false);c.api.showResult(endData({matchId:'next'}));assert.equal(c.get('fp-result').open,true);
  assert.equal(c.all().filter(el=>el.id==='fp-result').length,1);
});
test('online rematch reflects both seats and prevents duplicate requests while awaiting the callback',async()=>{
  const c=client();let calls=0,release;c.api.onRematch(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  c.api.showResult(endData({seat:1}));c.api.setRematch({ready:[true,false],mode:'online'});assert.equal(c.get('fp-rematch').textContent,'한 판 더 수락');
  const pending=c.get('fp-rematch').onclick();await c.get('fp-rematch').onclick();assert.equal(calls,1);assert.equal(c.get('fp-rematch').disabled,true);
  c.api.setRematch({ready:[true,true]});release();await pending;assert.equal(c.get('fp-rematch').textContent,'새 판 준비 중...');assert.equal(c.get('fp-rematch').disabled,true);
  c.api.setRematch({closed:true});assert.match(c.get('fp-rematch-note').textContent,/상대가 나갔습니다/);
  c.api.setRematch({closed:false,mode:'bot',blocked:'10코인 이상부터 가능합니다.'});assert.equal(c.get('fp-rematch').disabled,true);assert.match(c.get('fp-rematch-note').textContent,/10코인/);
});
test('a delayed leave callback cannot close a newer match result',async()=>{
  const c=client();let release;c.api.onLeave(()=>new Promise(resolve=>{release=resolve;}));c.api.showResult(endData());
  const leaving=c.get('fp-result-leave').onclick();c.api.cancel();c.api.showResult(endData({matchId:'newer'}));release(true);await leaving;
  assert.equal(c.get('fp-result').open,true);
});
test('an opponent turn shows played and drawn cards plus named events without a capture popup',async()=>{
  const c=client(),promise=c.api.playTurns([{id:1,seat:1,played:[cards[4]],drawn:cards[12],captures:[{source:'hand',cards:[cards[4],cards[5]]}],events:['따닥']}],0,profiles);
  assert.equal(c.get('fp-stage').attributes['data-step'],'played');assert.equal(c.byClass('fp-stage-title')[0].textContent,'둘째사람');assert.equal(c.get('fp-stage').attributes['data-self'],'false');
  assert.equal(c.all().filter(el=>el.tagName==='img').length,1);assert.equal([...c.timers.values()][0].ms,1250);
  await c.next();assert.equal([...c.timers.values()][0].ms,1250);assert.equal(c.get('fp-stage').attributes['data-step'],'drawn');assert(c.all().some(el=>el.src==='assets/cards/m04-01.svg'));
  await c.next();assert.equal([...c.timers.values()][0].ms,1625);assert.equal(c.get('fp-stage').attributes['data-step'],'event');assert.match(c.byClass('fp-stage-note')[0].textContent,/따닥/);assert.equal(c.byClass('fp-captured-cards').length,0);assert.equal(c.all().filter(el=>el.tagName==='img').length,2);assert.doesNotMatch(c.get('fp-stage').textContent,/가져온 패|장 획득/);
  await c.next();await promise;assert.equal(c.get('fp-stage').hidden,true);
});
test('capture-only and empty records produce no popup or wait while played cards remain visible',async()=>{
  const c=client();let promise=c.api.playTurns([{id:1,seat:0,played:[],drawn:null,captures:[{source:'draw',cards:[cards[4],cards[5]]}],events:[]}],0,profiles);
  await promise;assert.equal(c.get('fp-stage').hidden,true);assert.equal(c.timers.size,0);assert.equal(c.byClass('fp-capture-area').length,0);
  promise=c.api.playTurns([{id:2,seat:0,played:[cards[0]],drawn:null,captures:[],events:[]}],0,profiles);assert.equal(c.byClass('fp-turn-columns')[0].children.length,1);assert.equal([...c.timers.values()][0].ms,1250);await c.drain();await promise;
  await c.api.playTurns([{id:3,seat:0,played:[],drawn:null,captures:[],events:[]}],0,profiles);assert.equal(c.timers.size,0);assert.equal(c.get('fp-stage').hidden,true);
});
test('cancel resolves pending animation promises and stale timer callbacks cannot mutate a newer stage',async()=>{
  const c=client(),pending=c.api.playTurns([{seat:1,played:[cards[0]],drawn:cards[4],captures:[],events:[]}],0,profiles),old=[...c.timers.values()][0].fn;
  c.api.cancel();await pending;assert.equal(c.timers.size,0);assert.equal(c.get('fp-stage').hidden,true);
  const next=c.api.playTurns([{seat:0,played:[],drawn:null,captures:[],events:['뻑! 세 장 쌓임']}],0,profiles);old();await tick();
  assert.equal(c.get('fp-stage').hidden,false);assert.match(c.byClass('fp-stage-note')[0].textContent,/뻑/);assert.equal(c.timers.size,1);await c.drain();await next;
});
test('opening gives each round 1750ms backs, 4500ms to read ranks and 6250ms for the outcome',async()=>{
  const c=client(),opening={id:'opening',rounds:[{hands:[[cards[0],cards[4]],[cards[8],cards[12]]],labels:['삼끗','삼끗'],winner:null,reason:'동점'},{hands:[[cards[0],cards[1]],[cards[4],cards[8]]],labels:['일땡','오끗'],winner:0,reason:'땡 승리'}],winner:0};
  const pending=c.api.showOpening(opening,1,profiles);assert.equal(c.get('fp-stage').attributes['data-kind'],'opening');assert.equal(c.byClass('fp-card-back').length,4);assert.equal([...c.timers.values()][0].ms,1750);
  await c.next();assert.equal(c.byClass('fp-opening-rank')[0].textContent,'삼끗');assert.equal(c.all().filter(el=>el.tagName==='img').length,4);assert.equal([...c.timers.values()][0].ms,4500);
  await c.next();assert.match(c.byClass('fp-stage-note')[0].textContent,/무승부/);assert.equal([...c.timers.values()][0].ms,6250);
  await c.next();assert.equal(c.byClass('fp-card-back').length,4);assert.equal([...c.timers.values()][0].ms,1750);
  await c.next();assert.equal(c.byClass('fp-opening-rank')[1].textContent,'일땡');assert.equal([...c.timers.values()][0].ms,4500);await c.next();
  assert.match(c.byClass('fp-stage-note')[0].textContent,/첫사람 선!/);assert.equal(c.byClass('is-winner')[0].attributes['data-player'],'0');assert.equal([...c.timers.values()][0].ms,6250);await c.drain();await pending;assert.equal(c.get('fp-stage').hidden,true);
});
test('cancelling the longer rank-reading pause resolves the opener without showing a stale winner',async()=>{
  const c=client(),opening={id:'cancel-opening',rounds:[{hands:[[cards[0],cards[1]],[cards[4],cards[8]]],labels:['일땡','오끗'],winner:0}],winner:0};
  const pending=c.api.showOpening(opening,0,profiles);await c.next();const stale=[...c.timers.values()][0].fn;
  assert.equal([...c.timers.values()][0].ms,4500);c.api.cancel();await pending;assert.equal(c.timers.size,0);assert.equal(c.get('fp-stage').hidden,true);
  stale();await tick();assert.equal(c.get('fp-stage').hidden,true);assert.equal(c.byClass('is-winner').length,0);
});
test('reduced-motion mode shortens delays and unknown settlement never invents a coin amount',async()=>{
  const c=client({reduced:true}),pending=c.api.playTurns([{seat:0,played:[cards[0]],drawn:cards[4],captures:[],events:['쪽']}],0,profiles);
  while(c.timers.size){assert([...c.timers.values()].every(timer=>timer.ms<=500));await c.next();}await pending;
  const opener=c.api.showOpening({id:'reduced',rounds:[{hands:[[cards[0],cards[1]],[cards[4],cards[8]]],labels:['일땡','오끗'],winner:0}],winner:0},0,profiles);
  const openingDurations=[];while(c.timers.size){openingDurations.push([...c.timers.values()][0].ms);await c.next();}await opener;assert.deepEqual(openingDurations,[500,500,500]);
  c.api.showResult({...endData(),settlement:null});assert.equal(c.get('fp-result-delta').textContent,'코인 정산 확인 중');c.api.showResult(endData());assert.equal(c.get('fp-result-delta').textContent,'+28코인');
  const css=fs.readFileSync(path.join(__dirname,'../presentation.css'),'utf8');assert(css.includes('@media(prefers-reduced-motion:reduce)'));
});
