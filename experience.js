/* ═══════════════════════════════════════════════════════════════
   RETURN BY DEATH — EXPERIENCE LAYER v4
   Full cinematic immersion patch — no logic changes
═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── CHAPTER DATA ── */
const CH = {
  1:  { n:1, title:'CHAPTER I — CURIOSITY',   cls:'',         intro:'You found the door.\nYou didn\'t ask if you should open it.',      color:'#4fffb0', rgb:'79,255,176' },
  2:  { n:1, title:'CHAPTER I — CURIOSITY',   cls:'',         intro:'Something was hidden here.\nThings usually are.',                  color:'#4fffb0', rgb:'79,255,176' },
  3:  { n:1, title:'CHAPTER I — CURIOSITY',   cls:'',         intro:'Noise hides signal.\nSignal hides truth.',                         color:'#4fffb0', rgb:'79,255,176' },
  4:  { n:1, title:'CHAPTER I — CURIOSITY',   cls:'',         intro:'They said there was nothing to see.\nThey lied.',                  color:'#4fffb0', rgb:'79,255,176' },
  5:  { n:2, title:'CHAPTER II — TENSION',    cls:'',         intro:'Access denied is just a suggestion\nto the right person.',        color:'#4fa8ff', rgb:'79,168,255' },
  6:  { n:2, title:'CHAPTER II — TENSION',    cls:'',         intro:'The script ran.\nNo one was supposed to be listening.',            color:'#4fa8ff', rgb:'79,168,255' },
  7:  { n:2, title:'CHAPTER II — TENSION',    cls:'',         intro:'A second factor only slows you down\nif you play by the rules.',  color:'#4fa8ff', rgb:'79,168,255' },
  8:  { n:2, title:'CHAPTER II — TENSION',    cls:'',         intro:'Not everything on the server belongs to you.\nThat\'s the point.', color:'#4fa8ff', rgb:'79,168,255' },
  9:  { n:3, title:'CHAPTER III — DREAD',     cls:'',         intro:'The server trusts what you tell it.\nInteresting.',                color:'#ffaa22', rgb:'255,170,34'  },
  10: { n:3, title:'CHAPTER III — DREAD',     cls:'',         intro:'The gate doesn\'t ask who you are.\nIt asks what you know.',       color:'#ffaa22', rgb:'255,170,34'  },
  11: { n:4, title:'CHAPTER IV — THE VOID',   cls:'',         intro:'No hints. No safety net.\nJust you and what you\'re made of.',    color:'#ff4466', rgb:'255,68,102'  },
  12: { n:4, title:'CHAPTER IV — THE VOID',   cls:'',         intro:'This is the last one.\nOr is it?',                                color:'#ff4466', rgb:'255,68,102'  },
};

const AFTER_SOLVE = {
  1:'The first wall fell. There are eleven more.',
  2:'You stitched the pieces together. What else is hidden?',
  3:'The noise was a mask. You saw through it.',
  4:'Maintenance pages hide more than maintenance.',
  5:'You elevated yourself. The system noticed.',
  6:'The dead script spoke. You listened.',
  7:'Six digits. All it took.',
  8:'Someone left their files where you could find them.',
  9:'You changed what the server believed. Dangerous.',
  10:'The gate opened. What lies beyond it is different.',
  11:'The void gave something up. Keep going.',
};

const IDLE_WHISPERS = [
  'are you still there?','the cursor knows.','this was never just a game.',
  '...','you\'ve been here before.','return by death.',
  'something is watching.','loop 1 of ???','i see you.','don\'t look away.',
  'the checkpoint remembered.','how many times have you died?',
  'subaru didn\'t give up.','neither should you... probably.',
];

/* ── STATE ── */
let _ch = 0, _st = 0, _lastScore = 0, _lastSolvedSt = 0;
let _fakeEndDone = false, _loopDone = false;
let _idleTimer = null, _trailTick = 0;
let _eggCount = 0, _eggTimer = null;
let _popStack = [];

