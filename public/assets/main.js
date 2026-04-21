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
