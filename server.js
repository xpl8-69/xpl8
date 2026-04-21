// CTF SERVER — built by 0x69erツ
const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 10*60*1000, max: 100, message: { error: 'Too many requests.' } });
app.use('/api/', limiter);

// ── SESSIONS ──
const sessions = new Map();
function makeSession() {
  const token = uuidv4();
  sessions.set(token, { stage: 1, solved: [], attempts: 0 });
  setTimeout(() => sessions.delete(token), 3 * 60 * 60 * 1000);
  return token;
}
function getSession(req) {
  return sessions.get(req.headers['x-session'] || '') || null;
}

// ── ANSWERS & FLAG ──
const ANSWERS = { 1:'VAULT', 2:'SHIELD', 3:'STORM', 4:'DECODE' };
const FLAG        = 'FLAG{5k1ll_1ssu3_but_y0u_m4d3_1t}';
const JWT_SECRET  = 'secret123';
const TOTP_CODE   = '133337';

// ── JWT helpers (no external dep) ──
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function parseB64(s) {
  return JSON.parse(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
}
function signHS256(header, payload) {
  const data = b64url(header)+'.'+b64url(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return data+'.'+sig;
}
function verifyJWT(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header  = parseB64(parts[0]);
    const payload = parseB64(parts[1]);
    if (header.alg === 'none') return payload;
    const expected = signHS256(header, payload).split('.')[2];
    if (parts[2] === expected) return payload;
    return null;
  } catch(e) { return null; }
}

// ── SVG IMAGE GENERATORS (no canvas needed) ──
function svgWrap(W, H, borderColor, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#0a0e1a;font-family:monospace">
  <rect x="8" y="8" width="${W-16}" height="${H-16}" fill="none" stroke="${borderColor||'#00C8FF'}" stroke-width="2"/>
  ${content}
</svg>`;
}

function genStage1SVG() {
  const hexes = ['#56','#41','#55','#4C','#54'];
  const colors = ['#8B0000','#006400','#008000','#004080','#004040'];
  let rects = '';
  hexes.forEach((h,i) => {
    const x = 20 + i*104;
    rects += `<rect x="${x}" y="60" width="96" height="80" fill="${colors[i]}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    <text x="${x+22}" y="165" fill="#F5C518" font-size="16" font-weight="bold">${h}</text>
    <text x="${x+14}" y="182" fill="#00C8FF" font-size="11" opacity="0.7">hex→dec</text>
    <text x="${x+20}" y="196" fill="#00C8FF" font-size="11" opacity="0.7">→ascii</text>`;
  });
  return svgWrap(600, 280, '#00C8FF',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ SKIN VAULT — COLOR LOCK ]</text>
    ${rects}
    <text x="18" y="252" fill="#B4D2FF" font-size="12" opacity="0.6">parseInt("HEX", 16)  →  decimal  →  String.fromCharCode(n)</text>
    <text x="18" y="268" fill="#B4D2FF" font-size="12" opacity="0.6">Combine all 5 characters → UPPERCASE</text>`
  );
}

