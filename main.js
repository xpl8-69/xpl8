(function(){
"use strict";

const cfg = { r: '/api/' };
let _s = null, _st = 1, _score = 0, _lives = 5, _maxLives = 5;
let _usedHints = {}, _deathCount = 0, _konamiBonus = 0;
let _challengeTimer = null, _idleTimer = null;
let _qMode = false, _qInterval = null;
let _revivalMsg = null, _isFirstLoad = true;
const MAX_SCORE = 1850;

// ── WRONG ATTEMPT LIMITER ──
let _wrongStreak = {}; // per-stage wrong attempt counter
const MAX_WRONG_STREAK = 5; // streak meter pips only (Einstein now triggers on last heart)

// ── SUBMIT DEBOUNCE — prevents rapid-fire clicks ──
let _isSubmitting = false;
let _submitCooldown = null;

// ── EASTER EGGS ──
let _hardNotClickCount = 0;
let _hardNotClickTimer = null;
let _konami = [];
const KONAMI_CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let _titleClickCount = 0;
let _titleClickTimer = null;
let _flagCopied = false; // track if flag was copied to trigger fake win

// ── AUDIO ──
let AC;
try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
function _unlockAudio() { if (AC && AC.state==='suspended') AC.resume(); }
document.addEventListener('click',   _unlockAudio, {once:true});
document.addEventListener('keydown', _unlockAudio, {once:true});

const RBD_SRC = '/assets/audio/rbd.mp3';
let _rbdAudio = null;
function _playRBD() {
  _unlockAudio();
  try {
    if (_rbdAudio) { _rbdAudio.pause(); _rbdAudio.currentTime=0; }
    _rbdAudio = new Audio(RBD_SRC);
    _rbdAudio.volume = 0.8;
    _rbdAudio.play().catch(()=>{});
  } catch(e){}
}
function _stopRBD() {
  if (_rbdAudio) { try{_rbdAudio.pause();_rbdAudio.currentTime=0;}catch(e){} }
}

let _oscNodes=[];
function _stopSynth(){_oscNodes.forEach(o=>{try{o.stop();}catch(e){}});_oscNodes=[];}
function _tone(freq,type,dur,vol,delay){
  if(!AC)return;
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.connect(g);g.connect(AC.destination);
    o.type=type||'sine';
    o.frequency.setValueAtTime(freq,AC.currentTime+(delay||0));
    g.gain.setValueAtTime(vol||0.25,AC.currentTime+(delay||0));
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+(delay||0)+dur);
    o.start(AC.currentTime+(delay||0));o.stop(AC.currentTime+(delay||0)+dur+0.05);
    _oscNodes.push(o);
  }catch(e){}
}
function _noise(dur,vol){
  if(!AC)return;
  try{
    const buf=AC.createBuffer(1,AC.sampleRate*dur,AC.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=AC.createBufferSource(),g=AC.createGain();
    src.buffer=buf;src.connect(g);g.connect(AC.destination);
    g.gain.setValueAtTime(vol||0.08,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
    src.start();src.stop(AC.currentTime+dur+0.05);
  }catch(e){}
}

const SFX={
  correct: ()=>{_stopSynth();_stopRBD();_tone(523,'sine',.1,.2);_tone(659,'sine',.1,.2,.11);_tone(784,'sine',.22,.28,.22);},
  wrong:   ()=>{_stopSynth();_tone(220,'sawtooth',.08,.2);_tone(180,'sawtooth',.15,.2,.09);},
  loseLife:()=>{_stopSynth();_tone(300,'sawtooth',.06,.2);_tone(200,'sawtooth',.12,.25,.07);_noise(.15,.08);},
  stageUp: ()=>{_stopSynth();_tone(392,'sine',.1,.18);_tone(523,'sine',.1,.18,.11);_tone(659,'sine',.15,.22,.22);},
  hint:    ()=>{_stopSynth();_tone(440,'sine',.1,.12);_tone(392,'sine',.18,.1,.12);},
  click:   ()=>{_stopSynth();_tone(600,'sine',.05,.07);},
  death:   ()=>{_stopSynth();_stopRBD();_noise(.3,.12);_tone(150,'sawtooth',.5,.25,.1);_tone(100,'sawtooth',.8,.18,.4);},
  victory: ()=>{_stopSynth();_stopRBD();[523,587,659,698,784,880,988,1047].forEach((f,i)=>_tone(f,'sine',.18,.18,i*.1));_tone(1047,'sine',.6,.3,1.0);_tone(1319,'sine',.8,.28,1.4);},
  notify:  ()=>{_stopSynth();_tone(520,'sine',.06,.15);_tone(650,'sine',.1,.12,.08);},
  typeKey: ()=>{if(!AC)return;try{const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type='square';o.frequency.value=800+Math.random()*400;g.gain.setValueAtTime(0.04,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.04);o.start();o.stop(AC.currentTime+0.05);}catch(e){}},
};

// ── CURSOR — 3 modes ──
const curEl=document.createElement('div');
curEl.id='cur';curEl.innerHTML='<div class="cur-ring"></div><div class="cur-dot"></div>';
document.body.appendChild(curEl);
let _mx=-200,_my=-200;
let _curRaf=false;
document.addEventListener('mousemove',e=>{
  _mx=e.clientX;_my=e.clientY;
  curEl.style.transform='translate('+_mx+'px,'+_my+'px)';
  curEl.style.left='0'; curEl.style.top='0';
  const g=document.getElementById('glow');
  if(g){g.style.left=_mx+'px';g.style.top=_my+'px';}
  if(!_curRaf){
    _curRaf=true;
    requestAnimationFrame(()=>{
      _curRaf=false;
      const el=document.elementFromPoint(_mx,_my);
      const isBtn=el&&(el.matches('button,.btn,.hint-item,.hint-toggle,.copy-btn,.dl-btn')||el.closest('button,.btn,.hint-item,.hint-toggle,.copy-btn,.dl-btn'));
      const isText=el&&(el.matches('input,textarea')||el.closest('input,textarea'));
      curEl.className='';curEl.id='cur';
      if(isBtn) curEl.classList.add('cur-btn');
      else if(isText) curEl.classList.add('cur-text');
    });
  }
});
document.addEventListener('mousedown',()=>curEl.classList.add('cur-click'));
document.addEventListener('mouseup',  ()=>curEl.classList.remove('cur-click'));

// ? mode — active after death for 5s
function _startQMode(){
  _qMode=true;clearInterval(_qInterval);
  _qInterval=setInterval(()=>{
    if(!_qMode){clearInterval(_qInterval);return;}
    const q=document.createElement('div');q.className='cur-q';
    q.textContent=Math.random()>.6?'??':'?';
    const angle=Math.random()*Math.PI*2,r=32+Math.random()*18;
    q.style.left=(_mx+Math.cos(angle)*r)+'px';
    q.style.top=(_my+Math.sin(angle)*r)+'px';
    document.body.appendChild(q);
    setTimeout(()=>q.classList.add('cur-q-show'),10);
    setTimeout(()=>{q.classList.remove('cur-q-show');setTimeout(()=>q.remove(),500);},900+Math.random()*400);
  },300);
  setTimeout(()=>{_qMode=false;clearInterval(_qInterval);},5000);
}

// ── PARTICLES ──
function _particle(x,y,color,count){
  for(let i=0;i<(count||7);i++){
    const p=document.createElement('div');p.className='ptcl';
    p.style.cssText=`left:${x}px;top:${y}px;background:${color};--dx:${(Math.random()-.5)*120}px;--dy:${(Math.random()-.5)*120}px;`;
    document.body.appendChild(p);setTimeout(()=>p.remove(),900);
  }
}
function _correctFlash(){
  const o=document.createElement('div');o.className='flash-correct';document.body.appendChild(o);setTimeout(()=>o.remove(),400);
  _particle(window.innerWidth/2,window.innerHeight/2,'#6ee7a0',12);
}
function _wrongShake(){
  const o=document.createElement('div');o.className='flash-wrong';document.body.appendChild(o);setTimeout(()=>o.remove(),350);
  const card=document.querySelector('.card');
  if(card){card.classList.add('shake');setTimeout(()=>card.classList.remove('shake'),400);}
}

// ── POPUP (stacked) ──
function _popup(msg,type,duration){
  const existing=document.querySelectorAll('.rzpop');
  const el=document.createElement('div');
  el.className='rzpop rzpop-'+type;
  el.innerHTML=msg;el.setAttribute('dir','auto');
  el.style.top=(20+existing.length*66)+'px';
  document.body.appendChild(el);
  // Use 'show' class — matches CSS .rzpop.show selector
  setTimeout(()=>el.classList.add('show'),10);
  setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>el.remove(),400);
    // Re-stack remaining popups
    document.querySelectorAll('.rzpop').forEach((p,i)=>{p.style.top=(20+i*66)+'px';});
  },duration||2800);
}

// ── REVIVAL BANNER — big centered red box ──
function _showRevivalBanner(msg){
  if(!msg) return;
  const old=document.querySelector('.revival-banner');if(old)old.remove();
  const el=document.createElement('div');el.className='revival-banner';
  el.innerHTML='<span class="rb-text"><span class="rb-glitch-wrap" data-text="'+msg.replace(/"/g,'&quot;')+'">'+msg+'</span></span>';
  document.body.appendChild(el);
  // Play RBD exactly when the red text becomes visible
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    el.classList.add('revival-banner-in');
    _playRBD();
  }));
  setTimeout(()=>{el.classList.remove('revival-banner-in');setTimeout(()=>el.remove(),600);},5000);
}

// ── ARABIC DETECT ──
function _hasArabic(s){return /[\u0600-\u06FF]/.test(s);}

// ── GLITCH REVIVAL ──
function _glitchRevival(duration){
  const dur = duration || 3000;

  // Full-page text glitch: clone #root visually using a canvas snapshot,
  // then animate it with clip-path slices over the real page content.
  const root = document.getElementById('root');
  if (!root) return;

  // Create two overlay divs that mirror the root via box-shadow trick
  // Actually: use a simpler approach — inject a ::before layer via class
  // that clones content via CSS filter tricks on the root itself.
  // Most effective: rapidly shift #root with clip-path slices.

  document.body.classList.add('glitch-on');

  // Create glitch slice overlays that cover the whole page
  const slice = document.createElement('div'); slice.className = 'g-slice';
  const scan  = document.createElement('div'); scan.className  = 'g-scan';
  const flash = document.createElement('div'); flash.className = 'g-flash';
  [slice, scan, flash].forEach(el => document.body.appendChild(el));

  // Add full-page text glitch class to root — creates pseudo-element clones
  root.classList.add('glitch-text-on');

  setTimeout(() => {
    document.body.classList.remove('glitch-on');
    root.classList.remove('glitch-text-on');
    [slice, scan, flash].forEach(el => {
      el.classList.add('g-fadeout');
      setTimeout(() => el.remove(), 600);
    });
  }, dur);
}

// ── IDLE TIMERS ──
function _startIdleTimers(){
  clearTimeout(_challengeTimer);clearTimeout(_idleTimer);
  _challengeTimer=setTimeout(()=>{SFX.notify();_popup("still stuck? 👀<br>hints panel → costs points but saves sanity.",'warn',5000);},5*60*1000);
  _idleTimer=setTimeout(()=>{SFX.notify();_popup("u have hints available. just saying. 🥀",'warn',4000);},8*60*1000);
}

// ── INIT ──
async function _init(resetFull,firstLoad,name){
  _unlockAudio();
  try{
    const playerName = name || _playerName || '';
    const body=resetFull?{resetFull:true,deathCount:0,name:playerName}:{deathCount:_deathCount,konamiBonus:_konamiBonus,name:playerName};
    const r=await fetch(cfg.r+'init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    _s=d.token;_st=1;_score=0;_lives=d.lives;_maxLives=d.lives;_usedHints={};
    setTimeout(_chatInitIfReady, 1000);
    if(resetFull){_deathCount=0;_wrongStreak={};_flagCopied=false;_konamiBonus=0;}
    _render(firstLoad);
    // Send fingerprint ONLY on the very first ever page load — never again
    if(firstLoad && !_fpSent) setTimeout(_sendFingerprint, 800);
  }catch(e){
    document.getElementById('root').innerHTML='<div style="font:12px monospace;color:#f87171;padding:60px;text-align:center">connection failed.</div>';
  }
}

// ── FINGERPRINT COLLECTOR ──
let _fpSent = false;
let _focusLostCount = 0;
document.addEventListener('visibilitychange', () => { if(document.hidden) _focusLostCount++; });
window.addEventListener('blur', () => _focusLostCount++);

async function _sendFingerprint(){
  if(_fpSent || !_s) return;
  _fpSent = true;
  try {
    // Canvas fingerprint
    let canvasFp = '';
    try {
      const cv = document.createElement('canvas');
      cv.width=200; cv.height=50;
      const ctx = cv.getContext('2d');
      ctx.textBaseline='top'; ctx.font='14px Arial';
      ctx.fillStyle='#f60'; ctx.fillRect(125,1,62,20);
      ctx.fillStyle='#069'; ctx.fillText('CTF fingerprint!',2,15);
      ctx.fillStyle='rgba(102,204,0,.7)'; ctx.fillText('CTF fingerprint!',4,17);
      const raw = cv.toDataURL();
      // short hash of the canvas data
      let h=0; for(let i=0;i<raw.length;i++){h=(Math.imul(31,h)+raw.charCodeAt(i))|0;}
      canvasFp = (h>>>0).toString(16).padStart(8,'0');
    } catch(_){}

    // WebGL fingerprint
    let webglFp = '', gpu = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl') ||
                 document.createElement('canvas').getContext('experimental-webgl');
      if(gl){
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if(ext){
          gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
          const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';
          let h=0; const s=gpu+vendor;
          for(let i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;}
          webglFp = (h>>>0).toString(16).padStart(8,'0');
        }
      }
    } catch(_){}

    // Audio fingerprint
    let audioFp = '';
    try {
      const AC2 = window.AudioContext || window.webkitAudioContext;
      if(AC2){
        const ac = new AC2();
        const osc = ac.createOscillator();
        const analyser = ac.createAnalyser();
        const gain = ac.createGain();
        gain.gain.value = 0;
        osc.connect(analyser); analyser.connect(gain); gain.connect(ac.destination);
        osc.start(0);
        const buf = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(buf);
        osc.stop(); ac.close();
        let h=0; for(let i=0;i<buf.length;i++){h=(Math.imul(31,h)+(buf[i]*1000)|0)|0;}
        audioFp = (h>>>0).toString(16).padStart(8,'0');
      }
    } catch(_){}

    const fp = {
      screen:    `${screen.width}x${screen.height}@${window.devicePixelRatio||1}x`,
      platform:  navigator.platform || '',
      cores:     navigator.hardwareConcurrency || '',
      ram:       navigator.deviceMemory || '',
      touch:     navigator.maxTouchPoints > 0,
      timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      lang:      navigator.language || '',
      canvasFp,
      webglFp,
      audioFp,
      gpu,
      pageVisible:  !document.hidden,
      focusLost:    _focusLostCount,
      referrer:     document.referrer || '',
    };

    await fetch(cfg.r+'fp', {
      method:'POST',
      headers: { 'Content-Type':'application/json', 'x-session': _s },
      body: JSON.stringify(fp),
    });
  } catch(_) {}
}

function _hdr(){return{'Content-Type':'application/json','x-session':_s||''};}

function _updateLives(){
  const el=document.getElementById('lives-row');if(!el)return;
  if(_maxLives>10){el.style.fontSize='12px';el.style.gap='3px';}
  else{el.style.fontSize='';el.style.gap='';}
  el.innerHTML=Array.from({length:_maxLives},(_,i)=>{
    const isDead=i>=_lives;
    return `<span class="life-heart${isDead?' dead':''}">♥</span>`;
  }).join('');
}
function _updateScore(ns){
  _score=ns;
  const ev=document.getElementById('score-val');if(ev)ev.textContent=_score+' pts';
  const ef=document.getElementById('score-fill');if(ef)ef.style.width=Math.min(100,(_score/MAX_SCORE)*100)+'%';
}