/* ── INJECT STATIC DOM ELEMENTS ── */
function _boot(){
  // Page veil
  if(!document.getElementById('page-veil')){
    const v=document.createElement('div'); v.id='page-veil';
    document.body.prepend(v);
  }
  // Noise
  _el('noise','div',''); document.getElementById('noise').id='noise';
  // Scanlines
  _mkFixed('scanlines','scanlines');
  // Grid
  _mkFixed('bg-grid','bg-grid');
  // Ambient glow
  if(!document.getElementById('ambient')){
    const g=document.createElement('div'); g.id='ambient';
    document.body.appendChild(g);
  }
  // Corner accents
  ['tl','tr','bl','br'].forEach(c=>{
    if(!document.getElementById('corner-'+c)){
      const d=document.createElement('div');
      d.id='corner-'+c; document.body.appendChild(d);
    }
  });
  // Custom cursor
  if(!document.getElementById('cur')){
    const cur=document.createElement('div'); cur.id='cur';
    cur.innerHTML='<div class="cur-outer"></div><div class="cur-inner"></div>';
    document.body.appendChild(cur);
  }
  // Level transition overlay
  if(!document.getElementById('level-transition')){
    const lt=document.createElement('div');
    lt.id='level-transition';
    lt.innerHTML=`
      <div class="lt-line" id="lt-chapter"></div>
      <div class="lt-big"  id="lt-title"></div>
      <div class="lt-narrative" id="lt-narrative"></div>
      <div class="lt-bar-wrap"><div class="lt-bar" id="lt-bar"></div></div>`;
    document.body.appendChild(lt);
  }
}

function _mkFixed(id, cls){
  if(!document.getElementById(id)){
    const d=document.createElement('div'); d.id=id; d.className=cls;
    document.body.appendChild(d);
  }
}
function _el(id,tag,html){
  if(!document.getElementById(id)){
    const d=document.createElement(tag||'div'); d.id=id;
    if(html!==undefined) d.innerHTML=html;
    document.body.appendChild(d);
  }
  return document.getElementById(id);
}

/* ── CURSOR ── */
const _cur = ()=>document.getElementById('cur');
document.addEventListener('mousemove',e=>{
  const c=_cur(); if(!c) return;
  c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px';
  // Ambient glow follows
  const g=document.getElementById('ambient');
  if(g){ g.style.left=e.clientX+'px'; g.style.top=e.clientY+'px'; }
  // Trail
  _trailTick++;
  if(_trailTick%3===0){
    const t=document.createElement('div');
    t.className='ctrail';
    t.style.cssText=`left:${e.clientX}px;top:${e.clientY}px;width:4px;height:4px;`;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),850);
  }
  _resetIdle();
});

document.addEventListener('mouseover',e=>{
  const c=_cur(); if(!c) return;
  if(e.target.closest('button,.btn,a,label')) c.className='on-btn';
  else if(e.target.closest('input,textarea')) c.className='on-text';
  else c.className='';
});

document.addEventListener('mousedown',e=>{
  const c=_cur(); if(c) c.classList.add('pressed');
  _spawnClick(e.clientX,e.clientY,e.target);
});
document.addEventListener('mouseup',()=>{ const c=_cur(); if(c) c.classList.remove('pressed'); });

/* ── CLICK PARTICLES ── */
function _spawnClick(x,y,target){
  const ch=getComputedStyle(document.documentElement).getPropertyValue('--ch').trim()||'#4fffb0';
  // Ring
  const r=document.createElement('div');
  r.className='ring-burst';
  r.style.cssText=`left:${x}px;top:${y}px;border-color:${ch};`;
  document.body.appendChild(r);
  setTimeout(()=>r.remove(),750);
  // Burst only on buttons
  if(!target.closest('button,.btn')) return;
  for(let i=0;i<8;i++){
    const p=document.createElement('div'); p.className='ptcl';
    const ang=(i/8)*Math.PI*2, dist=50+Math.random()*60;
    p.style.cssText=`left:${x}px;top:${y}px;width:${3+Math.random()*3}px;height:${3+Math.random()*3}px;color:${ch};background:${ch};--dx:${Math.cos(ang)*dist}px;--dy:${Math.sin(ang)*dist}px;--dur:${.7+Math.random()*.4}s;`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),1100);
  }
}

