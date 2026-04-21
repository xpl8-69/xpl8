(function(){
"use strict";

const cfg = { r: '/api/' };
let _s = null, _st = 1, _score = 0, _lives = 5, _maxLives = 5, _usedHints = {}, _deathCount = 0;
const MAX_SCORE = 1450;

// ── AUDIO ENGINE (Web Audio API - no external files needed) ──
const AC = new (window.AudioContext || window.webkitAudioContext)();

function _unlockAudio() { if (AC.state === 'suspended') AC.resume(); }
document.addEventListener('click', _unlockAudio, { once: true });
document.addEventListener('keydown', _unlockAudio, { once: true });

function _beep(freq, type, duration, volume, delay) {
  try {
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, AC.currentTime + (delay||0));
    g.gain.setValueAtTime(volume||0.3, AC.currentTime + (delay||0));
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + (delay||0) + duration);
    o.start(AC.currentTime + (delay||0));
    o.stop(AC.currentTime + (delay||0) + duration + 0.05);
  } catch(e) {}
}

function _noise(duration, volume) {
  try {
    const buf = AC.createBuffer(1, AC.sampleRate * duration, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource();
    const g = AC.createGain();
    src.buffer = buf;
    src.connect(g); g.connect(AC.destination);
    g.gain.setValueAtTime(volume||0.1, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + duration);
    src.start(); src.stop(AC.currentTime + duration + 0.05);
  } catch(e) {}
}

const SFX = {
  correct: () => {
    _beep(523, 'sine', 0.12, 0.25);
    _beep(659, 'sine', 0.12, 0.25, 0.12);
    _beep(784, 'sine', 0.25, 0.3, 0.24);
  },
  wrong: () => {
    _beep(220, 'sawtooth', 0.08, 0.2);
    _beep(180, 'sawtooth', 0.15, 0.2, 0.09);
  },
  loseLife: () => {
    _beep(300, 'sawtooth', 0.06, 0.2);
    _beep(200, 'sawtooth', 0.12, 0.25, 0.07);
    _noise(0.15, 0.08);
  },
  // Return by Death — eerie descending tone + reverb feel
  returnByDeath: () => {
    _beep(880, 'sine', 0.4, 0.15);
    _beep(740, 'sine', 0.4, 0.15, 0.3);
    _beep(587, 'sine', 0.4, 0.2, 0.6);
    _beep(440, 'sine', 0.6, 0.25, 0.9);
    _beep(370, 'sine', 0.8, 0.2, 1.4);
    _beep(294, 'sine', 1.0, 0.15, 2.0);
    // eerie high overtone
    _beep(1760, 'sine', 2.5, 0.04, 0.1);
  },
  death: () => {
    _noise(0.3, 0.15);
    _beep(150, 'sawtooth', 0.5, 0.3, 0.1);
    _beep(100, 'sawtooth', 0.8, 0.2, 0.4);
  },
  death2: () => {
    _noise(0.2, 0.12);
    _beep(200, 'sawtooth', 0.3, 0.3, 0.05);
    _beep(120, 'sine', 0.6, 0.25, 0.2);
    _beep(80,  'sine', 1.0, 0.2,  0.5);
  },
  death3: () => {
    _beep(440, 'sawtooth', 0.1, 0.2);
    _beep(330, 'sawtooth', 0.1, 0.2, 0.1);
    _beep(220, 'sawtooth', 0.1, 0.2, 0.2);
    _beep(110, 'sawtooth', 0.6, 0.3, 0.3);
    _noise(0.4, 0.1);
  },
  victory: () => {
    const notes = [523,587,659,698,784,880,988,1047];
    notes.forEach((f,i) => _beep(f, 'sine', 0.2, 0.2, i*0.1));
    _beep(1047, 'sine', 0.6, 0.35, notes.length*0.1);
    _beep(1319, 'sine', 0.8, 0.3, notes.length*0.1+0.3);
  },
  hint: () => {
    _beep(440, 'sine', 0.1, 0.15);
    _beep(392, 'sine', 0.2, 0.12, 0.12);
  },
  hover: () => _beep(800, 'sine', 0.04, 0.05),
  click: () => _beep(600, 'sine', 0.06, 0.08),
  stageUp: () => {
    _beep(392, 'sine', 0.1, 0.2);
    _beep(523, 'sine', 0.1, 0.2, 0.1);
    _beep(659, 'sine', 0.15, 0.25, 0.2);
  }
};

// ── CURSOR ──
const cur = document.createElement('div');
cur.id = 'custom-cursor';
cur.innerHTML = '<div class="cur-inner"></div>';
document.body.appendChild(cur);
document.addEventListener('mousemove', e => {
  cur.style.left = e.clientX + 'px';
  cur.style.top  = e.clientY + 'px';
  const g = document.getElementById('glow');
  if (g) { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }
});
document.addEventListener('mousedown', () => cur.classList.add('clicking'));
document.addEventListener('mouseup',   () => cur.classList.remove('clicking'));

// ── PARTICLES ──
function _particle(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${x}px;top:${y}px;background:${color};
      --dx:${(Math.random()-0.5)*120}px;--dy:${(Math.random()-0.5)*120}px;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}

// ── RE:ZERO POPUP ──
function _popup(msg, type) {
  const el = document.createElement('div');
  el.className = 'rz-popup rz-popup-' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3200);
}