function genStage2SVG() {
  const rows = ['01010011','01001000','01001001','01000101','01001100','01000100'];
  let lines = '';
  rows.forEach((bits,i) => {
    const y = 68 + i*36;
    lines += `<text x="18" y="${y}" fill="#00C8FF" font-size="11" opacity="0.6">ROW ${i+1}:</text>`;
    bits.split('').forEach((bit,j) => {
      lines += `<text x="${90+j*26}" y="${y}" fill="${bit==='1'?'#F5C518':'rgba(0,200,255,0.25)'}" font-size="18" font-weight="bold">${bit}</text>`;
    });
    lines += `<text x="310" y="${y}" fill="#C84BFF" font-size="14">→  ?</text>`;
  });
  return svgWrap(600, 320, '#00C8FF',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ MAP SEED — BINARY GRID ]</text>
    ${lines}
    <text x="18" y="306" fill="#B4D2FF" font-size="12" opacity="0.6">binary → decimal → ASCII char  |  combine 6 chars → UPPERCASE</text>`
  );
}

function genStage3SVG() {
  return svgWrap(600, 260, '#C84BFF',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ FINAL BOSS — CHEST INSCRIPTION ]</text>
    <text x="140" y="118" fill="#F5C518" font-size="56" font-weight="bold">TYVAZ</text>
    <text x="18" y="152" fill="#B4D2FF" font-size="12" opacity="0.7">STEP 1 — The word was  reversed  before being carved</text>
    <text x="18" y="174" fill="#B4D2FF" font-size="12" opacity="0.7">STEP 2 — Then  Caesar +7  was applied on top</text>
    <text x="18" y="196" fill="#00C8FF" font-size="12" opacity="0.8">To decode: undo Caesar first (shift -7), then reverse</text>
    <text x="18" y="222" fill="#C84BFF" font-size="10" opacity="0.6">"TYVAZ".replace(/[A-Z]/g, c =&gt; String.fromCharCode((c.charCodeAt(0)-65-7+26)%26+65))</text>
    <text x="18" y="238" fill="#C84BFF" font-size="10" opacity="0.6">Then reverse the result → UPPERCASE</text>`
  );
}

function genStage4SVG() {
  return svgWrap(600, 310, '#00FF85',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ DEOBFUSCATE THE SCRIPT ]</text>
    <text x="18" y="62"  fill="#00FF85" font-size="11">var _$=['\\x44\\x45', '\\x43\\x4F', '\\x44\\x45'];</text>
    <text x="18" y="80"  fill="#00FF85" font-size="11">(function(a,b){</text>
    <text x="18" y="98"  fill="#00FF85" font-size="11">  var c=function(d){while(--d){a.push(a.shift());}};c(++b);</text>
    <text x="18" y="116" fill="#00FF85" font-size="11">})(_$, 0x2);</text>
    <text x="18" y="134" fill="#00FF85" font-size="11">var _get=function(i){return _$[i];};</text>
    <text x="18" y="162" fill="#F5C518" font-size="11">// Part 1: _get(0)  →  ??</text>
    <text x="18" y="180" fill="#F5C518" font-size="11">// Part 2: _get(1)  →  ??</text>
    <text x="18" y="198" fill="#F5C518" font-size="11">// Part 3: _get(2)  →  ??</text>
    <text x="18" y="226" fill="#00C8FF" font-size="11">// Hint: \\x44=D  \\x45=E  \\x43=C  \\x4F=O</text>
    <text x="18" y="244" fill="#00C8FF" font-size="11">// Combine Part1+Part2+Part3 → UPPERCASE word</text>`
  );
}

function genStage5SVG() {
  return svgWrap(600, 300, '#F5C518',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ JWT AUTH CHALLENGE ]</text>
    <text x="18" y="68"  fill="#B4D2FF" font-size="12">You received a JWT cookie: ctf_jwt</text>
    <text x="18" y="88"  fill="#B4D2FF" font-size="12">Open Cookie Editor → copy the token value</text>
    <text x="18" y="108" fill="#B4D2FF" font-size="12">Go to jwt.io → paste the token → read the payload</text>
    <text x="18" y="140" fill="#F5C518" font-size="12">Payload looks like:</text>
    <text x="18" y="160" fill="#00FF85" font-size="12">  { "role": "guest", "user": "player" }</text>
    <text x="18" y="192" fill="#B4D2FF" font-size="12">The server only gives the flag to role: "admin"</text>
    <text x="18" y="212" fill="#B4D2FF" font-size="12">The JWT uses a weak algorithm — use the known weakness.</text>
    <text x="18" y="244" fill="#00C8FF" font-size="12">Change role to admin → send the new token → claim flag</text>`
  );
}

function genStage6SVG() {
  return svgWrap(600, 280, '#C84BFF',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ 2FA BYPASS CHALLENGE ]</text>
    <text x="18" y="68"  fill="#B4D2FF" font-size="12">A login endpoint is protected by 2FA.</text>
    <text x="18" y="88"  fill="#B4D2FF" font-size="12">Endpoint: POST /api/zone6/verify</text>
    <text x="18" y="120" fill="#F5C518" font-size="12">Normal request body:</text>
    <text x="18" y="140" fill="#00FF85" font-size="12">  { "code": "123456" }</text>
    <text x="18" y="172" fill="#B4D2FF" font-size="12">The developer added a debug parameter</text>
    <text x="18" y="192" fill="#B4D2FF" font-size="12">that was never removed from production.</text>
    <text x="18" y="224" fill="#00C8FF" font-size="12">Find the hidden parameter that bypasses 2FA.</text>
    <text x="18" y="244" fill="#00C8FF" font-size="12">Hint: think about what devs use during testing...</text>`
  );
}