/* ── MAGNETIC BUTTONS ── */
function _bindMagnetic(){
  document.querySelectorAll('.btn:not([data-mag])').forEach(btn=>{
    btn.dataset.mag='1';
    btn.addEventListener('mousemove',e=>{
      const r=btn.getBoundingClientRect();
      const dx=(e.clientX-r.left-r.width/2)*.2;
      const dy=(e.clientY-r.top-r.height/2)*.2;
      btn.style.transform=`translate(${dx}px,${dy}px) translateY(-3px)`;
    });
    btn.addEventListener('mouseleave',()=>btn.style.transform='');
  });
}

/* ── CARD 3D TILT ── */
function _bindTilt(){
  document.querySelectorAll('.card:not([data-tilt])').forEach(card=>{
    card.dataset.tilt='1';
    // Inject glow line
    if(!card.querySelector('.card-glow-line')){
      const gl=document.createElement('div'); gl.className='card-glow-line';
      card.prepend(gl);
    }
    card.addEventListener('mousemove',e=>{
      const r=card.getBoundingClientRect();
      const nx=(e.clientX-r.left)/r.width;  // 0..1
      const ny=(e.clientY-r.top)/r.height;
      const rx=(ny-.5)*-10; // -5..5 deg
      const ry=(nx-.5)*10;
      card.style.transform=`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px)`;
      card.style.setProperty('--mx',(nx*100)+'%');
      card.style.setProperty('--my',(ny*100)+'%');
    });
    card.addEventListener('mouseleave',()=>{
      card.style.transform='';
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });
}

/* ── CHAPTER SYSTEM ── */
function _setChapter(st){
  const info=CH[st]; if(!info) return;
  const chNum=info.n;
  if(chNum===_ch) return;
  _ch=chNum;
  document.documentElement.dataset.ch=chNum;
  document.documentElement.style.setProperty('--ch',info.color);
  document.documentElement.style.setProperty('--ch-rgb',info.rgb);
  document.documentElement.style.setProperty('--ch-glow',`rgba(${info.rgb},.07)`);
  // Update ambient
  const g=document.getElementById('ambient');
  if(g) g.style.background=`radial-gradient(circle,rgba(${info.rgb},.07) 0%,transparent 65%)`;
}

/* ── PROGRESS ARC ── */
function _updateArc(st){
  // Remove old
  document.querySelectorAll('.prog-arc').forEach(e=>e.remove());
  const hdr=document.querySelector('.hdr'); if(!hdr) return;
  hdr.style.position='relative';
  const total=12, pct=(st-1)/total;
  const R=24, circ=2*Math.PI*R;
  const offset=circ*(1-pct);
  const arc=document.createElement('div'); arc.className='prog-arc';
  arc.innerHTML=`
    <svg width="60" height="60" viewBox="0 0 60 60">
      <circle class="arc-track" cx="30" cy="30" r="${R}"/>
      <circle class="arc-fill"  cx="30" cy="30" r="${R}"
        stroke-dasharray="${circ.toFixed(2)}"
        stroke-dashoffset="${circ.toFixed(2)}"/>
    </svg>
    <div class="prog-arc-num">${st-1}/12</div>`;
  hdr.appendChild(arc);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const fill=arc.querySelector('.arc-fill');
    if(fill) fill.style.strokeDashoffset=offset.toFixed(2);
  }));
}

/* ── CHAPTER STRIP ── */
function _updateChapterStrip(st){
  document.querySelectorAll('.ch-strip').forEach(e=>e.remove());
  const info=CH[st]; if(!info) return;
  const hdr=document.querySelector('.hdr'); if(!hdr) return;
  const strip=document.createElement('div'); strip.className='ch-strip';
  strip.innerHTML=`<div class="ch-strip-label">${info.title}</div><div class="ch-strip-line">${info.intro}</div>`;
  strip.style.opacity='0';
  hdr.after(strip);
  setTimeout(()=>{ strip.style.transition='opacity .6s ease'; strip.style.opacity='1'; },60);
}