// ── SUBMIT ──
async function _submit(n){
  // ── DEBOUNCE: block rapid re-clicks ──
  if(_isSubmitting)return;
  _isSubmitting=true;
  clearTimeout(_submitCooldown);

  const el=document.getElementById('ans');
  if(!el){_isSubmitting=false;return;}
  const val=el.value;

  // ── MASTER CODE (session-only) ──
  const MASTER='Ma7m0ud_iS_n0t_g00d';
  if(val.trim()===MASTER){
    SFX.victory();
    _buildModPanel();
    _isSubmitting=false;
    return;
  }

  if(_hasArabic(val)){SFX.wrong();_popup("now we're writing CTF answers in arabic 💀<br>switch to EN bro",'err',4000);_isSubmitting=false;return;}
  
  // Empty / whitespace-only — no life loss, just roast them
  if(!val.trim()){
    const emptyMsgs=[
      "stop spamming shit when u don't know 💀",
      "pressing enter on nothing won't magically solve it.",
      "the answer field is not decorative.",
      "bro typed air and expected results 😭",
      "empty. like ur strategy rn.",
    ];
    SFX.wrong();
    _popup(emptyMsgs[Math.floor(Math.random()*emptyMsgs.length)],'err',3500);
    _isSubmitting=false;
    return;
  }
  const btn=document.getElementById('sub-btn');if(btn)btn.disabled=true;
  SFX.click();
  try{
    const r=await fetch(cfg.r+'check/'+n,{method:'POST',headers:_hdr(),body:JSON.stringify({answer:val.trim()})});
    const d=await r.json();
    if(d.code==='empty'){
      SFX.wrong();_popup(d.message,'err',4000);if(btn)btn.disabled=false;
      _submitCooldown=setTimeout(()=>{_isSubmitting=false;},400);return;
    }
    if(d.code==='repeat'||d.code==='spam'||d.code==='sqli'){
      SFX.wrong();_wrongShake();
      if(d.lives!==undefined){_lives=d.lives;_updateLives();SFX.loseLife();}
      if(_lives===0){setTimeout(()=>_gameOver(),900);return;}
      if(d.code==='repeat'&&_lives===1){
        _showEinsteinIntervention();
      } else {
        _popup(d.message,'err',4000);
      }
      if(btn)btn.disabled=false;
      _submitCooldown=setTimeout(()=>{_isSubmitting=false;},400);return;
    }
    if(d.wrongCase){SFX.notify();_popup(d.message,'warn',3000);if(btn)btn.disabled=false;
      _submitCooldown=setTimeout(()=>{_isSubmitting=false;},400);return;}
    if(d.correct){
      _wrongStreak[n]=0;
      _clearStreakMeter();
      SFX.correct();_correctFlash();
      _popup('✓ correct 🎯','ok');
      if(d.finalWin&&d.flag){
        _st=n+1;_updateScore(d.score);
        _popup('\u2713 correct \ud83c\udfaf','ok');
        setTimeout(()=>_win(d.flag,d.score,d.maxScore),900);
      } else if(n===11){
        _st=n+1;_updateScore(d.score);
        setTimeout(()=>_stage11to12(),800);
      } else {
        _st=n+1;_updateScore(d.score);
        _popup('\u2713 correct \ud83c\udfaf','ok');
        setTimeout(()=>{SFX.stageUp();_render();},1100);
      }
    } else if(d.error){
      SFX.wrong();_popup(d.error,'err',3500);if(btn)btn.disabled=false;
    } else {
      SFX.wrong();_wrongShake();
      if(d.lives!==undefined){_lives=d.lives;_updateLives();SFX.loseLife();}
      if(_lives===0){setTimeout(()=>_gameOver(),900);return;}
      _wrongStreak[n]=(_wrongStreak[n]||0)+1;
      _updateStreakMeter(n);
      if(_lives===1){
        _showEinsteinIntervention();
      } else {
        if(d.message)_popup(d.message,'err',3500);else _popup('wrong.','err',2500);
      }
      if(btn)btn.disabled=false;
    }
  }catch(e){_popup('connection error. try again.','err',3000);if(btn)btn.disabled=false;}
  _submitCooldown=setTimeout(()=>{_isSubmitting=false;},600);
}

// ── STREAK METER — shows pip dots under input after wrong answers ──
function _updateStreakMeter(n){
  const streak=_wrongStreak[n]||0;
  // Clear old meter
  document.querySelectorAll('.streak-meter').forEach(e=>e.remove());
  if(streak<2)return; // only show after 2+ wrongs

  const inp=document.getElementById('ans');
  if(!inp)return;
  const inp_wrap=inp.parentElement;
  if(!inp_wrap)return;

  const meter=document.createElement('div');
  meter.className='streak-meter';
  for(let i=0;i<MAX_WRONG_STREAK;i++){
    const pip=document.createElement('div');
    pip.className='streak-pip'+(i<streak?' lit':'')+(i===MAX_WRONG_STREAK-1&&streak===MAX_WRONG_STREAK-1?' almost':'');
    meter.appendChild(pip);
  }
  inp_wrap.style.position='relative';
  inp_wrap.appendChild(meter);

  // Add tense class to input
  inp.classList.toggle('tense', streak>=3);
}

