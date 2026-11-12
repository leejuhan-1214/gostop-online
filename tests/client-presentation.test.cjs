const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),cards=require('../engine.js').cards(),tick=()=>new Promise(setImmediate);
const opening=id=>({id,rounds:[{hands:[[cards[0],cards[1]],[cards[4],cards[8]]],labels:['일땡','오끗'],winner:0,reason:'땡 승리'}],winner:0});
const view=(extra={})=>({rulesVersion:4,ruleRevision:4,hand:[cards[0],cards[4]],otherHandCount:2,floor:[cards[1]],stacks:{},deckCount:4,players:[0,1].map(()=>({won:[],go:0,score:{total:0,counts:{광:0,열:0,띠:0,피:0}},shaken:[],bombed:[],passes:0,gukjinPi:false})),turn:0,phase:'play',pending:null,inTurn:null,lastTurns:[],log:'차례 시작',winner:null,result:null,opening:opening('opening-one'),visualTurns:[],...extra});
const packet=(extra={})=>({matchId:'match-one',revision:1,waiting:false,view:view(),profiles:[{id:'one',nickname:'첫사람'},{id:'two',nickname:'둘째사람'}],settlement:null,rematch:{ready:[false,false],closed:false},...extra});
const turn=(id,extra={})=>({id,seat:1,played:[cards[12]],drawn:null,captures:[],events:[],...extra});
const ended=(extra={})=>view({phase:'end',winner:0,hand:[],result:{base:7,goBonus:0,multipliers:[],total:7},...extra});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function client({initial=packet(),skipOpening=false,mode='online',handler}={}){
  const elements={},timers=new Map(),requests=[],pendingActions=[],pendingPresentation=[],calls=[],storage=new Map();let timerId=0,state=structuredClone(initial);
  storage.set('flower-gostop-session-v1',JSON.stringify({code:'ABC234',token:'room-token',seat:0,mode,difficulty:'normal'}));if(skipOpening)storage.set('flower-gostop-opening',initial.view?.opening?.id||'opening-one');
  function element(id=''){const classes=new Set();return{id,textContent:'',value:'normal',disabled:false,children:[],attributes:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},setAttribute(name,value){this.attributes[name]=value;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(){},showModal(){},close(){}};}
  const get=id=>elements[id]??=element(id),body=element('body');
  function queued(type,data){calls.push({type,data});return new Promise(resolve=>pendingPresentation.push({type,resolve}));}
  const presentation={showOpening:(...args)=>queued('opening',args),playTurns:(...args)=>queued('turns',args),showResult:data=>calls.push({type:'result',data}),hideResult:()=>calls.push({type:'hideResult'}),openResult:()=>calls.push({type:'openResult'}),setRematch:data=>calls.push({type:'rematchState',data}),cancel(){calls.push({type:'cancel'});for(const task of pendingPresentation.splice(0))task.resolve();},onRematch(fn){this.rematch=fn;},onLeave(fn){this.leave=fn;}};
  const fetch=async(url,options)=>{
    const request={url,options};requests.push(request);if(handler){const result=await handler(request);if(result!==undefined)return result;}
    if(url.includes('/state?'))return response(structuredClone(state));
    if(url.endsWith('/action'))return new Promise(resolve=>pendingActions.push(resolve));
    if(url.endsWith('/leave'))return response({ok:true});
    if(url.endsWith('/rematch'))return response(structuredClone(state));
    if(url.endsWith('/bot')||url.endsWith('/rooms'))return response({code:'DEF567',token:'new-token',seat:0,mode:url.endsWith('/bot')?'bot':'online',difficulty:'normal'});
    throw Error('Unexpected URL '+url);
  };
  vm.runInNewContext(source,{FlowerPresentation:presentation,document:{body,getElementById:get,createElement:()=>element()},fetch,AbortController,navigator:{},console,confirm:()=>true,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  return{get,body,presentation,calls,requests,storage,pendingPresentation,of:type=>calls.filter(call=>call.type===type),setState(next){state=structuredClone(next);},replyAction(next,status=200){assert(pendingActions.length,'action must be pending');pendingActions.shift()(response(structuredClone(next),status));},async finish(type){const index=pendingPresentation.findIndex(item=>item.type===type);assert(index>=0,`pending ${type} presentation required`);pendingPresentation.splice(index,1)[0].resolve();await tick();},beginPoll(){const entry=[...timers].find(([,timer])=>timer.ms===1500);assert(entry,'poll timer required');timers.delete(entry[0]);return entry[1].fn();}};
}
test('a host waiting with an existing match ID still sees the opening when the other player joins',async()=>{
  const c=client({initial:packet({revision:0,waiting:true,view:null})});await tick();assert.equal(c.of('opening').length,0);
  c.setState(packet());const poll=c.beginPoll();await tick();assert.equal(c.of('opening').length,1);assert.equal(c.of('opening')[0].data[0].id,'opening-one');assert(c.get('hand').children.every(card=>card.disabled));
  await c.finish('opening');await poll;assert(c.get('hand').children.every(card=>!card.disabled));assert.equal(c.storage.get('flower-gostop-opening'),'opening-one');
});
test('turn animation blocks hand actions and duplicate polling never replays the same visual sequence',async()=>{
  const c=client({skipOpening:true});await tick();const action=c.get('hand').children[0].onclick();await tick();
  const next=packet({revision:2,view:view({hand:[cards[4]],floor:[cards[12]],visualTurns:[turn(1)]})});c.replyAction(next);await tick();
  assert.equal(c.of('turns').length,1);assert(c.get('hand').children.every(card=>card.disabled));assert.equal(c.get('floor').children[0].children[0].src,'assets/cards/m01-02.svg');
  await c.get('hand').children[0].onclick();assert.equal(c.requests.filter(request=>request.url.endsWith('/action')).length,1);
  c.setState(next);await c.beginPoll();assert.equal(c.of('turns').length,1);await c.finish('turns');await action;
  assert.equal(c.get('floor').children[0].children[0].src,'assets/cards/m04-01.svg');assert(c.get('hand').children.every(card=>!card.disabled));
  await c.beginPoll();assert.equal(c.of('turns').length,1);
});
test('the result appears only after every queued final turn, using the latest settlement',async()=>{
  const c=client({skipOpening:true});await tick();const action=c.get('hand').children[0].onclick();await tick();
  c.replyAction(packet({revision:2,view:ended({visualTurns:[turn(1)]}),settlement:{matchId:'match-one',score:7,delta:7,reason:'score'}}));await tick();assert.equal(c.of('result').length,0);
  c.setState(packet({revision:3,view:ended({visualTurns:[turn(1),turn(2,{played:[],captures:[{source:'hand',cards:[cards[12],cards[13]]}],events:['싹쓸이']})]}),settlement:{matchId:'match-one',score:7,delta:7,reason:'score'}}));const poll=c.beginPoll();await tick();
  await c.finish('turns');assert.equal(c.of('turns').length,2);assert.deepEqual(c.of('turns')[1].data[0].map(t=>t.id),[2]);assert.equal(c.of('result').length,0);
  await c.finish('turns');await Promise.all([action,poll]);assert(c.of('result').length>0);assert(c.of('result').every(call=>call.data.matchId==='match-one'&&call.data.settlement.delta===7));assert.match(c.get('notice').textContent,/승리/);
});
test('a stored opening is not replayed when restoring or polling the same match',async()=>{
  const c=client({skipOpening:true});await tick();assert.equal(c.of('opening').length,0);await c.beginPoll();assert.equal(c.of('opening').length,0);
  c.setState(packet({revision:2}));await c.beginPoll();assert.equal(c.of('opening').length,0);assert(c.get('hand').children.every(card=>!card.disabled));
});
test('online rematch starts a new opening and resets visual sequence without leaving the room',async()=>{
  const next=packet({matchId:'match-two',revision:2,view:view({opening:opening('opening-two'),visualTurns:[]})});
  const c=client({skipOpening:true,initial:packet({view:ended()}),handler:request=>request.url.endsWith('/rematch')?response(next):undefined});await tick();assert(c.of('result').some(call=>call.data.matchId==='match-one'));
  const pending=c.presentation.rematch();await tick();assert.equal(c.requests.filter(request=>request.url.endsWith('/leave')).length,0);assert.equal(c.of('opening').at(-1).data[0].id,'opening-two');assert(c.get('hand').children.every(card=>card.disabled));
  const sent=c.requests.find(request=>request.url.endsWith('/rematch'));assert.equal(JSON.parse(sent.options.body).matchId,'match-one');await c.finish('opening');await pending;
  assert.equal(c.body.classList.contains('playing'),true);assert.equal(c.get('online-rematch').classList.contains('hidden'),true);assert.equal(c.storage.get('flower-gostop-opening'),'opening-two');
  const action=c.get('hand').children[0].onclick();await tick();c.replyAction(packet({matchId:'match-two',revision:3,view:ended({opening:opening('opening-two'),visualTurns:[turn(1)]}),settlement:{matchId:'match-two',score:7,delta:7}}));await tick();assert.equal(c.of('turns').at(-1).data[0][0].id,1);await c.finish('turns');await action;assert(c.of('result').some(call=>call.data.matchId==='match-two'));
});
test('leaving cancels the pending opening and cannot mark it viewed or restore the old game',async()=>{
  const c=client();await tick();assert.equal(c.pendingPresentation[0].type,'opening');const stale=c.pendingPresentation[0].resolve;
  await c.get('leave').onclick();await tick();assert.equal(c.body.classList.contains('playing'),false);assert.equal(c.storage.has('flower-gostop-opening'),false);assert.equal(c.pendingPresentation.length,0);
  stale();await tick();assert.equal(c.body.classList.contains('playing'),false);assert.equal(c.of('result').length,0);
});
test('a late action response after leaving cannot enqueue stale turns or reopen a result',async()=>{
  const c=client({skipOpening:true});await tick();const action=c.get('hand').children[0].onclick();await tick();await c.get('leave').onclick();
  c.replyAction(packet({revision:2,view:ended({visualTurns:[turn(1)]}),settlement:{score:7,delta:7}}));await action;await tick();assert.equal(c.of('turns').length,0);assert.equal(c.of('result').length,0);assert.equal(c.body.classList.contains('playing'),false);
});