/* ── BETWEEN-LEVEL CINEMATIC TRANSITION ── */
function _levelTransition(st, onDone){
  const info=CH[st]; if(!info){ onDone&&onDone(); return; }
  const lt=document.getElementById('level-transition'); if(!lt) return;
  const chEl=document.getElementById('lt-chapter');
  const titleEl=document.getElementById('lt-title');
  const narEl=document.getElementById('lt-narrative');
  const bar=document.getElementById('lt-bar');

  if(chEl)  chEl.textContent=info.title;
  if(titleEl)titleEl.textContent='STAGE '+st;
  if(narEl) narEl.textContent=info.intro;
  if(bar)   bar.style.width='0';

  // Animate in
  lt.classList.add('active');
  [chEl,titleEl,narEl].forEach((el,i)=>{
    if(!el) return;
    el.classList.remove('show');
    setTimeout(()=>el.classList.add('show'),100+i*140);
  });
  setTimeout(()=>{ if(bar) bar.style.width='100%'; },200);

  // Hold then exit
  setTimeout(()=>{
    lt.style.transition='opacity .5s ease';
    lt.style.opacity='0';
    setTimeout(()=>{
      lt.classList.remove('active');
      lt.style.opacity='';
      lt.style.transition='';
      [chEl,titleEl,narEl].forEach(el=>el&&el.classList.remove('show'));
      onDone&&onDone();
    },520);
  },2200);
}

/* ── AFTER-SOLVE POPUP ── */
function _afterSolvePop(st){
  const text=AFTER_SOLVE[st]; if(!text) return;
  _toast(text,'warn',4000,true);
}

/* ── TOAST ── */
function _toast(text,type,dur,italic){
  const pop=document.createElement('div');
  const typeMap={ok:'rzpop-ok',err:'rzpop-err',warn:'rzpop-warn'};
  pop.className='rzpop '+(typeMap[type]||'rzpop-ok');
  if(italic) pop.style.fontStyle='italic';
  // Stack offset
  const offset=_popStack.length*60;
  pop.style.top=(20+offset)+'px';
  pop.innerHTML=text;
  document.body.appendChild(pop);
  _popStack.push(pop);
  setTimeout(()=>pop.classList.add('show'),15);
  setTimeout(()=>{
    pop.classList.remove('show');
    setTimeout(()=>{
      pop.remove();
      _popStack=_popStack.filter(p=>p!==pop);
    },400);
  },dur||3000);
}

/* ── CORRECT FLASH ── */
function _flashOk(){
  const f=document.createElement('div'); f.className='flash-ok';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(),700);
  // Explosion of particles
  const ch=getComputedStyle(document.documentElement).getPropertyValue('--ch').trim()||'#4fffb0';
  const cx=window.innerWidth/2, cy=window.innerHeight/2;
  for(let i=0;i<16;i++){
    const p=document.createElement('div'); p.className='ptcl';
    const ang=(i/16)*Math.PI*2, dist=80+Math.random()*120;
    const sz=4+Math.random()*6;
    p.style.cssText=`left:${cx}px;top:${cy*.8}px;width:${sz}px;height:${sz}px;color:${ch};background:${ch};--dx:${Math.cos(ang)*dist}px;--dy:${Math.sin(ang)*dist}px;--dur:${.9+Math.random()*.5}s;`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),1500);
  }
}

/* ── WRONG FLASH ── */
function _flashBad(){
  const f=document.createElement('div'); f.className='flash-bad';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(),600);
}

/* ── DEATH GLITCH (body-level) ── */
function _deathGlitch(){
  // Time freeze
  document.body.style.filter='brightness(2) saturate(0)';
  setTimeout(()=>{ document.body.style.filter=''; },150);
  // Body chroma
  document.body.classList.add('death-chroma');
  setTimeout(()=>document.body.classList.remove('death-chroma'),600);
  // Slice overlays
  _spawnGlitchOverlays(1600);
}

function _spawnGlitchOverlays(dur){
  const red=document.createElement('div'); red.className='g-red';
  const cyan=document.createElement('div'); cyan.className='g-cyan';
  const lines=document.createElement('div'); lines.className='g-lines';
  [red,cyan,lines].forEach(e=>document.body.appendChild(e));
  setTimeout(()=>{
    [red,cyan,lines].forEach(e=>{ e.classList.add('g-fade'); setTimeout(()=>e.remove(),700); });
  },dur);
}