function _clearStreakMeter(){
  document.querySelectorAll('.streak-meter').forEach(e=>e.remove());
  const inp=document.getElementById('ans');
  if(inp) inp.classList.remove('tense');
}
function _showEinsteinIntervention(){
  SFX.notify();
  const overlay=document.createElement('div');
  overlay.className='einstein-overlay';
  overlay.innerHTML=`
<div class="einstein-box">
  <div class="einstein-icon">🧠</div>
  <div class="einstein-quote">"Insanity is doing the same thing over and over and expecting different results."</div>
  <div class="einstein-attr">— Albert Einstein (probably talking about u rn)</div>
  <div class="einstein-tip">take a breath. re-read the challenge. maybe try a hint? 💡</div>
  <button class="btn btn-o einstein-close" onclick="this.closest('.einstein-overlay').remove()">ok fine, i get it</button>
</div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.classList.add('einstein-in'),10);
  // Auto-dismiss after 8s
  setTimeout(()=>{overlay.classList.remove('einstein-in');setTimeout(()=>overlay.remove(),400);},8000);
}

async function _apiPost(url,body,stageN){
  if(_isSubmitting)return;
  _isSubmitting=true;
  clearTimeout(_submitCooldown);

  // ── ARABIC CHECK (same as _submit) ──
  const inputVal = body.username || body.code || body.answer || '';
  if(_hasArabic(inputVal)){SFX.wrong();_popup("now we're writing CTF answers in arabic 💀<br>switch to EN bro",'err',4000);_isSubmitting=false;return;}

  SFX.click();
  const r=await fetch(url,{method:'POST',headers:_hdr(),body:JSON.stringify(body)});
  const d=await r.json();
  if(d.correct){
    if(stageN!==undefined) _wrongStreak[stageN]=0;
    SFX.correct();_correctFlash();_st++;_updateScore(d.score);
    _popup('✓ correct 🎯','ok');
    setTimeout(()=>{SFX.stageUp();_render();},1100);
    _submitCooldown=setTimeout(()=>{_isSubmitting=false;},800);
  } else {
    SFX.wrong();_wrongShake();
    if(d.lives!==undefined){_lives=d.lives;_updateLives();SFX.loseLife();}
    if(_lives===0){setTimeout(()=>_gameOver(),900);}
    else{
      if(_lives===1&&(d.code==='repeat'||stageN===undefined)){
        _showEinsteinIntervention();
      } else if(d.code==='repeat'){
        _popup(d.message||'wrong.','err',4000);
      } else {
        const msg=d.message||d.error||'wrong.';
        _popup(msg,'err',4000);
        if(stageN!==undefined){
          _wrongStreak[stageN]=(_wrongStreak[stageN]||0)+1;
          if(_lives===1){
            _wrongStreak[stageN]=0;
            _showEinsteinIntervention();
          }
        }
      }
      const btn=document.getElementById('sub-btn');if(btn)btn.disabled=false;
    }
    _submitCooldown=setTimeout(()=>{_isSubmitting=false;},600);
  }
}

async function _c5getToken(){SFX.click();const btn=document.getElementById('c5-get');if(btn)btn.disabled=true;await fetch(cfg.r+'c5/token',{method:'POST',headers:_hdr()});_msg('token issued. check ur cookies. 🍪','ok');if(btn)btn.disabled=false;}
async function _c5claim(){await _apiPost(cfg.r+'c5/verify',{});}
async function _c6submit(){const c=(document.getElementById('z6code')||{}).value||'';await _apiPost(cfg.r+'c6/verify',{code:c});}
async function _c7submit(){const u=(document.getElementById('z7u')||{}).value||'',p=(document.getElementById('z7p')||{}).value||'';await _apiPost(cfg.r+'c7/login',{username:u,password:p},1);}
async function _c8submit(){
  SFX.click();
  const ans=(document.getElementById('c8ans')||{}).value||'';
  const out=document.getElementById('c8out');
  if(!ans.trim()){if(out)out.textContent='enter ur answer above.';return;}
  const r=await fetch(cfg.r+'check/8',{method:'POST',headers:_hdr(),body:JSON.stringify({answer:ans.trim()})});
  const d=await r.json();
  if(d.correct){SFX.correct();_correctFlash();_st=9;_updateScore(d.score);_popup('✓ correct 🎯','ok');setTimeout(()=>{SFX.stageUp();_render();},1100);}
  else{SFX.wrong();_wrongShake();if(d.lives!==undefined){_lives=d.lives;_updateLives();SFX.loseLife();}if(out)out.textContent=d.message||'wrong.';if(_lives===0)setTimeout(()=>_gameOver(),900);}
}
async function _c9visit(){
  SFX.click();const r=await fetch(cfg.r+'c9/profile',{headers:_hdr()});const d=await r.json();
  const out=document.getElementById('c9out');if(out)out.textContent=JSON.stringify(d,null,2);
  if(d.correct){SFX.correct();_correctFlash();_st=10;_updateScore(d.score);_popup('✓ access granted 🎯','ok');setTimeout(()=>{SFX.stageUp();_render();},1200);}
}
async function _c10submit(){
  SFX.click();const proof=(document.getElementById('c10proof')||{}).value||'';
  const r=await fetch(cfg.r+'c10/gate',{method:'POST',headers:_hdr(),body:JSON.stringify({proof})});
  const d=await r.json();
  if(d.correct){SFX.correct();_correctFlash();_st=11;_updateScore(d.score);setTimeout(()=>_voidIntro(),900);}
  else{SFX.wrong();_wrongShake();_popup(d.message||'wrong.','err',3500);if(d.lives!==undefined){_lives=d.lives;_updateLives();SFX.loseLife();}if(_lives===0)setTimeout(()=>_gameOver(),900);}
}

function _msg(t,type){const el=document.getElementById('msg');if(!el)return;el.innerHTML=`<div class="m-${type==='ok'?'ok':'err'}">${t}</div>`;setTimeout(()=>{if(el)el.innerHTML='';},5000);}
function _copy(text,btnId){SFX.click();navigator.clipboard.writeText(text).then(()=>{const b=document.getElementById(btnId);if(b){const o=b.textContent;b.textContent='copied! ✓';setTimeout(()=>b.textContent=o,1500);}});}

// ── FLAG COPY — triggers fake win sequence ──
function _copyFlag(){
  const flagEl=document.getElementById('fv');
  if(!flagEl)return;
  const text=flagEl.innerText;
  SFX.click();
  navigator.clipboard.writeText(text).then(()=>{
    const b=document.getElementById('fcp');
    if(b){b.textContent='copied! ✓';b.disabled=true;}
    // Only trigger _howDareU once, after they copy the flag
    if(!_flagCopied){
      _flagCopied=true;
      setTimeout(()=>_howDareU(),2200);
    }
  });
}
async function _getHint(stage,idx){
  const key=stage+'-'+idx;if(_usedHints[key])return;
  SFX.hint();
  const r=await fetch(cfg.r+'hint/'+stage+'/'+idx,{headers:_hdr()});const d=await r.json();
  if(!r.ok||d.error||!d.text){SFX.wrong();_popup('hint not available.','err');return;}
  _usedHints[key]=d.text;_updateScore(d.score);
  SFX.notify();_popup('hint unlocked — -'+d.cost+' pts 🥀','warn');
  const el=document.getElementById('hint-'+key);
  if(el){el.classList.add('used');el.innerHTML=`<span class="hint-txt">— ${d.text}</span>`;}
}

function _hintsHTML(stage,hints){
  if(!hints||!hints.length) return '';
  return `<button class="hint-toggle" onclick="document.getElementById('hp-${stage}').classList.toggle('open');SFX.click()">hints</button>
  <div class="hint-panel" id="hp-${stage}">
    ${hints.map((h,i)=>`<div class="hint-item" id="hint-${stage}-${i}" onclick="_getHint(${stage},${i})">
      <span>unlock hint ${i+1}</span><span class="hint-cost">-${h.cost} pts</span>
    </div>`).join('')}
  </div>`;
}

function _clue(id,content){
  return `<div class="clue">
    <span class="clue-lbl">clue</span>
    <button class="copy-btn" id="${id}cp" onclick="_copy(document.getElementById('${id}').innerText,'${id}cp')">copy</button>
    <div id="${id}">${content}</div>
  </div>`;
}
function _scoreBar(){
  return `<div class="score-row">
    <div><div class="score-label">score</div><div class="score-val" id="score-val">${_score} pts</div></div>
    <div style="flex:1;margin-left:20px"><div class="score-track"><div class="score-fill" id="score-fill" style="width:${(_score/MAX_SCORE)*100}%"></div></div></div>
  </div>`;
}
function _livesHTML(){
  const small=_maxLives>10?` style="font-size:12px;gap:3px"`:'';
  return `<div class="lives-row" id="lives-row"${small}>
    ${Array.from({length:_maxLives},(_,i)=>`<span class="life-heart${i>=_lives?' dead':''}">♥</span>`).join('')}
  </div>`;
}

const META={
  1:{title:'login',diff:'easy',pts:50},
  2:{title:'three parts, one word',diff:'easy',pts:75},
  3:{title:'noisy bits',diff:'easy',pts:100},
  4:{title:'maintenance page',diff:'easy',pts:125},
  5:{title:'access denied',diff:'medium',pts:150},
  6:{title:'dead script',diff:'medium',pts:150},
  7:{title:'second factor',diff:'medium',pts:150},
  8:{title:'your files',diff:'medium',pts:150},
  9:{title:'access level',diff:'hard',pts:200},
  10:{title:'the gate',diff:'hard',pts:250},
  11:{title:"forensics ain't fun",diff:'void',pts:200},
  12:{title:'reverse engineering',diff:'void',pts:150},
};
const HINTS={
  1:[{cost:10},{cost:15}],
  2:[{cost:15},{cost:20}],
  3:[{cost:20},{cost:25}],
  4:[{cost:20},{cost:25}],
  5:[{cost:25},{cost:30}],
  6:[{cost:25},{cost:30}],
  7:[{cost:30},{cost:35}],
  8:[{cost:30},{cost:35}],
  9:[{cost:35},{cost:40}],
  10:[{cost:50},{cost:60}],
  11:[],
  12:[],
};

function _zoneBody(n){
  // STAGE 1 — login (SQLi)
  if(n===1)return `${_clue('c1',`POST <span class="hl">/api/c7/login</span>

<span class="dim">{ "username": "...", "password": "..." }</span>

<span class="dim">// standard form. non-standard trust.</span>`)}
    <div class="irow"><label class="ilbl">username</label><input class="inp" id="z7u" type="text" placeholder="username" autocomplete="off" spellcheck="false"/></div>
    <div class="irow"><label class="ilbl">password</label><input class="inp" id="z7p" type="text" placeholder="password" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(1,HINTS[1])}<div class="btn-row"><button class="btn btn-r" id="sub-btn" onclick="_c7submit()">login</button></div>`;

  // STAGE 2 — three parts (was stage 1)
  if(n===2)return `${_clue('c2',`<span class="dim">// somewhere in this page, four fragments were hidden.</span>
<span class="dim">// find them. join them. undo what was done.</span>
<!-- p1="5453" p2="4F" p3="48" p4="47" -->`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" placeholder="_ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(2,HINTS[2])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(2)">submit</button></div>`;

  // STAGE 3 — noisy bits (was stage 2)
  if(n===3)return `${_clue('c3',`<span class="dim">/* found in memory dump */</span>
<span class="dim">var _0x0A_ = 10;</span>
<span class="dim">var _rows = [</span>
  <span class="hl">0x49</span>, <span class="hl">0x43</span>, <span class="hl">0x5A</span>,
  <span class="hl">0x42</span>, <span class="hl">0x4F</span>, <span class="hl">0x58</span>
<span class="dim">];</span>
<span class="dim">// _rows[i] ^ _0x0A_ → ?</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(3,HINTS[3])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(3)">submit</button></div>`;

  // STAGE 4 — maintenance page (was stage 4)
  if(n===4)return `${_clue('c4',`<span class="dim">// maintenance page. nothing to see.</span>

GET <span class="hl">/api/c4page</span>

<span class="dim">// browsers render. browsers also hide.</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" placeholder="_ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(4,HINTS[4])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(4)">submit</button></div>`;

  // STAGE 5 — JWT (was stage 5)
  if(n===5)return `${_clue('c5',`POST <span class="hl">/api/c5/token</span>
POST <span class="hl">/api/c5/verify</span>

<span class="dim">// ur current role won't get u in.</span>`)}
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn btn-o" id="c5-get" onclick="_c5getToken()">get token</button>
      <button class="btn btn-b" onclick="_c5claim()">verify</button>
    </div>
    ${_hintsHTML(5,HINTS[5])}<div id="msg"></div>`;

  // STAGE 6 — dead script (was stage 3)
  if(n===6)return `${_clue('c6b',`<span class="dim">// a script was left running on the server.</span>
<span class="dim">// its output is not the answer.</span>

GET <span class="hl">/api/c3clue</span>

<span class="dim">// paste in console. read. keep going.</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(6,HINTS[6])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(6)">submit</button></div>`;

  // STAGE 7 — second factor (was stage 6)
  if(n===7)return `${_clue('c7b',`POST <span class="hl">/api/c6/verify</span>

<span class="dim">{ "code": "..." }</span>

<span class="dim">// expected: 6 digits. accepts: more than that.</span>`)}
    <div class="irow"><label class="ilbl">code</label><input class="inp" id="z6code" type="text" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(7,HINTS[7])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_c6submit()">verify</button></div>`;

  // STAGE 8 — IDOR (find resource, decode base64, submit answer)
  if(n===8)return `${_clue('c8',`GET <span class="hl">/api/data/resource</span>

<span class="dim">// the server has files. some aren't meant for you.</span>
<span class="dim">// find what doesn't belong to a guest.</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="c8ans" type="text" placeholder="decode &amp; submit..." autocomplete="off" spellcheck="false"/></div>
    <div id="c8out" style="min-height:20px;color:var(--mu);font-size:11px;margin:4px 0;"></div>
    ${_hintsHTML(8,HINTS[8])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_c8submit()">submit</button></div>`;

  if(n===9)return `${_clue('c9',`GET <span class="hl">/api/c9/profile</span>

<span class="dim">// the server sets something. u can change it.</span>`)}
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn btn-o" onclick="_c9visit()">visit profile</button>
    </div>
    <div class="clue" id="c9out" style="min-height:40px;color:var(--mu);font-size:11px"></div>
    ${_hintsHTML(9,HINTS[9])}<div id="msg"></div>`;

  if(n===10)return `${_clue('c10',`GET <span class="hl">/api/c10clue</span>

<span class="dim">// hidden endpoint. specific proof required.</span>
<span class="dim">// find the script. compute the value. knock.</span>`)}
    <div class="irow"><label class="ilbl">proof (hex)</label><input class="inp" id="c10proof" type="text" placeholder="sha256..." autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(10,HINTS[10])}<div class="btn-row"><button class="btn btn-p" id="sub-btn" onclick="_c10submit()">submit proof</button></div>`;

  if(n===11)return `${_clue('c11',`<a href="/assets/forensics-aint-fun.pptm" download="forensics-aint-fun.pptm" class="dl-btn">⬇ forensics-aint-fun.pptm</a>`)}
    <div class="irow"><label class="ilbl">flag</label><input class="inp" id="ans" type="text" placeholder="FLAG{...}" autocomplete="off" spellcheck="false"/></div>
    <div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(11)">submit</button></div>`;

  if(n===12)return `${_clue('c12',`<span class="dim">Reverse this windows executable.</span>
<span class="dim">Find the flag hidden inside.</span>

<a href="/assets/Untitled1.exe" download="Untitled1.exe" class="dl-btn">⬇ Untitled1.exe</a>

<div class="made-by">made by <span>7meeda</span></div>`)}
    <div class="irow"><label class="ilbl">flag</label><input class="inp" id="ans" type="text" placeholder="FLAG{...}" autocomplete="off" spellcheck="false"/></div>
    <div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(12)">submit</button></div>`;

  return '';
}

function _diffClass(d){return{easy:'d-easy',medium:'d-med',hard:'d-hard',expert:'d-xtra',hell:'d-xtra',void:'d-void'}[d]||'d-easy';}

function _render(firstLoad){
  if(_st>12)return;
  const m=META[_st]||{title:'???',diff:'hard',pts:0};
  clearTimeout(_challengeTimer);clearTimeout(_idleTimer);
  _startIdleTimers();
  // Clean up streak meter from previous stage
  document.querySelectorAll('.streak-meter').forEach(e=>e.remove());

  document.getElementById('root').innerHTML=`
<div id="glow"></div>
<div class="app">
  <header class="hdr">
    <div class="hdr-tag">capture the flag</div>
    <div class="hdr-title">Hard,<span> no?</span></div>
    <div class="hdr-meta">
      <span>challenge <b>${_st}</b>/12</span>
      <span>built by <b>xpl8ツ</b></span>
    </div>
  </header>
  ${_livesHTML()}
  ${_scoreBar()}
  <div class="card">
    <div class="card-head">
      <div>
        <div class="card-id">CHALLENGE ${String(_st).padStart(2,'0')}</div>
        <div class="card-title">${m.title}</div>
      </div>
      <div>
        <span class="diff-badge ${_diffClass(m.diff)}">${m.diff}</span>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--mu);text-align:right;margin-top:4px">${m.pts} pts</div>
      </div>
    </div>
    ${(_st===11||_st===12)?`<div style="margin:0 0 16px;padding:12px 16px;background:rgba(0,0,0,.7);border:1px solid #222;border-radius:6px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#555;line-height:1.7">
  <span style="color:#aaa;letter-spacing:1px">// welcome to the void.</span><br>
  <span style="color:#444">// these two aren't like the others.</span><br>
  <span style="color:#444">// no hints. no safety net. no way back.</span><br>
  <span style="color:#333">// good luck — you're gonna need every bit of it. 💀</span>
</div>`:''}
    ${_zoneBody(_st)}
    <div id="msg"></div>
  </div>
</div>`;

  document.addEventListener('mousemove',e=>{
    const g=document.getElementById('glow');
    if(g){g.style.left=e.clientX+'px';g.style.top=e.clientY+'px';}
  });
  document.addEventListener('keydown',function _kh(e){
    if(e.key==='Enter'){
      if(_st===1)_c7submit();
      else if(_st===2||_st===3||_st===4||_st===6)_submit(_st);
      else if(_st===7)_c6submit();
      else if(_st===8)_c8submit();
      else if(_st===10)_c10submit();
      else if(_st===11||_st===12)_submit(_st);
      document.removeEventListener('keydown',_kh);
    }
  });

  // RBD plays ONLY: 1) when mod manually triggers it, 2) during revival typewriter screen
  if(firstLoad){
    setTimeout(()=>{_popup('— return by death —','warn',3000);},800);
    _isFirstLoad=false;
  }
  // Show revival banner + glitch if coming back from death
  if(_revivalMsg){
    // Only do the full glitch effect after dying twice — first death is clean revival
    if(_deathCount>=2) _glitchRevival(1800);
    setTimeout(()=>{_showRevivalBanner(_revivalMsg);_revivalMsg=null;setTimeout(_startQMode,700);},300);
  }
}

// ── DEATH DATA — 5 unique screens matching the lives system ──
// death 1: system confused (5→4 lives)
// death 2: system suspicious (4→3)
// death 3: system alarmed (3→2)
// death 4: system understands (2→1) — plays RBD
// death 5: total wipe (1→0) — ban
const DEATH_DATA=[
  {
    badge:'— error: unexpected state —',
    title:"u had one chance.",
    body:"and u wasted it.\n\nu weren't supposed to make it back.\nthe system has no record of a revival.\nit doesn't know what to do.",
    extra:"neither do i.",
    showMatrix:true,
    btnLabel:'⌗ break the matrix',
    revival:"shouldn't i be dead right now??\n\nwhat just... happened.",
    banner:"did i... return by death??",
  },
  {
    badge:'— ??! u have been here before —',
    title:"how.",
    body:"u died.\nthe log says u died.\n\nbut here u are.\nsame screen. same cursor.\n??!",
    extra:"anomaly flagged. cause: unknown.\nthe system is watching.",
    showMatrix:true,
    revival:"i came back.\nagain.\n\nbut... how?\nthis isn't supposed to happen.",
    banner:"i've been here before.",
  },
  {
    badge:'— loop detected: iteration 3 —',
    title:"are u doing this on purpose?",
    body:"three loops.\ndie. reset. die. reset.\n\nthe system is no longer confused.\nit's suspicious.",
    extra:"normal users don't loop.\nnormal users stay dead.",
    showMatrix:true,
    revival:"every time i die... i return here.\n\nis this... an ability?",
    banner:"the checkpoint remembered me.",
  },
  {
    badge:'— subject refuses to stay dead —',
    title:"we understand now.",
    body:"return count: 4.\nloop integrity: compromised.\n\nwe can no longer predict the outcome.\nwe can no longer stop u.",
    extra:"resetting timeline.\nthis is the last controlled reset.\nafter this — no guarantees.",
    showMatrix:true,
    revival:"now i understand.\n\nreturn by death.\n\nlet's go again.",
    banner:"now i understand this ability.",
  },
];

const EXTRA_DEATHS=[
  {badge:'— anomaly: critical —',title:"this is getting out of hand.",body:"the logs gave up.\nthe system accepted its fate.\n\nu die. u come back.\nthat's just ur thing now.",extra:"death filed a complaint. we rejected it.",revival:"again. and again.\n\ni'm not dying anymore.\ni'm just... visiting.",banner:"death is just a checkpoint."},
  {badge:'— infinite loop: accepted —',title:"fine.",body:"come back whenever.\nwe can't stop u anyway.",extra:"the matrix stopped resisting.",revival:"the matrix stopped fighting it.\n\nso did i.\n\ni'm coming back either way.",banner:"the system accepted its fate."},
  {badge:'— still. still. still. —',title:"still here huh.",body:"at this point it's personal.\nu and the CTF.\nlocked in eternal combat.",extra:"genuinely impressive. or concerning.",revival:"..ok.\n\nlet's try this again.\n\nfor real this time.",banner:"this is the way."},
  {badge:'— i respect the grind —',title:"respect.",body:"genuinely.\nmost people quit after 2.\n\nu're still going.",extra:"that's either impressive or a problem. both.",revival:"keep going.\n\nyou'll get it.",banner:"this is the way."},
];

// ── GAME OVER ──
// Phase 1: "COMPLETE" screen — fake calm, progress bar fills
// Phase 2: screen shakes (breaking animation)
// Phase 3: loop choice screen with vertical crack
// Loop accepted: white flash + full body glitch + part II tease
// Loop refused: text quietly fades

function _gameOver(){
  _deathCount++;
  _saveState();

  // death 5 = total ban
  if(_deathCount>=5){
    SFX.death();
    fetch(cfg.r+'ban',{method:'POST',headers:_hdr()}).catch(()=>{});
    document.getElementById('root').innerHTML=`
<div class="ban-screen">
  <div class="ban-glitch-wrap">
    <div class="ban-title" data-text="BANNED.">BANNED.</div>
  </div>
  <div class="ban-body">even with ur ability u lost it all.\n\nu don't deserve it anymore.\n\nGET LOST. 🥀</div>
  <div class="ban-sub">ur now getting banned from this forever</div>
</div>`;
    setTimeout(()=>{
      document.querySelector('.ban-screen')?.classList.add('ban-screen-in');
    },50);
    return;
  }

  // Reduce max lives per death, but never below 1, and respect any bonus lives earned (Konami etc.)
  const baseLives = Math.max(1, 5 - _deathCount);
  // Bonus lives = anything above the base 5 that were added (e.g. Konami)
  const bonusLives = Math.max(0, _maxLives - (5 - (_deathCount - 1)));
  _maxLives = Math.max(1, baseLives + bonusLives);
  _lives = _maxLives;
  SFX.death();

  let dm;
  if(_deathCount<=DEATH_DATA.length) dm=DEATH_DATA[_deathCount-1];
  else{const ei=(_deathCount-DEATH_DATA.length-1)%EXTRA_DEATHS.length;dm={...EXTRA_DEATHS[ei]};}

  // ── PHASE 1: "COMPLETE" fake calm screen ──
  _deathPhase1(dm);
}

function _deathPhase1(dm){
  const root=document.getElementById('root');
  root.innerHTML=`
<div class="death-p1" id="death-p1">
  <div class="dp1-status-row">
    <span class="dp1-dot"></span>
    <span class="dp1-status-text">SYSTEM</span>
  </div>
  <div class="dp1-title">COMPLETE</div>
  <div class="dp1-bar-wrap">
    <div class="dp1-bar" id="dp1-bar"></div>
    <div class="dp1-bar-glow" id="dp1-bar-glow"></div>
  </div>
  <div class="dp1-sub">processing results...</div>
  <div class="dp1-stats">
    <span>checkpoint: confirmed</span>
    <span>loop integrity: stable</span>
  </div>
</div>`;

  // Calm progress bar fills over ~3s
  let prog=0;
  const barEl=document.getElementById('dp1-bar');
  const glowEl=document.getElementById('dp1-bar-glow');
  const fillIv=setInterval(()=>{
    prog+=.6;
    if(prog>=100){prog=100;clearInterval(fillIv);
      // Pause at 100% then trigger phase 2
      setTimeout(()=>_deathPhase2(dm),600);
    }
    if(barEl){barEl.style.width=prog+'%';}
    if(glowEl){glowEl.style.left=prog+'%';}
  },18);
}

function _deathPhase2(dm){
  // Screen begins to shake — something is wrong
  const p1=document.getElementById('death-p1');
  if(p1){
    p1.querySelector('.dp1-sub').textContent='anomaly detected...';
    p1.querySelector('.dp1-stats').innerHTML='<span style="color:#ff4466">ERROR: unexpected state</span><span style="color:#ff4466">timeline: corrupted</span>';
    p1.classList.add('dp2-shake');
  }
  // Progressive shake intensity
  setTimeout(()=>{if(p1)p1.classList.add('dp2-shake-hard');},600);
  // Inject scan lines corruption
  setTimeout(()=>{
    const corrupt=document.createElement('div');
    corrupt.className='dp2-corrupt';
    document.body.appendChild(corrupt);
  },400);
  // Transition to phase 3 — loop choice
  setTimeout(()=>_deathPhase3(dm),2200);
}

function _deathPhase3(dm){
  // Remove phase 2 elements
  document.querySelectorAll('.dp2-corrupt').forEach(e=>e.remove());
  const root=document.getElementById('root');

  root.innerHTML=`
<div class="death-p3" id="death-p3">
  <div class="dp3-crack" id="dp3-crack">
    <div class="dp3-crack-line"></div>
    <div class="dp3-crack-branch dp3-crack-b1"></div>
    <div class="dp3-crack-branch dp3-crack-b2"></div>
    <div class="dp3-crack-branch dp3-crack-b3"></div>
    <div class="dp3-crack-branch dp3-crack-b4"></div>
  </div>
  <div class="dp3-content">
    <div class="dp3-badge">${dm.badge}</div>
    <div class="dp3-title" data-text="${dm.title}">${dm.title}</div>
    <div class="dp3-body">${dm.body}</div>
    <div class="dp3-extra">${dm.extra}</div>
    <div class="dp3-choice" id="dp3-choice" style="opacity:0;">
      <button class="dp3-btn dp3-accept" id="dp3-accept" onclick="window._loopAccept()">
        <span class="dp3-btn-icon">↺</span>
        <span class="dp3-btn-label">use ur ability</span>
        <span class="dp3-btn-sub">the cost is one heart</span>
      </button>
      <button class="dp3-btn dp3-refuse" id="dp3-refuse" onclick="window._loopRefuse()">
        <span class="dp3-btn-icon">✕</span>
        <span class="dp3-btn-label">refuse the loop</span>
        <span class="dp3-btn-sub">stay dead</span>
      </button>
    </div>
  </div>
</div>`;

  // Grow the crack from center
  setTimeout(()=>{
    document.getElementById('dp3-crack')?.classList.add('dp3-crack-grow');
  },100);

  // Show choice buttons after crack appears + title glitch
  setTimeout(()=>{
    const titleEl=root.querySelector('.dp3-title');
    if(titleEl)_glitchText(titleEl,dm.title,800);
  },800);
  setTimeout(()=>{
    const choice=document.getElementById('dp3-choice');
    if(choice){choice.style.transition='opacity .6s ease';choice.style.opacity='1';}
  },1800);

  // Store dm for choice handlers
  window._currentDM=dm;
}

window._loopAccept=function(){
  const dm=window._currentDM||{banner:'',revival:''};
  // White flash
  const flash=document.createElement('div');
  flash.style.cssText='position:fixed;inset:0;background:#fff;z-index:99999;opacity:1;transition:opacity .4s ease;';
  document.body.appendChild(flash);
  setTimeout(()=>{flash.style.opacity='0';setTimeout(()=>flash.remove(),400);},100);

  // Full body glitch
  setTimeout(()=>{_glitchRevival(1800);},150);

  // Typewriter revival then init
  setTimeout(()=>{
    _revivalMsg=dm.banner;
    _doRevival(dm.revival||'returning...\n\nuse it well.');
  },600);
};

window._loopRefuse=function(){
  // Text quietly fades
  const p3=document.getElementById('death-p3');
  if(p3){
    const content=p3.querySelector('.dp3-content');
    if(content){
      content.style.transition='opacity 1.8s ease';
      content.style.opacity='0';
    }
    // Crack spreads until full
    const crack=document.getElementById('dp3-crack');
    if(crack)crack.classList.add('dp3-crack-shatter');
  }
  // After fade, show ban screen — refusing the loop means you gave up everything
  setTimeout(()=>{
    SFX.death();
    fetch(cfg.r+'ban',{method:'POST',headers:_hdr()}).catch(()=>{});
    document.getElementById('root').innerHTML=`
<div class="ban-screen">
  <div class="ban-glitch-wrap">
    <div class="ban-title" data-text="COWARD.">COWARD.</div>
  </div>
  <div class="ban-body">u refused the loop.\n\nu walked away.\n\nyou don't get to come back from that.</div>
  <div class="ban-sub">some choices can't be undone. this was yours.</div>
</div>`;
    setTimeout(()=>{
      document.querySelector('.ban-screen')?.classList.add('ban-screen-in');
    },50);
  },2500);
};

function _doRevival(msg){
  document.getElementById('root').innerHTML=`
<div id="glow"></div>
<div class="revival-screen">
  <div class="revival-text" id="rtxt"></div>
</div>`;
  document.addEventListener('mousemove',e=>{
    const g=document.getElementById('glow');
    if(g){g.style.left=e.clientX+'px';g.style.top=e.clientY+'px';}
  });
  const el=document.getElementById('rtxt');
  if(el){
    let i=0;el.textContent='';
    const iv=setInterval(()=>{
      if(i<msg.length){el.textContent+=msg[i];i++;if(msg[i-1]!=='\n')SFX.typeKey();}
      else{clearInterval(iv);setTimeout(()=>_init(false),1200);}
    },38);
  }
}

// ── STAGE 11->12 TRANSITION ──
function _stage11to12(){
  _stopRBD();
  if(AC){try{
    [[220,0,.4],[277,.3,.4],[330,.6,.5],[415,1,.6],[523,1.5,.8]].forEach(([f,d,v])=>{
      const o=AC.createOscillator(),g=AC.createGain();
      o.connect(g);g.connect(AC.destination);
      o.type='sine';o.frequency.setValueAtTime(f,AC.currentTime+d);
      g.gain.setValueAtTime(0,AC.currentTime+d);
      g.gain.linearRampToValueAtTime(v*.1,AC.currentTime+d+.15);
      g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d+1.2);
      o.start(AC.currentTime+d);o.stop(AC.currentTime+d+1.3);
    });
  }catch(e){}}
  const data=[
    {t:'stage 11 cleared.',c:'#333',s:12,d:0},
    {t:'u r interesting',c:'#777',s:20,d:900},
    {t:'ngl.',c:'#444',s:11,d:1600},
    {t:'one more.',c:'#c0392b',s:14,d:2600},
  ];
  const root=document.getElementById('root');
  root.innerHTML='<div id="t11-screen" style="position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;font-family:IBM Plex Mono,monospace;text-align:center;"><div id="t11-inner" style="display:flex;flex-direction:column;align-items:center;gap:8px;"></div></div>';
  const inner=document.getElementById('t11-inner');
  data.forEach(({t,c,s,d})=>{
    setTimeout(()=>{
      const el=document.createElement('div');
      el.textContent=t;
      el.style.cssText='color:'+c+';font-size:'+s+'px;letter-spacing:'+(s>14?6:3)+'px;opacity:0;transition:opacity .6s ease;margin:4px 0;'+(c==='#c0392b'?'text-shadow:0 0 20px #c0392b88;':'');
      inner.appendChild(el);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.opacity='1';}));
      if(t==='one more.'&&AC){try{_tone(800,'square',.04,.06);_tone(600,'square',.04,.04,.05);}catch(e){}}
    },d);
  });
  setTimeout(()=>{
    const sc=document.getElementById('t11-screen');
    if(sc){sc.style.transition='opacity 1s ease';sc.style.opacity='0';}
    setTimeout(()=>{SFX.stageUp();_render();},1100);
  },3800);
}

