const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),cards=require('../engine.js').cards();
const tick=()=>new Promise(setImmediate);
const profile=(extra={})=>({id:'user-one',username:'user_1',nickname:'첫사람',coins:1000,debt:[],totalDebt:0,activeRoom:null,...extra});
const room=(extra={})=>({code:'ABC234',token:'room-token',seat:0,mode:'bot',difficulty:'normal',userId:'user-one',...extra});
const view=(extra={})=>({rulesVersion:4,ruleRevision:4,hand:[cards[0],cards[4]],otherHandCount:2,floor:[cards[1]],stacks:{},deckCount:4,players:[0,1].map(()=>({won:[],go:0,score:{total:0,counts:{광:0,열:0,띠:0,피:0}},shaken:[],bombed:[],passes:0,gukjinPi:false})),turn:0,phase:'play',pending:null,inTurn:null,lastTurns:[],log:'차례 시작',winner:null,result:null,...extra});
const response=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
function client({initialProfile=profile(),token='account-token',savedRoom=null,initialView=view(),handler,ready}={}){
  const elements={},timers=new Map(),requests=[],listeners=new Set(),updates=[],profileOpens=[],storage=new Map();
  if(savedRoom)storage.set('flower-gostop-session-v1',JSON.stringify(savedRoom));
  let currentProfile=initialProfile,currentToken=initialProfile?token:'',timerId=0,loginRequests=0,refreshCalls=0,confirmAnswer=true;
  let state={revision:1,waiting:false,view:initialView};
  function element(id=''){
    const classes=new Set(['waiting','game','decisions','turn-details','history-open','bot-rematch'].includes(id)?['hidden']:[]);
    return{id,textContent:'',value:id==='bot-difficulty'?'normal':'',disabled:false,children:[],attributes:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},setAttribute(name,value){this.attributes[name]=value;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(){},showModal(){},close(){}};
  }
  const get=id=>elements[id]??=element(id),body=element('body');
  const notify=()=>{for(const fn of listeners)fn(currentProfile);};
  const account={ready:ready||Promise.resolve(currentProfile),getProfile:()=>currentProfile,getToken:()=>currentToken,isLoggedIn:()=>Boolean(currentProfile&&currentToken),requireLogin(){loginRequests++;return Boolean(currentProfile&&currentToken);},update(next){currentProfile=next;updates.push(next);notify();},refresh:async()=>{refreshCalls++;return currentProfile;},openProfile:id=>profileOpens.push(id),onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  const fetch=async(url,options)=>{
    const request={url,options};requests.push(request);
    if(handler){const result=await handler(request);if(result!==undefined)return result;}
    if(url.includes('/state?'))return response(structuredClone(state));
    if(url.endsWith('/action'))return response({revision:2,waiting:false,view:initialView,account:currentProfile});
    if(url.endsWith('/leave'))return response({ok:true,account:currentProfile&&{...currentProfile,activeRoom:null}});
    if(['/bot','/rooms','/join'].some(suffix=>url.endsWith(suffix)))return response({...room({mode:url.endsWith('/bot')?'bot':'online'}),account:currentProfile});
    throw Error('Unexpected URL '+url);
  };
  vm.runInNewContext(source,{FlowerAccount:account,document:{body,getElementById:get,createElement:()=>element()},fetch,AbortController,navigator:{},console,confirm:()=>confirmAnswer,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  return{get,body,account,requests,updates,profileOpens,storage,timers,get loginRequests(){return loginRequests;},get refreshCalls(){return refreshCalls;},setState(next){state=structuredClone(next);},setConfirm(next){confirmAnswer=next;},changeAccount(next,nextToken=next?'new-account-token':''){currentProfile=next;currentToken=nextToken;notify();},async firePoll(){const entry=[...timers].find(([,item])=>item.ms===1500);assert(entry,'poll timer must exist');timers.delete(entry[0]);await entry[1].fn();await tick();}};
}
test('anonymous room, join and bot entry requires login without sending game API requests',async()=>{
  const c=client({initialProfile:null});await tick();
  c.get('host').onclick();await tick();c.get('code').value='ABC234';c.get('join').onclick();await tick();c.get('bot').onclick();await tick();
  assert.equal(c.loginRequests,3);assert.equal(c.requests.length,0);assert.equal(c.body.classList.contains('playing'),false);
});
test('new games send the account token and subsequent state/actions keep the separate room bearer',async()=>{
  const c=client();await tick();c.get('bot').onclick();await tick();
  const create=c.requests.find(r=>r.url.endsWith('/bot')),state=c.requests.find(r=>r.url.includes('/state?'));
  assert.equal(create.options.headers['X-Account-Token'],'account-token');assert.equal(create.options.headers.Authorization,undefined);
  assert.equal(state.options.headers.Authorization,'Bearer room-token');assert.equal(state.options.headers['X-Account-Token'],'account-token');
  await c.get('hand').children[0].onclick();
  const action=c.requests.find(r=>r.url.endsWith('/action'));assert.equal(action.options.headers.Authorization,'Bearer room-token');assert.equal(action.options.headers['X-Account-Token'],'account-token');
});
test('account activeRoom resumes on a new device only after account readiness',async()=>{
  const gate=deferred(),active=room();const c=client({initialProfile:profile({activeRoom:active}),ready:gate.promise});
  assert.equal(c.requests.length,0);gate.resolve(c.account.getProfile());await tick();
  assert.equal(c.requests.filter(r=>r.url.includes('/state?code=ABC234')).length,1);
  assert.equal(c.requests.filter(r=>r.url.endsWith('/bot')).length,0);assert.equal(c.body.classList.contains('playing'),true);
  assert.equal(JSON.parse(c.storage.get('flower-gostop-session-v1')).userId,'user-one');
});
test('saved rooms from another account do not override the current account activeRoom',async()=>{
  const current=room({code:'DEF567',token:'second-room-token',userId:'user-two'});
  const c=client({initialProfile:profile({id:'user-two',activeRoom:current}),savedRoom:room()});await tick();
  assert(c.requests.every(r=>!r.url.includes('ABC234')));assert(c.requests.some(r=>r.url.includes('DEF567')));
});
test('switching account clears its prior room and late action responses cannot restore old coins',async()=>{
  const actionGate=deferred(),c=client({savedRoom:room(),handler:request=>request.url.endsWith('/action')?actionGate.promise:undefined});await tick();
  const action=c.get('hand').children[0].onclick();await tick();
  c.changeAccount(profile({id:'user-two',nickname:'다음사람',coins:777}));
  actionGate.resolve(response({revision:2,waiting:false,view:view(),account:profile({coins:1200})}));await action;await tick();
  assert.equal(c.account.getProfile().id,'user-two');assert.equal(c.account.getProfile().coins,777);assert.equal(c.body.classList.contains('playing'),false);assert.equal(c.storage.has('flower-gostop-session-v1'),false);
});
test('server settlement updates coins and disables bot entry/rematch below ten coins',async()=>{
  const ended=view({phase:'end',winner:1,log:'정산 완료'}),c=client({savedRoom:room(),handler:request=>request.url.endsWith('/action')?response({revision:2,view:ended,account:profile({coins:9})}):undefined});await tick();
  await c.get('hand').children[0].onclick();
  assert.equal(c.account.getProfile().coins,9);assert.equal(c.get('bot').disabled,true);assert.equal(c.get('bot-rematch').disabled,true);assert.equal(c.get('bot-rematch').classList.contains('hidden'),false);
  c.account.update(profile({coins:10}));assert.equal(c.get('bot').disabled,false);assert.equal(c.get('bot-rematch').disabled,false);
});
test('player name buttons open self and opponent profiles using account IDs',async()=>{
  const c=client({savedRoom:room({mode:'online'}),handler:request=>request.url.includes('/state?')?response({revision:1,waiting:false,view:view(),profiles:[{id:'user-one',nickname:'첫사람'},{id:'user-two',nickname:'둘째사람'}]}):undefined});await tick();
  assert.equal(c.get('my-name').textContent,'첫사람');assert.equal(c.get('other-name').textContent,'둘째사람');
  c.get('my-name').onclick();c.get('other-name').onclick();assert.deepEqual(c.profileOpens,[undefined,'user-two']);
});
test('declining forfeit keeps the active room, and a failed leave cannot start a rematch',async()=>{
  const c=client({savedRoom:room(),handler:request=>request.url.endsWith('/leave')?response({error:'잠시 후 다시 시도'},503):undefined});await tick();
  c.setConfirm(false);assert.equal(await c.get('leave').onclick(),false);assert.equal(c.requests.filter(r=>r.url.endsWith('/leave')).length,0);assert.equal(c.body.classList.contains('playing'),true);
  c.setConfirm(true);await c.get('bot-rematch').onclick();assert.equal(c.requests.filter(r=>r.url.endsWith('/bot')).length,0);assert.equal(c.body.classList.contains('playing'),true);assert.match(c.get('notice').textContent,/잠시 후/);
});
test('a delayed older poll cannot roll back the coin balance from a newer settlement',async()=>{
  const c=client({savedRoom:room(),handler:request=>request.url.endsWith('/action')?response({revision:3,waiting:false,view:view({phase:'end',winner:0}),account:profile({coins:1050})}):undefined});await tick();
  await c.get('hand').children[0].onclick();assert.equal(c.account.getProfile().coins,1050);
  c.setState({revision:2,waiting:false,view:view(),account:profile({coins:1000})});await c.firePoll();
  assert.equal(c.account.getProfile().coins,1050);assert.match(c.get('notice').textContent,/승리/);
});
test('an old leave response cannot clear the next account room and the next active game resumes',async()=>{
  const leaveGate=deferred(),c=client({savedRoom:room(),handler:request=>request.url.endsWith('/leave')?leaveGate.promise:undefined});await tick();
  const leaving=c.get('leave').onclick();await tick();
  c.changeAccount(profile({id:'user-two',coins:777,activeRoom:room({code:'DEF567',token:'new-room-token',userId:'user-two'})}));
  leaveGate.resolve(response({error:'종료된 이전 방'},404));await leaving;await tick();
  assert.equal(c.account.getProfile().id,'user-two');assert.equal(c.account.getProfile().coins,777);
  assert.equal(JSON.parse(c.storage.get('flower-gostop-session-v1')).code,'DEF567');assert.equal(c.body.classList.contains('playing'),true);
  assert(c.requests.some(r=>r.url.includes('/state?code=DEF567')));
});
test('switching account while creating a room discards the response for the previous account',async()=>{
  const enterGate=deferred(),c=client({handler:request=>request.url.endsWith('/rooms')?enterGate.promise:undefined});await tick();
  c.get('host').onclick();await tick();c.changeAccount(profile({id:'user-two',nickname:'다음사람',coins:777}));
  enterGate.resolve(response({...room({mode:'online'}),account:profile()}));await tick();
  assert.equal(c.account.getProfile().id,'user-two');assert.equal(c.account.getProfile().coins,777);assert.equal(c.requests.filter(r=>r.url.includes('/state?')).length,0);assert.equal(c.storage.has('flower-gostop-session-v1'),false);
});
test('same-tick entry attempts send only one room creation request',async()=>{
  const enterGate=deferred(),c=client({handler:request=>request.url.endsWith('/rooms')?enterGate.promise:undefined});await tick();
  c.get('host').onclick();c.get('host').onclick();await tick();
  assert.equal(c.requests.filter(r=>r.url.endsWith('/rooms')).length,1);
  enterGate.resolve(response({...room({mode:'online'}),account:profile()}));await tick();
});