/* ── IDLE EASTER EGGS ── */
function _resetIdle(){
  clearTimeout(_idleTimer);
  _idleTimer=setTimeout(_spawnIdleGhost, 18000+Math.random()*14000);
}
function _spawnIdleGhost(){
  const w=document.createElement('div'); w.className='idle-ghost';
  w.textContent=IDLE_WHISPERS[Math.floor(Math.random()*IDLE_WHISPERS.length)];
  w.style.left=(8+Math.random()*55)+'vw';
  w.style.bottom=(8+Math.random()*25)+'vh';
  document.body.appendChild(w);
  setTimeout(()=>w.classList.add('show'),80);
  setTimeout(()=>{ w.classList.remove('show'); setTimeout(()=>w.remove(),1900); },5500);
  _resetIdle();
}
document.addEventListener('keydown',_resetIdle);

/* ── TITLE EASTER EGG (5 taps) ── */
function _bindTitleEgg(){
  const title=document.querySelector('.hdr-h1');
  if(!title||title.dataset.egg) return;
  title.dataset.egg='1';
  title.style.cursor='none';
  title.addEventListener('click',()=>{
    _eggCount++;
    clearTimeout(_eggTimer);
    _eggTimer=setTimeout(()=>{ _eggCount=0; },2500);
    if(_eggCount>=5){
      _eggCount=0;
      // Screen invert flash ×3
      [0,80,160].forEach(t=>setTimeout(()=>{
        document.body.style.filter='invert(1) hue-rotate(90deg)';
        setTimeout(()=>document.body.style.filter='',60);
      },t));
      // Special glitch
      _spawnGlitchOverlays(800);
      setTimeout(()=>_toast('you found something you weren\'t supposed to.','warn',5000,true),300);
      // Shake hdr
      title.closest('.hdr').classList.add('shake');
      setTimeout(()=>title.closest('.hdr').classList.remove('shake'),600);
    }
  });
}

/* ── WIN SCREEN OVERRIDE ── */
// We monkey-patch _win to inject our new win screen
function _patchWin(){
  if(!window._win) return;
  const orig=window._win;
  window._win=function(flag,score,maxScore){
    // Call original to get audio/particles
    // But intercept the innerHTML write by wrapping _part2Screen
    orig.call(this,flag,score,maxScore);
    // After original renders, replace the .win div with cinematic version
    setTimeout(()=>_upgradedWinScreen(flag,score,maxScore),50);
  };
}