// ── INIT ──
async function _init(resetToFull) {
  _unlockAudio();
  try {
    const body = resetToFull
      ? { resetFull: true }
      : { deathCount: _deathCount };
    const r = await fetch(cfg.r + 'init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    _s = d.token; _st = 1; _score = 0;
    _lives = d.lives; _maxLives = d.lives;
    _usedHints = {};
    if (resetToFull) _deathCount = 0;
    _render();
  } catch(e) {
    document.getElementById('root').innerHTML =
      '<div style="font:12px IBM Plex Mono,monospace;color:#f87171;padding:60px;text-align:center">connection failed.</div>';
  }
}

function _hdr() { return { 'Content-Type': 'application/json', 'x-session': _s || '' }; }

function _updateLives() {
  const el = document.getElementById('lives-row');
  if (!el) return;
  el.innerHTML = Array.from({length: _maxLives}, (_,i) =>
    `<span class="life${i >= _lives ? ' dead' : ''}">♥</span>`
  ).join('');
}

function _updateScore(newScore) {
  _score = newScore;
  const el = document.getElementById('score-val');
  if (el) el.textContent = _score + ' pts';
  const fill = document.getElementById('score-fill');
  if (fill) fill.style.width = Math.min(100, (_score / MAX_SCORE) * 100) + '%';
}

// ── SUBMIT HANDLERS ──
async function _submit(n) {
  const el = document.getElementById('ans');
  if (!el || !el.value.trim()) return;
  const btn = document.getElementById('sub-btn');
  if (btn) btn.disabled = true;
  SFX.click();
  try {
    const r = await fetch(cfg.r + 'check/' + n, { method: 'POST', headers: _hdr(), body: JSON.stringify({ answer: el.value.trim() }) });
    const d = await r.json();
    if (d.correct) {
      SFX.correct();
      _st = n + 1; _updateScore(d.score);
      _popup('✓ correct', 'ok');
      _particle(window.innerWidth/2, window.innerHeight/2, '#6ee7a0');
      _msg(d.message || 'correct.', 'ok');
      setTimeout(() => { SFX.stageUp(); _render(); }, 1200);
    } else {
      SFX.wrong();
      if (d.lives !== undefined) _lives = d.lives;
      _updateLives();
      SFX.loseLife();
      _msg('wrong.', 'err');
      const card = document.querySelector('.card');
      if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 400); }
      if (_lives === 0) { setTimeout(() => _gameOver(), 900); }
      else if (btn) btn.disabled = false;
    }
  } catch(e) { _msg('error.', 'err'); if (btn) btn.disabled = false; }
}

