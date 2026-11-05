const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../engine.js'),all=E.cards(),source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function makeClient(view){
  const els={},requests=[],body={classList:{toggle(k,v){this[k]=v;}}};
  function element(id=''){return{id,textContent:'',value:'',disabled:false,children:[],attributes:{},classList:{hidden:['waiting','game','decisions','bot-rematch','turn-details','history-open'].includes(id),toggle(k,v){this.hidden=v;},contains(){return this.hidden;},add(){this.hidden=true;}},setAttribute(k,v){this.attributes[k]=v;},append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},addEventListener(){},showModal(){},close(){}};}
  function get(id){return els[id] ||=element(id);}
  const prior=JSON.stringify({code:'ABC234',token:'fake',seat:0,mode:'bot',difficulty:'normal'});
  const fetch=async(url,opt)=>{requests.push({url,opt});return {ok:true,json:async()=>({seat:0,revision:requests.length,waiting:false,view})};};
  const sandbox={document:{body,getElementById:get,createElement:()=>element()},fetch,AbortController,setTimeout:()=>1,clearTimeout:()=>{},sessionStorage:{getItem:()=>prior,setItem(){},removeItem(){}},navigator:{},console};
  vm.runInNewContext(source,sandbox);return{get,requests,body};
}
test('visible names and art map to the server card identity, and clicks submit that same card id',async()=>{
  const g=E.create();g.phase='play';g.turn=0;g.hands[0]=[all[26],all[10],all[12]];g.floor=[all[11],all[14],all[27]];g.lastTurns=[{seat:0,played:[all[10]],drawn:all[13],captures:[{source:'draw',cards:[all[13],all[12]]}],events:[]}];
  const c=makeClient(E.view(g,0));await new Promise(setImmediate);const cards=c.get('hand').children;
  assert.deepEqual(cards.map(x=>x.attributes['aria-label']),['3월 벚꽃 피','4월 흑싸리 열','7월 적싸리 피']);
  assert.deepEqual(cards.map(x=>x.children[0].src),['assets/cards/m03-03.svg','assets/cards/m04-01.svg','assets/cards/m07-03.svg']);
  assert.equal(cards[0].children[2].textContent,'피');assert.match(c.get('turn-details').children[0].textContent,/낸 패 3월 벚꽃 피/);assert.match(c.get('history-content').children[0].textContent,/뒤집은 패: 4월 흑싸리 띠/);
  cards[2].onclick();await new Promise(setImmediate);const sent=c.requests.find(r=>r.url.endsWith('/action'));assert.equal(JSON.parse(sent.opt.body).action.id,26);
  assert.equal(c.body.classList.playing,true);
});
test('the HTML includes all controls used by the client',()=>{const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');for(const id of ['turn-details','history-open','history','history-close','history-content','bot-difficulty','special-actions','floor','hand'])assert(html.includes(`id="${id}"`),id);});