function _upgradedWinScreen(flag,score,maxScore){
  const root=document.getElementById('root'); if(!root) return;
  const pct=Math.round((score/(maxScore||1))*100);
  let taunt,tc;
  if(pct===100){ taunt='perfect score. no hints. no deaths.\nabsolutely unreal. 🎯'; tc='t-gold'; }
  else if(pct>=75){ taunt=pct+'%. solid. you clearly know what you\'re doing. 👀'; tc='t-ok'; }
  else if(pct>=50){ taunt=pct+'%. not bad.\nthe hints carried you a little though. 🦎'; tc=''; }
  else { taunt=pct+'%. used every hint, died multiple times,\nand still barely made it. 😭'; tc='t-bad'; }

  root.innerHTML=`
    <div class="win-screen">
      <div class="win-ring-1"></div>
      <div class="win-ring-2"></div>
      <div class="win-ring-3"></div>
      <div class="win-inner">
        <div class="win-badge">— you actually cleared all of it —</div>
        <div class="win-title" data-t="GG.">GG.</div>
        <div class="win-sub">all 12 challenges cleared 🎯</div>
        <div class="win-score-big" id="w-score">0</div>
        <div class="win-score-label">/ ${maxScore} — final score</div>
        <div class="win-flag-box">
          <div class="wfl">🚩 your flag</div>
          <div class="wfv" id="w-flag">${_esc(flag)}</div>
          <button class="btn btn-g" onclick="_copy(document.getElementById('w-flag').innerText,'w-copy-btn')" id="w-copy-btn">⌘ copy flag</button>
        </div>
        <div class="win-taunt ${tc}">${taunt}</div>
        <div class="win-deaths" id="w-deaths"></div>
        <div class="win-credit">built by xpl8ツ</div>
      </div>
    </div>`;

  // Animate score count up
  _countUp('w-score', score, 1800);
  // Fill deaths from global
  const d=document.getElementById('w-deaths');
  if(d && typeof window._deathCount!=='undefined') d.textContent=`died ${window._deathCount} time${window._deathCount!==1?'s':''} to get here.`;

  // Fire celebration particles continuously for 3s
  const ch=getComputedStyle(document.documentElement).getPropertyValue('--ch').trim()||'#4fffb0';
  for(let i=0;i<20;i++){
    setTimeout(()=>{
      const colors=[ch,'#ffaa22','#b06fff','#ff4466'];
      const col=colors[Math.floor(Math.random()*colors.length)];
      const x=Math.random()*window.innerWidth;
      const y=Math.random()*window.innerHeight*.6;
      for(let j=0;j<6;j++){
        const p=document.createElement('div'); p.className='ptcl';
        const ang=(j/6)*Math.PI*2, dist=40+Math.random()*80;
        p.style.cssText=`left:${x}px;top:${y}px;width:${5+Math.random()*5}px;height:${5+Math.random()*5}px;background:${col};color:${col};--dx:${Math.cos(ang)*dist}px;--dy:${Math.sin(ang)*dist}px;--dur:${.8+Math.random()*.6}s;`;
        document.body.appendChild(p);
        setTimeout(()=>p.remove(),1600);
      }
    },i*150);
  }

  // Trigger fake ending after 5s
  if(!_fakeEndDone) setTimeout(_triggerFakeEnd, 5000);
}

