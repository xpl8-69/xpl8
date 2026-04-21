(function(){
"use strict";

const cfg={r:'/api/'};
let _s=null,_st=1;

async function _init(){
  try{
    const r=await fetch(cfg.r+'init',{method:'POST'});
    const d=await r.json();
    _s=d.token;_st=d.stage;
    _render();
  }catch(e){
    document.getElementById('root').innerHTML=
      '<div style="font:14px monospace;color:#ff4455;padding:40px;text-align:center">⚠ Connection failed. Is the server running?</div>';
  }
}

function _hdr(){return{'Content-Type':'application/json','x-session':_s||''};}

async function _loadClue(n){
  const img=document.getElementById('clue-img');
  if(!img)return;
  img.src='';img.style.opacity='0';
  const r=await fetch(cfg.r+'clue/'+n,{headers:{'x-session':_s||''}});
  if(!r.ok)return;
  const blob=await r.blob();
  img.onload=()=>{img.style.opacity='1';};
  img.src=URL.createObjectURL(blob);
}

async function _submit(n){
  const el=document.getElementById('ans');
  if(!el||!el.value.trim())return;
  const btn=document.getElementById('sub-btn');
  if(btn)btn.disabled=true;
  try{
    const r=await fetch(cfg.r+'check/'+n,{method:'POST',headers:_hdr(),body:JSON.stringify({answer:el.value.trim()})});
    if(r.status===429){_msg('⚠ Slow down.','e');if(btn)btn.disabled=false;return;}
    const d=await r.json();
    if(d.correct){_st=n+1;_msg(d.message,'ok');_fx(n);setTimeout(()=>_render(),1300);}
    else{_msg(d.message||'✘ Wrong.','e');if(btn)btn.disabled=false;}
  }catch(e){_msg('⚠ Server error.','e');if(btn)btn.disabled=false;}
}

// Zone 5 — JWT
async function _z5login(){
  const r=await fetch(cfg.r+'zone5/login',{method:'POST',headers:_hdr()});
  const d=await r.json();
  _msg(d.message||'Got token!','ok');
}
async function _z5flag(){
  const r=await fetch(cfg.r+'zone5/flag',{method:'POST',headers:_hdr()});
  const d=await r.json();
  if(d.correct){_st=6;_msg(d.message,'ok');_fx(5);setTimeout(()=>_render(),1300);}
  else _msg(d.error||'✘ Not admin yet.','e');
}

// Zone 6 — 2FA
async function _z6submit(){
  const code=(document.getElementById('z6code')||{}).value||'';
  const r=await fetch(cfg.r+'zone6/verify',{method:'POST',headers:_hdr(),body:JSON.stringify({code})});
  const d=await r.json();
  if(d.correct){_st=7;_msg(d.message,'ok');_fx(6);setTimeout(()=>_render(),1300);}
  else _msg(d.message||'✘ Wrong.','e');
}

// Zone 7 — Auth Bypass
async function _z7submit(){
  const u=(document.getElementById('z7user')||{}).value||'';
  const p=(document.getElementById('z7pass')||{}).value||'';
  const r=await fetch(cfg.r+'zone7/login',{method:'POST',headers:_hdr(),body:JSON.stringify({username:u,password:p})});
  const d=await r.json();
  if(d.correct){_st=8;_msg(d.message,'ok');_fx(7);if(d.flag)setTimeout(()=>_win(d.flag),1400);}
  else _msg(d.message||'✘ Wrong.','e');
}

function _msg(t,type){
  const el=document.getElementById('msg');
  if(!el)return;
  el.innerHTML='<div class="m-'+type+'">'+t+'</div>';
  setTimeout(()=>{if(el)el.innerHTML='';},6000);
}

function _fx(n){
  const map={1:['💎','⛏'],2:['🛡','🗺'],3:['🏆','⚡'],4:['🟢','💻'],5:['🔑','🪙'],6:['🛡','🔓'],7:['💉','🚨']};
  (map[n]||['⭐']).forEach((e,i)=>setTimeout(()=>_pk(e),i*250));
}

function _pk(emoji,rand){
  const p=document.createElement('div');p.className='pk';p.textContent=emoji;
  p.style.left=(rand?Math.random()*88+2:42+Math.random()*16)+'vw';
  p.style.bottom=(60+Math.random()*40)+'px';
  p.style.setProperty('--d',(2+Math.random()*1.5)+'s');
  document.body.appendChild(p);setTimeout(()=>p.remove(),4000);
}

function _win(flag){
  document.getElementById('root').innerHTML=`
<div class="win">
  <div class="w-glow"></div>
  <div class="w-inner">
    <div class="w-title">VICTORY ROYALE</div>
    <div class="w-sub">ALL 7 ZONES CLEARED</div>
    <div class="flag-box">
      <div class="fl">◆ YOUR FLAG ◆</div>
      <div class="fv" id="fv">${flag}</div>
      <button class="cp-btn" onclick="navigator.clipboard.writeText(document.getElementById('fv').textContent).then(()=>{this.textContent='✔ COPIED!'})">📋 COPY</button>
    </div>
    <div class="sk">HEX · BINARY · CAESAR · DEOBFUSCATE · JWT · 2FA · SQLI</div>
    <div class="cr">built by <span>0x69erツ</span></div>
    <div class="xp-w"><div class="xp-b" id="xpb"></div></div>
    <button class="btn-g" onclick="location.reload()">↺ PLAY AGAIN</button>
  </div>
</div>`;
  setTimeout(()=>{const b=document.getElementById('xpb');if(b)b.style.width='100%';},400);
  ['💎','⚔️','🏆','🎯','⚡','🔑','💉','🛡'].forEach((e,i)=>setTimeout(()=>_pk(e,true),i*150));
}

function _zoneUI(zone){
  const titles={1:'🎨 THE SKIN VAULT',2:'🗺 THE BINARY MAP',3:'⚡ FINAL CHEST',4:'💻 OBFUSCATED SCRIPT',5:'🪙 JWT AUTH',6:'🛡 2FA LOCK',7:'💉 LOGIN BYPASS'};
  const diffs={1:'EASY',2:'MEDIUM',3:'MEDIUM',4:'MEDIUM',5:'HARD',6:'HARD',7:'HARD'};
  const dcls={1:'d-easy',2:'d-med',3:'d-med',4:'d-med',5:'d-hard',6:'d-hard',7:'d-hard'};
  const story={
    1:'A legendary skin is locked in the vault.<br>The vault uses a <strong>color-coded password</strong>.<br>Decode the palette to crack it open.',
    2:'An ancient map seed was found — stored in binary.<br>Each row of bits spells one letter.<br>Read the map to find the <strong>hidden item</strong>.',
    3:'The final chest is guarded by a <strong>double cipher</strong>.<br>An inscription was carved on it — encrypted twice.<br>Break both layers to claim the prize.',
    4:'A suspicious script was found on the server.<br>The variable names are <strong>mangled and shuffled</strong>.<br>Deobfuscate it to reveal the hidden word.',
    5:'A JWT cookie was issued to you.<br>Open your <strong>Cookie Editor</strong> → copy <code>ctf_jwt</code>.<br>Paste it on jwt.io — the server trusts the wrong algorithm.',
    6:'The login is protected by 2FA.<br>The developer left a <strong>debug parameter</strong> in production.<br>Find it to bypass the code check.',
    7:'A login form stands between you and the flag.<br>The backend query is <strong>not sanitized</strong>.<br>Inject your way in.',
  };

  // Custom input UI per zone
  let inputHTML='';
  if(zone<=4){
    const labels={1:'🔑 ENTER 5-LETTER CODE',2:'🗺 ENTER 6-LETTER WORD',3:'⚡ ENTER DECODED WORD',4:'💻 ENTER DECODED WORD'};
    const btns={1:'⛏ CRACK THE VAULT',2:'🗺 READ THE MAP',3:'⚡ CLAIM THE PRIZE',4:'🟢 SUBMIT WORD'};
    const bcls={1:'btn-g',2:'btn-b',3:'btn-r',4:'btn-gr'};
    inputHTML=`
      <div class="irow">
        <label class="ilbl">${labels[zone]}</label>
        <input class="inp" id="ans" type="text" maxlength="12" placeholder="_ _ _ _ _" autocomplete="off" spellcheck="false"/>
      </div>
      <button class="hint-tog" onclick="document.getElementById('hint').classList.toggle('open')">[ ? ] HINT</button>
      <div class="hint-panel" id="hint"></div>
      <div id="msg"></div>
      <button class="${bcls[zone]} sub-btn" id="sub-btn" onclick="_submit(${zone})">${btns[zone]}</button>`;
  } else if(zone===5){
    inputHTML=`
      <div class="z-actions">
        <button class="btn-b" onclick="_z5login()">1. GET JWT COOKIE</button>
        <div class="z-note">Then open Cookie Editor → copy <code>ctf_jwt</code> → go to jwt.io → change role to <code>admin</code> → set alg to <code>none</code> → remove signature → paste back in Cookie Editor</div>
        <button class="btn-r" onclick="_z5flag()">2. CLAIM FLAG (with admin JWT)</button>
      </div>
      <button class="hint-tog" onclick="document.getElementById('hint').classList.toggle('open')">[ ? ] HINT</button>
      <div class="hint-panel" id="hint"></div>
      <div id="msg"></div>`;
  } else if(zone===6){
    inputHTML=`
      <div class="irow">
        <label class="ilbl">🛡 ENTER 2FA CODE (or find the bypass)</label>
        <input class="inp" id="z6code" type="text" maxlength="10" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/>
      </div>
      <button class="hint-tog" onclick="document.getElementById('hint').classList.toggle('open')">[ ? ] HINT</button>
      <div class="hint-panel" id="hint"></div>
      <div id="msg"></div>
      <button class="btn-r" onclick="_z6submit()">🛡 VERIFY</button>`;
  } else if(zone===7){
    inputHTML=`
      <div class="irow">
        <label class="ilbl">👤 USERNAME</label>
        <input class="inp" id="z7user" type="text" maxlength="60" placeholder="username" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="irow">
        <label class="ilbl">🔒 PASSWORD</label>
        <input class="inp" id="z7pass" type="text" maxlength="60" placeholder="password" autocomplete="off" spellcheck="false"/>
      </div>
      <button class="hint-tog" onclick="document.getElementById('hint').classList.toggle('open')">[ ? ] HINT</button>
      <div class="hint-panel" id="hint"></div>
      <div id="msg"></div>
      <button class="btn-r" onclick="_z7submit()">💉 LOGIN</button>`;
  }

  return `
<div class="app">
  <div class="sky"></div>
  <div class="stars" id="stars"></div>
  <div class="clouds" id="clouds"></div>
  <div class="ground"><div class="ggrass"></div><div class="gdirt"></div></div>
  <div class="blocks" id="blocks"></div>
  <div class="wrap">
    <header class="hdr">
      <div class="hbadge">⚡ SEASON X ⚡</div>
      <h1 class="htitle"><span class="pt">⛏ CTF</span><span class="ft">CHALLENGE</span></h1>
      <div class="hsub">SURVIVAL · DECODE · CONQUER</div>
      <div class="hbuilt">BUILT BY <span>0x69erツ</span></div>
    </header>
    <div class="hud">
      <div class="hl"><div class="hlbl">ZONE</div><div class="hval">${zone} / 7</div></div>
      <div class="hc">
        ${[1,2,3,4,5,6,7].map(i=>`<span class="heart${zone>i?' act':''}">${zone>i?'♥':'♡'}</span>`).join('')}
      </div>
      <div class="hr"><div class="hlbl">XP</div><div class="xpt"><div class="xpf" style="width:${(zone-1)/7*100}%"></div></div></div>
    </div>
    <section class="zone">
      <div class="zh">
        <div class="zn">◆ ZONE 0${zone}</div>
        <div class="zt">${titles[zone]||''}</div>
        <div class="zd ${dcls[zone]||''}">${diffs[zone]||''}</div>
      </div>
      <div class="zs">${story[zone]||''}</div>
      <div class="clue-wrap">
        <img id="clue-img" class="clue-img" alt=""/>
        <div class="clue-loading" id="clue-load">Loading clue...</div>
      </div>
      ${inputHTML}
    </section>
  </div>
</div>`;
}

function _render(){
  if(_st>7){return;}
  document.getElementById('root').innerHTML=_zoneUI(_st);
  _buildScene();
  _loadClue(_st);
  if(_st<=4) _loadHint(_st);
  if(_st>=5) _loadHint(_st);
  document.addEventListener('keydown',function _kh(e){
    if(e.key==='Enter'){
      if(_st<=4)_submit(_st);
      else if(_st===6)_z6submit();
      else if(_st===7)_z7submit();
      document.removeEventListener('keydown',_kh);
    }
  });
}

async function _loadHint(n){
  const r=await fetch(cfg.r+'hint/'+n,{headers:{'x-session':_s||''}});
  if(!r.ok)return;
  const d=await r.json();
  const el=document.getElementById('hint');
  if(el)el.innerHTML=d.html||'';
}

function _buildScene(){
  const se=document.getElementById('stars');
  if(se)for(let i=0;i<100;i++){
    const s=document.createElement('div');s.className='star';
    const sz=Math.random()*2.5+0.5;
    s.style.cssText=`width:${sz}px;height:${sz}px;top:${Math.random()*70}%;left:${Math.random()*100}%;--d:${2+Math.random()*4}s;--dl:${Math.random()*4}s`;
    se.appendChild(s);
  }
  const ce=document.getElementById('clouds');
  if(ce)[[120,28,'8%','35s','0s'],[80,20,'14%','52s','12s'],[150,32,'5%','44s','26s']].forEach(([w,h,t,d,dl])=>{
    const el=document.createElement('div');el.className='cloud';
    el.style.cssText=`width:${w}px;height:${h}px;top:${t};border-radius:${h/2}px;--d:${d};--dl:${dl}`;
    ce.appendChild(el);
  });
  const be=document.getElementById('blocks');
  if(be)[['db-grass','4vw','15%','3.5s','0s'],['db-stone','18vw','22%','4.2s','0.7s'],
    ['db-gold','80vw','28%','2.8s','1.2s'],['db-wood','90vw','18%','5s','0.3s'],
    ['db-iron','68vw','34%','3.8s','1.8s'],['db-stone','35vw','40%','4.5s','0.5s'],
    ['db-grass','55vw','25%','3.2s','2s'],['db-gold','12vw','38%','3s','1.5s']
  ].forEach(([cls,l,b,d,dl])=>{
    const el=document.createElement('div');el.className=`dblock ${cls}`;
    el.style.cssText=`left:${l};bottom:${b};animation-duration:${d};animation-delay:${dl}`;
    be.appendChild(el);
  });
}

window._submit=_submit;
window._z5login=_z5login;
window._z5flag=_z5flag;
window._z6submit=_z6submit;
window._z7submit=_z7submit;
_init();
})();
