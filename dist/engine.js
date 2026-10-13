export const BLACK=1, WHITE=2;
export const opponent=c=>3-c;
export const key=board=>board.join('');
export const at=(x,y,size)=>y*size+x;
export function neighbors(p,size){const x=p%size,y=Math.floor(p/size);return [x>0?p-1:-1,x<size-1?p+1:-1,y>0?p-size:-1,y<size-1?p+size:-1].filter(x=>x>=0);}
export function group(board,p,size){
  const color=board[p], stones=new Set(), liberties=new Set();
  if(!color)return {color:0,stones,liberties};
  const stack=[p];stones.add(p);
  while(stack.length){for(const q of neighbors(stack.pop(),size)){if(!board[q])liberties.add(q);else if(board[q]===color&&!stones.has(q)){stones.add(q);stack.push(q);}}}
  return {color,stones,liberties};
}
export function allGroups(board,size){const seen=new Set(),out=[];for(let i=0;i<board.length;i++)if(board[i]&&!seen.has(i)){const g=group(board,i,size);g.stones.forEach(x=>seen.add(x));out.push(g);}return out;}
export function createGame(size=9,board=null,turn=1,komi=6.5){const b=board?[...board]:Array(size*size).fill(0);return {size,board:b,turn,captures:{1:0,2:0},passes:0,phase:'play',history:[key(b)],moves:[],last:null,komi};}
export function simulate(board,size,p,color){
  if(!Number.isInteger(p)||p<0||p>=board.length)return {ok:false,error:'bounds'};
  if(board[p])return {ok:false,error:'occupied'};
  const next=[...board];next[p]=color;const captured=[];const checked=new Set();
  for(const q of neighbors(p,size))if(next[q]===opponent(color)&&!checked.has(q)){
    const g=group(next,q,size);g.stones.forEach(x=>checked.add(x));if(!g.liberties.size){g.stones.forEach(x=>{captured.push(x);next[x]=0;});}
  }
  const own=group(next,p,size);if(!own.liberties.size)return {ok:false,error:'suicide'};
  return {ok:true,board:next,captured,liberties:own.liberties,stones:own.stones};
}
export function snapshot(s){return {board:[...s.board],turn:s.turn,captures:{...s.captures},passes:s.passes,phase:s.phase,last:s.last};}
export function play(s,p){
  if(s.phase!=='play')return {ok:false,error:'finished'};
  const result=simulate(s.board,s.size,p,s.turn);if(!result.ok)return result;
  const hash=key(result.board);if(s.history.length>1&&hash===s.history.at(-2))return {ok:false,error:'ko'};
  const repetitions=s.history.filter(x=>x===hash).length;
  const next={...s,board:result.board,turn:opponent(s.turn),captures:{...s.captures,[s.turn]:s.captures[s.turn]+result.captured.length},passes:0,last:p,history:[...s.history,hash],phase:repetitions>=2?'repetition':'play',moves:[...s.moves,{p,color:s.turn,captured:result.captured,before:snapshot(s)}]};
  return {ok:true,state:next,captured:result.captured};
}
export function pass(s){if(s.phase!=='play')return s;return {...s,turn:opponent(s.turn),last:null,passes:s.passes+1,phase:s.passes+1>=2?'scoring':'play',history:[...s.history,key(s.board)],moves:[...s.moves,{p:null,color:s.turn,captured:[],before:snapshot(s)}]};}
export function undo(s){const m=s.moves.at(-1);if(!m)return s;return {...s,...m.before,history:s.history.slice(0,-1),moves:s.moves.slice(0,-1)};}
export function emptyRegion(board,p,size){if(board[p])return [];const seen=new Set([p]),stack=[p];while(stack.length){for(const q of neighbors(stack.pop(),size))if(!board[q]&&!seen.has(q)){seen.add(q);stack.push(q);}}return [...seen];}
export function territory(s,dead=[],neutral=[]){
  const b=[...s.board],deadCounts={1:0,2:0};for(const p of new Set(dead))if(b[p]){deadCounts[b[p]]++;b[p]=0;}
  const owned=Array(b.length).fill(0),neutralSet=new Set(neutral),seen=new Set(),counts={1:0,2:0};
  for(let p=0;p<b.length;p++)if(!b[p]&&!seen.has(p)){
    const region=emptyRegion(b,p,s.size),borders=new Set();let forcedNeutral=false;
    for(const x of region){seen.add(x);if(neutralSet.has(x))forcedNeutral=true;for(const q of neighbors(x,s.size))if(b[q])borders.add(b[q]);}
    const owner=!forcedNeutral&&borders.size===1?[...borders][0]:0;
    if(owner){for(const x of region)owned[x]=owner;counts[owner]+=region.length;}
  }
  const black=counts[1]+s.captures[1]+deadCounts[2];
  const white=counts[2]+s.captures[2]+deadCounts[1]+s.komi;
  return {board:b,owned,counts,deadCounts,black,white,margin:Math.abs(black-white),winner:black===white?0:black>white?1:2};
}
function trueEye(board,p,size,c){const ns=neighbors(p,size);if(!ns.every(q=>board[q]===c))return false;const x=p%size,y=Math.floor(p/size),ds=[];for(const dx of [-1,1])for(const dy of [-1,1])if(x+dx>=0&&x+dx<size&&y+dy>=0&&y+dy<size)ds.push(at(x+dx,y+dy,size));const foes=ds.filter(q=>board[q]===opponent(c)).length;return ds.length<4?foes===0:foes<=1;}
export function rankMoves(s){
  const own=allGroups(s.board,s.size).filter(g=>g.color===s.turn&&g.liberties.size===1);
  const out=[];let occupied=s.board.filter(Boolean).length;
  for(let p=0;p<s.board.length;p++){
    const r=play(s,p);if(!r.ok)continue;
    const g=group(r.state.board,p,s.size);let score=0,reason='빈 공간을 넓혀보세요.';
    const saves=own.filter(old=>old.liberties.has(p)&&g.liberties.size>=2).reduce((n,old)=>n+old.stones.size,0);
    const threatens=new Set();for(const q of neighbors(p,s.size))if(r.state.board[q]===opponent(s.turn)){const enemy=group(r.state.board,q,s.size);if(enemy.liberties.size===1)enemy.stones.forEach(x=>threatens.add(x));}
    score+=r.captured.length*30+saves*27+threatens.size*6;
    if(g.liberties.size===1&&!r.captured.length)score-=36+g.stones.size*4;
    const ns=neighbors(p,s.size);if(trueEye(s.board,p,s.size,s.turn))score-=80;
    const x=p%s.size,y=Math.floor(p/s.size),edge=Math.min(x,y,s.size-1-x,s.size-1-y);
    const friends=ns.filter(q=>s.board[q]===s.turn).length,foes=ns.filter(q=>s.board[q]===opponent(s.turn)).length;
    const nearest=s.board.reduce((m,c,i)=>c?Math.min(m,Math.abs(i%s.size-x)+Math.abs(Math.floor(i/s.size)-y)):m,99);
    score+=Math.min(g.liberties.size,5)*.8+(edge===2?2.5:edge===1?1.5:edge===0?-1:0);
    if(occupied<5)score+=nearest>=3?4:0;else score+=nearest===1?2:nearest===2?3:-Math.min(nearest,8);
    if(friends>=3&&!foes)score-=12;
    if(r.captured.length)reason='상대 돌의 마지막 활로를 막아 잡을 수 있어요.';
    else if(saves)reason='위험한 내 돌을 살리고 활로를 늘릴 수 있어요.';
    else if(threatens.size)reason='상대 돌의 활로를 줄여 움직임을 제한해요.';
    else if(friends)reason='내 돌과 이어져 더 튼튼하게 둘 수 있어요.';
    else reason='빈 공간을 향해 내 돌의 자리를 넓혀보세요.';
    out.push({p,score,reason});
  }
  return out.sort((a,b)=>b.score-a.score||a.p-b.p);
}
export function botMove(s){const moves=rankMoves(s);if(!moves.length)return null;const best=moves[0];if(best.score<0||(s.passes>0&&best.score<12)||(s.moves.length>150&&best.score<20))return null;return best;}
export function validateGame(s){
 if(!s||![5,9].includes(s.size))return false;
 const n=s.size*s.size, pos=p=>Number.isInteger(p)&&p>=0&&p<n;
 const board=b=>Array.isArray(b)&&b.length===n&&b.every(c=>[0,1,2].includes(c));
 const state=v=>v&&board(v.board)&&[1,2].includes(v.turn)&&v.captures&&[1,2].every(c=>Number.isInteger(v.captures[c])&&v.captures[c]>=0)&&Number.isInteger(v.passes)&&v.passes>=0&&v.passes<=2&&['play','scoring','finished','repetition'].includes(v.phase)&&(v.last===null||pos(v.last));
 return !!(state(s)&&Number.isFinite(s.komi)&&s.komi>=0&&s.komi<=100&&Array.isArray(s.moves)&&s.moves.length<2000&&s.moves.every(m=>m&&(m.p===null||pos(m.p))&&[1,2].includes(m.color)&&Array.isArray(m.captured)&&m.captured.every(pos)&&state(m.before))&&Array.isArray(s.history)&&s.history.length===s.moves.length+1&&s.history.every(h=>typeof h==='string'&&h.length===n&&/^[012]+$/.test(h))&&['dead','neutral'].every(k=>s[k]===undefined||(Array.isArray(s[k])&&s[k].every(pos))));
}