async function _apiPost(url, body) {
  SFX.click();
  const r = await fetch(url, { method: 'POST', headers: _hdr(), body: JSON.stringify(body) });
  const d = await r.json();
  if (d.correct) {
    SFX.correct();
    _st++; _updateScore(d.score);
    _popup('✓ correct', 'ok');
    _particle(window.innerWidth/2, window.innerHeight/2, '#6ee7a0');
    _msg(d.message || 'correct.', 'ok');
    setTimeout(() => { SFX.stageUp(); _render(); }, 1200);
  } else {
    SFX.wrong();
    _msg(d.error || 'wrong.', 'err');
    if (d.lives !== undefined) { _lives = d.lives; _updateLives(); SFX.loseLife(); }
    if (_lives === 0) setTimeout(() => _gameOver(), 900);
    else { const btn = document.getElementById('sub-btn'); if (btn) btn.disabled = false; }
  }
}

async function _c5getToken() {
  SFX.click();
  const btn = document.getElementById('c5-get'); if (btn) btn.disabled = true;
  await fetch(cfg.r + 'c5/token', { method: 'POST', headers: _hdr() });
  _msg('token issued. check your cookies.', 'ok');
  if (btn) btn.disabled = false;
}
async function _c5claim()   { await _apiPost(cfg.r + 'c5/verify', {}); }
async function _c6submit()  { const code = (document.getElementById('z6code')||{}).value||''; await _apiPost(cfg.r + 'c6/verify', { code }); }
async function _c7submit()  { const u=(document.getElementById('z7u')||{}).value||'', p=(document.getElementById('z7p')||{}).value||''; await _apiPost(cfg.r + 'c7/login', { username:u, password:p }); }
async function _c8try(id)   {
  SFX.click();
  const r = await fetch(cfg.r + 'c8/resource/' + id, { headers: _hdr() });
  const d = await r.json();
  const out = document.getElementById('c8out');
  if (out) out.textContent = JSON.stringify(d, null, 2);
  if (d.correct) { SFX.correct(); _st = 9; _updateScore(d.score); _popup('✓ found it', 'ok'); _msg(d.message, 'ok'); setTimeout(() => { SFX.stageUp(); _render(); }, 1400); }
}
async function _c9visit()   {
  SFX.click();
  const r = await fetch(cfg.r + 'c9/profile', { headers: _hdr() });
  const d = await r.json();
  const out = document.getElementById('c9out');
  if (out) out.textContent = JSON.stringify(d, null, 2);
  if (d.correct) { SFX.correct(); _st = 10; _updateScore(d.score); _popup('✓ access granted', 'ok'); _msg(d.message, 'ok'); setTimeout(() => { SFX.stageUp(); _render(); }, 1400); }
}
async function _c10submit() {
  SFX.click();
  const proof = (document.getElementById('c10proof')||{}).value||'';
  const r = await fetch(cfg.r + 'c10/gate', { method:'POST', headers: _hdr(), body: JSON.stringify({ proof }) });
  const d = await r.json();
  if (d.correct) { SFX.victory(); _st = 11; _updateScore(d.score); if (d.flag) setTimeout(() => _win(d.flag, d.score, d.maxScore), 600); }
  else { SFX.wrong(); _msg('wrong.', 'err'); if (d.lives !== undefined) { _lives = d.lives; _updateLives(); SFX.loseLife(); } if (_lives === 0) setTimeout(() => _gameOver(), 900); }
}

