(function(){
"use strict";

const cfg = { r: '/api/' };
let _s = null, _st = 1, _score = 0, _lives = 3, _maxLives = 3, _usedHints = {}, _runCount = 0;
const MAX_SCORE = 1450;

document.addEventListener('mousemove', e => {
  const g = document.getElementById('glow');
  if (g) {
    g.style.left = e.clientX + 'px';
    g.style.top = e.clientY + 'px';
    g.style.filter = 'brightness(1.2) contrast(1.3)';
  }
});

async function _init(prevLives) {
  try {
    const body = prevLives ? { prevLives, runCount: _runCount } : { runCount: _runCount };
    const r = await fetch(cfg.r + 'init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    _s = d.token; _st = 1; _score = 0; _lives = d.lives; _maxLives = d.lives; _usedHints = {};
    _render();
  } catch(e) {
    document.getElementById('root').innerHTML = '<div style="font:12px IBM Plex Mono,monospace;color:#f87171;padding:60px;text-align:center">connection failed.</div>';
  }
}

function _hdr() { return { 'Content-Type': 'application/json', 'x-session': _s || '' }; }

function _loseLife() {
  _lives = Math.max(0, _lives - 1);
  _updateLives();
  if (_lives === 0) {
    setTimeout(() => _gameOver(), 800);
    return true;
  }
  const card = document.querySelector('.card');
  if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 400); }
  return false;
}

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

async function _submit(n) {
  const el = document.getElementById('ans');
  if (!el || !el.value.trim()) return;
  const btn = document.getElementById('sub-btn');
  if (btn) btn.disabled = true;
  try {
    const r = await fetch(cfg.r + 'check/' + n, { method: 'POST', headers: _hdr(), body: JSON.stringify({ answer: el.value.trim() }) });
    const d = await r.json();
    if (d.correct) {
      _st = n + 1; _updateScore(d.score);
      _msg(d.message || 'correct.', 'ok');
      setTimeout(() => _render(), 1200);
    } else {
      _msg('wrong.', 'err');
      if (d.lives !== undefined) _lives = d.lives;
      const dead = _lives === 0;
      _updateLives();
      if (dead) setTimeout(() => _gameOver(), 800);
      else if (btn) btn.disabled = false;
    }
  } catch(e) { _msg('error.', 'err'); if (btn) btn.disabled = false; }
}

async function _apiPost(url, body, onOk) {
  const r = await fetch(url, { method: 'POST', headers: _hdr(), body: JSON.stringify(body) });
  const d = await r.json();
  if (d.correct) {
    _st++; _updateScore(d.score);
    _msg(d.message || 'correct.', 'ok');
    setTimeout(() => _render(), 1200);
  } else {
    _msg(d.error || 'wrong.', 'err');
    if (d.lives !== undefined) { _lives = d.lives; _updateLives(); }
    if (_lives === 0) setTimeout(() => _gameOver(), 800);
    else { const btn = document.getElementById('sub-btn'); if (btn) btn.disabled = false; }
  }
}

async function _c5getToken() {
  const btn = document.getElementById('c5-get'); if (btn) btn.disabled = true;
  await fetch(cfg.r + 'c5/token', { method: 'POST', headers: _hdr() });
  _msg('token issued. check your cookies.', 'ok');
  if (btn) btn.disabled = false;
}
async function _c5claim() {
  await _apiPost(cfg.r + 'c5/verify', {}, null);
}
async function _c6submit() {
  const code = (document.getElementById('z6code') || {}).value || '';
  await _apiPost(cfg.r + 'c6/verify', { code }, null);
}
async function _c7submit() {
  const u = (document.getElementById('z7u') || {}).value || '';
  const p = (document.getElementById('z7p') || {}).value || '';
  await _apiPost(cfg.r + 'c7/login', { username: u, password: p }, null);
}
async function _c8try(id) {
  const r = await fetch(cfg.r + 'c8/resource/' + id, { headers: _hdr() });
  const d = await r.json();
  const out = document.getElementById('c8out');
  if (out) out.textContent = JSON.stringify(d, null, 2);
  if (d.correct) { _st = 9; _updateScore(d.score); _msg(d.message, 'ok'); setTimeout(() => _render(), 1400); }
}
async function _c9visit() {
  const r = await fetch(cfg.r + 'c9/profile', { headers: _hdr() });
  const d = await r.json();
  const out = document.getElementById('c9out');
  if (out) out.textContent = JSON.stringify(d, null, 2);
  if (d.correct) { _st = 10; _updateScore(d.score); _msg(d.message, 'ok'); setTimeout(() => _render(), 1400); }
}
async function _c10submit() {
  const proof = (document.getElementById('c10proof') || {}).value || '';
  const r = await fetch(cfg.r + 'c10/gate', { method: 'POST', headers: _hdr(), body: JSON.stringify({ proof }) });
  const d = await r.json();
  if (d.correct) { _st = 11; _updateScore(d.score); if (d.flag) setTimeout(() => _win(d.flag, d.score, d.maxScore), 1000); }
  else { _msg('wrong.', 'err'); if (d.lives !== undefined) { _lives = d.lives; _updateLives(); } if (_lives === 0) setTimeout(() => _gameOver(), 800); }
}

function _msg(t, type) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.innerHTML = `<div class="m-${type === 'ok' ? 'ok' : 'err'}">${t}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

function _copy(text, btnId) {
  navigator.clipboard.writeText(text).then(() => {
    const b = document.getElementById(btnId);
    if (b) { const o = b.textContent; b.textContent = 'copied!'; setTimeout(() => b.textContent = o, 1500); }
  });
}

async function _getHint(stage, idx, cost) {
  const key = stage + '-' + idx;
  if (_usedHints[key]) return;
  const r = await fetch(cfg.r + 'hint/' + stage + '/' + idx, { headers: _hdr() });
  const d = await r.json();
  _usedHints[key] = d.text;
  _updateScore(d.score);
  const el = document.getElementById('hint-' + key);
  if (el) {
    el.classList.add('used');
    el.innerHTML = `<span style="color:var(--mu)">— ${d.text}</span>`;
  }
}

function _hintsHTML(stage, hints) {
  return `<button class="hint-toggle" onclick="document.getElementById('hp-${stage}').classList.toggle('open')">hints</button>
  <div class="hint-panel" id="hp-${stage}">
    ${hints.map((h,i) => `<div class="hint-item" id="hint-${stage}-${i}" onclick="_getHint(${stage},${i},${h.cost})">
      <span>unlock</span><span class="hint-cost">-${h.cost} pts</span>
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
  1:{ title:'three parts, one word',desc:'the data went through multiple transformations.\nread backwards from the output.',diff:'easy',pts:50},
  2:{ title:'noisy bits',desc:'the binary looks clean.\nit is not.',diff:'easy',pts:75},
  3:{ title:'dead script',desc:'the code runs. the output means nothing yet.\ntwo layers. peel them.',diff:'medium',pts:100},
  4:{ title:'maintenance page',desc:'the page says nothing.\nthe source does not agree.',diff:'medium',pts:125},
  5:{ title:'access denied',desc:'you have a token.\nyou are not who you need to be.',diff:'medium',pts:150},
  6:{ title:'second factor',desc:'the endpoint expects a code.\nit also accepts something else.',diff:'hard',pts:150},
  7:{ title:'login',desc:'standard login form.\nnon-standard implementation.',diff:'hard',pts:175},
  8:{ title:'your files',desc:'you can read your own resources.\nmaybe others too.',diff:'hard',pts:175},
  9:{ title:'access level',desc:'your role is stored somewhere you can reach.\nit is encoded, not encrypted.',diff:'hard',pts:200},
  10:{ title:'the gate',desc:'a hidden endpoint. a specific proof.\nfind the script. read it. compute the answer.',diff:'expert',pts:250},
};

const HINTS = {
  1:[{cost:10,text:'...'},{cost:15,text:'...'}],
  2:[{cost:15,text:'...'},{cost:20,text:'...'}],
  3:[{cost:20,text:'...'},{cost:25,text:'...'}],
  4:[{cost:20,text:'...'},{cost:25,text:'...'}],
  5:[{cost:25,text:'...'},{cost:30,text:'...'}],
  6:[{cost:25,text:'...'},{cost:30,text:'...'}],
  7:[{cost:30,text:'...'},{cost:35,text:'...'}],
  8:[{cost:30,text:'...'},{cost:35,text:'...'}],
  9:[{cost:35,text:'...'},{cost:40,text:'...'}],
  10:[{cost:50,text:'...'},{cost:60,text:'...'}],
};

function _zoneBody(n){return ''}

function _diffClass(d){return{easy:'d-easy',medium:'d-med',hard:'d-hard',expert:'d-xtra'}[d]||'d-easy'}

function _render(){if(_st>10)return;const m=META[_st];document.getElementById('root').innerHTML=`
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
<div class="card-desc">${m.desc}</div>
${_zoneBody(_st)}
<div id="msg"></div>
</div>
</div>`;}

function _gameOver(){}
function _win(){}

window._submit=_submit;
window._c5getToken=_c5getToken;
window._c5claim=_c5claim;
window._c6submit=_c6submit;
window._c7submit=_c7submit;
window._c8try=_c8try;
window._c9visit=_c9visit;
window._c10submit=_c10submit;
window._copy=_copy;
window._getHint=_getHint;
window._init=_init;

_init();
})();
