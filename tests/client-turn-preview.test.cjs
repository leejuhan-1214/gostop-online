const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cards=require('../engine.js').cards();
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const tick=()=>new Promise(setImmediate);

function makeView(overrides={}){
  return {
    rulesVersion:4,ruleRevision:4,hand:[cards[0],cards[4]],otherHandCount:2,
    floor:[cards[1]],stacks:{},deckCount:4,
    players:[0,1].map(()=>({won:[],go:0,score:{total:0,counts:{광:0,열:0,띠:0,피:0}},shaken:[],bombed:[],passes:0,gukjinPi:false})),
    turn:0,phase:'play',pending:null,inTurn:null,lastTurns:[],log:'차례 시작',winner:null,result:null,
    ...overrides
  };
}

function makeClient(initialView=makeView(),seat=0){
  const elements={},timers=new Map(),requests=[],pendingActions=[];
  let timerId=0,state={revision:1,waiting:false,view:initialView};
  function element(id=''){
    const classes=new Set();
    return {
      id,textContent:'',value:'normal',disabled:false,children:[],attributes:{},
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      setAttribute(name,value){this.attributes[name]=value;},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      addEventListener(){},showModal(){},close(){}
    };
  }
  const get=id=>elements[id]??=element(id),body=element('body');
  const fetch=async(url,options)=>{
    requests.push({url,options});
    let data;
    if(url.endsWith('/action'))data=new Promise(resolve=>pendingActions.push(resolve));
    else if(url.endsWith('/bot'))data={code:'DEF567',token:'new-test-token',seat:0,mode:'bot',difficulty:'normal'};
    else if(url.endsWith('/leave'))data={ok:true};
    else data=structuredClone(state);
    return {ok:true,json:async()=>data};
  };
  vm.runInNewContext(source,{
    document:{body,getElementById:get,createElement:()=>element()},fetch,AbortController,navigator:{},console,
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),
    sessionStorage:{getItem:()=>JSON.stringify({code:'ABC234',token:'test-token',seat,mode:'bot'}),setItem(){},removeItem(){}}
  });
  return {
    get,body,requests,timers,
    setState(next){state=structuredClone(next);},
    replyAction(result){assert(pendingActions.length,'an action must be waiting');pendingActions.shift()(structuredClone(result));},
    timer(ms){return [...timers].find(([,timer])=>timer.ms===ms);},
    async fire(ms){const entry=this.timer(ms);assert(entry,`missing ${ms}ms timer`);timers.delete(entry[0]);await entry[1].fn();await tick();}
  };
}

function response(){
  return {
    revision:2,waiting:false,
    intermediateView:makeView({hand:[cards[4]],floor:[cards[0],cards[1],cards[2]],stacks:{1:0},turn:1,log:'뻑! 세 장이 바닥에 쌓였습니다.'}),
    view:makeView({hand:[cards[4]],floor:[cards[6]],log:'봇이 뻑을 가져갔습니다.'})
  };
}
const floorLabel=client=>client.get('floor').children[0].children.at(-1).textContent;

test('a human ppuk stays visible for 900ms before the bot capture, with moves blocked',async()=>{
  const client=makeClient();await tick();
  const action=client.get('hand').children[0].onclick();await tick();
  client.replyAction(response());await tick();
  assert.equal(client.get('floor').children[0].className,'floor-stack');
  assert.equal(floorLabel(client),'내 뻑 · 3장');
  assert(client.get('hand').children.every(card=>card.disabled));
  assert.match(client.get('notice').textContent,/뻑! 세 장/);
  assert(client.timer(900));
  await client.fire(900);await action;
  assert.notEqual(client.get('floor').children[0].className,'floor-stack');
  assert.equal(client.get('floor').children[0].children[0].src,'assets/cards/m02-03.svg');
  assert.match(client.get('notice').textContent,/봇이 뻑을 가져갔습니다/);
  assert(client.get('hand').children.every(card=>!card.disabled));
});

test('polling cannot skip an active ppuk preview',async()=>{
  const client=makeClient();await tick();const result=response();
  const action=client.get('hand').children[0].onclick();await tick();
  client.replyAction(result);await tick();
  client.setState({revision:2,waiting:false,view:result.view});
  await client.fire(1500);
  assert.equal(floorLabel(client),'내 뻑 · 3장');
  assert.match(client.get('notice').textContent,/뻑! 세 장/);
  await client.fire(900);await action;
  assert.match(client.get('notice').textContent,/봇이 뻑을 가져갔습니다/);
});