function genStage7SVG() {
  return svgWrap(600, 290, '#FF4455',
    `<text x="18" y="36" fill="#F5C518" font-size="13" font-weight="bold">[ AUTHENTICATION BYPASS ]</text>
    <text x="18" y="68"  fill="#B4D2FF" font-size="12">Endpoint: POST /api/zone7/login</text>
    <text x="18" y="88"  fill="#B4D2FF" font-size="12">Body: { "username": "...", "password": "..." }</text>
    <text x="18" y="120" fill="#F5C518" font-size="12">The backend builds its query like this:</text>
    <text x="18" y="140" fill="#00FF85" font-size="11">  "SELECT * FROM users WHERE username='" + input + "'"</text>
    <text x="18" y="172" fill="#B4D2FF" font-size="12">The developer forgot to sanitize input.</text>
    <text x="18" y="192" fill="#B4D2FF" font-size="12">Use a classic injection to bypass authentication.</text>
    <text x="18" y="224" fill="#00C8FF" font-size="12">Classic payload example: admin'--</text>`
  );
}

// ── API ──
app.post('/api/init', (req,res) => {
  res.json({ token: makeSession(), stage: 1 });
});

app.get('/api/state', (req,res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'No session.' });
  res.json({ stage: sess.stage, solved: sess.solved });
});

app.get('/api/clue/:stage', (req,res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'No session.' });
  const n = parseInt(req.params.stage);
  if (n < 1 || n > 7 || n > sess.stage) return res.status(403).end();
  const fns = { 1:genStage1SVG, 2:genStage2SVG, 3:genStage3SVG, 4:genStage4SVG, 5:genStage5SVG, 6:genStage6SVG, 7:genStage7SVG };
  res.set('Content-Type','image/svg+xml');
  res.set('Cache-Control','no-store');
  res.send(fns[n]());
});

app.get('/api/hint/:stage', (req,res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'No session.' });
  const n = parseInt(req.params.stage);
  const hints = {
    1: `parseInt("56",16)=86 → String.fromCharCode(86)="V"<br>Do all 5 hex values → combine → UPPERCASE`,
    2: `parseInt("01010011",2)=83 → "S"<br>Do all 6 rows → combine → UPPERCASE`,
    3: `<code>"TYVAZ".replace(/[A-Z]/g,c=>String.fromCharCode((c.charCodeAt(0)-65-7+26)%26+65))</code><br>Then reverse the result`,
    4: `The array after shuffle is <code>["DE","CO","DE"]</code><br>\\x44=D \\x45=E \\x43=C \\x4F=O → combine → UPPERCASE`,
    5: `Go to <a href="https://jwt.io" target="_blank">jwt.io</a> — paste your token.<br>Change role to <code>admin</code>, set alg to <code>none</code>, remove signature.<br>Format: <code>header.payload.</code> (empty signature, keep the dot)`,
    6: `Try adding <code>"skip2fa": ""</code> to the request body.<br>Use browser console:<br><code>fetch('/api/zone6/verify',{method:'POST',headers:{'Content-Type':'application/json','x-session':TOKEN},body:JSON.stringify({skip2fa:""})})</code>`,
    7: `The username field is injectable.<br>Try: <code>admin'--</code> as username, anything as password.`,
  };
  res.json({ html: hints[n] || '' });
});

