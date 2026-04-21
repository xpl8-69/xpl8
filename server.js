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

const limiter = rateLimit({ windowMs: 10*60*1000, max: 200, message: { error: 'slow down.' } });
app.use('/api/', limiter);

// ── SESSIONS ──
const sessions = new Map();
function makeSession(lives) {
  const token = uuidv4();
  sessions.set(token, {
    stage: 1,
    solved: [],
    attempts: 0,
    score: 0,
    hintsUsed: [],
    lives: lives || 3,
    maxLives: lives || 3,
    runCount: 0
  });
  setTimeout(() => sessions.delete(token), 6 * 60 * 60 * 1000);
  return token;
}
function getSession(req) {
  return sessions.get(req.headers['x-session'] || '') || null;
}

// ── FLAG ──
const FLAG = 'FLAG{5k1ll_1ssu3_but_y0u_m4d3_1t}';
const JWT_SECRET = 'hunter2';

// ── JWT helpers ──
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

// ── CHALLENGES ──
// Each challenge: { points, answer, hints: [{cost, text}] }
const CHALLENGES = {
  1: {
    points: 50,
    // hex encoded word split across 3 parts + reversed
    // answer: GHOST
    answer: 'GHOST',
    hints: [
      { cost: 10, text: 'the output of each operation feeds into the next.' },
      { cost: 15, text: 'one of these operations is reversible by reading backwards.' },
    ]
  },
  2: {
    points: 75,
    // binary rows XOR'd with key 0x2A
    // answer: CIPHER
    answer: 'CIPHER',
    hints: [
      { cost: 15, text: 'raw binary is not always what it seems. something was applied to each byte.' },
      { cost: 20, text: 'XOR is self-inverse. if you know the key, you can undo it.' },
    ]
  },
  3: {
    points: 100,
    // deobfuscated JS reveals base64 → rot13 → answer
    // answer: SHADOW
    answer: 'SHADOW',
    hints: [
      { cost: 20, text: 'two layers. the outer one is just encoding, not encryption.' },
      { cost: 25, text: 'ROT13 applied after decoding the outer layer.' },
    ]
  },
  4: {
    points: 125,
    // answer hidden in HTML comment as morse code
    // answer: DELTA
    answer: 'DELTA',
    hints: [
      { cost: 20, text: 'not everything visible on screen is the whole story.' },
      { cost: 25, text: 'the page source holds more than meets the eye. dots and dashes.' },
    ]
  },
  5: {
    points: 150,
    // JWT with weak secret — brute force or none alg
    // answer: correct role unlocks next
    answer: '__JWT__',
    hints: [
      { cost: 25, text: 'the token structure is standard. the weakness is not.' },
      { cost: 30, text: 'some implementations trust the algorithm field in the header itself.' },
    ]
  },
  6: {
    points: 150,
    // 2FA bypass via hidden param
    answer: '__2FA__',
    hints: [
      { cost: 25, text: 'the endpoint accepts more fields than it admits.' },
      { cost: 30, text: 'developers leave traces. look for something that should not be in production.' },
    ]
  },
  7: {
    points: 175,
    // SQL injection
    answer: '__SQLI__',
    hints: [
      { cost: 30, text: 'the query is concatenated, not parameterized.' },
      { cost: 35, text: 'classic injection terminates the condition early.' },
    ]
  },
  8: {
    points: 175,
    // IDOR: access another user's resource by changing an ID
    answer: '__IDOR__',
    hints: [
      { cost: 30, text: 'the server trusts what the client sends a bit too much.' },
      { cost: 35, text: 'what happens if you request a resource that belongs to someone else?' },
    ]
  },
  9: {
    points: 200,
    // cookie tampering: role encoded in cookie, not JWT
    answer: '__COOKIE__',
    hints: [
      { cost: 35, text: 'authorization state is stored somewhere the client can touch.' },
      { cost: 40, text: 'a base64-encoded value in a cookie is not the same as encryption.' },
    ]
  },
  10: {
    points: 250,
    // final: deobfuscate JS → get endpoint → send correct hash → get flag
    answer: '__FINAL__',
    hints: [
      { cost: 50, text: 'the endpoint is not documented. you have to find it.' },
      { cost: 60, text: 'the script reveals the path. the path expects a specific value.' },
    ]
  },
};

const MAX_SCORE = Object.values(CHALLENGES).reduce((a,c) => a + c.points, 0);

// ── HIDDEN COMMENT (challenge 4) ──
// morse for DELTA: -.. . .-.. - .-
const MORSE_COMMENT = `<!-- .−.. . .-.. - .− -->`;