test('the final state replaces a preview even if polling already applied the same revision',async()=>{
  const client=makeClient();await tick();const result=response();
  const action=client.get('hand').children[0].onclick();await tick();
  client.setState({revision:2,waiting:false,view:result.view});
  await client.fire(1500);
  assert.match(client.get('notice').textContent,/봇이 뻑을 가져갔습니다/);
  client.replyAction(result);await tick();
  assert.equal(floorLabel(client),'내 뻑 · 3장');
  await client.fire(900);await action;
  assert.match(client.get('notice').textContent,/봇이 뻑을 가져갔습니다/);
  assert.notEqual(client.get('floor').children[0].className,'floor-stack');
});

test('leaving cancels a preview and its stale callback cannot alter a new game preview',async()=>{
  const client=makeClient();await tick();
  const firstAction=client.get('hand').children[0].onclick();await tick();
  client.replyAction(response());await tick();
  const oldCallback=client.timer(900)[1].fn;
  client.get('leave').onclick();await firstAction;await tick();
  assert.equal(client.body.classList.contains('playing'),false);
  assert.equal(client.timer(900),undefined);
  assert.equal(client.get('lobby').classList.contains('hidden'),false);
  client.setState({revision:1,waiting:false,view:makeView()});
  client.get('bot').onclick();await tick();
  const newAction=client.get('hand').children[0].onclick();await tick();
  client.replyAction(response());await tick();
  oldCallback();await tick();
  assert.equal(client.body.classList.contains('playing'),true);
  assert.equal(floorLabel(client),'내 뻑 · 3장');
  assert(client.timer(900),'the new preview timer must survive a stale callback');
  await client.fire(900);await newAction;
  assert.match(client.get('notice').textContent,/봇이 뻑을 가져갔습니다/);
});

test('three-card labels distinguish initial, self and opponent stacks from either seat',async()=>{
  for(const seat of [0,1]){
    const client=makeClient(makeView({
      floor:[0,1,2,4,5,6,8,9,10].map(id=>cards[id]),
      stacks:{1:null,2:seat,3:1-seat}
    }),seat);await tick();
    const stacks=client.get('floor').children;
    assert.deepEqual(stacks.map(pile=>pile.children.at(-1).textContent),['처음 3장','내 뻑 · 3장','상대 뻑 · 3장']);
    assert.deepEqual(stacks.map(pile=>pile.attributes['data-stack-owner']),['initial','mine','other']);
    assert.match(stacks[2].attributes['aria-label'],/^3월 벚꽃 상대 뻑/);
    assert(stacks.every(pile=>pile.children.slice(0,3).every(card=>card.disabled)));
  }
});

test('canGo false blocks go while allowing stop, and old views without the flag keep go available',async()=>{
  const client=makeClient(makeView({phase:'decision',canGo:false}));await tick();
  assert.equal(client.get('go').disabled,true);
  assert.equal(client.get('stop').disabled,false);
  assert.equal(client.get('decisions').classList.contains('hidden'),false);
  client.setState({revision:2,waiting:false,view:makeView({rulesVersion:3,ruleRevision:undefined,phase:'decision'})});
  await client.fire(1500);
  assert.equal(client.get('go').disabled,false);
});

test('migrated rules allow decision-time gukjin while keeping shakes and passes out of decisions',async()=>{
  const decision=makeView({rulesVersion:3,ruleRevision:4,phase:'decision',canGo:false});
  decision.players[0].won=[cards[32]];decision.players[0].shaken=[3];decision.players[0].go=1;decision.players[0].passes=1;
  const client=makeClient(decision);await tick();
  assert.equal(client.get('special-actions').children.length,1);
  assert.equal(client.get('special-actions').children[0].textContent,'국진: 쌍피로');
  assert.equal(client.get('my-go').textContent,'1고 · 3월 흔듦');
  client.setState({revision:2,waiting:false,view:{...decision,ruleRevision:undefined}});
  await client.fire(1500);
  assert.equal(client.get('special-actions').children.length,0);
});
