(()=>{'use strict';
const $=id=>document.getElementById(id),API='https://flower-gostop-relay.magic-shark-7297.chatgpt.site',KEY='flower-gostop-session-v1',NAMES=['송학','매화','벚꽃','흑싸리','난초','모란','적싸리','공산','국화','단풍','오동','비'];
let session=null,lastView=null,revision=-1,timer=null,generation=0,busy=false,offline=false,previewing=false,previewTimer=null,previewResolve=null;
function screen(id){['lobby','waiting','game'].forEach(x=>$(x).classList.toggle('hidden',x!==id));document.body.classList.toggle('playing',id==='game');}
function status(id,msg){$(id).textContent=msg;}
function save(){try{if(session)sessionStorage.setItem(KEY,JSON.stringify(session));else sessionStorage.removeItem(KEY);}catch{}}
async function request(path,{data,token}={}){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000),headers={};if(data!==undefined)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;try{const response=await fetch(API+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,cache:'no-store'});const result=await response.json();if(!response.ok){const error=new Error(result.error||'서버에 연결하지 못했습니다.');error.status=response.status;throw error;}return result;}finally{clearTimeout(timeout);}}
function cancelPreview(){const resolve=previewResolve;if(previewTimer!==null)clearTimeout(previewTimer);previewTimer=null;previewResolve=null;previewing=false;if(resolve)resolve();}
function reset(notify=false){generation++;cancelPreview();if(timer!==null)clearTimeout(timer);timer=null;const previous=session;session=null;lastView=null;revision=-1;busy=false;offline=false;save();screen('lobby');status('lobby-status','');if(notify&&previous)request('/leave',{data:{code:previous.code},token:previous.token}).catch(()=>{});}
function start(s){generation++;session=s;lastView=null;revision=-1;save();const levels={easy:'쉬움',normal:'보통',hard:'어려움'};$('game-room').textContent=s.mode==='bot'?'· '+(levels[s.difficulty]||'보통'):'· '+s.code;$('other-name').textContent=s.mode==='bot'?'고스톱 봇':'상대방';if(s.seat===0&&s.mode!=='bot'){$('room-code').textContent=s.code;screen('waiting');status('wait-status','친구가 입장하면 게임이 시작돼요.');}else{screen('game');status('notice','게임을 준비하고 있습니다...');}poll(generation);}
function updateState(result,force=false){if(previewing||result.revision<revision||(result.revision===revision&&!offline&&!force))return;offline=false;revision=result.revision;if(result.waiting){screen('waiting');$('room-code').textContent=session.code;status('wait-status','친구가 입장하면 게임이 시작돼요.');return;}if(result.view){lastView=result.view;screen('game');render();}}
async function poll(run){if(!session||run!==generation)return;const current=session;try{const result=await request('/state?code='+encodeURIComponent(current.code),{token:current.token});if(run!==generation)return;updateState(result);}catch(e){if(run!==generation)return;if(e.status===403||e.status===404){reset();status('lobby-status',e.message);return;}offline=true;status($('game').classList.contains('hidden')?'wait-status':'notice','서버에 다시 연결하고 있어요. 인터넷 연결을 확인해 주세요.');}if(run===generation)timer=setTimeout(()=>poll(run),1500);}
async function action(a){
  if(!session||busy)return;
  busy=true;render();const run=generation,current=session;let message='';
  try{
    const result=await request('/action',{data:{code:current.code,revision,action:a},token:current.token});
    if(run!==generation)return;
    if(result.intermediateView&&result.revision>=revision){
      previewing=true;lastView=result.intermediateView;render();
      await new Promise(resolve=>{
        previewResolve=resolve;
        previewTimer=setTimeout(()=>{if(previewResolve===resolve){previewTimer=null;previewResolve=null;}resolve();},900);
      });
      if(run!==generation)return;
      previewing=false;
      // A poll may already have returned this revision before the action response.
      updateState(result,true);
    }else updateState(result);
  }catch(e){message=e.name==='AbortError'?'서버 응답이 늦습니다. 잠시 후 다시 눌러 주세요.':e.message;}
  finally{if(run===generation){cancelPreview();busy=false;render();if(message)status('notice',message);}}
}
function playerMarks(player){return [player.go?`${player.go}고`:'',player.ppeokCount?`${player.ppeokCount}뻑`:'',...(player.shaken||[]).map(month=>`${month}월 흔듦`)].filter(Boolean).join(' · ');}
function cardLabel(c){const type=lastView?.stacks&&(c.id===41||c.id===47)?'쌍피':c.type;return `${c.month}월 ${NAMES[c.month-1]} ${type}`;}
function fitCards(){
  if(typeof getComputedStyle!=='function')return;
  for(const id of ['floor','hand']){
    const area=$(id);
    if(!area.clientWidth||!area.clientHeight||!area.children.length)continue;
    const css=getComputedStyle(area),px=value=>parseFloat(value)||0;
    const columns=css.gridTemplateColumns.trim().split(/\s+/).length;
    const rows=Math.ceil(area.children.length/columns);
    const width=area.clientWidth-px(css.paddingLeft)-px(css.paddingRight);
    const height=area.clientHeight-px(css.paddingTop)-px(css.paddingBottom);
    // Leave room for the offset edges of a three-card stack in its grid cell.
    const inset=area.querySelector('.floor-stack')?6:0;
    const cellWidth=(width-px(css.columnGap)*(columns-1))/columns-inset;
    const cellHeight=(height-px(css.rowGap)*(rows-1))/rows-inset;
    const size=Math.max(0,Math.floor(Math.min(cellWidth,cellHeight*103.2/168.2,id==='hand'?76:64)*100)/100);
    area.style.setProperty('--card-width',size+'px');
  }
}
function card(c,clickable,onClick){const b=document.createElement('button'),type=lastView?.stacks&&(c.id===41||c.id===47)?'쌍피':c.type;b.type='button';b.className='card '+(c.type==='광'?'bright':'');b.disabled=!clickable||busy;b.setAttribute('aria-label',cardLabel(c));const img=document.createElement('img');img.className='card-image';img.src=`assets/cards/m${String(c.month).padStart(2,'0')}-${String(c.id%4+1).padStart(2,'0')}.svg`;img.alt='';img.draggable=false;const month=document.createElement('span');month.className='card-month';month.textContent=`${c.month}월 ${NAMES[c.month-1]}`;const tag=document.createElement('span');tag.className='card-tag';tag.textContent=type;b.append(img,month,tag);if(onClick)b.onclick=onClick;return b;}
function renderWon(id,p){
  const kind=item=>item.id===32&&p.gukjinPi?'피':item.type;
  const groups=[['광','광','bright'],['열','열끗','animal'],['띠','띠','ribbon'],['피','피','pi']].map(([type,name,key])=>{
    const group=document.createElement('section'),label=document.createElement('span'),pile=document.createElement('div');
    group.className='won-group';group.setAttribute('data-kind',key);
    label.className='won-label';label.textContent=`${name} ${p.score.counts[type]}`;
    group.setAttribute('aria-label',label.textContent);
    const cards=p.won.filter(item=>kind(item)===type).sort((a,b)=>a.id-b.id);
    pile.className='won-pile';pile.setAttribute('style',`--won-count: ${Math.max(1,cards.length)}`);
    for(const item of cards){
      const img=document.createElement('img');
      img.src=`assets/cards/m${String(item.month).padStart(2,'0')}-${String(item.id%4+1).padStart(2,'0')}.svg`;
      img.alt=`${item.month}월 ${NAMES[item.month-1]} ${kind(item)}`;img.title=img.alt;img.draggable=false;
      pile.append(img);
    }
    if(!cards.length){const empty=document.createElement('span');empty.className='won-empty';empty.textContent='—';pile.append(empty);}
    group.append(label,pile);return group;
  });
  $(id).replaceChildren(...groups);
}
function renderFloor(v,myTurn){const items=[],shown=new Set(),floor=v.floor.slice().sort((a,b)=>a.month-b.month||a.id-b.id);for(const c of floor){const stack=v.stacks&&Object.prototype.hasOwnProperty.call(v.stacks,c.month)?floor.filter(x=>x.month===c.month):[];if(stack.length===3){if(shown.has(c.month))continue;shown.add(c.month);const pile=document.createElement('div');pile.className='floor-stack';pile.setAttribute('aria-label',`${c.month}월 ${NAMES[c.month-1]} 세 장 쌓임`);for(const x of stack)pile.append(card(x,false));const label=document.createElement('span');label.className='stack-label';label.textContent=v.stacks[c.month]===null?'처음 3장':v.stacks[c.month]===session.seat?'내 뻑 · 3장':'상대 뻑 · 3장';pile.setAttribute('data-stack-owner',v.stacks[c.month]===null?'initial':v.stacks[c.month]===session.seat?'mine':'other');pile.setAttribute('aria-label',`${c.month}월 ${NAMES[c.month-1]} ${label.textContent}`);pile.append(label);items.push(pile);}else items.push(card(c,myTurn&&v.phase==='choose'&&v.pending.options.includes(c.id),()=>action({type:'choose',id:c.id})));} $('floor').replaceChildren(...items);}
function describeTurn(t,seat){const who=t.seat===seat?'나':session.mode==='bot'?'봇':'상대';const played=t.played?.length?t.played.map(cardLabel).join(', '):'손패 없이 뒤집기';const drawn=t.drawn?cardLabel(t.drawn):'아직 안 뒤집음';const captures=(t.captures||[]).map(c=>`${c.source==='draw'?'뒤집기로':c.source==='bonus'?'피 가져오기':'낸 패로'} ${c.cards.map(cardLabel).join(' + ')}`);return `${who} · 낸 패: ${played} / 뒤집은 패: ${drawn}${captures.length?' / 획득: '+captures.join(' | '):''}${t.events?.length?' / '+t.events.join(', '):''}`;}
function renderHistory(v,seat){const turns=(v.lastTurns||[]).slice(-2);if(v.inTurn){if(turns.length>=2)turns.shift();turns.push({...v.inTurn,seat:v.turn,events:[]});}const box=$('turn-details'),full=$('history-content'),lines=[],details=[];for(const t of turns){const text=describeTurn(t,seat),line=document.createElement('div'),detail=document.createElement('p'),who=t.seat===seat?'나':session.mode==='bot'?'봇':'상대',played=t.played?.length?t.played.map(cardLabel).join(', '):'뒤집기만';line.className='turn-line';line.textContent=`${who} 낸 패 ${played} · 뒤집은 패 ${t.drawn?cardLabel(t.drawn):'대기 중'}`;line.title=text;detail.textContent=text;lines.push(line);details.push(detail);}box.replaceChildren(...lines);full.replaceChildren(...details);box.classList.toggle('hidden',lines.length===0);$('history-open').classList.toggle('hidden',lines.length===0);}
function renderSpecial(v,me,myTurn){
  const box=$('special-actions'),buttons=[];
  if(v.stacks&&myTurn&&(v.phase==='play'||(v.phase==='decision'&&(v.ruleRevision||v.rulesVersion)>=4))){
    if(me.won.some(c=>c.id===32)){
      const b=document.createElement('button');b.textContent=me.gukjinPi?'국진: 열끗으로':'국진: 쌍피로';
      b.disabled=busy;b.onclick=()=>action({type:'gukjin'});buttons.push(b);
    }
    if(v.phase==='play'){
      const months=[...new Set(v.hand.map(c=>c.month))];
      for(const month of months){
        if(v.hand.filter(c=>c.month===month).length!==3)continue;
        const matching=v.floor.filter(c=>c.month===month).length;
        if(matching===0&&!(me.shaken||[]).includes(month)&&!(me.bombed||[]).includes(month)){
          const b=document.createElement('button');b.textContent=month+'월 흔들기';
          b.disabled=busy;b.onclick=()=>action({type:'shake',month});buttons.push(b);
        }
        if(matching===1){
          const b=document.createElement('button');b.textContent=month+'월 폭탄';
          b.disabled=busy;b.onclick=()=>action({type:'bomb',month});buttons.push(b);
        }
      }
      if(me.passes>0){
        const b=document.createElement('button');b.textContent='뒤집기 ('+me.passes+'회)';
        b.disabled=busy;b.onclick=()=>action({type:'pass'});buttons.push(b);
      }
    }
  }
  box.replaceChildren(...buttons);box.classList.toggle('hidden',buttons.length===0);
}
function render(){const v=lastView;if(!v||!session)return;const seat=session.seat,me=v.players[seat],other=v.players[1-seat],myTurn=v.turn===seat;$('other-score').textContent=other.score.total+'점';$('my-score').textContent=me.score.total+'점';$('other-go').textContent=playerMarks(other);$('my-go').textContent=playerMarks(me);$('other-cards').textContent=`손패 ${v.otherHandCount}장`;$('my-role').textContent=session.mode==='bot'?'혼자 하기':seat===0?'방장':'참가자';$('deck-count').textContent=v.deckCount;renderWon('other-won',other);renderWon('my-won',me);renderFloor(v,myTurn);renderSpecial(v,me,myTurn);renderHistory(v,seat);$('hand').replaceChildren(...v.hand.slice().sort((a,b)=>a.month-b.month||a.id-b.id).map(c=>card(c,myTurn&&v.phase==='play',()=>action({type:'play',id:c.id}))));$('decisions').classList.toggle('hidden',!(myTurn&&v.phase==='decision'));$('go').disabled=busy||v.canGo===false;$('stop').disabled=busy;let text=v.log;if(v.phase==='end')text=v.winner===null?'무승부! '+v.log:(v.winner===seat?'승리! ':'아쉽지만 패배! ')+v.log;else if(myTurn&&v.phase==='choose')text=`${v.pending.source==='draw'?'뒤집은 패':'낸 패'} ${cardLabel(v.pending.card)}와 짝지을 바닥패를 선택하세요.`;else if(myTurn&&v.phase==='play')text=(v.log?v.log+' · ':'')+(v.hand.length?'내 차례 · 낼 손패를 선택하세요.':'내 차례 · 뒤집기를 선택하세요.');else if(!myTurn)text=(v.log?v.log+' · ':'')+'상대방의 차례를 기다리고 있어요.';status('notice',text);const detail=$('result-detail');if(v.phase==='end'&&v.result){const r=v.result;detail.textContent=`기본 ${r.base}점${r.goBonus?' + 고 '+r.goBonus+'점':''}${r.multipliers.map(x=>` · ${x.name} ×${x.factor}`).join('')} = ${r.total}점`;detail.classList.toggle('hidden',false);}else detail.classList.toggle('hidden',true);$('bot-rematch').classList.toggle('hidden',!(v.phase==='end'&&session.mode==='bot'));fitCards();}
async function enter(path,data){$('host').disabled=true;$('join').disabled=true;$('bot').disabled=true;status('lobby-status',path==='/bot'?'봇 대전을 준비하고 있어요...':path==='/rooms'?'방을 만들고 있어요...':'방에 입장하고 있어요...');try{const result=await request(path,{data});start(result);}catch(e){status('lobby-status',e.name==='AbortError'?'서버 응답이 늦습니다. 다시 시도해 주세요.':e.message||'서버에 연결할 수 없습니다.');}finally{$('host').disabled=false;$('join').disabled=false;$('bot').disabled=false;}}
if(typeof ResizeObserver==='function'){
  const observer=new ResizeObserver(fitCards);
  observer.observe($('floor'));observer.observe($('hand'));
}
$('bot').onclick=()=>{const difficulty=$('bot-difficulty').value;reset();enter('/bot',{difficulty});};
$('bot-rematch').onclick=()=>{const difficulty=session?.difficulty||'normal';reset(true);enter('/bot',{difficulty});};
$('host').onclick=()=>{reset();enter('/rooms',{});};
$('join').onclick=()=>{const code=$('code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code)){status('lobby-status','6자리 방 코드를 입력해 주세요.');return;}reset();enter('/join',{code});};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(session.code);status('wait-status','코드를 복사했어요! 친구에게 보내 주세요.');}catch{status('wait-status','위 코드를 직접 복사해 친구에게 보내 주세요.');}};
$('cancel').onclick=()=>reset(true);$('leave').onclick=()=>reset(true);$('go').onclick=()=>action({type:'decision',choice:'go'});$('stop').onclick=()=>action({type:'decision',choice:'stop'});$('rules-open').onclick=()=>$('rules').showModal();$('rules-close').onclick=()=>$('rules').close();$('history-open').onclick=()=>$('history').showModal();$('history-close').onclick=()=>$('history').close();$('code').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'');});$('code').addEventListener('keydown',e=>{if(e.key==='Enter')$('join').click();});
try{const previous=JSON.parse(sessionStorage.getItem(KEY)||'null');if(previous&&typeof previous.code==='string'&&typeof previous.token==='string'&&(previous.seat===0||previous.seat===1))start(previous);}catch{}
})();