function _msg(t, type) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.innerHTML = `<div class="m-${type==='ok'?'ok':'err'}">${t}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

function _copy(text, btnId) {
  SFX.click();
  navigator.clipboard.writeText(text).then(() => {
    const b = document.getElementById(btnId);
    if (b) { const o = b.textContent; b.textContent = 'copied!'; setTimeout(() => b.textContent = o, 1500); }
  });
}

async function _getHint(stage, idx) {
  const key = stage + '-' + idx;
  if (_usedHints[key]) return;
  SFX.hint();
  const r = await fetch(cfg.r + 'hint/' + stage + '/' + idx, { headers: _hdr() });
  const d = await r.json();
  _usedHints[key] = d.text;
  _updateScore(d.score);
  _popup('hint unlocked (-' + d.cost + ' pts)', 'warn');
  const el = document.getElementById('hint-' + key);
  if (el) { el.classList.add('used'); el.innerHTML = `<span class="hint-revealed">— ${d.text}</span>`; }
}

function _hintsHTML(stage, hints) {
  return `<button class="hint-toggle" onclick="document.getElementById('hp-${stage}').classList.toggle('open');SFX.click()">hints</button>
  <div class="hint-panel" id="hp-${stage}">
    ${hints.map((h,i) => `<div class="hint-item" id="hint-${stage}-${i}" onclick="_getHint(${stage},${i})">
      <span>unlock hint ${i+1}</span><span class="hint-cost">-${h.cost} pts</span>
    </div>`).join('')}
  </div>`;
}

function _clue(id, content) {
  return `<div class="clue">
    <span class="clue-lbl">clue</span>
    <button class="copy-btn" id="${id}cp" onclick="_copy(document.getElementById('${id}').innerText,'${id}cp')">copy</button>
    <div id="${id}">${content}</div>
  </div>`;
}

function _scoreBar() {
  return `<div class="score-row">
    <div><div class="score-label">score</div><div class="score-val" id="score-val">${_score} pts</div></div>
    <div style="flex:1;margin-left:20px"><div class="score-track"><div class="score-fill" id="score-fill" style="width:${(_score/MAX_SCORE)*100}%"></div></div></div>
  </div>`;
}

function _livesHTML() {
  return `<div class="lives-row" id="lives-row">
    ${Array.from({length:_maxLives},(_,i)=>`<span class="life${i>=_lives?' dead':''}">♥</span>`).join('')}
  </div>`;
}

const META = {
  1:  { title: 'three parts, one word',  desc: '', diff: 'easy',   pts: 50  },
  2:  { title: 'noisy bits',             desc: '', diff: 'easy',   pts: 75  },
  3:  { title: 'dead script',            desc: '', diff: 'medium', pts: 100 },
  4:  { title: 'maintenance page',       desc: '', diff: 'medium', pts: 125 },
  5:  { title: 'access denied',          desc: '', diff: 'medium', pts: 150 },
  6:  { title: 'second factor',          desc: '', diff: 'hard',   pts: 150 },
  7:  { title: 'login',                  desc: '', diff: 'hard',   pts: 175 },
  8:  { title: 'your files',             desc: '', diff: 'hard',   pts: 175 },
  9:  { title: 'access level',           desc: '', diff: 'hard',   pts: 200 },
  10: { title: 'the gate',               desc: '', diff: 'expert', pts: 250 },
};

const HINTS = {
  1: [{cost:10,text:'the output of each operation feeds into the next.'},{cost:15,text:'one of these operations is reversible by reading backwards.'}],
  2: [{cost:15,text:'raw binary is not always what it seems. something was applied to each byte.'},{cost:20,text:'XOR is self-inverse. if you know the key, you can undo it.'}],
  3: [{cost:20,text:'two layers. the outer one is just encoding, not encryption.'},{cost:25,text:'ROT13 applied after decoding the outer layer.'}],
  4: [{cost:20,text:'not everything visible on screen is the whole story.'},{cost:25,text:'the page source holds more than meets the eye. dots and dashes.'}],
  5: [{cost:25,text:'the token structure is standard. the weakness is not.'},{cost:30,text:'some implementations trust the algorithm field in the header itself.'}],
  6: [{cost:25,text:'the endpoint accepts more fields than it admits.'},{cost:30,text:'developers leave traces. look for something that should not be in production.'}],
  7: [{cost:30,text:'the query is concatenated, not parameterized.'},{cost:35,text:'classic injection terminates the condition early.'}],
  8: [{cost:30,text:'the server trusts what the client sends a bit too much.'},{cost:35,text:'what happens if you request a resource that belongs to someone else?'}],
  9: [{cost:35,text:'authorization state is stored somewhere the client can touch.'},{cost:40,text:'a base64-encoded value in a cookie is not the same as encryption.'}],
  10:[{cost:50,text:'the endpoint is not documented. you have to find it.'},{cost:60,text:'the script reveals the path. the path expects a specific value.'}],
};

function _zoneBody(n) {
  if (n===1) return `${_clue('c1',`<span class="hl">part_a</span> = <span class="hl2">"5453"</span>\n<span class="hl">part_b</span> = <span class="hl2">"4F48"</span>\n<span class="hl">part_c</span> = <span class="hl2">"47"</span>\n\n<span class="dim">// combine → undo → decode → UPPERCASE</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" maxlength="12" placeholder="_ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(1,HINTS[1])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(1)">submit</button></div>`;

  if (n===2) return `${_clue('c2',`<span class="dim">ROW 1:</span>  <span class="hl">01001001</span>\n<span class="dim">ROW 2:</span>  <span class="hl">01000011</span>\n<span class="dim">ROW 3:</span>  <span class="hl">01011010</span>\n<span class="dim">ROW 4:</span>  <span class="hl">01000010</span>\n<span class="dim">ROW 5:</span>  <span class="hl">01001111</span>\n<span class="dim">ROW 6:</span>  <span class="hl">01011000</span>\n\n<span class="dim">key</span> = <span class="hl2">0x0A</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" maxlength="12" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(2,HINTS[2])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(2)">submit</button></div>`;

  if (n===3) return `${_clue('c3',`GET <span class="hl">/api/c3clue</span>\n\n<span class="dim">// paste in console. read output. keep going.</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" maxlength="12" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(3,HINTS[3])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(3)">submit</button></div>`;

  if (n===4) return `${_clue('c4',`GET <span class="hl">/api/c4page</span>\n\n<span class="dim">// open it. look past what the browser shows you.</span>`)}
    <div class="irow"><label class="ilbl">answer</label><input class="inp" id="ans" type="text" maxlength="12" placeholder="_ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(4,HINTS[4])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_submit(4)">submit</button></div>`;

  if (n===5) return `${_clue('c5',`POST <span class="hl">/api/c5/token</span>   <span class="dim">→ receive token</span>\nPOST <span class="hl">/api/c5/verify</span>  <span class="dim">→ prove your role</span>\n\n<span class="dim">// your current role won't get you in.</span>`)}
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn btn-o" id="c5-get" onclick="_c5getToken()">get token</button>
      <button class="btn btn-b" onclick="_c5claim()">verify</button>
    </div>
    ${_hintsHTML(5,HINTS[5])}<div id="msg"></div>`;

  if (n===6) return `${_clue('c6',`POST <span class="hl">/api/c6/verify</span>\n\n<span class="dim">{ "code": "..." }</span>\n\n<span class="dim">// expected: 6 digits. accepts: more than that.</span>`)}
    <div class="irow"><label class="ilbl">code</label><input class="inp" id="z6code" type="text" maxlength="10" placeholder="_ _ _ _ _ _" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(6,HINTS[6])}<div class="btn-row"><button class="btn btn-g" id="sub-btn" onclick="_c6submit()">verify</button></div>`;

  if (n===7) return `${_clue('c7',`POST <span class="hl">/api/c7/login</span>\n\n<span class="dim">{ "username": "...", "password": "..." }</span>\n\n<span class="dim">// standard form. non-standard trust.</span>`)}
    <div class="irow"><label class="ilbl">username</label><input class="inp" id="z7u" type="text" maxlength="80" placeholder="username" autocomplete="off" spellcheck="false"/></div>
    <div class="irow"><label class="ilbl">password</label><input class="inp" id="z7p" type="text" maxlength="80" placeholder="password" autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(7,HINTS[7])}<div class="btn-row"><button class="btn btn-r" id="sub-btn" onclick="_c7submit()">login</button></div>`;

  if (n===8) return `${_clue('c8',`GET <span class="hl">/api/c8/resource/:id</span>\n\n<span class="dim">// your resources are yours. or are they?</span>`)}
    <div class="btn-row" style="margin-bottom:12px">
      ${[1,2,3].map(i=>`<button class="btn btn-o" onclick="_c8try(${i})">/resource/${i}</button>`).join('')}
    </div>
    <div class="clue" id="c8out" style="min-height:40px;color:var(--mu);font-size:11px"></div>
    ${_hintsHTML(8,HINTS[8])}<div id="msg"></div>`;

  if (n===9) return `${_clue('c9',`GET <span class="hl">/api/c9/profile</span>\n\n<span class="dim">// the server sets something. you can change it.</span>`)}
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn btn-o" onclick="_c9visit()">visit profile</button>
    </div>
    <div class="clue" id="c9out" style="min-height:40px;color:var(--mu);font-size:11px"></div>
    ${_hintsHTML(9,HINTS[9])}<div id="msg"></div>`;

  if (n===10) return `${_clue('c10',`GET <span class="hl">/api/c10clue</span>\n\n<span class="dim">// hidden endpoint. specific proof required.</span>\n<span class="dim">// find the script. compute the value. knock.</span>`)}
    <div class="irow"><label class="ilbl">proof (hex)</label><input class="inp" id="c10proof" type="text" maxlength="70" placeholder="sha256..." autocomplete="off" spellcheck="false"/></div>
    ${_hintsHTML(10,HINTS[10])}<div class="btn-row"><button class="btn btn-p" id="sub-btn" onclick="_c10submit()">submit proof</button></div>`;

  return '';
}

function _diffClass(d) { return {easy:'d-easy',medium:'d-med',hard:'d-hard',expert:'d-xtra'}[d]||'d-easy'; }

function _render() {
  if (_st > 10) return;
  const m = META[_st];
  document.getElementById('root').innerHTML = `
<div id="glow"></div>
<div class="app">
  <header class="hdr">
    <div class="hdr-tag">capture the flag</div>
    <div class="hdr-title">Hard,<span> no?</span></div>
    <div class="hdr-meta">
      <span>challenge <b>${_st}</b>/10</span>
      <span>built by <b>0x69erツ</b></span>
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
    ${_zoneBody(_st)}
    <div id="msg"></div>
  </div>
</div>`;

  document.addEventListener('mousemove', e => {
    const g = document.getElementById('glow');
    if (g) { g.style.left = e.clientX+'px'; g.style.top = e.clientY+'px'; }
  });
  document.addEventListener('keydown', function _kh(e) {
    if (e.key==='Enter') {
      if (_st<=4) _submit(_st);
      else if (_st===6) _c6submit();
      else if (_st===7) _c7submit();
      else if (_st===10) _c10submit();
      document.removeEventListener('keydown', _kh);
    }
  });
}

// ── GAME OVER — Re:Zero theme ──
// death messages cycle: 1st death → msg[0], 2nd → msg[1], etc.
// after 4th death: reset to fresh start with msg[3] redirect
const DEATH_MSGS = [
  {
    sfx: 'death',
    title: 'u have a skill issue btw,',
    sub: "don't play CTFs again bro.",
    subaruo: "Subaru would've solved this by now.",
    btn: 'ok, one more try',
    lives: 5,
    resetFull: false,
  },
  {
    sfx: 'death2',
    title: 'ok, I will give one more try,',
    sub: "don't disappoint me.",
    subaruo: "even dying twice didn't teach u anything huh.",
    btn: "i'll do better",
    lives: 5,
    resetFull: false,
  },
  {
    sfx: 'death3',
    title: "there is no way u have played CTF\never in your life,",
    sub: "anyways there is no point of not letting u try again.",
    subaruo: "Return by Death must be exhausting for Subaru too.",
    btn: "yeah ok",
    lives: 5,
    resetFull: false,
  },
  {
    sfx: 'death3',
    title: "broo, u know what I am tired of this.",
    sub: "go back again to the starting point.",
    subaruo: "back to the checkpoint. again. for real this time.",
    btn: "...fine",
    lives: 5,
    resetFull: true,
  },
];

// extra cycling messages for beyond 4th death
const EXTRA_DEATH = [
  { title: "How did u come back again??", sub: "did u return by death or something?", subaruo: "This is getting ridiculous.", sfx: 'death' },
  { title: "Did u Return by Death?", sub: "because that's the only explanation.", subaruo: "Subaru's power suits u apparently.", sfx: 'death2' },
  { title: "u have only one life.", sub: "just kidding. but seriously. get it together.", subaruo: "one more loop. one more chance.", sfx: 'death3' },
  { title: "ok fine. try again.", sub: "I've run out of things to say.", subaruo: "Beatrice is judging you from the library.", sfx: 'death' },
];

function _gameOver() {
  _deathCount++;
  const idx = Math.min(_deathCount - 1, DEATH_MSGS.length - 1);
  let m;
  if (_deathCount > DEATH_MSGS.length) {
    m = EXTRA_DEATH[(_deathCount - DEATH_MSGS.length - 1) % EXTRA_DEATH.length];
    m.lives = 5; m.resetFull = false;
  } else {
    m = DEATH_MSGS[idx];
  }

  SFX[m.sfx]();
  setTimeout(() => SFX.returnByDeath(), 600);

  document.getElementById('root').innerHTML = `
<div id="glow"></div>
<div class="rz-overlay"></div>
<div class="app">
  <div class="gameover">
    <div class="rz-badge">— Return by Death —</div>
    <div class="go-title">${m.title}</div>
    <div class="go-sub">${m.sub}</div>
    <div class="go-subaruo">"${m.subaruo}"</div>
    <button class="btn btn-r go-btn" onclick="window._goNext()">${m.btn}</button>
  </div>
</div>`;

  window._goNext = () => {
    SFX.click();
    if (m.resetFull) { _deathCount = 0; _init(true); }
    else _init(false);
  };

  document.addEventListener('mousemove', e => {
    const g = document.getElementById('glow');
    if (g) { g.style.left = e.clientX+'px'; g.style.top = e.clientY+'px'; }
  });
}

// ── WIN ──
function _win(flag, score, maxScore) {
  SFX.victory();
  const pct = Math.round((score / maxScore) * 100);
  let taunt, tclass;
  if (pct === 100) { taunt = "perfect score. no hints used. genuinely impressive."; tclass = 'taunt-gold'; }
  else if (pct >= 75) { taunt = `${pct}% score. solid. u clearly know what you're doing.`; tclass = 'taunt-ok'; }
  else if (pct >= 50) { taunt = `${pct}% score. not bad. the hints carried u a little tho.`; tclass = ''; }
  else { taunt = `${pct}% score. bro used every hint and still barely made it 😭`; tclass = 'taunt-bad'; }

  document.getElementById('root').innerHTML = `
<div id="glow"></div>
<div class="app">
  <div class="win">
    <div class="win-rzbadge">— u actually made it —</div>
    <div class="win-title">GG.</div>
    <div class="win-sub">all 10 challenges cleared</div>
    <div class="flag-box">
      <div class="flag-lbl">your flag</div>
      <div class="flag-val" id="fv">${flag}</div>
      <button class="btn btn-g" id="fcp" onclick="_copy(document.getElementById('fv').innerText,'fcp')">copy flag</button>
    </div>
    <div class="win-score">${score} <span style="font-size:1rem;color:var(--mu)">/ ${maxScore}</span></div>
    <div class="win-score-lbl">final score</div>
    <div class="win-taunt ${tclass}">${taunt}</div>
    <div style="margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--mu)">died ${_deathCount} time${_deathCount!==1?'s':''} to get here.</div>
    <div style="margin-top:28px"><button class="btn btn-o" onclick="_init(true)">play again</button></div>
    <div class="win-credit">built by 0x69erツ</div>
  </div>
</div>`;

  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      _particle(Math.random()*window.innerWidth, Math.random()*window.innerHeight*0.6, '#6ee7a0');
      _particle(Math.random()*window.innerWidth, Math.random()*window.innerHeight*0.6, '#fbbf24');
    }, i * 300);
  }

  document.addEventListener('mousemove', e => {
    const g = document.getElementById('glow');
    if (g) { g.style.left = e.clientX+'px'; g.style.top = e.clientY+'px'; }
  });
}

// expose
window._submit      = _submit;
window._c5getToken  = _c5getToken;
window._c5claim     = _c5claim;
window._c6submit    = _c6submit;
window._c7submit    = _c7submit;
window._c8try       = _c8try;
window._c9visit     = _c9visit;
window._c10submit   = _c10submit;
window._copy        = _copy;
window._getHint     = _getHint;
window._init        = _init;
window.SFX          = SFX;

_init();
})();