function _countUp(id,target,dur){
  const el=document.getElementById(id); if(!el) return;
  const start=performance.now();
  function tick(now){
    const p=Math.min(1,(now-start)/dur);
    const ease=1-Math.pow(1-p,4);
    el.textContent=Math.round(ease*target);
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ── FAKE ENDING ── */
function _triggerFakeEnd(){
  if(_fakeEndDone) return;
  _fakeEndDone=true;

  // Phase 1 — calm completion screen
  const fe=document.createElement('div'); fe.className='fake-end-screen'; fe.id='fake-end';
  fe.innerHTML=`
    <div class="fe-status">SYSTEM STATUS</div>
    <div class="fe-title">COMPLETE</div>
    <div class="fe-sub">all challenges cleared.<br>you made it through.</div>
    <div class="fe-loader"></div>
    <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-top:8px;letter-spacing:3px;">preparing final results...</div>`;
  document.body.appendChild(fe);

  // Phase 2 — glitch break after 4.5s
  setTimeout(()=>{
    fe.classList.add('breaking');
    _spawnGlitchOverlays(1600);
    setTimeout(()=>{
      fe.remove();
      _showLoopChoice();
    },1800);
  },4500);
}

/* ── LOOP CHOICE ── */
function _showLoopChoice(){
  const ls=document.createElement('div'); ls.className='loop-screen'; ls.id='loop-screen';
  ls.innerHTML=`
    <div class="loop-twist">did you really think<br>it ends here?</div>
    <div class="loop-sub">
      you've been here before.<br>
      the loop doesn't stop because you want it to.<br>
      it stops when you choose to face what's next.
    </div>
    <div class="loop-btns">
      <button class="loop-btn-accept" id="loop-accept">[ accept the loop ]</button>
      <button class="loop-btn-refuse" id="loop-refuse">[ walk away ]</button>
    </div>`;
  document.body.appendChild(ls);
  document.getElementById('loop-accept').onclick=()=>_acceptLoop(ls);
  document.getElementById('loop-refuse').onclick=()=>_refuseLoop(ls);
}

function _acceptLoop(el){
  _loopDone=true; el.remove();
  // White flash
  const flash=document.createElement('div');
  flash.style.cssText='position:fixed;inset:0;background:#fff;z-index:99999;pointer-events:none;';
  document.body.appendChild(flash);
  // Full glitch
  document.body.classList.add('body-glitch','body-glitch2');
  _spawnGlitchOverlays(2500);
  setTimeout(()=>{ flash.style.transition='opacity .6s'; flash.style.opacity='0'; setTimeout(()=>flash.remove(),650); },100);
  setTimeout(()=>{ document.body.classList.remove('body-glitch','body-glitch2'); _showPart2('continue'); },2400);
}

function _refuseLoop(el){
  _loopDone=true;
  el.querySelector('.loop-btns').remove();
  el.querySelector('.loop-twist').textContent='then this is where your story ends.';
  el.querySelector('.loop-sub').innerHTML='but the loop continues.<br><br><span style="color:var(--muted);font-size:10px;">for everyone else.</span>';
  setTimeout(()=>{ el.style.transition='opacity 2.5s ease'; el.style.opacity='0'; setTimeout(()=>{ el.remove(); _showPart2('refuse'); },2600); },3500);
}

function _showPart2(mode){
  const s=document.createElement('div'); s.className='part2-screen';
  s.innerHTML=`
    <div class="p2-eyebrow">${mode==='refuse'?'— end of the line —':'— the next loop begins —'}</div>
    <div class="p2-main">${mode==='refuse'?'the loop continues.':'to be continued...'}</div>
    <div class="p2-hint">part ii? — whenever it's ready</div>`;
  document.body.appendChild(s);
}

/* ── MUTATION OBSERVER — watches for stage changes ── */
let _moTimer=null;
const _mo=new MutationObserver(()=>{
  clearTimeout(_moTimer);
  _moTimer=setTimeout(_checkDOM,120);
});
_mo.observe(document.body,{childList:true,subtree:true,attributes:false,characterData:false});

function _checkDOM(){
  _bindTilt();
  _bindMagnetic();
  _bindTitleEgg();
  _patchWin();

  // Detect current stage from card-num or card-id
  const numEl=document.querySelector('.card-num,.card-id');
  if(!numEl) return;
  const m=numEl.textContent.match(/(\d+)/);
  if(!m) return;
  const st=parseInt(m[1]);
  if(st===_st) return;

  // Stage changed!
  const prev=_st; _st=st;
  _setChapter(st);
  _updateArc(st);
  _updateChapterStrip(st);

  // Between-level cinematic (not on page load)
  if(prev>0 && prev!==st){
    _afterSolvePop(prev);
    _levelTransition(st);
  }
  _resetIdle();
}

/* ── SCORE WATCHER ── */
setInterval(()=>{
  const sv=document.getElementById('score-val');
  if(!sv) return;
  const m=sv.textContent.match(/(\d+)/);
  if(!m) return;
  const sc=parseInt(m[1]);
  if(sc>_lastScore){ _lastScore=sc; _flashOk(); }
},500);

/* ── WATCH WRONG ANSWERS ── */
// Intercept the .m-err message appearing
const _errObs=new MutationObserver(()=>{
  if(document.querySelector('.m-err')) _flashBad();
});
// Attach once root exists
function _attachErrObs(){
  const root=document.getElementById('root');
  if(root && !root.dataset.errObs){
    root.dataset.errObs='1';
    _errObs.observe(root,{childList:true,subtree:true});
    // Also observe for death events — lives-row changes
    const livesObs=new MutationObserver(()=>{
      if(document.querySelector('.life.losing,.life.just-lost')) _deathGlitch();
    });
    livesObs.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
}
setInterval(_attachErrObs,500);

/* ── PAGE OPEN/CLOSE ANIMATION ── */
// Already handled via CSS #page-veil. Add close animation on links:
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');
  if(!a||a.target==="_blank") return;
  e.preventDefault();
  document.body.classList.add('page-closing');
  setTimeout(()=>{ window.location.href=a.href; },750);
});

/* ── HELPER ── */
function _esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* ── BOOT ── */
_boot();
_resetIdle();
_bindMagnetic();
_bindTilt();

// Boot flash
const bf=document.createElement('div');
bf.style.cssText='position:fixed;inset:0;background:rgba(79,255,176,.04);z-index:99990;pointer-events:none;transition:opacity .8s ease;';
document.body.appendChild(bf);
setTimeout(()=>{ bf.style.opacity='0'; setTimeout(()=>bf.remove(),850); },300);

})();