// ── OBFUSCATED JS (challenge 3 clue, served via API) ──
function getChallenge3Clue() {
  // base64("SHADOW") = "U0hBRE9X", then rot13 applied before b64:
  // rot13("SHADOW") = "FUNQBJ" → btoa("FUNQBJ") = "RlVOUUJK"
  // player must: recognize b64 → decode → recognize rot13 → decode
  const obf = `
(function(){
  var _x = ["\x52\x6c\x56\x4f\x55\x55\x4a\x4b", "\x61\x74\x6f\x62", "\x66\x72\x6f\x6d\x43\x68\x61\x72\x43\x6f\x64\x65"];
  var _d = window[_x[1]](_x[0]);
  var _r = _d[_x[2].slice(4)](function(c){
    var n = c.charCodeAt(0);
    if(n >= 65 && n <= 90) return String.fromCharCode(((n - 65 + 13) % 26) + 65);
    if(n >= 97 && n <= 122) return String.fromCharCode(((n - 97 + 13) % 26) + 97);
    return c;
  });
  console.log(_r);
})();`;
  return obf;
}

// ── IDOR resource store ──
const RESOURCES = {
  '1': { owner: 'guest', data: 'nothing interesting here.' },
  '2': { owner: 'admin', data: 'admin_secret_token: Z3JFZW4=' },
  '3': { owner: 'guest', data: 'also nothing.' },
};

// ── FINAL challenge hash ──
// player must POST { token: sha256("0x69er" + their session token slice) }
function finalHash(sessionToken) {
  return crypto.createHash('sha256').update('0x69er' + sessionToken.slice(0,8)).digest('hex');
}

// ── API ──
app.post('/api/init', (req, res) => {
  const { resetFull, deathCount } = req.body || {};
  // Lives decrease each run: 5→4→3→2→1→reset
  const INITIAL_LIVES = 5;
  const dc = (resetFull ? 0 : (deathCount || 0));
  const lives = Math.max(1, INITIAL_LIVES - dc);
  const token = makeSession(lives);
  const sess = sessions.get(token);
  sess.deathCount = dc;
  res.json({ token, stage: 1, lives, maxLives: lives, score: 0 });
});

app.get('/api/state', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'no session.' });
  res.json({ stage: sess.stage, solved: sess.solved, score: sess.score, lives: sess.lives, maxLives: sess.maxLives });
});

app.get('/api/hint/:stage/:idx', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'no session.' });
  const n   = parseInt(req.params.stage);
  const idx = parseInt(req.params.idx);
  const ch  = CHALLENGES[n];
  if (!ch || !ch.hints[idx]) return res.status(404).json({ error: 'no hint.' });
  const key = `${n}-${idx}`;
  if (!sess.hintsUsed.includes(key)) {
    sess.hintsUsed.push(key);
    sess.score = Math.max(0, sess.score - ch.hints[idx].cost);
  }
  res.json({ text: ch.hints[idx].text, cost: ch.hints[idx].cost, score: sess.score });
});

app.post('/api/check/:stage', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'no session.' });
  const n = parseInt(req.params.stage);
  if (sess.stage !== n) return res.status(400).json({ error: 'wrong stage.' });
  sess.attempts++;

  const answer = (req.body.answer || '').trim().toUpperCase();
  const ch = CHALLENGES[n];
  if (!ch) return res.status(400).json({ error: 'invalid stage.' });

  if (n <= 4 && answer === ch.answer) {
    sess.solved.push(n);
    sess.stage = n + 1;
    sess.score += ch.points;
    return res.json({ correct: true, score: sess.score, message: `+${ch.points} pts` });
  }

  // wrong answer costs a life
  sess.lives = Math.max(0, sess.lives - 1);
  res.json({ correct: false, lives: sess.lives, message: 'wrong.' });
});

// Challenge 3 clue endpoint
app.get('/api/c3clue', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 3) return res.status(403).end();
  res.set('Content-Type', 'text/plain');
  res.send(getChallenge3Clue());
});