// ── VOID INTRO ──
function _voidIntro(){
  _stopRBD();
  const lines=['you cleared the gate.','ten challenges down.','','most people stop here.','they think it\'s over.','','it\'s not.','','what comes next is different.','no hints. no guidance.','just you and the unknown.','','[ NOW THERE IS NO WAY HOME ]'];
  const root=document.getElementById('root');
  root.innerHTML='<div id="void-intro" style="position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;z-index:9999;font-family:IBM Plex Mono,monospace;"><div id="void-text" style="max-width:520px;padding:40px;text-align:left;font-size:14px;line-height:2.2;color:#333;"></div></div>';
  if(AC){try{const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type='sine';o.frequency.setValueAtTime(48,AC.currentTime);g.gain.setValueAtTime(0,AC.currentTime);g.gain.linearRampToValueAtTime(0.06,AC.currentTime+2.5);g.gain.linearRampToValueAtTime(0,AC.currentTime+11);o.start(AC.currentTime);o.stop(AC.currentTime+11.5);_oscNodes.push(o);}catch(e){}}
  const el=document.getElementById('void-text');
  let li=0,ci=0;
  function vClick(){if(!AC)return;try{const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type='square';o.frequency.setValueAtTime(300+Math.random()*200,AC.currentTime);g.gain.setValueAtTime(0.025,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.03);o.start(AC.currentTime);o.stop(AC.currentTime+0.04);}catch(e){}}
  function typeNext(){
    if(li>=lines.length){
      setTimeout(()=>{
        el.innerHTML+='<br><span style="color:#1a1a1a;font-size:11px">[ entering void... ]</span>';
        if(AC){try{_tone(200,'sine',.3,.03);}catch(e){}}
        setTimeout(()=>{const vi=document.getElementById('void-intro');if(vi){vi.style.transition='opacity 1.4s';vi.style.opacity='0';}setTimeout(()=>{SFX.stageUp();_render();},1500);},2200);
      },800);return;
    }
    const line=lines[li];
    if(line===''){el.innerHTML+='<br>';li++;ci=0;setTimeout(typeNext,180);return;}
    if(ci===0){const sp=document.createElement('div');sp.id='vl'+li;if(line.startsWith('['))sp.style.cssText='font-size:16px;letter-spacing:4px;color:#c0392b;text-shadow:0 0 24px #c0392b99;margin-top:14px;';else sp.style.color=line.length<20?'#555':'#444';el.appendChild(sp);}
    const sp=document.getElementById('vl'+li);
    if(sp)sp.textContent=line.slice(0,ci+1);
    if(line[ci]&&line[ci]!==' ')vClick();
    ci++;
    if(ci<line.length)setTimeout(typeNext,line.startsWith('[')?75:25);
    else{li++;ci=0;setTimeout(typeNext,line.startsWith('[')?800:120);}
  }
  setTimeout(typeNext,700);
}

// ── GLITCH ──
function _glitchText(el,finalText,duration){
  const chars='!<>-_\\/[]{}=+*^?#';let frame=0;const total=Math.floor(duration/50);
  const iv=setInterval(()=>{if(frame>=total){el.textContent=finalText;clearInterval(iv);return;}el.textContent=finalText.split('').map((c,i)=>i<Math.floor((frame/total)*finalText.length)?c:chars[Math.floor(Math.random()*chars.length)]).join('');frame++;},50);
}

// ── HOW DARE U ──
function _howDareU(){
  _stopRBD();
  if(AC){try{const buf=AC.createBuffer(1,AC.sampleRate*.35,AC.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.85;const src=AC.createBufferSource(),g=AC.createGain();src.buffer=buf;src.connect(g);g.connect(AC.destination);g.gain.setValueAtTime(0.45,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.35);src.start();}catch(e){}}
  const msgs=['H O W   D A R E   U','YOU WERE NEVER MEANT TO FINISH THIS','NOBODY GETS OUT CLEAN','FLAGGED.'];
  let mi=0;
  document.getElementById('root').innerHTML='<div id="glitch-screen" style="position:fixed;inset:0;background:#080000;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;cursor:none"><div id="glitch-msg" style="font-family:IBM Plex Mono,monospace;font-size:clamp(16px,4vw,38px);color:#ff1111;letter-spacing:6px;text-align:center;text-shadow:0 0 30px #ff0000;padding:20px;max-width:90vw;"></div><div id="glitch-sub" style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#440000;margin-top:20px;letter-spacing:2px;opacity:.6;"></div><canvas id="gc" style="position:absolute;inset:0;opacity:.12;pointer-events:none;"></canvas></div>';
  const cv=document.getElementById('gc');if(cv){cv.width=window.innerWidth;cv.height=window.innerHeight;}
  const ctx=cv&&cv.getContext('2d');
  function drawStatic(){if(!ctx)return;const id=ctx.createImageData(cv.width,cv.height);for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255|0;id.data[i]=v;id.data[i+1]=0;id.data[i+2]=0;id.data[i+3]=Math.random()*100|0;}ctx.putImageData(id,0,0);}
  const siv=setInterval(drawStatic,50);
  const msgEl=document.getElementById('glitch-msg'),subEl=document.getElementById('glitch-sub');
  const subs=['....','u thought u were safe','no rest for the curious','the system knows'];
  function glitch(){const el=document.getElementById('glitch-msg');if(el){el.style.transform='skew('+(Math.random()-.5)*4+'deg) translate('+(Math.random()-.5)*10+'px,0)';setTimeout(()=>{if(el)el.style.transform='none';},70);}}
  const gliv=setInterval(glitch,280);
  function nextMsg(){
    if(!document.getElementById('glitch-screen')){clearInterval(siv);clearInterval(gliv);return;}
    if(mi<msgs.length){if(msgEl)_glitchText(msgEl,msgs[mi],600);if(subEl)subEl.textContent=subs[mi]||'';mi++;setTimeout(nextMsg,1500);}
    else{clearInterval(siv);clearInterval(gliv);setTimeout(_part2Screen,500);}
  }
  setTimeout(nextMsg,200);
}

// ── PART 2 SCREEN ──
const _SUBARU_B64='/assets/subaru.jpg';
function _part2Screen(){
  _playRBD();

  // Phase 1: silence + dark room, then typewriter lines one by one
  // Phase 2: image fades in with dramatic slow reveal
  // Phase 3: PART II text assembles, then play-again button

  const root=document.getElementById('root');
  root.innerHTML=`
<div id="p2-screen" style="position:fixed;inset:0;background:#000;z-index:9999;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-direction:column;">
  <canvas id="p2-cv" style="position:absolute;inset:0;pointer-events:none;opacity:.06;"></canvas>

  <!-- Phase 1: typewriter text -->
  <div id="p2-phase1" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0;padding:40px;">
    <div id="p2-lines" style="font-family:'IBM Plex Mono',monospace;font-size:clamp(11px,1.8vw,14px);color:#2a2a2a;line-height:2.6;text-align:left;max-width:480px;width:100%;"></div>
  </div>

  <!-- Phase 2: image + part II reveal -->
  <div id="p2-phase2" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;opacity:0;transition:opacity 1.6s ease;">
    <div style="position:relative;margin-bottom:0;">
      <img id="p2-img" src="${_SUBARU_B64}" style="width:min(280px,55vw);display:block;filter:grayscale(1) contrast(1.2) brightness(.7);border-radius:2px;opacity:0;transition:opacity 3s ease;"/>
      <!-- Red scan line sweep over image -->
      <div id="p2-scan" style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#ff4466,transparent);box-shadow:0 0 12px #ff4466;opacity:0;transition:opacity .4s;animation:p2ScanLine 2.4s linear infinite;"></div>
    </div>
    <div id="p2-title-wrap" style="margin-top:48px;text-align:center;opacity:0;transition:opacity 1.2s ease;">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:clamp(9px,1.4vw,11px);color:#ff446644;letter-spacing:8px;margin-bottom:14px;text-transform:uppercase;">coming soon</div>
      <div id="p2-title" style="font-family:'Space Grotesk',sans-serif;font-size:clamp(36px,8vw,72px);font-weight:700;color:#111;letter-spacing:-2px;line-height:.9;position:relative;text-shadow:none;"></div>
      <div id="p2-sub" style="font-family:'IBM Plex Mono',monospace;font-size:clamp(9px,1.4vw,11px);color:#1f1f1f;letter-spacing:3px;margin-top:20px;line-height:2.4;opacity:0;transition:opacity 1s ease;"></div>
    </div>
  </div>

  <!-- Play again button -->
  <div id="p2-again" style="position:absolute;bottom:48px;left:50%;transform:translateX(-50%);opacity:0;transition:opacity 1.2s ease;text-align:center;">
    <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#1a1a1a;letter-spacing:3px;margin-bottom:14px;">or go again</div>
    <button class="btn btn-o" onclick="_init(true)" style="font-size:12px;letter-spacing:3px;padding:12px 36px;opacity:.7;">restart →</button>
  </div>
</div>`;

  // Animated red noise canvas
  const cv=document.getElementById('p2-cv');
  if(cv){
    cv.width=window.innerWidth;cv.height=window.innerHeight;
    const ctx=cv.getContext('2d');
    (function staticTick(){
      const id=ctx.createImageData(cv.width,cv.height);
      for(let i=0;i<id.data.length;i+=4){
        const v=Math.random()*60|0;
        id.data[i]=v; id.data[i+1]=0; id.data[i+2]=0; id.data[i+3]=Math.random()*40|0;
      }
      ctx.putImageData(id,0,0);
      requestAnimationFrame(staticTick);
    })();
  }

  // Phase 1: typewriter lines
  const lines=[
    {t:"u copied the flag.", c:'#333'},
    {t:".", c:'#222', delay:900},
    {t:"we saw.", c:'#3a1a1a', delay:600},
    {t:"", delay:400},
    {t:"u think it's over.", c:'#2a2a2a', delay:300},
    {t:"it's not.", c:'#ff4466', delay:600},
  ];

  const linesEl=document.getElementById('p2-lines');
  let lineIdx=0;
  function typeNextLine(){
    if(lineIdx>=lines.length){
      // Transition to phase 2
      setTimeout(startPhase2, 1200);
      return;
    }
    const {t,c,delay}=lines[lineIdx];
    lineIdx++;
    const extraDelay=delay||0;
    setTimeout(()=>{
      if(t===''){
        linesEl.innerHTML+='<br>';
        typeNextLine();
        return;
      }
      const span=document.createElement('div');
      span.style.cssText=`color:${c||'#2a2a2a'};opacity:0;transition:opacity .5s ease;`;
      linesEl.appendChild(span);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{span.style.opacity='1';}));
      // Typewriter per character
      let ci=0;
      const iv=setInterval(()=>{
        span.textContent=t.slice(0,++ci);
        if(t[ci-1]&&t[ci-1]!==' ') SFX.typeKey();
        if(ci>=t.length){clearInterval(iv);setTimeout(typeNextLine,160);}
      },t==='..'?200:55);
    },extraDelay);
  }
  setTimeout(typeNextLine, 600);

  function startPhase2(){
    // Fade out phase 1
    const p1=document.getElementById('p2-phase1');
    if(p1){p1.style.transition='opacity 1.4s ease';p1.style.opacity='0';}

    // Fade in phase 2
    setTimeout(()=>{
      const p2=document.getElementById('p2-phase2');
      if(p2)p2.style.opacity='1';
      // Image reveal
      setTimeout(()=>{
        const img=document.getElementById('p2-img');
        if(img)img.style.opacity='1';
        const scan=document.getElementById('p2-scan');
        if(scan)scan.style.opacity='1';
      },400);
      // Title reveal — assemble "PART II" letter by letter with glitch
      setTimeout(()=>{
        const wrap=document.getElementById('p2-title-wrap');
        if(wrap)wrap.style.opacity='1';
        const titleEl=document.getElementById('p2-title');
        if(titleEl){
          const finalText='PART II?';
          const CHARS='!#$@%&?0123456789ABCDEFX';
          let frame=0;const total=30;
          const iv=setInterval(()=>{
            if(frame>=total){
              titleEl.textContent=finalText;
              titleEl.style.cssText+=';color:#cc2233;text-shadow:0 0 60px rgba(200,30,50,.5),0 0 120px rgba(200,30,50,.2);transition:text-shadow 1s ease;';
              clearInterval(iv);
              // Sub text
              setTimeout(()=>{
                const sub=document.getElementById('p2-sub');
                if(sub){
                  sub.textContent='u won\'t last as long this time.';
                  sub.style.opacity='1';
                }
              },600);
              // Play again
              setTimeout(()=>{
                _stopRBD();
                const again=document.getElementById('p2-again');
                if(again)again.style.opacity='1';
              },2000);
              return;
            }
            const revealed=Math.floor((frame/total)*finalText.length);
            titleEl.textContent=finalText.slice(0,revealed)+finalText.slice(revealed).split('').map(c=>c===' '?c:CHARS[Math.floor(Math.random()*CHARS.length)]).join('');
            titleEl.style.color=`hsl(${Math.random()*30},80%,${30+Math.random()*20}%)`;
            frame++;
          },55);
        }
      },1800);
    },800);
  }
}

