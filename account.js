(()=>{'use strict';
const $=id=>document.getElementById(id),API='https://flower-gostop-relay.magic-shark-7297.chatgpt.site',KEY='flower-gostop-account-v1',LOAN_KEY=KEY+'-loan-pending';
const listeners=new Set(),number=new Intl.NumberFormat('ko-KR');
let token='',profile=null,authBusy=false,profileRequest=0,refreshRequest=null,refreshToken='',offline=false,profileIsOwn=false,loanBusy=false,loanAttempt=null;
try{token=localStorage.getItem(KEY)||'';}catch{}
try{const saved=JSON.parse(localStorage.getItem(LOAN_KEY)||'null');if(saved&&typeof saved.userId==='string'&&['borrow','repay'].includes(saved.kind)&&Number.isSafeInteger(saved.amount)&&saved.amount>0&&typeof saved.requestId==='string')loanAttempt=saved;}catch{}
const text=(id,value)=>{$(id).textContent=value;};
const show=(id,visible)=>$(id).classList.toggle('hidden',!visible);
const format=value=>Number.isFinite(value)?number.format(value):'—';
function persist(){try{if(token)localStorage.setItem(KEY,token);else localStorage.removeItem(KEY);}catch{}}
function notify(){for(const listener of listeners){try{listener(profile);}catch(error){console.error(error);}}}
function debtOf(p){return Array.isArray(p?.debt)?p.debt.filter(d=>Number.isFinite(d.amount)&&d.amount>0):[];}
function debtTotal(p){return Number.isFinite(p?.totalDebt)?p.totalDebt:debtOf(p).reduce((sum,d)=>sum+d.amount,0);}
function titleOf(p){const debt=debtOf(p);if(debtTotal(p)<=0)return '';return typeof p.title==='string'&&p.title?p.title:debt.length?`${debt[0].creditorNickname}의 노예`:'';}
function renderAccount(){
  const signedIn=Boolean(token&&profile),coins=signedIn?`${format(profile.coins)}코인`:'';
  text('account-open',signedIn?`${profile.nickname} · ${coins}`:token?'계정 다시 확인':'로그인 · 회원가입');
  text('account-lobby-summary',signedIn?(offline?'코인 정보를 다시 확인해 주세요.':titleOf(profile)||'1점 = 1코인 · 내 프로필 보기'):'처음 가입하면 1,000코인');
  text('account-game-name',signedIn?'내 프로필':'로그인');
  text('account-game-coins',signedIn?coins:'');
  $('account-game-open').classList.toggle('signed-in',signedIn);
  $('account-game-open').setAttribute('aria-label',signedIn?`${profile.nickname} 프로필, ${coins}`:'로그인 또는 회원가입');
  const blocked=signedIn&&Number.isFinite(profile.coins)&&profile.coins<10;
  show('account-bot-hint',blocked);
  text('account-bot-hint',blocked?'봇 대전은 10코인 이상부터 가능합니다. 친구 대전은 계속할 수 있어요.':'');
  if(blocked)$('bot').disabled=true;
}
function update(next){
  if(!next||typeof next!=='object'||!Number.isFinite(next.coins))return;
  if(profile?.id===next.id&&Number.isFinite(profile.coinVersion)&&Number.isFinite(next.coinVersion)&&next.coinVersion<profile.coinVersion){offline=false;renderAccount();return;}
  profile=next;offline=false;renderAccount();
  if(profileIsOwn&&$('profile-dialog').open)renderProfile(profile,true);
  notify();
}
function clearAccount(message=''){
  token='';profile=null;offline=false;profileRequest++;persist();renderAccount();notify();
  if($('profile-dialog').open)$('profile-dialog').close();
  if(message)text('auth-status',message);
}
async function request(path,{data,authenticated=true}={}){
  const current=authenticated?token:'',headers={},controller=new AbortController();
  if(current)headers.Authorization='Bearer '+current;
  if(data!==undefined)headers['Content-Type']='application/json';
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(API+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,cache:'no-store'});
    const result=await response.json();
    if(!response.ok){
      const error=new Error(result.error||'계정 요청을 처리하지 못했습니다.');error.status=response.status;
      if(response.status===401&&current&&current===token)clearAccount('로그인이 만료됐어요. 다시 로그인해 주세요.');
      throw error;
    }
    return result;
  }catch(error){
    if(error.name==='AbortError')throw new Error('서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.');
    if(error instanceof TypeError)throw new Error('계정 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    if(error instanceof SyntaxError)throw new Error('계정 서버의 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');
    throw error;
  }finally{clearTimeout(timeout);}
}
function refresh(){
  if(!token)return Promise.resolve(null);
  if(refreshRequest&&refreshToken===token)return refreshRequest;
  const current=token;refreshToken=current;
  const pending=request('/me').then(result=>{
    if(current!==token)return profile;
    const next=result.profile||result;
    if(!Number.isFinite(next?.coins))throw new Error('코인 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
    update(next);return profile;
  }).catch(error=>{
    if(current===token){offline=true;renderAccount();}
    throw error;
  }).finally(()=>{if(refreshRequest===pending){refreshRequest=null;refreshToken='';}});
  refreshRequest=pending;return pending;
}
function selectAuthTab(tab){
  const register=tab==='register';
  show('account-login-form',!register);show('account-register-form',register);
  $('account-login-tab').setAttribute('aria-selected',String(!register));
  $('account-register-tab').setAttribute('aria-selected',String(register));
  $('account-login-tab').tabIndex=register?-1:0;$('account-register-tab').tabIndex=register?0:-1;
  text('auth-status','');
}
function openAuth(message=''){
  if($('profile-dialog').open)$('profile-dialog').close();
  selectAuthTab('login');text('auth-status',message);
  if(!$('auth-dialog').open)$('auth-dialog').showModal();
}
function requireLogin(){if(token&&profile)return true;openAuth(token?'계정 정보를 확인할 수 없습니다. 다시 로그인해 주세요.':'로그인하면 코인과 전적을 저장하고 대전할 수 있어요.');return false;}
function setAuthBusy(busy){
  authBusy=busy;
  for(const id of ['account-login-submit','account-register-submit','account-login-tab','account-register-tab'])$(id).disabled=busy;
}
async function submitAuth(mode,event){
  event.preventDefault();if(authBusy)return;
  const register=mode==='register',prefix=register?'register':'login';
  const username=$(`${prefix}-username`).value.trim(),password=$(`${prefix}-password`).value;
  const nickname=register?$('register-nickname').value.trim().normalize('NFC'):'';
  if(!/^[A-Za-z0-9_]{4,24}$/.test(username)){text('auth-status','아이디는 영문·숫자·밑줄로 4~24자 입력해 주세요.');return;}
  if(password.length<10||password.length>128){text('auth-status','비밀번호는 10~128자로 입력해 주세요.');return;}
  if(register&&!/^[\p{Script=Hangul}A-Za-z0-9_ -]{2,16}$/u.test(nickname)){text('auth-status','닉네임은 한글·영문·숫자·공백·밑줄·하이픈으로 2~16자 입력해 주세요.');return;}
  setAuthBusy(true);text('auth-status',register?'계정을 만들고 있습니다...':'로그인하고 있습니다...');
  try{
    const result=await request('/auth/'+mode,{data:register?{username,nickname,password}:{username,password},authenticated:false});
    if(typeof result.token!=='string'||!result.token||!Number.isFinite(result.profile?.coins))throw new Error('계정 정보를 받지 못했습니다. 다시 로그인해 주세요.');
    token=result.token;persist();update(result.profile);
    $('login-password').value='';$('register-password').value='';
    $('auth-dialog').close();text('auth-status','');
  }catch(error){text('auth-status',error.message||'계정 서버에 연결하지 못했습니다.');}
  finally{setAuthBusy(false);}
}
function recentResultText(p){
  const recent=p.recentResult||p.lastResult;
  if(typeof recent==='string')return recent;
  if(!recent||typeof recent!=='object')return '';
  if(typeof recent.message==='string')return recent.message;
  if(typeof recent.text==='string')return recent.text;
  if(Number.isFinite(recent.delta))return `${recent.opponentNickname?recent.opponentNickname+'와 ':''}최근 정산 ${recent.delta>0?'+':''}${format(recent.delta)}코인${recent.reason==='forfeit'?' · 기권 정산':recent.reason==='draw'?' · 무승부':''}`;
  return '';
}
function renderProfile(p,own){
  text('profile-nickname',p.nickname||'프로필');
  text('profile-username',own&&p.username?`@${p.username}`:'');
  text('profile-coins',format(p.coins));text('profile-wins',format(p.wins));text('profile-losses',format(p.losses));
  text('profile-games',format(p.games??((p.wins||0)+(p.losses||0)+(p.draws||0))));text('profile-draws',format(p.draws||0));
  const activeRoom=own&&p.activeRoom;
  text('profile-active-room',activeRoom?`진행 중인 방 ${activeRoom.code} · 게임 화면에서 이어서 플레이하세요.`:'');show('profile-active-room',Boolean(activeRoom));
  const title=titleOf(p);text('profile-title',title);show('profile-title',Boolean(title));
  const debt=debtOf(p),total=debtTotal(p);show('profile-debt-section',total>0);
  text('profile-debt-total',`${format(total)}코인`);
  const rows=debt.map(item=>{const row=document.createElement('li'),name=document.createElement('span'),amount=document.createElement('strong');name.textContent=item.creditorNickname;amount.textContent=`${format(item.amount)}코인`;row.append(name,amount);return row;});
  $('profile-debts').replaceChildren(...rows);
  text('profile-debt-help',debt.length>1?`외 ${debt.length-1}명에게도 빚이 있어요. 승리하거나 코인을 빌리면 오래된 빚부터 갚고, 모두 갚으면 칭호가 사라집니다.`:'승리하거나 코인을 빌리면 상대에게 진 빚을 먼저 갚습니다. 모두 갚으면 칭호가 사라집니다.');
  renderLoan(p,own);
  const recent=recentResultText(p);text('profile-recent',recent);show('profile-recent',Boolean(recent));
  show('account-logout',own);show('profile-body',true);
}
function saveLoanAttempt(){try{if(loanAttempt)localStorage.setItem(LOAN_KEY,JSON.stringify(loanAttempt));else localStorage.removeItem(LOAN_KEY);}catch{}}
function loanOf(p){const loan=p?.loan;return loan&&['principal','interest','total','available'].every(key=>Number.isFinite(loan[key]))?loan:null;}
function renderLoan(p,own){
  const loan=loanOf(p),visible=Boolean(own&&loan);show('profile-loan-section',visible);if(!visible)return;
  for(const key of ['principal','interest','total','available'])text('profile-loan-'+key,`${format(loan[key])}코인`);
  const pending=loanAttempt?.userId===p.id?loanAttempt:null;
  if(pending)$('profile-loan-amount').value=String(pending.amount);
  const amount=Number($('profile-loan-amount').value),valid=Number.isSafeInteger(amount)&&amount>0,interest=valid?Math.ceil(amount/10):0,repayable=Math.min(loan.total,Math.max(0,p.coins));
  text('profile-loan-preview',valid?`${format(amount)}코인 대출 시 이자 ${format(interest)}코인 · 이번 대출 상환액 ${format(amount+interest)}코인`:'1코인 이상의 정수 금액을 입력해 주세요.');
  text('profile-loan-help',`지금 상환할 수 있는 금액 ${format(repayable)}코인 · 이자부터 갚고 남은 금액으로 원금을 갚습니다.${debtTotal(p)>0?' 빌린 코인은 상대에게 진 빚부터 갚습니다.':''}`);
  $('profile-loan-amount').disabled=loanBusy||Boolean(pending);
  $('profile-loan-borrow').disabled=loanBusy||(!pending&&(!valid||amount>loan.available||amount>3000))||Boolean(pending&&pending.kind!=='borrow');
  $('profile-loan-repay').disabled=loanBusy||(!pending&&(!valid||amount>repayable))||Boolean(pending&&pending.kind!=='repay');
  $('profile-loan-repay-all').disabled=loanBusy||Boolean(pending)||loan.total<1||loan.total>Math.max(0,p.coins);
  if(pending&&!loanBusy)text('profile-loan-status',`이전 ${pending.kind==='borrow'?'대출':'상환'} 결과를 확인해야 합니다. 같은 버튼을 다시 누르면 중복 처리 없이 확인합니다.`);
}
async function submitLoan(kind,all=false){
  if(loanBusy||!requireLogin())return;
  const loan=loanOf(profile);if(!loan)return;
  const amount=all?loan.total:Number($('profile-loan-amount').value);
  if(!Number.isSafeInteger(amount)||amount<1){text('profile-loan-status','1코인 이상의 정수 금액을 입력해 주세요.');return;}
  let operation=loanAttempt?.userId===profile.id?loanAttempt:null;
  if(operation&&(operation.kind!==kind||operation.amount!==amount)){text('profile-loan-status','이전 요청과 같은 금액으로 먼저 결과를 확인해 주세요.');return;}
  if(!operation){
    if(kind==='borrow'&&(amount>loan.available||amount>3000)){text('profile-loan-status','남은 원금 한도 안에서 대출 금액을 입력해 주세요.');return;}
    if(kind==='repay'&&amount>Math.min(loan.total,Math.max(0,profile.coins))){text('profile-loan-status','남은 대출액과 보유 코인 안에서 상환 금액을 입력해 주세요.');return;}
    operation={userId:profile.id,kind,amount,requestId:crypto.randomUUID()};loanAttempt=operation;saveLoanAttempt();
  }
  const current=token;loanBusy=true;renderLoan(profile,true);text('profile-loan-status',kind==='borrow'?'대출을 처리하고 있습니다...':'상환을 처리하고 있습니다...');
  try{
    const result=await request('/loans/'+kind,{data:{amount,requestId:operation.requestId}});
    if(current!==token)return;
    if(!Number.isFinite(result.profile?.coins)||!loanOf(result.profile))throw new Error('대출 결과를 확인하지 못했습니다. 같은 버튼으로 다시 확인해 주세요.');
    if(loanAttempt===operation){loanAttempt=null;saveLoanAttempt();}
    update(result.profile);
    text('profile-loan-status',kind==='borrow'?`${format(amount)}코인을 빌렸습니다. 이자 ${format(Math.ceil(amount/10))}코인이 한 번 추가됐습니다.`:`${format(amount)}코인을 상환했습니다.`);
  }catch(error){
    if(current!==token)return;
    if(error.status>=400&&error.status<500){
      if(loanAttempt===operation){loanAttempt=null;saveLoanAttempt();}
      if(error.status===409)await refresh().catch(()=>{});
    }
    text('profile-loan-status',error.message||'대출 요청을 확인하지 못했습니다. 같은 버튼으로 다시 확인해 주세요.');
  }finally{loanBusy=false;if(profile&&profileIsOwn)renderLoan(profile,true);}
}
async function openProfile(id){
  if(!requireLogin())return;
  if($('auth-dialog').open)$('auth-dialog').close();
  const own=id===undefined||id===null||String(id)===String(profile.id),run=++profileRequest;
  profileIsOwn=own;
  text('profile-status','');show('account-logout',own);
  if(own)renderProfile(profile,true);else{show('profile-body',false);text('profile-nickname','프로필 불러오는 중');text('profile-username','');text('profile-status','프로필을 불러오고 있습니다...');}
  if(!$('profile-dialog').open)$('profile-dialog').showModal();
  try{
    const result=own?await refresh():await request('/profiles/'+encodeURIComponent(String(id)));
    if(run!==profileRequest||!token)return;
    const next=own?result:(result.profile||result);renderProfile(next,own);text('profile-status','');
  }catch(error){if(run===profileRequest)text('profile-status',error.message||'프로필을 불러오지 못했습니다.');}
}
async function logout(){
  if(!token)return;
  $('account-logout').disabled=true;text('profile-status','계정을 확인하고 있습니다...');
  try{
    await refresh();if(!profile)return;
    if(profile.activeRoom){text('profile-status','진행 중인 방에서 먼저 나가 주세요. 방을 나간 뒤 로그아웃할 수 있습니다.');return;}
    await request('/auth/logout',{data:{}});clearAccount();
  }catch(error){text('profile-status',error.message||'로그아웃하지 못했습니다. 다시 시도해 주세요.');}
  finally{$('account-logout').disabled=false;}
}
$('account-login-tab').onclick=()=>selectAuthTab('login');$('account-register-tab').onclick=()=>selectAuthTab('register');
for(const id of ['account-login-tab','account-register-tab'])$(id).addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||authBusy)return;
  event.preventDefault();const register=event.key==='End'||(event.key!=='Home'&&id==='account-login-tab');
  selectAuthTab(register?'register':'login');$(register?'account-register-tab':'account-login-tab').focus();
});
$('account-login-form').addEventListener('submit',event=>submitAuth('login',event));
$('account-register-form').addEventListener('submit',event=>submitAuth('register',event));
$('account-open').onclick=()=>(token&&profile)?openProfile():openAuth();
$('account-game-open').onclick=()=>(token&&profile)?openProfile():openAuth();
$('auth-close').onclick=()=>$('auth-dialog').close();$('profile-close').onclick=()=>{profileRequest++;$('profile-dialog').close();};
$('auth-dialog').addEventListener('close',()=>{$('login-password').value='';$('register-password').value='';});
$('account-logout').onclick=logout;
$('profile-loan-amount').addEventListener('input',()=>{if(profile&&profileIsOwn){text('profile-loan-status','');renderLoan(profile,true);}});
$('profile-loan-borrow').onclick=()=>submitLoan('borrow');
$('profile-loan-repay').onclick=()=>submitLoan('repay');
$('profile-loan-repay-all').onclick=()=>submitLoan('repay',true);
window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  token=event.newValue||'';profile=null;offline=false;profileRequest++;renderAccount();notify();
  if(token)refresh().catch(()=>{});else if($('profile-dialog').open)$('profile-dialog').close();
});
const account={ready:null,getToken:()=>token,getProfile:()=>profile,isLoggedIn:()=>Boolean(token&&profile),requireLogin,refresh,update,openProfile,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
window.FlowerAccount=account;renderAccount();
account.ready=token?refresh().catch(error=>{text('auth-status',error.message||'계정을 불러오지 못했습니다.');return null;}):Promise.resolve(null);
})();