// Challenge 4 — page with hidden morse comment
app.get('/api/c4page', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 4) return res.status(403).end();
  res.set('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>maintenance</title></head>
<body style="background:#111;color:#555;font-family:monospace;padding:40px">
<p>nothing to see here.</p>
${MORSE_COMMENT}
</body>
</html>`);
});

// Challenge 5 — JWT
app.post('/api/c5/token', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 5) return res.status(403).json({ error: 'not yet.' });
  const token = signHS256({ alg: 'HS256', typ: 'JWT' }, { role: 'viewer', uid: 42, iat: Math.floor(Date.now()/1000) });
  res.cookie('ctf_auth', token, { httpOnly: false, path: '/' });
  res.json({ issued: true });
});

app.post('/api/c5/verify', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 5) return res.status(403).json({ error: 'not yet.' });
  const token = req.cookies.ctf_auth || req.body.token || '';
  const decoded = verifyJWT(token);
  if (!decoded) return res.status(401).json({ error: 'invalid token.' });
  if (decoded.role === 'admin') {
    sess.solved.push(5); sess.stage = 6;
    sess.score += CHALLENGES[5].points;
    return res.json({ correct: true, score: sess.score, message: `+${CHALLENGES[5].points} pts` });
  }
  sess.lives = Math.max(0, sess.lives - 1);
  return res.status(403).json({ error: 'insufficient role.', lives: sess.lives });
});

// Challenge 6 — 2FA bypass
app.post('/api/c6/verify', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 6) return res.status(403).json({ error: 'not yet.' });
  const { code, debug } = req.body;
  if (debug !== undefined) {
    sess.solved.push(6); sess.stage = 7;
    sess.score += CHALLENGES[6].points;
    return res.json({ correct: true, score: sess.score, message: `+${CHALLENGES[6].points} pts` });
  }
  if (code === '291847') {
    sess.solved.push(6); sess.stage = 7;
    sess.score += CHALLENGES[6].points;
    return res.json({ correct: true, score: sess.score, message: `+${CHALLENGES[6].points} pts` });
  }
  sess.lives = Math.max(0, sess.lives - 1);
  res.json({ correct: false, lives: sess.lives });
});

// Challenge 7 — SQLi simulation
app.post('/api/c7/login', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 7) return res.status(403).json({ error: 'not yet.' });
  const { username = '', password = '' } = req.body;
  const sqli = [/'\s*--/,/'\s*OR\s*'1'\s*=\s*'1/i,/'\s*OR\s*1\s*=\s*1/i,/admin'\s*--/i,/'\s*#/,/'\s*\/\*/];
  if (sqli.some(p => p.test(username) || p.test(password))) {
    sess.solved.push(7); sess.stage = 8;
    sess.score += CHALLENGES[7].points;
    return res.json({ correct: true, score: sess.score, message: `+${CHALLENGES[7].points} pts` });
  }
  sess.lives = Math.max(0, sess.lives - 1);
  res.json({ correct: false, lives: sess.lives });
});

// Challenge 8 — IDOR
app.get('/api/c8/resource/:id', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 8) return res.status(403).json({ error: 'not yet.' });
  const r = RESOURCES[req.params.id];
  if (!r) return res.status(404).json({ error: 'not found.' });
  if (req.params.id === '2') {
    sess.solved.push(8); sess.stage = 9;
    sess.score += CHALLENGES[8].points;
    return res.json({ correct: true, data: r.data, score: sess.score, message: `+${CHALLENGES[8].points} pts` });
  }
  res.json({ data: r.data });
});

// Challenge 9 — cookie tampering
app.get('/api/c9/profile', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 9) return res.status(403).json({ error: 'not yet.' });
  const roleCookie = req.cookies.c9_role;
  if (!roleCookie) {
    // issue guest cookie
    res.cookie('c9_role', Buffer.from('guest').toString('base64'), { httpOnly: false, path: '/' });
    return res.json({ role: 'guest', message: 'access level: guest' });
  }
  try {
    const role = Buffer.from(roleCookie, 'base64').toString('utf8');
    if (role === 'superadmin') {
      sess.solved.push(9); sess.stage = 10;
      sess.score += CHALLENGES[9].points;
      return res.json({ correct: true, role, score: sess.score, message: `+${CHALLENGES[9].points} pts` });
    }
    res.json({ role, message: `access level: ${role}` });
  } catch(e) {
    res.json({ error: 'malformed cookie.' });
  }
});

// Challenge 10 — final: hidden endpoint + hash
// The obfuscated clue in the JS reveals endpoint /api/c10/gate
// player must POST { proof: sha256("0x69er" + sessionToken[0:8]) }
app.post('/api/c10/gate', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 10) return res.status(403).json({ error: 'not yet.' });
  const sessionToken = req.headers['x-session'] || '';
  const expected = finalHash(sessionToken);
  const { proof } = req.body;
  if (proof === expected) {
    sess.solved.push(10); sess.stage = 11;
    sess.score += CHALLENGES[10].points;
    return res.json({ correct: true, flag: FLAG, score: sess.score, maxScore: MAX_SCORE });
  }
  sess.lives = Math.max(0, sess.lives - 1);
  res.json({ correct: false, lives: sess.lives });
});

// Challenge 10 clue — obfuscated JS that reveals endpoint + hash logic
app.get('/api/c10clue', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.stage !== 10) return res.status(403).end();
  // obfuscated: reveals /api/c10/gate and the hash formula
  const clue = `
!function(){var _a=["api","c10","gate"].join("/"),_b=["0x69er"].join(""),
_k=document.cookie.split(";").find(function(c){return c.includes("x-session")})||"",
_h=async function(s){var b=new TextEncoder().encode(s),d=await crypto.subtle.digest("SHA-256",b),
r=Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,"0")}).join("");
return r;};
// hint: proof = H( _b + sessionToken.slice(0,8) )
// endpoint: /" + _a
console.log("figure it out.");
}();`;
  res.set('Content-Type', 'text/javascript');
  res.send(clue);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => { console.log(`\n⛏  CTF → http://localhost:${PORT}\n`); });