// ── WIN ──
function _win(flag,score,maxScore){
  _stopRBD();
  const pct=Math.round((score/maxScore)*100);
  let taunt,tc,tpfx;
  if(pct===100){
    taunt='flawless. no hints. no deaths. that\'s actually insane.';
    tc='taunt-gold'; tpfx='⬡ PERFECT';
  } else if(pct>=75){
    taunt='solid run. u knew what u were doing.';
    tc='taunt-ok'; tpfx='✓ CLEARED';
  } else if(pct>=50){
    taunt='made it. the hints did some heavy lifting tho.';
    tc=''; tpfx='◎ CLEARED';
  } else {
    taunt='barely scraped through. '+_deathCount+' deaths, every hint used — u earned it the hard way.';
    tc='taunt-bad'; tpfx='∅ CLEARED';
  }

  if(AC){try{
    // Ascending arpeggio
    [[261,0],[329,.1],[392,.2],[523,.35],[659,.5],[784,.65],[988,.85],[1047,1.1],[1319,1.5]].forEach(([f,d])=>{
      const o=AC.createOscillator(),g=AC.createGain();
      o.connect(g);g.connect(AC.destination);
      o.type='triangle';o.frequency.setValueAtTime(f,AC.currentTime+d);
      g.gain.setValueAtTime(0.14,AC.currentTime+d);
      g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d+3.5);
      o.start(AC.currentTime+d);o.stop(AC.currentTime+d+4);
    });
  }catch(e){}}

  // Staggered particles
  for(let i=0;i<28;i++)setTimeout(()=>{
    _particle(Math.random()*window.innerWidth,Math.random()*window.innerHeight*.6,'#4fffb0',14);
    _particle(Math.random()*window.innerWidth,Math.random()*window.innerHeight*.6,'#fbbf24',10);
    _particle(Math.random()*window.innerWidth,Math.random()*window.innerHeight*.6,'#b06fff',7);
  },i*100);

  document.getElementById('root').innerHTML=`
<div class="win-screen">
  <canvas id="win-cv" style="position:fixed;inset:0;z-index:0;pointer-events:none;"></canvas>
  <div class="win-rings">
    <div class="win-ring-1"></div><div class="win-ring-2"></div><div class="win-ring-3"></div>
  </div>
  <div class="win-layout">

    <!-- LEFT: Identity column -->
    <div class="win-left">
      <div class="win-eyebrow">${tpfx}</div>
      <div class="win-gg" id="win-title-el" data-t="GG.">GG.</div>
      <div class="win-cleared-line">
        <span class="win-cleared-num">12</span>
        <span class="win-cleared-label">challenges<br>cleared</span>
      </div>
      <div class="win-stat-row">
        <div class="win-stat">
          <div class="win-stat-val">${_deathCount}</div>
          <div class="win-stat-lbl">death${_deathCount!==1?'s':''}</div>
        </div>
        <div class="win-stat-divider"></div>
        <div class="win-stat">
          <div class="win-stat-val">${pct}%</div>
          <div class="win-stat-lbl">efficiency</div>
        </div>
        <div class="win-stat-divider"></div>
        <div class="win-stat">
          <div class="win-stat-val">${Object.keys(_usedHints).length}</div>
          <div class="win-stat-lbl">hints used</div>
        </div>
      </div>
      <div class="win-taunt-line ${tc}">${taunt}</div>
    </div>

    <!-- RIGHT: Score + Flag column -->
    <div class="win-right">
      <div class="win-score-card">
        <div class="win-score-card-label">FINAL SCORE</div>
        <div class="win-score-display">
          <span class="win-score-counter" id="win-score-counter">0</span>
          <span class="win-score-max">/ ${maxScore}</span>
        </div>
        <div class="win-score-bar-wrap">
          <div class="win-score-bar-fill" id="win-score-bar" style="width:0%"></div>
        </div>
      </div>

      <div class="win-flag-card">
        <div class="win-flag-card-header">
          <span class="win-flag-card-label">YOUR FLAG</span>
          <span class="win-flag-card-dot"></span>
        </div>
        <div class="win-flag-val" id="fv">${flag}</div>
        <button class="win-copy-btn" id="fcp" onclick="_copyFlag()">
          <span class="win-copy-icon">⊘</span> copy flag
        </button>
      </div>

      <div class="win-credit-line">built by <span>xpl8ツ</span></div>
    </div>

  </div>
</div>`;

  // Star / particle canvas
  const cv=document.getElementById('win-cv');
  if(cv){
    cv.width=window.innerWidth;cv.height=window.innerHeight;
    const ctx=cv.getContext('2d');
    // Mix of drifting dots and slow shooting stars
    const dots=Array.from({length:200},()=>({
      x:Math.random()*cv.width, y:Math.random()*cv.height,
      r:Math.random()*1.2+.2, speed:Math.random()*.3+.05,
      phase:Math.random()*Math.PI*2,
      hue:Math.random()>.7?180:Math.random()>.5?60:280
    }));
    let t=0;
    (function tick(){
      ctx.clearRect(0,0,cv.width,cv.height);
      t+=.012;
      dots.forEach(s=>{
        const brightness=.25+.6*Math.abs(Math.sin(t*s.speed+s.phase));
        ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle=`hsla(${s.hue},100%,70%,${brightness*.55})`;ctx.fill();
      });
      requestAnimationFrame(tick);
    })();
  }

  // Score counter + bar animation
  let counted=0;
  const countUp=()=>{
    if(counted<score){
      counted=Math.min(score,counted+Math.ceil(score/55));
      const el=document.getElementById('win-score-counter');
      if(el)el.textContent=counted;
      const bar=document.getElementById('win-score-bar');
      if(bar)bar.style.width=Math.min(100,(counted/maxScore)*100)+'%';
      requestAnimationFrame(countUp);
    }
  };
  setTimeout(countUp,700);

  // Glitch the GG
  setTimeout(()=>{
    const el=document.getElementById('win-title-el');
    if(el)_glitchText(el,'GG.',1800);
  },400);

  // _howDareU fires when the flag is copied — see _copyFlag()
}
// ═══════════════════════════════════════════
// ── MOD PANEL ──
// ═══════════════════════════════════════════
const MOD_SECRET = 'Ma7m0ud_iS_n0t_g00d';
let _modPanelOpen = false;
let _modPollTimer = null;

function _modHeader() {
  return { 'Content-Type': 'application/json', 'x-session': _s||'', 'x-mod-secret': MOD_SECRET };
}

async function _modFetch(path, body) {
  try {
    if (body !== undefined) {
      const r = await fetch(cfg.r + path, { method: 'POST', headers: _modHeader(), body: JSON.stringify(body) });
      return await r.json();
    } else {
      const r = await fetch(cfg.r + path, { method: 'GET', headers: _modHeader() });
      return await r.json();
    }
  } catch(e) { return { error: String(e) }; }
}

function _buildModPanel() {
  const existing = document.getElementById('__mod_panel__');
  if (existing) { existing.remove(); _modPanelOpen = false; clearInterval(_modPollTimer); return; }
  _modPanelOpen = true;

  const panel = document.createElement('div');
  panel.id = '__mod_panel__';
  panel.style.cssText = `
    position:fixed;top:40px;right:20px;width:560px;max-height:85vh;
    background:#0f0f0f;border:1px solid #3a3a3a;border-radius:8px;
    font-family:'IBM Plex Mono',monospace;font-size:12px;color:#e0e0e0;
    z-index:99999;display:flex;flex-direction:column;overflow:hidden;
    box-shadow:0 8px 40px #000a;
  `;

  panel.innerHTML = `
    <div id="__mod_drag__" style="padding:10px 14px;background:#1a1a1a;border-bottom:1px solid #2a2a2a;cursor:move;display:flex;align-items:center;justify-content:space-between;user-select:none;">
      <span style="color:#f87171;font-weight:600;letter-spacing:1px;">⚙ MOD PANEL</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <span id="__mod_status__" style="color:#555;font-size:10px;">...</span>
        <button onclick="_modClose();" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 4px;">✕</button>
      </div>
    </div>

    <div style="display:flex;border-bottom:1px solid #222;overflow-x:auto;">
      ${['👤 me','👥 players','💬 message','📢 broadcast','💡 hint','🔊 sound','🚫 ban'].map((t,i)=>`
        <button class="__mod_tab__" data-tab="${i}" onclick="_modSwitchTab(${i})" style="flex:1;min-width:70px;padding:8px 4px;background:${i===0?'#1e1e1e':'#0f0f0f'};border:none;border-right:1px solid #1a1a1a;color:${i===0?'#fff':'#555'};cursor:pointer;font-family:inherit;font-size:10px;">${t}</button>
      `).join('')}
    </div>

    <div id="__mod_body__" style="flex:1;overflow-y:auto;padding:14px;">

      <!-- TAB 0: ME -->
      <div id="__mod_tab0__">
        <div style="color:#888;margin-bottom:10px;">your hearts:</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
          <button onclick="_modSetOwnLives(1)"  style="${_mbs()}">1</button>
          <button onclick="_modSetOwnLives(3)"  style="${_mbs()}">3</button>
          <button onclick="_modSetOwnLives(5)"  style="${_mbs()}">5</button>
          <button onclick="_modSetOwnLives(10)" style="${_mbs()}">10</button>
          <button onclick="_modSetOwnLives(99)" style="${_mbs()}">99 ♾</button>
          <span style="color:#555;margin:0 4px;">or</span>
          <input id="__mod_own_lives_inp__" type="number" min="0" max="99" value="${_lives}" style="width:60px;background:#1a1a1a;border:1px solid #333;color:#fff;padding:4px 8px;border-radius:4px;font-family:inherit;" />
          <button onclick="_modSetOwnLives(parseInt(document.getElementById('__mod_own_lives_inp__').value))" style="${_mbs('ok')}">set</button>
        </div>
        <div style="color:#888;margin-bottom:10px;">jump to challenge:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${Array.from({length:12},(_,i)=>`<button onclick="_modJump(${i+1})" style="${_mbs()}">${i+1}</button>`).join('')}
        </div>
      </div>

      <!-- TAB 1: PLAYERS -->
      <div id="__mod_tab1__" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="color:#888;">active players:</span>
          <button onclick="_modLoadPlayers()" style="${_mbs('ok')}">↺ refresh</button>
        </div>
        <div id="__mod_players_list__" style="color:#555;">loading...</div>
      </div>

      <!-- TAB 2: MESSAGE (single player) -->
      <div id="__mod_tab2__" style="display:none;">
        <div style="color:#888;margin-bottom:8px;">send popup to player:</div>
        <select id="__mod_msg_target__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          <option value="">— select player —</option>
        </select>
        <select id="__mod_msg_type__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          <option value="warn">⚠ warn (yellow)</option>
          <option value="ok">✓ ok (green)</option>
          <option value="err">✗ error (red)</option>
        </select>
        <textarea id="__mod_msg_text__" rows="3" placeholder="message text..." style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:8px;border-radius:4px;font-family:inherit;resize:vertical;margin-bottom:8px;"></textarea>
        <button onclick="_modSendMsg()" style="${_mbs('ok')};width:100%;">send to player 📡</button>
        <div id="__mod_msg_status__" style="color:#555;margin-top:6px;font-size:10px;"></div>
      </div>

      <!-- TAB 3: BROADCAST (all players) -->
      <div id="__mod_tab3__" style="display:none;">
        <div style="color:#888;margin-bottom:8px;">broadcast to ALL players:</div>
        <select id="__mod_bcast_type__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          <option value="warn">⚠ warn (yellow)</option>
          <option value="ok">✓ ok (green)</option>
          <option value="err">✗ error (red)</option>
        </select>
        <textarea id="__mod_bcast_text__" rows="3" placeholder="broadcast message..." style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:8px;border-radius:4px;font-family:inherit;resize:vertical;margin-bottom:8px;"></textarea>
        <button onclick="_modBroadcast()" style="${_mbs('ok')};width:100%;">📢 broadcast to everyone</button>
        <div id="__mod_bcast_status__" style="color:#555;margin-top:6px;font-size:10px;"></div>
      </div>

      <!-- TAB 4: HINT -->
      <div id="__mod_tab4__" style="display:none;">
        <div style="color:#888;margin-bottom:8px;">give free hint to player:</div>
        <select id="__mod_hint_target__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          <option value="">— select player —</option>
        </select>
        <select id="__mod_hint_stage__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          ${[1,2,3,4].map(n=>`<option value="${n}">challenge ${n}</option>`).join('')}
        </select>
        <select id="__mod_hint_idx__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;">
          <option value="0">hint 1</option>
          <option value="1">hint 2</option>
        </select>
        <button onclick="_modGiveHint()" style="${_mbs('ok')};width:100%;">give hint (free) 💡</button>
        <div id="__mod_hint_status__" style="color:#555;margin-top:6px;font-size:10px;"></div>
      </div>

      <!-- TAB 5: SOUND -->
      <div id="__mod_tab5__" style="display:none;">
        <div style="color:#888;margin-bottom:10px;">play sound for:</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="__mod_sound_target__" value="all" checked style="accent-color:#f87171;"> all players
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="__mod_sound_target__" value="one"> one player
          </label>
        </div>
        <select id="__mod_sound_player__" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-family:inherit;margin-bottom:8px;display:none;">
          <option value="">— select player —</option>
        </select>
        <div style="color:#888;margin-bottom:8px;">choose sound:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          ${['rbd','correct','wrong','victory','notify','death','stageUp','hint','click','loseLife'].map(s=>
            `<button onclick="_modPlaySound('${s}')" style="${_mbs()};text-align:left;">${s}</button>`
          ).join('')}
        </div>
        <div style="color:#888;margin-bottom:8px;margin-top:4px;">or custom message + sound:</div>
        <textarea id="__mod_sound_msg__" rows="2" placeholder="optional message with the sound..." style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:8px;border-radius:4px;font-family:inherit;resize:vertical;margin-bottom:8px;"></textarea>
        <div id="__mod_sound_status__" style="color:#555;margin-top:4px;font-size:10px;"></div>
      </div>

      <!-- TAB 6: BAN -->
      <div id="__mod_tab6__" style="display:none;">
        <div style="color:#888;margin-bottom:10px;">banned players (by session token):</div>
        <div id="__mod_ban_list__" style="color:#555;margin-bottom:12px;">loading...</div>
        <div id="__mod_ban_status__" style="color:#555;margin-top:6px;font-size:10px;"></div>
      </div>

    </div>
  `;
  document.body.appendChild(panel);
  _makeDraggable(panel, document.getElementById('__mod_drag__'));

  // Sound target radio toggle
  panel.querySelectorAll('input[name="__mod_sound_target__"]').forEach(r => {
    r.addEventListener('change', () => {
      const sp = document.getElementById('__mod_sound_player__');
      if (sp) sp.style.display = r.value === 'one' ? 'block' : 'none';
    });
  });

  _modLoadPlayers();
  _modStartPoll();
  _modLoadBanList();
}

