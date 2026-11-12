const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../account.js'),'utf8');
const KEY='flower-gostop-account-v1';
const LOAN_KEY=KEY+'-loan-pending';
const baseProfile=()=>({id:'player-one',username:'player_1',nickname:'꽃놀이',coins:1000,wins:0,losses:0,games:0,draws:0,totalDebt:0,debt:[],title:'',activeRoom:null,loan:{principal:0,interest:0,total:0,available:3000,limit:3000,interestRate:.1}});
function client(handler,{savedToken='',savedValues={}}={}){
  const elements={},storage=new Map([...(savedToken?[[KEY,savedToken]]:[]),...Object.entries(savedValues)]),requests=[],storageWrites=[];
  function element(id=''){
    return{id,value:'',textContent:'',disabled:false,open:false,children:[],attributes:{},listeners:{},classList:{values:new Set(),toggle(key,on){if(on)this.values.add(key);else this.values.delete(key);},contains(key){return this.values.has(key);}},
      setAttribute(key,value){this.attributes[key]=value;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(name,listener){this.listeners[name]=listener;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.({});},focus(){}};
  }
  function get(id){if(!elements[id]){elements[id]=element(id);if(id==='profile-loan-amount')elements[id].value='100';}return elements[id];}
  const win={listeners:{},addEventListener(name,listener){this.listeners[name]=listener;}};
  const fetch=async(url,options)=>{requests.push({url,options});return handler(url,options);};
  const localStorage={getItem:key=>storage.get(key)||null,setItem(key,value){storage.set(key,value);storageWrites.push([key,value]);},removeItem:key=>storage.delete(key)};
  vm.runInNewContext(source,{window:win,document:{getElementById:get,createElement:()=>element()},localStorage,fetch,AbortController,setTimeout,clearTimeout,Intl,TypeError,SyntaxError,crypto:webcrypto,console});
  return{account:win.FlowerAccount,get,requests,storage,storageWrites,win};
}
const response=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});
test('signup submits credentials once, stores only the opaque token, and publishes the server balance',async()=>{
  const c=client(async(url,options)=>{assert(url.endsWith('/auth/register'));assert.equal(options.headers.Authorization,undefined);return response({token:'opaque-account-token',profile:baseProfile()});});
  await c.account.ready;assert.equal(c.account.requireLogin(),false);assert.equal(c.get('auth-dialog').open,true);
  c.get('account-register-tab').onclick();
  c.get('register-username').value='player_1';c.get('register-nickname').value='꽃놀이';c.get('register-password').value='long-test-password';
  let changed;c.account.onChange(p=>{changed=p;});
  await c.get('account-register-form').listeners.submit({preventDefault(){}});
  assert.equal(c.requests.length,1);
  assert.deepEqual(JSON.parse(c.requests[0].options.body),{username:'player_1',nickname:'꽃놀이',password:'long-test-password'});
  assert.deepEqual(c.storageWrites,[[KEY,'opaque-account-token']]);assert.equal(c.get('register-password').value,'');
  assert.equal(c.account.isLoggedIn(),true);assert.equal(changed.coins,1000);assert.equal(c.get('auth-dialog').open,false);
  assert.match(c.get('account-open').textContent,/1,000코인/);
});
test('a failed refresh preserves the last balance while an expired account token clears login',async()=>{
  let mode='ok';const c=client(async(url,options)=>{assert(url.endsWith('/me'));assert.equal(options.headers.Authorization,'Bearer saved-token');if(mode==='offline')throw new TypeError('Network unavailable');if(mode==='expired')return response({error:'만료된 로그인'},401);return response({profile:baseProfile()});},{savedToken:'saved-token'});
  const initial=await c.account.ready;assert.deepEqual(initial,baseProfile());assert.equal(c.account.getProfile().coins,1000);assert.equal(c.account.getProfile().profile,undefined);
  mode='offline';await assert.rejects(c.account.refresh(),/계정 서버에 연결하지 못했습니다/);
  assert.equal(c.account.getProfile().coins,1000);assert.equal(c.account.isLoggedIn(),true);assert.match(c.get('account-open').textContent,/1,000코인/);
  let changed='unset';c.account.onChange(p=>{changed=p;});mode='expired';await assert.rejects(c.account.refresh(),/만료된 로그인/);
  assert.equal(c.account.getProfile(),null);assert.equal(c.account.getToken(),'');assert.equal(changed,null);assert.equal(c.storage.has(KEY),false);
});
test('debt profiles use literal text, reveal every creditor, and drop the title when repayment finishes',async()=>{
  let p={...baseProfile(),coins:-50,totalDebt:50,debt:[{creditorId:'first',creditorNickname:'앞사람',amount:30},{creditorId:'second',creditorNickname:'뒷사람',amount:20}],title:'앞사람의 노예',lastResult:{delta:-50,opponentNickname:'앞사람',reason:'score'}};
  const c=client(async()=>response({profile:p}),{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  assert.equal(c.get('profile-title').textContent,'앞사람의 노예');assert.equal(c.get('profile-debts').children.length,2);assert.equal(c.get('profile-coins').textContent,'-50');
  assert.match(c.get('profile-debt-help').textContent,/외 1명/);assert.match(c.get('profile-recent').textContent,/-50코인/);
  assert.equal(c.get('bot').disabled,true);assert.equal(c.get('account-bot-hint').classList.contains('hidden'),false);
  p={...baseProfile(),nickname:'<img src=x onerror=alert(1)>'};c.account.update(p);
  assert.equal(c.get('profile-nickname').textContent,p.nickname);assert.equal(c.get('profile-title').classList.contains('hidden'),true);assert.equal(c.get('profile-debt-section').classList.contains('hidden'),true);
});
test('a delayed refresh cannot overwrite newer settled coins, while equal-version room changes still apply',async()=>{
  let calls=0,release;
  const c=client(async()=>{calls++;if(calls===1)return response({profile:{...baseProfile(),coinVersion:1}});return new Promise(resolve=>{release=resolve;});},{savedToken:'saved-token'});
  await c.account.ready;const pending=c.account.refresh();
  c.account.update({...baseProfile(),coins:1100,coinVersion:3,activeRoom:{code:'ABC234',mode:'online'}});
  release(response({profile:{...baseProfile(),coins:1000,coinVersion:2,activeRoom:null}}));
  const refreshed=await pending;assert.equal(refreshed.coins,1100);assert.equal(refreshed.coinVersion,3);assert.equal(refreshed.activeRoom.code,'ABC234');
  c.account.update({...baseProfile(),coins:1100,coinVersion:3,activeRoom:null});assert.equal(c.account.getProfile().activeRoom,null);
});
test('logout refuses an active room, then logs out only after the server reports no active game',async()=>{
  let p={...baseProfile(),activeRoom:{code:'ABCD23',token:'private-room-token',mode:'online'}};
  const c=client(async(url)=>url.endsWith('/auth/logout')?response({ok:true}):response({profile:p}),{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  await c.get('account-logout').onclick();assert.equal(c.requests.filter(r=>r.url.endsWith('/auth/logout')).length,0);assert.match(c.get('profile-status').textContent,/먼저 나가/);
  assert.match(c.get('profile-active-room').textContent,/ABCD23/);assert(!c.get('profile-active-room').textContent.includes('private-room-token'));
  p={...p,activeRoom:null};await c.get('account-logout').onclick();assert.equal(c.requests.filter(r=>r.url.endsWith('/auth/logout')).length,1);assert.equal(c.account.isLoggedIn(),false);
});
test('account UI scripts and required forms are present in the page before the game client',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert(html.indexOf('src="account.js?')<html.indexOf('src="app.js?'));
  for(const id of ['account-open','account-game-open','account-lobby-summary','account-bot-hint','auth-dialog','profile-dialog','account-login-form','account-register-form','login-username','login-password','register-username','register-nickname','register-password','my-name','other-name','profile-games','profile-draws','profile-loan-section','profile-loan-principal','profile-loan-interest','profile-loan-total','profile-loan-available','profile-loan-amount','profile-loan-borrow','profile-loan-repay','profile-loan-repay-all','profile-loan-status'])assert(html.includes(`id="${id}"`),id);
  assert(html.includes('id="my-name" class="player-profile-name"'));assert(html.includes('id="other-name" class="player-profile-name"'));
  assert(!html.includes('회원가입 없이'));assert(html.includes('오래된 빚부터'));
});

test('own profile shows complete game statistics, one-time interest preview and server loan balances',async()=>{
  const p={...baseProfile(),games:12,wins:5,losses:4,draws:3,loan:{principal:500,interest:50,total:550,available:2500,limit:3000,interestRate:.1}};
  const c=client(async()=>response({profile:p}),{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  assert.equal(c.get('profile-games').textContent,'12');assert.equal(c.get('profile-wins').textContent,'5');assert.equal(c.get('profile-losses').textContent,'4');assert.equal(c.get('profile-draws').textContent,'3');
  assert.equal(c.get('profile-loan-section').classList.contains('hidden'),false);
  assert.equal(c.get('profile-loan-principal').textContent,'500코인');assert.equal(c.get('profile-loan-interest').textContent,'50코인');assert.equal(c.get('profile-loan-total').textContent,'550코인');assert.equal(c.get('profile-loan-available').textContent,'2,500코인');
  c.get('profile-loan-amount').value='101';c.get('profile-loan-amount').listeners.input();assert.match(c.get('profile-loan-preview').textContent,/이자 11코인/);
  c.get('profile-loan-amount').value='2501';c.get('profile-loan-amount').listeners.input();assert.equal(c.get('profile-loan-borrow').disabled,true);
  c.get('profile-loan-amount').value='551';c.get('profile-loan-amount').listeners.input();assert.equal(c.get('profile-loan-repay').disabled,true);
});

test('borrowing sends one idempotent request and locks both actions until the server returns',async()=>{
  let p={...baseProfile(),coinVersion:0},release;
  const c=client(async(url,options)=>{
    if(url.endsWith('/loans/borrow')){assert.equal(options.headers.Authorization,'Bearer saved-token');return new Promise(resolve=>release=resolve);}
    return response({profile:p});
  },{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  const pending=c.get('profile-loan-borrow').onclick();
  assert.equal(c.get('profile-loan-borrow').disabled,true);assert.equal(c.get('profile-loan-repay').disabled,true);assert.equal(c.get('profile-loan-repay-all').disabled,true);
  await c.get('profile-loan-borrow').onclick();
  const sent=c.requests.filter(r=>r.url.endsWith('/loans/borrow'));assert.equal(sent.length,1);
  const data=JSON.parse(sent[0].options.body);assert.equal(data.amount,100);assert.match(data.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(c.account.getProfile().coins,1000,'No optimistic local credit');
  p={...p,coins:1100,coinVersion:1,loan:{...p.loan,principal:100,interest:10,total:110,available:2900}};
  release(response({profile:p}));await pending;
  assert.equal(c.account.getProfile().coins,1100);assert.equal(c.get('profile-loan-total').textContent,'110코인');
  assert.equal(c.storage.has(LOAN_KEY),false);assert.match(c.get('profile-loan-status').textContent,/한 번 추가/);
});

test('an unknown network result retains its request ID and can retry even after the refreshed limit is exhausted',async()=>{
  let p={...baseProfile(),coinVersion:0,loan:{principal:2900,interest:290,total:3190,available:100,limit:3000,interestRate:.1}},loanCalls=0;
  const c=client(async(url)=>{
    if(url.endsWith('/loans/borrow')){
      loanCalls++;
      p={...p,coins:1100,coinVersion:1,loan:{...p.loan,principal:3000,interest:300,total:3300,available:0}};
      if(loanCalls===1)throw new TypeError('Response lost after commit');
    }
    return response({profile:p});
  },{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  await c.get('profile-loan-borrow').onclick();
  assert.equal(c.storage.has(LOAN_KEY),true);assert.equal(c.get('profile-loan-amount').disabled,true);assert.match(c.get('profile-loan-status').textContent,/중복 처리 없이/);
  await c.account.refresh();assert.equal(c.account.getProfile().loan.available,0);
  assert.equal(c.get('profile-loan-borrow').disabled,false,'The unresolved operation must still be retriable');
  await c.get('profile-loan-borrow').onclick();
  const requests=c.requests.filter(r=>r.url.endsWith('/loans/borrow')).map(r=>JSON.parse(r.options.body));
  assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(requests[0].amount,requests[1].amount);
  assert.equal(c.account.getProfile().coins,1100);assert.equal(c.storage.has(LOAN_KEY),false);assert.equal(c.get('profile-loan-borrow').disabled,true);
});

test('an unresolved loan survives a page reload and retries with the same user, amount and request ID',async()=>{
  const pending={userId:'player-one',kind:'borrow',amount:100,requestId:randomUUID()};
  const p={...baseProfile(),coins:1100,loan:{...baseProfile().loan,principal:100,interest:10,total:110,available:2900}};
  const c=client(async()=>response({profile:p}),{savedToken:'saved-token',savedValues:{[LOAN_KEY]:JSON.stringify(pending)}});
  await c.account.ready;await c.account.openProfile();assert.equal(c.get('profile-loan-amount').disabled,true);
  await c.get('profile-loan-borrow').onclick();
  const sent=JSON.parse(c.requests.find(r=>r.url.endsWith('/loans/borrow')).options.body);
  assert.equal(sent.requestId,pending.requestId);assert.equal(sent.amount,100);assert.equal(c.storage.has(LOAN_KEY),false);
});

test('full repayment includes interest above the principal cap and stays available during an active game',async()=>{
  let p={...baseProfile(),coins:4000,activeRoom:{code:'ABC234'},loan:{principal:3000,interest:300,total:3300,available:0,limit:3000,interestRate:.1}};
  const c=client(async(url,options)=>{
    if(url.endsWith('/loans/repay')){assert.equal(JSON.parse(options.body).amount,3300);p={...p,coins:700,loan:baseProfile().loan};}
    return response({profile:p});
  },{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile();
  assert.equal(c.get('profile-loan-repay-all').disabled,false);await c.get('profile-loan-repay-all').onclick();
  assert.equal(c.account.getProfile().coins,700);assert.equal(c.account.getProfile().activeRoom.code,'ABC234');
  assert.equal(c.get('profile-loan-total').textContent,'0코인');assert.equal(c.get('profile-loan-repay-all').disabled,true);
  assert.match(c.get('profile-loan-status').textContent,/3,300코인을 상환/);
});

test('definitive loan errors unlock the amount without changing displayed coins or bank debt',async()=>{
  const p=baseProfile(),c=client(async(url)=>url.endsWith('/loans/borrow')?response({error:'남은 원금 한도를 넘었습니다.'},400):response({profile:p}),{savedToken:'saved-token'});
  await c.account.ready;await c.account.openProfile();await c.get('profile-loan-borrow').onclick();
  assert.equal(c.account.getProfile().coins,1000);assert.equal(c.account.getProfile().loan.total,0);assert.equal(c.storage.has(LOAN_KEY),false);
  assert.equal(c.get('profile-loan-amount').disabled,false);assert.match(c.get('profile-loan-status').textContent,/한도를 넘었습니다/);
});

test('bank-loan controls stay private when viewing another player profile',async()=>{
  const own=baseProfile(),other={...baseProfile(),id:'other-player',nickname:'상대',games:4,draws:1,wins:2,losses:1,loan:{...own.loan,principal:500,interest:50,total:550,available:2500}};
  const c=client(async(url)=>response({profile:url.includes('/profiles/')?other:own}),{savedToken:'saved-token'});await c.account.ready;await c.account.openProfile('other-player');
  assert.equal(c.get('profile-loan-section').classList.contains('hidden'),true);assert.equal(c.get('profile-games').textContent,'4');assert.equal(c.get('profile-draws').textContent,'1');
});