app.post('/api/check/:stage', (req,res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'No session.' });
  const n = parseInt(req.params.stage);
  if (sess.stage !== n) return res.status(400).json({ error: 'Wrong stage.' });
  sess.attempts++;
  const answer = (req.body.answer||'').trim().toUpperCase();
  if (answer === ANSWERS[n]) {
    sess.solved.push(n); sess.stage = n+1;
    const msgs = { 1:'⛏ VAULT CRACKED! Zone 2 unlocked...', 2:'🛡 SHIELD FOUND! Zone 3 loading...', 3:'⚡ STORM UNLEASHED! Zone 4 loading...', 4:'🟢 SCRIPT DECODED! Zone 5 loading...' };
    return res.json({ correct: true, message: msgs[n] });
  }
  res.json({ correct: false, message: '✘ Wrong. Try again.' });
});

// Zone 5 — JWT
app.post('/api/zone5/login', (req,res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 5) return res.status(403).json({ error: 'Complete previous zones first.' });
  const token = signHS256({ alg:'HS256', typ:'JWT' }, { role:'guest', user:'player', iat: Math.floor(Date.now()/1000) });
  res.cookie('ctf_jwt', token, { httpOnly: false, path: '/' });
  res.json({ message: 'Logged in as guest. Admins only get the flag.', token });
});

app.post('/api/zone5/flag', (req,res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 5) return res.status(403).json({ error: 'Complete previous zones first.' });
  const token = req.cookies.ctf_jwt || req.body.token || (req.headers['authorization']||'').replace('Bearer ','');
  const decoded = verifyJWT(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token.' });
  if (decoded.role === 'admin') {
    sess.solved.push(5); sess.stage = 6;
    return res.json({ correct: true, message: '🔑 JWT CRACKED! Zone 6 loading...' });
  }
  return res.status(403).json({ error: 'Guests not allowed. You need role: admin' });
});

// Zone 6 — 2FA
app.post('/api/zone6/verify', (req,res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 6) return res.status(403).json({ error: 'Complete previous zones first.' });
  const { code, skip2fa } = req.body;
  if (skip2fa !== undefined) {
    sess.solved.push(6); sess.stage = 7;
    return res.json({ correct: true, message: '🛡 2FA BYPASSED! Zone 7 loading...' });
  }
  if (code === TOTP_CODE) {
    sess.solved.push(6); sess.stage = 7;
    return res.json({ correct: true, message: '🛡 2FA PASSED! Zone 7 loading...' });
  }
  res.json({ correct: false, message: '✘ Wrong 2FA code.' });
});

// Zone 7 — Auth Bypass
app.post('/api/zone7/login', (req,res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 7) return res.status(403).json({ error: 'Complete previous zones first.' });
  const { username='', password='' } = req.body;
  const sqli = [/'\s*--/,/'\s*OR\s*'1'\s*=\s*'1/i,/'\s*OR\s*1\s*=\s*1/i,/admin'\s*--/i,/'\s*#/];
  if (sqli.some(p => p.test(username) || p.test(password))) {
    sess.solved.push(7); sess.stage = 8;
    return res.json({ correct: true, flag: FLAG, message: '🏆 ALL ZONES CLEARED!' });
  }
  if (username === 'admin' && password === 'Sup3r$ecretP@ss!') {
    sess.solved.push(7); sess.stage = 8;
    return res.json({ correct: true, flag: FLAG, message: '🏆 ALL ZONES CLEARED!' });
  }
  res.json({ correct: false, message: '✘ Invalid credentials.' });
});

app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => { console.log(`\n⛏  CTF running → http://localhost:${PORT}\n`); });