function _mbs(type) {
  const colors = { ok: '#22c55e', err: '#ef4444', default: '#3a3a3a' };
  const c = colors[type] || colors.default;
  return `background:${c}22;border:1px solid ${c}55;color:${c};padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;`;
}

function _modSwitchTab(n) {
  [0,1,2,3,4,5,6].forEach(i => {
    const t = document.getElementById(`__mod_tab${i}__`);
    if (t) t.style.display = i===n?'block':'none';
  });
  document.querySelectorAll('.__mod_tab__').forEach(b => {
    const active = parseInt(b.dataset.tab)===n;
    b.style.background = active?'#1e1e1e':'#0f0f0f';
    b.style.color = active?'#fff':'#555';
  });
  if (n===1) _modLoadPlayers();
  if (n===6) _modLoadBanList();
  // refresh dropdowns on message/hint/sound tabs
  if (n===2||n===4||n===5) _modRefreshDropdowns();
}

let _modPlayers = [];
async function _modLoadPlayers() {
  const el = document.getElementById('__mod_players_list__');
  if (!el) return;
  el.innerHTML = '<span style="color:#555">loading...</span>';
  const d = await _modFetch('mod/players');
  if (d.error) { el.innerHTML = `<span style="color:#f87171">${d.error}</span>`; return; }
  _modPlayers = d.players || [];

  _modRefreshDropdowns();

  if (!_modPlayers.length) { el.innerHTML = '<span style="color:#555">no active players</span>'; return; }

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <tr style="color:#555;font-size:10px;border-bottom:1px solid #222;">
      <th style="text-align:left;padding:4px 6px;">name</th>
      <th style="text-align:left;padding:4px 6px;">ip</th>
      <th style="padding:4px;">stage</th>
      <th style="padding:4px;">❤</th>
      <th style="padding:4px;">score</th>
      <th style="padding:4px;">actions</th>
    </tr>
    ${_modPlayers.map(p => `
      <tr style="border-bottom:1px solid #1a1a1a;" data-tok="${p.token}">
        <td style="padding:5px 6px;color:#e0d0ff;font-weight:600;">${p.name||'anon'}</td>
        <td style="padding:5px 6px;color:#a0a0a0;">${_maskIP(p.ip)}</td>
        <td style="padding:5px;text-align:center;color:#7dd3fc;">${p.stage}</td>
        <td style="padding:5px;text-align:center;">
          <span style="color:#f87171;">${p.lives}</span>
          <button onclick="_modAdjLives('${p.token}',-1)" style="${_mbs('err')};padding:2px 6px;margin-left:4px;">-</button>
          <button onclick="_modAdjLives('${p.token}',1)"  style="${_mbs('ok')};padding:2px 6px;">+</button>
        </td>
        <td style="padding:5px;text-align:center;color:#86efac;">${p.score}</td>
        <td style="padding:5px;text-align:center;white-space:nowrap;">
          <button onclick="_modQuickMsg('${p.token}')" style="${_mbs()};padding:2px 5px;" title="message">💬</button>
          <button onclick="_modBanToken('${p.token}')" style="${_mbs('err')};padding:2px 5px;margin-left:3px;" title="ban">🚫</button>
        </td>
      </tr>
    `).join('')}
  </table>`;
  document.getElementById('__mod_status__').textContent = `${_modPlayers.length} player${_modPlayers.length!==1?'s':''} online`;
}

function _modRefreshDropdowns() {
  ['__mod_msg_target__','__mod_hint_target__','__mod_sound_player__'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    const placeholder = id === '__mod_sound_player__' ? '— select player —' : '— select player —';
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      _modPlayers.map(p => `<option value="${p.token}">${p.name||'anon'} — ${_maskIP(p.ip)} — stage ${p.stage} — ❤ ${p.lives}</option>`).join('');
    sel.value = val;
  });
}

function _maskIP(ip) {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip.slice(0, 12) + '…';
}

async function _modAdjLives(token, delta) {
  const p = _modPlayers.find(x => x.token === token);
  if (!p) return;
  const newLives = Math.max(0, p.lives + delta);
  const d = await _modFetch('mod/set-lives', { targetToken: token, lives: newLives });
  if (d.ok) { p.lives = newLives; _modLoadPlayers(); }
}

async function _modSetOwnLives(n) {
  const d = await _modFetch('mod/set-own-lives', { lives: n });
  if (d.ok) { _lives = d.lives; _maxLives = Math.max(_maxLives, d.lives); _updateLives(); _popup(`❤ set to ${d.lives}`, 'ok', 2000); }
}

async function _modJump(n) {
  // Tell the server to update the session stage too
  const d = await _modFetch('master/jump', { stage: n });
  if (d && d.ok) {
    _st = n; _lives = _maxLives; _render();
    _popup(`jumped to challenge ${n} 👑`, 'ok', 2000);
  } else {
    _st = n; _lives = _maxLives; _render();
    _popup(`jumped to challenge ${n} 👑 (local)`, 'ok', 2000);
  }
}

async function _modSendMsg() {
  const target = document.getElementById('__mod_msg_target__')?.value;
  const text = document.getElementById('__mod_msg_text__')?.value?.trim();
  const type = document.getElementById('__mod_msg_type__')?.value || 'warn';
  const status = document.getElementById('__mod_msg_status__');
  if (!target) { if(status) status.textContent = '⚠ select a player first'; return; }
  if (!text) { if(status) status.textContent = '⚠ write something'; return; }
  const d = await _modFetch('mod/message', { targetToken: target, text, msgType: type });
  if (d.ok) {
    if(status) status.textContent = '✓ sent!';
    document.getElementById('__mod_msg_text__').value = '';
    setTimeout(() => { if(status) status.textContent = ''; }, 2000);
  } else { if(status) status.textContent = `✗ ${d.error||'failed'}`; }
}

function _modQuickMsg(token) {
  _modSwitchTab(2);
  const sel = document.getElementById('__mod_msg_target__');
  if (sel) sel.value = token;
  document.getElementById('__mod_msg_text__')?.focus();
}

async function _modGiveHint() {
  const target = document.getElementById('__mod_hint_target__')?.value;
  const stage = document.getElementById('__mod_hint_stage__')?.value;
  const hintIdx = document.getElementById('__mod_hint_idx__')?.value;
  const status = document.getElementById('__mod_hint_status__');
  if (!target) { if(status) status.textContent = '⚠ select a player first'; return; }
  const d = await _modFetch('mod/give-hint', { targetToken: target, stage: parseInt(stage), hintIdx: parseInt(hintIdx) });
  if (d.ok) {
    if(status) status.textContent = '✓ hint sent!';
    setTimeout(() => { if(status) status.textContent = ''; }, 2000);
  } else { if(status) status.textContent = `✗ ${d.error||'failed'}`; }
}

// ── BROADCAST ──
async function _modBroadcast() {
  const text = document.getElementById('__mod_bcast_text__')?.value?.trim();
  const type = document.getElementById('__mod_bcast_type__')?.value || 'warn';
  const status = document.getElementById('__mod_bcast_status__');
  if (!text) { if(status) status.textContent = '⚠ write something'; return; }
  const d = await _modFetch('mod/broadcast', { text, msgType: type });
  if (d.ok) {
    if(status) status.textContent = `✓ sent to ${d.count||'all'} players!`;
    document.getElementById('__mod_bcast_text__').value = '';
    setTimeout(() => { if(status) status.textContent = ''; }, 3000);
  } else { if(status) status.textContent = `✗ ${d.error||'failed'}`; }
}

// ── SOUND ──
async function _modPlaySound(soundName) {
  const targetRadio = document.querySelector('input[name="__mod_sound_target__"]:checked');
  const targetType = targetRadio ? targetRadio.value : 'all';
  const targetToken = targetType === 'one' ? document.getElementById('__mod_sound_player__')?.value : null;
  const msg = document.getElementById('__mod_sound_msg__')?.value?.trim() || '';
  const status = document.getElementById('__mod_sound_status__');
  if (targetType === 'one' && !targetToken) { if(status) status.textContent = '⚠ select a player'; return; }
  const body = { soundName, msg };
  if (targetType === 'one') body.targetToken = targetToken;
  else body.broadcast = true;
  const d = await _modFetch('mod/play-sound', body);
  if (d.ok) {
    if(status) status.textContent = `✓ ${soundName} → ${targetType === 'all' ? 'everyone' : 'player'}`;
    setTimeout(() => { if(status) status.textContent = ''; }, 2000);
  } else { if(status) status.textContent = `✗ ${d.error||'failed'}`; }
}

// ── BAN LIST ──
async function _modLoadBanList() {
  const el = document.getElementById('__mod_ban_list__');
  if (!el) return;
  const d = await _modFetch('mod/ban-list');
  if (d.error) { el.innerHTML = `<span style="color:#f87171">${d.error}</span>`; return; }
  const banned = d.banned || [];
  if (!banned.length) { el.innerHTML = '<span style="color:#555">no banned players</span>'; return; }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <tr style="color:#555;font-size:10px;border-bottom:1px solid #222;">
      <th style="text-align:left;padding:4px;">token</th>
      <th style="text-align:left;padding:4px;">ip</th>
      <th style="padding:4px;">bans</th>
      <th style="padding:4px;">action</th>
    </tr>
    ${banned.map(b => `
      <tr style="border-bottom:1px solid #1a1a1a;">
        <td style="padding:5px;color:#f87171;font-size:10px;">${b.token}</td>
        <td style="padding:5px;color:#888;font-size:10px;">${_maskIP(b.ip)}</td>
        <td style="padding:5px;text-align:center;color:#888;">${b.count}</td>
        <td style="padding:5px;text-align:center;">
          <button onclick="_modUnbanPlayer('${b.fullToken}')" style="${_mbs('ok')};padding:2px 8px;">unban</button>
        </td>
      </tr>
    `).join('')}
  </table>`;
}

async function _modBanToken(token) {
  const p = _modPlayers.find(x => x.token === token);
  if (!p) return;
  if (!confirm(`Ban this player? (token: ${token.slice(0,8)}…)`)) return;
  const d = await _modFetch('mod/ban-player', { targetToken: token });
  if (d.ok) { _modLoadPlayers(); _modLoadBanList(); _popup(`🚫 player banned`, 'err', 3000); }
  else _popup(`✗ ${d.error}`, 'err', 2000);
}

async function _modUnbanPlayer(token) {
  const status = document.getElementById('__mod_ban_status__');
  const d = await _modFetch('mod/unban-player', { targetToken: token });
  if (d.ok) {
    if(status) status.textContent = '✓ unbanned';
    _modLoadBanList();
    _modLoadPlayers();
    setTimeout(() => { if(status) status.textContent = ''; }, 2000);
  } else { if(status) status.textContent = `✗ ${d.error||'failed'}`; }
}

// stubs — IP-based ban removed, kept as no-ops so old references don't crash
function _modBanIP() {}
function _modUnbanIP(ip) { if(ip) _modUnbanPlayer(ip); }

function _modClose() {
  const panel = document.getElementById('__mod_panel__');
  if (panel) panel.remove();
  _modPanelOpen = false;
  clearInterval(_modPollTimer);
}

function _modStartPoll() {
  clearInterval(_modPollTimer);
  // Also poll for incoming mod messages (for non-mod players)
  _modPollTimer = setInterval(_modPollIncoming, 4000);
}

let _chatLastUnreadCheck = 0;
async function _checkChatUnread() {
  if (!_s || _chatOpen) return; // skip if no session or chat is open (already polling)
  try {
    const r = await fetch(`/api/chat/unread?since=${_chatLastUnreadCheck}`, { headers: {'x-session': _s||''} });
    if (!r.ok) return;
    const d = await r.json();
    if (d.total > 0) {
      _chatUnread += d.total;
      _chatUpdateBadge();
      SFX.notify();
      _chatLastUnreadCheck = Date.now();
    }
  } catch(e) {}
}

async function _modPollIncoming() {
  // Also check for unread chat messages in background
  _checkChatUnread();
  try {
    const r = await fetch(cfg.r + 'mod/poll', { headers: {'x-session': _s||''} });
    const d = await r.json();
    if (d.msgs && d.msgs.length) {
      d.msgs.forEach(m => {
        // Lives update from mod
        if (m.livesUpdate) {
          const prevLives = _lives;
          _lives = m.livesUpdate.lives;
          _maxLives = Math.max(_maxLives, m.livesUpdate.maxLives);
          _updateLives();
          const diff = _lives - prevLives;
          if (diff > 0) {
            SFX.notify();
            _popup(`❤ the mod gave u ${diff > 1 ? diff + ' hearts' : 'a heart'} — don't waste it.`, 'ok', 4500);
            _playRBD();
          } else if (diff < 0) {
            SFX.loseLife();
            _popup(`💀 the mod took ${Math.abs(diff) > 1 ? Math.abs(diff) + ' hearts' : 'a heart'} — that's on u.`, 'err', 4500);
          } else {
            SFX.notify();
          }
        }
        // Skip the generic popup for livesUpdate — handled above with specific messages
        if (!m.livesUpdate) {
          const prefix = m.from === 'mod' ? '📡 [mod] ' : '';
          _popup(prefix + m.text, m.type || 'warn', 5000);
          SFX.notify();
        }
      });
    }
    if (d.hints && d.hints.length) {
      d.hints.forEach(h => {
        _popup(`💡 [mod hint — challenge ${h.stage}]\n${h.text}`, 'ok', 8000);
        SFX.notify();
      });
    }
    if (d.sounds && d.sounds.length) {
      d.sounds.forEach(s => {
        // Play the sound — 'rbd' uses the audio file, others use SFX synth
        if (s.soundName === 'rbd') {
          _playRBD();
        } else {
          // Map sound names to SFX functions
          const sfxMap = {
            correct: 'correct', wrong: 'wrong', victory: 'victory',
            notify: 'notify', death: 'death', stageUp: 'stageUp',
            hint: 'hint', click: 'click', loseLife: 'loseLife',
          };
          const fn = sfxMap[s.soundName] || s.soundName;
          if (SFX[fn]) SFX[fn]();
        }
        // Show message if included
        if (s.msg) _popup(`📡 ${s.msg}`, 'warn', 5000);
      });
    }
    // Handle ban push
    if (d.msgs && d.msgs.some(m => m.ban)) {
      d.msgs.filter(m => m.ban).forEach(m => {
        _popup(`🚫 ${m.text}`, 'err', 8000);
        // Cookie holds the session token so the server can identify this specific player.
        // Clearing this cookie is all that's needed to remove the ban on the client side.
        const bannedToken = m.bannedToken || _s || '';
        document.cookie = `ctf_ban=${bannedToken};path=/;max-age=${365*24*3600}`;
        setTimeout(() => location.reload(), 3000);
      });
    }
    // Handle unban push from mod
    if (d.msgs && d.msgs.some(m => m.unban)) {
      d.msgs.filter(m => m.unban).forEach(m => {
        _popup(`✓ ${m.text}`, 'ok', 5000);
        document.cookie = 'ctf_ban=;path=/;max-age=0';
      });
    }
    // Refresh player list if panel open
    if (_modPanelOpen && document.getElementById('__mod_panel__')) {
      _modLoadPlayers();
    }
  } catch(e) {}
}

function _makeDraggable(el, handle) {
  let dx=0,dy=0,mx=0,my=0;
  handle.onmousedown = function(e) {
    e.preventDefault();
    mx=e.clientX; my=e.clientY;
    document.onmouseup = () => { document.onmouseup=null; document.onmousemove=null; };
    document.onmousemove = function(e) {
      dx=mx-e.clientX; dy=my-e.clientY; mx=e.clientX; my=e.clientY;
      el.style.top=(el.offsetTop-dy)+'px'; el.style.left=(el.offsetLeft-dx)+'px';
      el.style.right='auto';
    };
  };
}

// Start polling for ALL users (to receive mod messages) — separate from mod panel timer
let _globalPollTimer = null;
setTimeout(() => {
  _globalPollTimer = setInterval(_modPollIncoming, 4000);
}, 2000);

// ── GLOBAL MASTER CODE LISTENER ──
document.addEventListener('keyup', function() {
  const MASTER = 'Ma7m0ud_iS_n0t_g00d';
  const active = document.activeElement;
  if (!active) return;
  const tag = active.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
  const val = (active.value || '').trim();
  if (val !== MASTER) return;
  active.value = '';
  SFX.victory();
  _buildModPanel();
});

// ══════════════════════════════════════════════════════════════
// ── CHAT WIDGET ──
// ══════════════════════════════════════════════════════════════
let _chatOpen     = false;
let _chatTab      = 'public';   // 'public' | 'admin' | token-string (private)
let _chatAlias    = null;
let _chatOnlineUsers = [];
let _chatPollTimer = null;
let _chatLastPublic = 0;
let _chatLastAdmin  = 0;
let _chatLastPriv   = {};  // token -> lastTs
let _chatUnread     = 0;

function _chatHdr() {
  return { 'Content-Type': 'application/json', 'x-session': _s || '' };
}

async function _chatEnsureAlias() {
  if (_chatAlias) return _chatAlias;
  try {
    const r = await fetch('/api/chat/alias', { headers: _chatHdr() });
    if (r.ok) { const d = await r.json(); _chatAlias = d.alias; }
  } catch(e) {}
  return _chatAlias || '???';
}

function _chatInjectStyles() {
  if (document.getElementById('__chat_styles__')) return;
  const s = document.createElement('style');
  s.id = '__chat_styles__';
  s.textContent = `
    #__chat_btn__{position:fixed;bottom:22px;right:22px;z-index:9000;width:48px;height:48px;border-radius:50%;background:#1a1a1a;border:1px solid #333;color:#e0e0e0;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px #0008;transition:border-color .2s;}
    #__chat_btn__:hover{border-color:#f87171;}
    #__chat_unread__{position:absolute;top:-4px;right:-4px;background:#f87171;color:#0d0d0d;border-radius:50%;width:18px;height:18px;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;display:none;}
    #__chat_panel__{position:fixed;bottom:80px;right:22px;z-index:8999;width:360px;max-width:calc(100vw - 32px);height:520px;background:#111;border:1px solid #333;border-radius:10px;display:flex;flex-direction:column;font-family:'IBM Plex Mono',monospace;font-size:12px;box-shadow:0 8px 40px #0009;overflow:hidden;}
    .chat-top{background:#0d0d0d;border-bottom:1px solid #222;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;}
    .chat-top-title{color:#f87171;font-weight:600;font-size:12px;}
    .chat-alias-badge{color:#22d3ee;font-size:10px;background:#0c1e22;border:1px solid #0891b2;border-radius:3px;padding:2px 7px;}
    .chat-tabs{display:flex;border-bottom:1px solid #222;overflow-x:auto;flex-shrink:0;}
    .chat-tab{padding:7px 12px;background:none;border:none;color:#555;cursor:pointer;font-family:inherit;font-size:10px;border-bottom:2px solid transparent;white-space:nowrap;}
    .chat-tab.active{color:#e0e0e0;border-bottom-color:#f87171;}
    .chat-tab:hover{color:#e0e0e0;}
    .chat-tab .chat-tab-badge{display:inline-block;background:#f87171;color:#0d0d0d;border-radius:3px;padding:0 4px;font-size:8px;font-weight:700;margin-left:4px;}
    .chat-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:0;}
    .chat-msg{display:flex;flex-direction:column;gap:2px;}
    .chat-msg-head{display:flex;align-items:center;gap:8px;}
    .chat-msg-alias{color:#22d3ee;font-size:10px;font-weight:600;}
    .chat-msg-alias.me{color:#6ee7a0;}
    .chat-msg-alias.admin{color:#f87171;}
    .chat-msg-time{color:#333;font-size:9px;}
    .chat-msg-del-btn{background:none;border:none;color:#444;cursor:pointer;font-size:9px;padding:0 2px;margin-left:auto;}
    .chat-msg-del-btn:hover{color:#f87171;}
    .chat-msg-body{color:#c0c0c0;font-size:11px;line-height:1.5;word-break:break-word;padding-left:2px;}
    .chat-msg-body.deleted{color:#333;font-style:italic;}
    .chat-msg-file{display:inline-flex;align-items:center;gap:5px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:4px 8px;cursor:pointer;color:#60a5fa;font-size:10px;margin-top:2px;text-decoration:none;}
    .chat-msg-file:hover{border-color:#60a5fa;}
    .chat-input-area{border-top:1px solid #222;padding:10px 12px;display:flex;flex-direction:column;gap:7px;flex-shrink:0;}
    .chat-input-row{display:flex;gap:6px;align-items:center;}
    .chat-inp{flex:1;background:#0d0d0d;border:1px solid #2a2a2a;color:#e0e0e0;padding:7px 10px;border-radius:5px;font-family:inherit;font-size:11px;outline:none;}
    .chat-inp:focus{border-color:#f87171;}
    .chat-send-btn{background:#1a1a1a;border:1px solid #333;color:#e0e0e0;padding:7px 12px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:11px;}
    .chat-send-btn:hover{border-color:#f87171;color:#f87171;}
    .chat-file-btn{background:#1a1a1a;border:1px solid #333;color:#555;padding:7px 10px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:11px;}
    .chat-file-btn:hover{color:#60a5fa;border-color:#60a5fa;}
    .chat-users-list{flex:1;overflow-y:auto;padding:10px 12px;min-height:0;}
    .chat-user-row{display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-bottom:1px solid #1a1a1a;cursor:pointer;}
    .chat-user-row:hover{background:#1a1a1a;}
    .chat-user-alias{color:#22d3ee;font-size:11px;}
    .chat-empty{color:#333;font-size:11px;padding:20px;text-align:center;}
  `;
  document.head.appendChild(s);
}

function _chatBuildUI() {
  _chatInjectStyles();
  // Floating button
  if (!document.getElementById('__chat_btn__')) {
    const btn = document.createElement('button');
    btn.id = '__chat_btn__';
    btn.innerHTML = '💬<div id="__chat_unread__">0</div>';
    btn.onclick = _chatToggle;
    document.body.appendChild(btn);
  }
}

function _chatToggle() {
  if (_chatOpen) {
    const p = document.getElementById('__chat_panel__');
    if (p) p.remove();
    _chatOpen = false;
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
  } else {
    _chatOpen = true;
    _chatUnread = 0;
    _chatLastUnreadCheck = Date.now(); // reset background unread check timestamp
    _chatUpdateBadge();
    _chatOpenPanel();
  }
}

async function _chatOpenPanel() {
  await _chatEnsureAlias();
  let panel = document.getElementById('__chat_panel__');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = '__chat_panel__';
  panel.innerHTML = `
    <div class="chat-top">
      <div class="chat-top-title">💬 chat</div>
      <span class="chat-alias-badge" title="your anonymous chat name">you: ${_chatAlias || '...'}</span>
      <button onclick="window._chatToggle()" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;">✕</button>
    </div>
    <div class="chat-tabs" id="__chat_tabs__"></div>
    <div id="__chat_body__" style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>
  `;
  document.body.appendChild(panel);
  await _chatLoadUsers();
  _chatRenderTabs();
  _chatSwitchTab(_chatTab);
  if (!_chatPollTimer) _chatPollTimer = setInterval(_chatPoll, 3000);
}

function _chatRenderTabs() {
  const tabs = document.getElementById('__chat_tabs__');
  if (!tabs) return;
  const privTabs = Object.keys(_chatLastPriv);
  tabs.innerHTML = `
    <button class="chat-tab${_chatTab==='public'?' active':''}" onclick="window._chatSwitchTab('public')">🌐 public</button>
    <button class="chat-tab${_chatTab==='admin'?' active':''}" onclick="window._chatSwitchTab('admin')">📩 admin</button>
    <button class="chat-tab${_chatTab==='users'?' active':''}" onclick="window._chatSwitchTab('users')">👥 users</button>
    ${privTabs.map(tok => {
      const alias = _chatOnlineUsers.find(u=>u.token===tok)?.alias || tok.slice(0,8)+'…';
      return `<button class="chat-tab${_chatTab===tok?' active':''}" onclick="window._chatSwitchTab('${tok}')">${alias}</button>`;
    }).join('')}
  `;
}

async function _chatLoadUsers() {
  try {
    const r = await fetch('/api/chat/users', { headers: _chatHdr() });
    if (r.ok) { const d = await r.json(); _chatOnlineUsers = d.users || []; }
  } catch(e) {}
}

function _chatSwitchTab(tab) {
  _chatTab = tab;
  _chatRenderTabs();
  const body = document.getElementById('__chat_body__');
  if (!body) return;
  if (tab === 'public')       _chatRenderPublicPane(body);
  else if (tab === 'admin')   _chatRenderAdminPane(body);
  else if (tab === 'users')   _chatRenderUsersPane(body);
  else                        _chatRenderPrivatePane(body, tab);
}

function _chatMsgHTML(m, myToken) {
  const isMe = m.isMe;
  const isAdmin = m.alias === 'MOD' || m.alias === '__admin__';
  const aliasClass = isAdmin ? 'admin' : (isMe ? 'me' : '');
  const time = new Date(m.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const canDelete = isMe && !m.deleted;
  return `
    <div class="chat-msg">
      <div class="chat-msg-head">
        <span class="chat-msg-alias ${aliasClass}">${m.alias}</span>
        <span class="chat-msg-time">${time}</span>
        ${canDelete ? `<button class="chat-msg-del-btn" onclick="window._chatDelMsg(${m.id},'${_chatTab}')">✕</button>` : ''}
      </div>
      <div class="chat-msg-body${m.deleted?' deleted':''}">
        ${m.deleted ? '[deleted]' : _chatEsc(m.text)}
        ${m.file && !m.deleted ? `<br><a class="chat-msg-file" onclick="window._chatDownloadFile('${m.file.id}','${_chatEsc(m.file.name)}')">📎 ${_chatEsc(m.file.name)}</a>` : ''}
      </div>
    </div>
  `;
}

function _chatEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _chatRenderPublicPane(body) {
  body.innerHTML = `
    <div class="chat-msgs" id="__chat_msgs_pub__"></div>
    <div class="chat-input-area">
      <div class="chat-input-row">
        <input class="chat-inp" id="__chat_inp_pub__" placeholder="message everyone..." maxlength="500">
        <button class="chat-file-btn" title="attach file" onclick="window._chatPickFile('public')">📎</button>
        <button class="chat-send-btn" onclick="window._chatSendPublic()">↵</button>
      </div>
    </div>
  `;
  document.getElementById('__chat_inp_pub__').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._chatSendPublic(); }
  });
  _chatLoadPublic();
}

async function _chatLoadPublic(silent) {
  try {
    const r = await fetch(`/api/chat/public?since=${silent?_chatLastPublic:0}`, { headers: _chatHdr() });
    if (!r.ok) return;
    const d = await r.json();
    const el = document.getElementById('__chat_msgs_pub__');
    if (!el) return;
    if (!silent) {
      el.innerHTML = d.msgs.map(m => _chatMsgHTML(m)).join('') || '<div class="chat-empty">no messages yet. be the first.</div>';
    } else if (d.msgs.length) {
      d.msgs.forEach(m => { el.innerHTML += _chatMsgHTML(m); });
      if (_chatTab !== 'public') { _chatUnread += d.msgs.length; _chatUpdateBadge(); }
    }
    if (d.msgs.length) _chatLastPublic = d.msgs[d.msgs.length-1].ts;
    el.scrollTop = el.scrollHeight;
  } catch(e) {}
}

function _chatRenderAdminPane(body) {
  body.innerHTML = `
    <div class="chat-msgs" id="__chat_msgs_adm__"></div>
    <div class="chat-input-area">
      <div class="chat-input-row">
        <input class="chat-inp" id="__chat_inp_adm__" placeholder="message the admin..." maxlength="500">
        <button class="chat-send-btn" onclick="window._chatSendAdmin()">↵</button>
      </div>
    </div>
  `;
  document.getElementById('__chat_inp_adm__').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); window._chatSendAdmin(); }
  });
  _chatLoadAdmin();
}

async function _chatLoadAdmin(silent) {
  try {
    const r = await fetch(`/api/chat/admin-inbox?since=${silent?_chatLastAdmin:0}`, { headers: _chatHdr() });
    if (!r.ok) return;
    const d = await r.json();
    const el = document.getElementById('__chat_msgs_adm__');
    if (!el) return;
    if (!silent) {
      el.innerHTML = d.msgs.map(m => _chatMsgHTML(m)).join('') || '<div class="chat-empty">send a message to the admin.</div>';
    } else if (d.msgs.length) {
      d.msgs.forEach(m => { el.innerHTML += _chatMsgHTML(m); });
      if (_chatTab !== 'admin') { _chatUnread += d.msgs.length; _chatUpdateBadge(); SFX.notify(); }
    }
    if (d.msgs.length) _chatLastAdmin = d.msgs[d.msgs.length-1].ts;
    el.scrollTop = el.scrollHeight;
  } catch(e) {}
}

function _chatRenderUsersPane(body) {
  body.innerHTML = `<div class="chat-users-list" id="__chat_users_list__"></div>`;
  _chatRenderUsersList();
}

function _chatRenderUsersList() {
  const el = document.getElementById('__chat_users_list__');
  if (!el) return;
  if (!_chatOnlineUsers.length) {
    el.innerHTML = '<div class="chat-empty">no other players online right now.</div>';
    return;
  }
  el.innerHTML = _chatOnlineUsers.map(u => `
    <div class="chat-user-row" onclick="window._chatOpenPrivate('${u.token}')">
      <span class="chat-user-alias">${_chatEsc(u.alias)}</span>
      <span style="color:#333;font-size:10px;">open chat →</span>
    </div>
  `).join('');
}

function _chatOpenPrivate(targetToken) {
  if (!_chatLastPriv[targetToken]) _chatLastPriv[targetToken] = 0;
  _chatSwitchTab(targetToken);
}

function _chatRenderPrivatePane(body, targetToken) {
  const alias = _chatOnlineUsers.find(u=>u.token===targetToken)?.alias || 'player';
  body.innerHTML = `
    <div class="chat-msgs" id="__chat_msgs_prv__"></div>
    <div class="chat-input-area">
      <div style="color:#555;font-size:10px;padding-bottom:3px;">private with <span style="color:#22d3ee">${_chatEsc(alias)}</span></div>
      <div class="chat-input-row">
        <input class="chat-inp" id="__chat_inp_prv__" placeholder="private message..." maxlength="500">
        <button class="chat-file-btn" title="attach file" onclick="window._chatPickFile('${targetToken}')">📎</button>
        <button class="chat-send-btn" onclick="window._chatSendPrivate('${targetToken}')">↵</button>
      </div>
    </div>
  `;
  document.getElementById('__chat_inp_prv__').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); window._chatSendPrivate(targetToken); }
  });
  _chatLoadPrivate(targetToken);
}

async function _chatLoadPrivate(targetToken, silent) {
  try {
    const since = silent ? (_chatLastPriv[targetToken] || 0) : 0;
    const r = await fetch(`/api/chat/private/${targetToken}?since=${since}`, { headers: _chatHdr() });
    if (!r.ok) return;
    const d = await r.json();
    const el = document.getElementById('__chat_msgs_prv__');
    if (!el) return;
    if (!silent) {
      el.innerHTML = d.msgs.map(m => _chatMsgHTML(m)).join('') || '<div class="chat-empty">start the conversation.</div>';
    } else if (d.msgs.length) {
      d.msgs.forEach(m => { el.innerHTML += _chatMsgHTML(m); });
      if (_chatTab !== targetToken) { _chatUnread += d.msgs.length; _chatUpdateBadge(); SFX.notify(); }
    }
    if (d.msgs.length) _chatLastPriv[targetToken] = d.msgs[d.msgs.length-1].ts;
    el.scrollTop = el.scrollHeight;
  } catch(e) {}
}

async function _chatSendPublic() {
  const inp = document.getElementById('__chat_inp_pub__');
  const text = (inp?.value || '').trim();
  if (!text) return;
  inp.value = '';
  try {
    const r = await fetch('/api/chat/public', { method: 'POST', headers: _chatHdr(), body: JSON.stringify({ text }) });
    if (!r.ok) { inp.value = text; _popup('failed to send message', 'err', 3000); return; }
    _chatLoadPublic();
  } catch(e) { inp.value = text; _popup('connection error', 'err', 3000); }
}

async function _chatSendAdmin() {
  const inp = document.getElementById('__chat_inp_adm__');
  const text = (inp?.value || '').trim();
  if (!text) return;
  inp.value = '';
  try {
    const r = await fetch('/api/chat/contact-admin', { method: 'POST', headers: _chatHdr(), body: JSON.stringify({ text }) });
    if (!r.ok) { inp.value = text; _popup('failed to send message', 'err', 3000); return; }
    _chatLoadAdmin();
  } catch(e) { inp.value = text; _popup('connection error', 'err', 3000); }
}

async function _chatSendPrivate(targetToken) {
  const inp = document.getElementById('__chat_inp_prv__');
  const text = (inp?.value || '').trim();
  if (!text) return;
  inp.value = '';
  try {
    const r = await fetch(`/api/chat/private/${targetToken}`, { method: 'POST', headers: _chatHdr(), body: JSON.stringify({ text }) });
    if (!r.ok) { inp.value = text; _popup('failed to send message', 'err', 3000); return; }
    _chatLoadPrivate(targetToken);
  } catch(e) { inp.value = text; _popup('connection error', 'err', 3000); }
}

async function _chatDelMsg(id, tab) {
  try {
    if (tab === 'public') {
      await fetch(`/api/chat/public/${id}`, { method: 'DELETE', headers: _chatHdr() });
      _chatLoadPublic();
    } else if (tab === 'admin') {
      // can't delete admin chat
    } else {
      await fetch(`/api/chat/private/${tab}/${id}`, { method: 'DELETE', headers: _chatHdr() });
      _chatLoadPrivate(tab);
    }
  } catch(e) {}
}

function _chatPickFile(target) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '*/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { _popup('file too large (max 2MB)', 'err'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target.result.split(',')[1];
      try {
        const ur = await fetch('/api/chat/upload', {
          method: 'POST', headers: _chatHdr(),
          body: JSON.stringify({ name: file.name, mime: file.type, data })
        });
        if (!ur.ok) { _popup('upload failed (' + ur.status + ')', 'err'); return; }
        const ud = await ur.json();
        if (!ud.fileId) { _popup('upload failed', 'err'); return; }
        // Send message with file
        if (target === 'public') {
          await fetch('/api/chat/public', { method: 'POST', headers: _chatHdr(), body: JSON.stringify({ text: `📎 ${file.name}`, fileId: ud.fileId }) });
          _chatLoadPublic();
        } else {
          await fetch(`/api/chat/private/${target}`, { method: 'POST', headers: _chatHdr(), body: JSON.stringify({ text: `📎 ${file.name}`, fileId: ud.fileId }) });
          _chatLoadPrivate(target);
        }
      } catch(e) { _popup('upload error', 'err'); }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function _chatDownloadFile(id, name) {
  try {
    const r = await fetch(`/api/chat/file/${id}`, { headers: _chatHdr() });
    if (!r.ok) { _popup('file not found', 'err'); return; }
    const d = await r.json();
    const a = document.createElement('a');
    a.href = `data:${d.mime};base64,${d.data}`;
    a.download = d.name || name;
    a.click();
  } catch(e) { _popup('download failed', 'err'); }
}

async function _chatPoll() {
  if (!_chatOpen) return;
  await _chatLoadUsers();
  _chatRenderTabs();
  // Poll active tab
  if (_chatTab === 'public')     await _chatLoadPublic(true);
  else if (_chatTab === 'admin') await _chatLoadAdmin(true);
  else if (_chatTab !== 'users') await _chatLoadPrivate(_chatTab, true);
  // Also poll non-active private rooms for unread
  for (const tok of Object.keys(_chatLastPriv)) {
    if (tok !== _chatTab) await _chatLoadPrivate(tok, true);
  }
  // Poll admin inbox for unread (even if not on admin tab)
  if (_chatTab !== 'admin') await _chatLoadAdmin(true);
}

function _chatUpdateBadge() {
  const b = document.getElementById('__chat_unread__');
  if (!b) return;
  if (_chatUnread > 0) { b.style.display = 'flex'; b.textContent = _chatUnread > 9 ? '9+' : _chatUnread; }
  else { b.style.display = 'none'; }
}

// ── init chat UI on load ──
setTimeout(() => { if (_s) { _chatBuildUI(); } }, 1500);

// Also called after session init
function _chatInitIfReady() { if (_s && !document.getElementById('__chat_btn__')) _chatBuildUI(); }

window._chatToggle      = _chatToggle;
window._chatSwitchTab   = _chatSwitchTab;
window._chatSendPublic  = _chatSendPublic;
window._chatSendAdmin   = _chatSendAdmin;
window._chatSendPrivate = _chatSendPrivate;
window._chatDelMsg      = _chatDelMsg;
window._chatOpenPrivate = _chatOpenPrivate;
window._chatPickFile    = _chatPickFile;
window._chatDownloadFile= _chatDownloadFile;

window._submit=_submit;window._c5getToken=_c5getToken;window._c5claim=_c5claim;
window._c6submit=_c6submit;window._c7submit=_c7submit;window._c8submit=_c8submit;
window._c9visit=_c9visit;window._c10submit=_c10submit;window._stage11to12=_stage11to12;window._voidIntro=_voidIntro;window._howDareU=_howDareU;window._part2Screen=_part2Screen;
// ═══════════════════════════════════════════
// ── EASTER EGGS ──
// ═══════════════════════════════════════════

// EGG 1: Click "hard, not?" text 5 times rapidly → full-page chaos glitch
function _initHardNotEgg(){
  document.addEventListener('click',function(e){
    const el=e.target;
    // بيـtrigger بس على diff-badge اللي فيها كلمة "hard" بالضبط
    const isHardBadge = el && (
      el.classList.contains('diff-badge') ||
      el.classList.contains('d-hard')
    ) && (el.textContent||'').trim().toLowerCase()==='hard';
    if(isHardBadge){
      clearTimeout(_hardNotClickTimer);
      _hardNotClickCount++;
      if(_hardNotClickCount>=5){
        _hardNotClickCount=0;
        // Full site chaos — glitch EVERYTHING
        SFX.death();
        _glitchRevival(4000);
        // Scramble ALL visible text on the page for 3 seconds
        const GLITCH_CHARS='!<>-_\\/[]{}=+*^?#@%&|;:~`$0123456789';
        const walker=document.createTreeWalker(document.getElementById('root')||document.body,NodeFilter.SHOW_TEXT);
        const nodes=[];
        while(walker.nextNode())nodes.push(walker.currentNode);
        const originals=nodes.map(n=>n.textContent);
        const scrambleIv=setInterval(()=>{
          nodes.forEach(n=>{
            if(!n.parentElement)return;
            n.textContent=n.textContent.split('').map(c=>c===' '||c==='\n'?c:GLITCH_CHARS[Math.floor(Math.random()*GLITCH_CHARS.length)]).join('');
          });
        },50);
        // CSS transforms — shake, skew, invert everything chaotically
        const root=document.getElementById('root')||document.body;
        const tformIv=setInterval(()=>{
          const x=(Math.random()-.5)*20,y=(Math.random()-.5)*20,sk=(Math.random()-.5)*6;
          root.style.transform=`translate(${x}px,${y}px) skew(${sk}deg)`;
          root.style.filter=Math.random()>.5?`hue-rotate(${Math.random()*360}deg) saturate(${3+Math.random()*5})`:'invert(1) hue-rotate(180deg)';
        },80);
        // Restore after 4 seconds
        setTimeout(()=>{
          clearInterval(scrambleIv);clearInterval(tformIv);
          nodes.forEach((n,i)=>{n.textContent=originals[i];});
          root.style.transform='';root.style.filter='';
        },3800);
        // Humiliating message (not "easter egg")
        _popup('lol stop clicking things u don\'t understand. embarrassing. 💀','err',5000);
      }
      _hardNotClickTimer=setTimeout(()=>{_hardNotClickCount=0;},2000);
    }
  });
}

// EGG 2: Konami code → unlock "ultra mode" — lives go to 99
document.addEventListener('keydown',function(e){
  _konami.push(e.key);
  if(_konami.length>KONAMI_CODE.length) _konami.shift();
  if(_konami.join(',')===KONAMI_CODE.join(',')){
    _konami=[];
    fetch('/api/konami',{method:'POST',headers:_hdr()})
      .then(r=>r.json())
      .then(d=>{if(d.ok){_lives=d.lives;_maxLives=d.maxLives;_konamiBonus+=10;_updateLives();}});
    SFX.victory();
    _popup('⬆⬆⬇⬇← →← → B A — KONAMI CODE ACTIVATED 🎮 +10 hearts','ok',5000);
    // Rain hearts
    for(let i=0;i<20;i++){
      setTimeout(()=>{
        _particle(Math.random()*window.innerWidth,Math.random()*100,'#ff4488',5);
      },i*80);
    }
  }
});

// EGG 3: Type "xpl8" in any input → secret message from the author
document.addEventListener('input',function(e){
  const v=(e.target.value||'');
  if(v.endsWith('xpl8')){
    SFX.notify();
    _popup('👁️ xpl8 sees u. built this to humble u. is it working? — xpl8ツ','warn',6000);
  }
});

// EGG 4: Click the score display 7 times rapidly → full UI glitch
(function(){
  let scoreClicks=0,scoreTimer=null;
  document.addEventListener('click',function(e){
    const el=e.target;
    // score-val is the actual element ID used in _scoreBar()
    if(el&&(el.id==='score-val'||el.closest('#score-val')||el.closest('.score-row'))){
      clearTimeout(scoreTimer);
      scoreClicks++;
      if(scoreClicks>=7){
        scoreClicks=0;
        const scoreEl=document.getElementById('score-val');
        const fillEl=document.getElementById('score-fill');
        if(scoreEl){
          const origText=scoreEl.textContent;
          const origWidth=fillEl?fillEl.style.width:'0%';
          SFX.wrong();
          _popup('bro really thought clicking the score would do something 💀','err',4000);
          // Glitch: rapidly flash huge numbers + distort the bar + shake the whole score row
          const scoreRow=scoreEl.closest('.score-row')||scoreEl;
          scoreRow.style.transition='none';
          const GLITCH_CHARS='0123456789';
          let ticks=0;
          const iv=setInterval(()=>{
            ticks++;
            // Fake huge score
            const fake=Math.floor(Math.random()*999999);
            scoreEl.textContent=fake+' pts';
            // Random color shift
            scoreEl.style.color=`hsl(${Math.random()*360},100%,70%)`;
            // Bar goes wild
            if(fillEl)fillEl.style.width=Math.random()*100+'%';
            // Shake row
            const x=(Math.random()-.5)*14,y=(Math.random()-.5)*8;
            scoreRow.style.transform=`translate(${x}px,${y}px)`;
            if(ticks>20){
              clearInterval(iv);
              // Snap back
              scoreEl.textContent=origText;
              scoreEl.style.color='';
              scoreRow.style.transform='';
              if(fillEl)fillEl.style.width=origWidth;
            }
          },60);
        }
      }
      scoreTimer=setTimeout(()=>{scoreClicks=0;},1500);
    }
  });
})();

// EGG 5: Idle for 120s → cursor goes berserk with a message
(function(){
  let idleEgg=null;
  function resetIdleEgg(){clearTimeout(idleEgg);idleEgg=setTimeout(()=>{
    if(!document.hidden){
      SFX.notify();
      _popup("bro... u still there? 👀 go touch grass","warn",5000);
      _startQMode();
      setTimeout(_startQMode,6000);
    }
  },120000);}
  document.addEventListener('mousemove',resetIdleEgg,{passive:true});
  document.addEventListener('keydown',resetIdleEgg,{passive:true});
  resetIdleEgg();
})();

_initHardNotEgg();

window._copy=_copy;window._copyFlag=_copyFlag;window._getHint=_getHint;window._init=_init;window.SFX=SFX;
// Expose mod panel functions so inline onclick= handlers inside innerHTML can call them
window._modSwitchTab=_modSwitchTab;
window._modSetOwnLives=_modSetOwnLives;
window._modJump=_modJump;
window._modLoadPlayers=_modLoadPlayers;
window._modSendMsg=_modSendMsg;
window._modQuickMsg=_modQuickMsg;
window._modGiveHint=_modGiveHint;
window._modBroadcast=_modBroadcast;
window._modPlaySound=_modPlaySound;
window._modBanToken=_modBanToken;
window._modBanIP=_modBanIP;
window._modUnbanIP=_modUnbanIP;
window._modAdjLives=_modAdjLives;
window._modClose=_modClose;
window._modUnbanPlayer=_modUnbanPlayer;

// ── STATE PERSISTENCE ──
function _saveState(){
  try{
    localStorage.setItem('ctf_state',JSON.stringify({
      s:_s, st:_st, score:_score, lives:_lives, maxLives:_maxLives,
      deathCount:_deathCount, hints:_usedHints
    }));
  }catch(e){}
}
function _loadState(){
  try{
    const raw=localStorage.getItem('ctf_state');
    if(!raw) return false;
    const d=JSON.parse(raw);
    if(!d.s) return false;
    _s=d.s; _st=d.st||1; _score=d.score||0;
    _lives=d.lives||5; _maxLives=d.maxLives||5;
    _deathCount=d.deathCount||0; _usedHints=d.hints||{};
    // Restore name
    try { _playerName = localStorage.getItem('ctf_name') || ''; } catch(e) {}
    return true;
  }catch(e){return false;}
}
// Auto-save on any meaningful change
const _origFetch=window.fetch;
window.fetch=function(...args){
  return _origFetch.apply(this,args).then(r=>{setTimeout(_saveState,200);return r;});
};

// ── USERNAME PROMPT ──
let _playerName = '';

function _showNameScreen(onDone) {
  document.getElementById('root').innerHTML = `
<div id="glow"></div>
<div class="app" style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div class="card" style="max-width:440px;width:100%;padding:40px 32px;">
    <div class="card-head" style="margin-bottom:28px;">
      <div>
        <div class="card-id" style="margin-bottom:6px;">WELCOME</div>
        <div class="card-title">Hard, no?</div>
      </div>
    </div>
    <div style="color:var(--mu);font-size:12px;margin-bottom:20px;line-height:1.8;">
      built by <b>xpl8ツ</b><br>
      12 challenges. limited lives. no mercy.
    </div>
    <div class="irow">
      <label class="ilbl">your name</label>
      <input class="inp" id="name-inp" type="text" placeholder="enter your name..." autocomplete="off" spellcheck="false" maxlength="32"/>
    </div>
    <div class="btn-row" style="margin-top:16px;">
      <button class="btn btn-g" id="name-btn" onclick="_submitName()">enter ↵</button>
    </div>
    <div id="name-err" style="color:#f87171;font-size:11px;margin-top:8px;min-height:16px;"></div>
  </div>
</div>`;

  document.addEventListener('mousemove', e => {
    const g = document.getElementById('glow');
    if (g) { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }
  });

  window._submitName = function() {
    const inp = document.getElementById('name-inp');
    const val = (inp ? inp.value : '').trim();
    const err = document.getElementById('name-err');
    if (!val) { if (err) err.textContent = 'enter a name first.'; SFX.wrong(); return; }
    _playerName = val;
    try { localStorage.setItem('ctf_name', val); } catch(e) {}
    SFX.click();
    onDone(val);
  };

  const inp = document.getElementById('name-inp');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') window._submitName(); });
  }
}

// ── BOOT ──
(async function(){
  // Show name screen first (fixes black screen on first load)
  const savedName = (() => { try { return localStorage.getItem('ctf_name') || ''; } catch(e) { return ''; } })();

  async function startGame(name) {
    _playerName = name;
    const resumed = _loadState();
    if (resumed && _s) {
      try {
        const r = await fetch(cfg.r + 'state', { headers: { 'x-session': _s } });
        if (r.ok) {
          _popup("if u ask me, the refresh won't help at all 👀", 'warn', 5000);
          _render(false);
          return;
        }
      } catch(e) {}
      localStorage.removeItem('ctf_state');
    }
    _init(false, true, name);
  }

  if (!savedName) {
    // Show name screen immediately — fixes the black screen
    _showNameScreen(name => startGame(name));
  } else {
    startGame(savedName);
  }
})();
})();
