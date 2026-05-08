// CTF SERVER — built by xpl8ツ
const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');
const os           = require('os');
const fs           = require('fs');

// ── CHAT LOG FILE ──
const CHAT_LOG_FILE = path.join(__dirname, 'chat_log.jsonl');
function appendChatLog(entry) {
  try { fs.appendFileSync(CHAT_LOG_FILE, JSON.stringify(entry) + '\n'); } catch(_) {}
}

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ═══════════════════════════════════════════
// ── MOD SYSTEM ──
// ═══════════════════════════════════════════
const MOD_SECRET = 'Ma7m0ud_iS_n0t_g00d';
const SUPER_ADMIN_PASS = 'mahmoud is a fucker';

// ── VISITOR LOG ──
// Stores ALL visitors ever — even after they leave
const visitorLog = []; // [ { id, ip, ua, os, device, browser, lang, tz, screen, referer, firstSeen, lastSeen, sessionToken, name, requestCount } ]

function parseUA(ua) {
  if (!ua) return { os: 'unknown', device: 'unknown', browser: 'unknown' };
  let os = 'unknown';
  if (/Windows NT 10/i.test(ua))       os = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua))         os = 'Windows';
  else if (/iPhone OS ([\d_]+)/i.test(ua)) os = 'iOS ' + ua.match(/iPhone OS ([\d_]+)/i)[1].replace(/_/g,'.');
  else if (/iPad.*OS ([\d_]+)/i.test(ua))  os = 'iPadOS ' + ua.match(/iPad.*OS ([\d_]+)/i)[1].replace(/_/g,'.');
  else if (/Android ([\d.]+)/i.test(ua))   os = 'Android ' + ua.match(/Android ([\d.]+)/i)[1];
  else if (/Mac OS X ([\d_]+)/i.test(ua))  os = 'macOS ' + ua.match(/Mac OS X ([\d_]+)/i)[1].replace(/_/g,'.');
  else if (/Linux/i.test(ua))           os = 'Linux';
  else if (/CrOS/i.test(ua))           os = 'ChromeOS';

  let device = 'Desktop';
  if (/iPhone/i.test(ua))                                    device = 'iPhone';
  else if (/iPad/i.test(ua))                                 device = 'iPad';
  else if (/Android.*Mobile/i.test(ua))                      device = 'Android Phone';
  else if (/Android/i.test(ua))                              device = 'Android Tablet';
  else if (/Mobile/i.test(ua))                               device = 'Mobile';

  let browser = 'unknown';
  if (/Edg\/([\d.]+)/i.test(ua))         browser = 'Edge ' + ua.match(/Edg\/([\d.]+)/i)[1];
  else if (/OPR\/([\d.]+)/i.test(ua))    browser = 'Opera ' + ua.match(/OPR\/([\d.]+)/i)[1];
  else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome ' + ua.match(/Chrome\/([\d.]+)/i)[1];
  else if (/Firefox\/([\d.]+)/i.test(ua)) browser = 'Firefox ' + ua.match(/Firefox\/([\d.]+)/i)[1];
  else if (/Safari\/([\d.]+)/i.test(ua) && !/Chrome/i.test(ua))   browser = 'Safari ' + ua.match(/Version\/([\d.]+)/i)?.[1] || '';
  else if (/Chromium\/([\d.]+)/i.test(ua)) browser = 'Chromium ' + ua.match(/Chromium\/([\d.]+)/i)[1];
  return { os, device, browser };
}

const visitorIndex = new Map(); // ip+ua hash -> visitorLog index

function trackVisitor(req, sessionToken, fp) {
  const ip = getIP(req);
  const ua = req.headers['user-agent'] || '';
  // Use session token as primary key if available, else ip+ua
  const key = sessionToken ? ('tok|' + sessionToken) : (ip + '|' + ua.slice(0, 80));
  const { os, device, browser } = parseUA(ua);
  const now = Date.now();

  if (visitorIndex.has(key)) {
    const v = visitorLog[visitorIndex.get(key)];
    v.lastSeen = now;
    v.requestCount = (v.requestCount || 1) + 1;
    if (sessionToken && !v.sessionTokens.includes(sessionToken)) v.sessionTokens.push(sessionToken);
    const sess = sessions.get(sessionToken);
    if (sess && sess.name && sess.name !== 'anonymous') v.name = sess.name;
    // Update fp fields if provided
    if (fp) Object.assign(v, _sanitizeFP(fp));
    return;
  }

  const sess = sessions.get(sessionToken);
  const entry = {
    id: visitorLog.length + 1,
    ip,
    ua,
    os,
    device,
    browser,
    lang: req.headers['accept-language'] || '',
    referer: req.headers['referer'] || '',
    firstSeen: now,
    lastSeen: now,
    sessionTokens: sessionToken ? [sessionToken] : [],
    name: (sess && sess.name) || '',
    requestCount: 1,
    // fingerprint fields — filled later via /api/fp
    country: '', city: '', isp: '',
    screen: '', platform: '', cores: '', ram: '', touch: false,
    timezone: '', canvasFp: '', webglFp: '', audioFp: '', gpu: '',
    pageVisible: true, focusLost: 0, stage: 0, score: 0,
    ...(fp ? _sanitizeFP(fp) : {}),
  };
  visitorIndex.set(key, visitorLog.length);
  visitorLog.push(entry);
}

function _sanitizeFP(fp) {
  const s = (v, max=64) => String(v||'').slice(0, max);
  return {
    country:    s(fp.country),
    city:       s(fp.city),
    isp:        s(fp.isp),
    screen:     s(fp.screen),
    platform:   s(fp.platform),
    cores:      s(fp.cores, 8),
    ram:        s(fp.ram, 8),
    touch:      !!fp.touch,
    timezone:   s(fp.timezone),
    canvasFp:   s(fp.canvasFp, 16),
    webglFp:    s(fp.webglFp, 16),
    audioFp:    s(fp.audioFp, 16),
    gpu:        s(fp.gpu, 120),
    pageVisible: fp.pageVisible !== false,
    focusLost:  parseInt(fp.focusLost) || 0,
  };
}

function isSuperAdmin(req) {
  return req.headers['x-super-admin'] === SUPER_ADMIN_PASS;
}

// Player registry: token -> { ip, lastSeen, stage, lives, score, maxLives }
const playerRegistry = new Map(); // token -> playerInfo

// Mod message queue: token -> [ { text, type, ts, from } ]
const modMsgQueue = new Map();

// Free hints queue: token -> [ { stage, hintIdx } ]
const modHintQueue = new Map();

// Hook into sessions to track by IP
function registerPlayer(req, token) {
  const ip = getIP(req);
  const sess = sessions.get(token);
  if (!sess) return;
  playerRegistry.set(token, { ip, token, lastSeen: Date.now() });
}

// Update player info from session
function refreshPlayer(req) {
  const token = req.headers['x-session'] || '';
  const sess = sessions.get(token);
  if (!sess) return;
  const ip = getIP(req);
  playerRegistry.set(token, { ip, token, lastSeen: Date.now(), stage: sess.stage, lives: sess.lives, maxLives: sess.maxLives, score: sess.score, name: sess.name || 'anonymous' });
}

// Middleware: refresh player registry on every API call
app.use('/api/', (req, res, next) => {
  refreshPlayer(req);
  const token = req.headers['x-session'] || '';
  trackVisitor(req, token);
  next();
});

function isMod(req) {
  if ((req.headers['x-mod-secret'] || req.body?.modSecret) === MOD_SECRET) return true;
  if (req.headers['x-super-admin'] === SUPER_ADMIN_PASS) return true;
  return false;
}

// ── BAN STORE ──
// Bans are per session-token, not per IP.
// The ban cookie holds the banned token — clearing it = instant unban.
const bannedTokens = new Map(); // token -> banCount
const BAN_COOKIE = 'ctf_ban';
// Deaths are tracked per-session only (not per-IP)
// Each new session starts with full lives regardless of other sessions on same network

function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim());
    return ips[ips.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

// Returns ban count for this request (0 = not banned).
// Checks cookie first — if cookie is gone, the player is effectively unbanned.
function isBanned(req) {
  const cookieToken = req.cookies[BAN_COOKIE];
  if (!cookieToken) return 0;                          // no cookie → not banned
  const count = bannedTokens.get(cookieToken) || 0;
  return count;
}

// Bans a player by their session token.
// Writes that token into the ban cookie so clearing it = unban.
function banUser(req, res, sessionToken) {
  const token = sessionToken || req.headers['x-session'] || 'unknown';
  const prev  = bannedTokens.get(token) || 0;
  const count = prev + 1;
  bannedTokens.set(token, count);
  res.cookie(BAN_COOKIE, token, { maxAge: 365*24*3600*1000, httpOnly: false, path: '/' });
  return count;
}

const BAN_MSGS = [
  { title:"BANNED.", body:"even with ur ability u lost it all.\n\nu don't deserve it anymore.\n\nGET LOST. 🥀", sub:"ur now getting banned from this forever" },
  { title:"didn't i ban u??", body:"get out!! 🚫\n\nbro i literally banned u.\nwhat are u doing here.", sub:"the ban is permanent. leave." },
  { title:"u're still here??", body:"bro seriously. 💀\n\nthe ban wasn't a suggestion.\nit was a sentence.", sub:"still banned. still not welcome." },
  { title:"ok this is impressive.", body:"i respect the commitment.\nbut no.\n\nget out. 🥀", sub:"banned. forever. no exceptions." },
  { title:"i give up.", body:"u clearly don't respect bans.\ni've run out of things to say.\n\njust leave. please. 🙏", sub:"ur now mythically banned." },
];

function getBanPage(count) {
  const m = BAN_MSGS[Math.min(count-1, BAN_MSGS.length-1)];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>banned</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0d0d0d;color:#e0e0e0;font-family:'IBM Plex Mono',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;}
.wrap{text-align:center;padding:40px 24px;max-width:500px;}
.big{font-size:clamp(3rem,10vw,6rem);font-weight:600;color:#f87171;letter-spacing:-3px;margin-bottom:24px;line-height:1;}
.msg{font-size:13px;color:#555;line-height:2;white-space:pre-line;margin-bottom:24px;}
.sub{font-size:10px;color:#333;letter-spacing:2px;text-transform:uppercase;}
</style></head><body>
<div class="wrap">
  <div class="big">${m.title}</div>
  <div class="msg">${m.body}</div>
  <div class="sub">${m.sub}</div>
</div></body></html>`;
}

// Ban middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/assets')) return next();
  if (req.path.startsWith('/api/mod/')) return next(); // mod bypass — never ban the mod
  // Also bypass ban if request carries mod secret
  const modSecret = req.headers['x-mod-secret'] || req.body?.modSecret;
  if (modSecret === MOD_SECRET) return next();
  const banCount = isBanned(req);
  if (banCount > 0) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ banned: true, banCount, msg: BAN_MSGS[Math.min(banCount-1,BAN_MSGS.length-1)].body });
    }
    return res.send(getBanPage(banCount));
  }
  next();
});

// Track all page visitors BEFORE express.static so GET / is captured
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/assets/')) {
    const token = req.headers['x-session'] || '';
    trackVisitor(req, token);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
const limiter = rateLimit({
  windowMs: 10*60*1000,
  max: 900,
  message: { error: 'slow down.' },
  keyGenerator: (req) => {
    // Rate-limit per session token, not per IP
    const token = req.headers['x-session'] || '';
    return token || (getIP(req) + '|anon');
  },
  skip: (req) => {
    // Skip for mod (admin)
    const modSecret = req.headers['x-mod-secret'] || req.body?.modSecret;
    if (modSecret === MOD_SECRET) return true;
    // Skip for super admin
    if (req.headers['x-super-admin'] === SUPER_ADMIN_PASS) return true;
    return false;
  }
});
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/mod/')) return next(); // no rate limit for mod routes
  if (req.path.startsWith('/superadmin/')) return next(); // no rate limit for super admin
  limiter(req, res, next);
});

// ── SESSIONS ──
const sessions = new Map();
function makeSession(lives, name) {
  const token = uuidv4();
  sessions.set(token, {
    stage: 1, solved: [], attempts: 0, score: 0,
    hintsUsed: [], lives: lives||5, maxLives: lives||5,
    konamiBonus: 0,
    lastAnswer: null, sameAnswerCount: 0, spamCount: 0, caseSpamCount: 0,
    name: (name || 'anonymous').slice(0, 32),
  });
  setTimeout(() => sessions.delete(token), 6*60*60*1000);
  return token;
}
function getSession(req) {
  return sessions.get(req.headers['x-session']||'')||null;
}

// ── FLAG & SECRETS ──
const FLAG       = 'FLAG{5k1ll_1ssu3_but_y0u_m4d3_1t}';
const JWT_SECRET = 'hunter2';

// Direct-check flags for downloadable challenges
const DIRECT_FLAGS = {
  11: 'FLAG{f0r3n51c5_3y35_n3v3r_m155_4_clu3}',  // forensics pptm
  12: 'FLAG{r3v3r53_1t_t1ll_1t_cr4ck5_b4ck}',   // reverse exe
};

// ── JWT helpers ──
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function parseB64(s) {
  return JSON.parse(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
}
function signHS256(hdr, payload) {
  const data = b64url(hdr)+'.'+b64url(payload);
  const sig = crypto.createHmac('sha256',JWT_SECRET).update(data).digest('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return data+'.'+sig;
}
function verifyJWT(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length!==3) return null;
  try {
    const hdr  = parseB64(parts[0]);
    const payload = parseB64(parts[1]);
    if (hdr.alg==='none') return payload;
    const expected = signHS256(hdr,payload).split('.')[2];
    if (parts[2]===expected) return payload;
    return null;
  } catch(e){ return null; }
}

// ── ANSWERS ──
// Difficulty order: Easy (1-4) → Medium (5-8) → Hard (9-10) → VOID (11-12)
const CHALLENGES = {
  // stage 1 = login (SQLi) — answer checked via /api/c7/login, not /api/check
  // stage 2 = three parts, one word
  2:{points:75,answer:'GHOST',hints:[{cost:10,text:'the output of each operation feeds into the next.'},{cost:15,text:'one of these operations is reversible by reading backwards.'}]},
  // stage 3 = noisy bits
  3:{points:100,answer:'CIPHER',hints:[{cost:15,text:'raw binary is not always what it seems. something was applied to each byte.'},{cost:20,text:'XOR is self-inverse. if you know the key, you can undo it.'}]},
  // stage 4 = maintenance page
  4:{points:125,answer:'DELTA',hints:[{cost:20,text:'not everything visible on screen is the whole story.'},{cost:25,text:'the page source holds more than meets the eye. dots and dashes.'}]},
  // stage 5 = JWT (no answer in /check — handled by c5/verify)
  5:{points:150,hints:[{cost:25,text:'JWTs have three parts separated by dots. the header says which algorithm to use.'},{cost:30,text:'what happens if you change the algorithm to "none"? some implementations trust the header blindly.'}]},
  // stage 6 = dead script
  6:{points:150,answer:'SHADOW',hints:[{cost:20,text:'two layers. the outer one is just encoding, not encryption.'},{cost:25,text:'ROT13 applied after decoding the outer layer.'}]},
  // stage 7 = second factor (no answer in /check — handled by c6/verify)
  7:{points:150,hints:[{cost:25,text:'look at the request being sent when you click verify. what parameters does the endpoint accept?'},{cost:30,text:'try adding an unexpected parameter to the request body — developers sometimes leave debug flags active.'}]},
  // stage 8 = IDOR — answer is decoded base64 from admin resource
  8:{points:150,answer:'IDOR_IS_N0T_IT',hints:[{cost:30,text:'have u ever heard of IDOR?'},{cost:35,text:'the resource endpoint accepts an id. not all ids are yours. some belong to someone else entirely.'}]},
  // stage 9 = access level
  9:{points:200,hints:[{cost:35,text:'your access level is stored in a cookie. cookies can be read and modified by the client.'},{cost:40,text:'the cookie value is base64 encoded. decode it, change the role to "superadmin", re-encode, and set it back.'}]},
  // stage 10 = the gate
  10:{points:250,hints:[{cost:50,text:'the proof is a SHA-256 hash. look at the clue endpoint — it tells you exactly what to hash.'},{cost:60,text:'hint: SHA256( prefix + first 8 chars of your session token ). the prefix is hidden in the clue script.'}]},
};
const RESOURCES = {
  '0':{owner:'guest',data:'lmaooo wrong id. try harder 💀'},
  '1':{owner:'guest',data:'nope. not even close.'},
  '2':{owner:'guest',data:'bro really typed this 😭'},
  '3':{owner:'guest',data:'u thought? cute.'},
  '4':{owner:'guest',data:'0/10 attempt. keep going.'},
  '5':{owner:'guest',data:'skill issue detected 🔍'},
  '6':{owner:'guest',data:'not it chief.'},
  '7':{owner:'guest',data:'nice try bestie 🌸'},
  '8':{owner:'guest',data:'this ain\'t it.'},
  '9':{owner:'guest',data:'somewhere between lost and clueless.'},
  '10':{owner:'guest',data:'bro is speedrunning failure.'},
  '11':{owner:'guest',data:'almost! (not really)'},
  '12':{owner:'guest',data:'sooo close... jk no.'},
  '13':{owner:'admin',data:'SURPUl9JU19OMFRfSVQ='},
  '14':{owner:'guest',data:'u passed the right one already 💔'},
  '15':{owner:'guest',data:'going too far bro.'},
  '16':{owner:'guest',data:'reverse moment.'},
  '17':{owner:'guest',data:'u already missed it.'},
  '18':{owner:'guest',data:'getting warmer? nah.'},
  '19':{owner:'guest',data:'this is sad to watch.'},
  '20':{owner:'guest',data:'ok at this point ur just guessing.'},
  '21':{owner:'guest',data:'have u tried... not this?'},
  '22':{owner:'guest',data:'lol.'},
  '23':{owner:'guest',data:'still wrong.'},
  '24':{owner:'guest',data:'just stop bro.'},
  '25':{owner:'guest',data:'last one and still wrong. impressive.'},
};
function finalHash(sessionToken) {
  return crypto.createHash('sha256').update('xpl8'+sessionToken.slice(0,8)).digest('hex');
}
const MAX_SCORE = 1850;

// ── SMART ANSWER ANALYSIS ──
function analyzeAnswer(answer, correct, sess) {
  const a = answer.trim();
  const aUp = a.toUpperCase();
  if (!a) return { code:'empty' };
  const isCorrectWrongCase = aUp === correct && a !== correct;
  if (isCorrectWrongCase) {
    sess.caseSpamCount = (sess.caseSpamCount||0)+1;
    if (sess.caseSpamCount >= 3) return { code:'case_spam' };
    return { code:'case' };
  } else {
    sess.caseSpamCount = 0;
    if (sess.lastAnswer === aUp) {
      sess.sameAnswerCount = (sess.sameAnswerCount||0)+1;
      if (sess.sameAnswerCount >= 1) return { code:'repeat' };
    } else { sess.sameAnswerCount = 0; sess.lastAnswer = aUp; }
  }
  const sqliPatterns = [/'\s*--/,/'\s*OR\s*'1'/i,/'\s*#/,/UNION\s+SELECT/i];
  if (sqliPatterns.some(p=>p.test(a))) return { code:'sqli_wrong_place' };
  const alphaRatio = (a.match(/[a-zA-Z]/g)||[]).length / a.length;
  if (a.length > 15 && alphaRatio < 0.5) return { code:'spam' };
  if (a.length > 25) return { code:'spam' };
  if (aUp === correct) return { code:'correct' };
  return { code:'wrong' };
}

// ── API ──
app.post('/api/init', (req,res)=>{
  const {deathCount, name, konamiBonus} = req.body||{};
  // Each new session gets full lives — deaths only tracked within the same session
  // deathCount from client is only used for revival (same session continuing after death)
  const dc = typeof deathCount==='number' ? Math.max(0, Math.min(deathCount, 4)) : 0;
  const baseLives = Math.max(1, 5 - dc);
  const bonus = typeof konamiBonus==='number' ? Math.max(0, Math.min(konamiBonus, 94)) : 0;
  const lives = Math.min(99, baseLives + bonus);
  const token = makeSession(lives, name);
  if (bonus > 0) { const sess = sessions.get(token); if (sess) { sess.konamiBonus = bonus; sess.maxLives = lives; } }
  registerPlayer(req, token);
  res.json({token, stage:1, lives, maxLives:lives, score:0});
});

// ── FINGERPRINT ENDPOINT ──
// Called by client after page load with browser fingerprint data
app.post('/api/fp', async (req, res) => {
  const token = req.headers['x-session'] || '';
  const fp = req.body || {};
  const ip = getIP(req);
  const ua = req.headers['user-agent'] || '';
  const key = ip + '|' + ua.slice(0, 80);

  // Geo lookup via ip-api.com (free, no key needed, works on Railway)
  let geo = { country: '', city: '', isp: '' };
  try {
    // Use node's built-in fetch (Node 18+) or fall back gracefully
    const geoFetch = typeof fetch !== 'undefined' ? fetch : null;
    if (geoFetch) {
      const gr = await Promise.race([
        geoFetch(`http://ip-api.com/json/${ip}?fields=country,city,isp,status`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      const gd = await gr.json();
      if (gd.status === 'success') {
        geo = { country: gd.country || '', city: gd.city || '', isp: gd.isp || '' };
      }
    }
  } catch (_) { /* geo lookup failed — no problem */ }

  const fullFP = { ...fp, ...geo };

  // If entry was created anonymously (ip+ua key), re-key it to tok|token now that we have a token
  const anonKey = ip + '|' + ua.slice(0, 80);
  const tokKey  = token ? ('tok|' + token) : null;
  if (tokKey && !visitorIndex.has(tokKey) && visitorIndex.has(anonKey)) {
    const idx = visitorIndex.get(anonKey);
    visitorIndex.delete(anonKey);
    visitorIndex.set(tokKey, idx);
  }

  // Update visitor log entry
  trackVisitor(req, token, fullFP);

  // Also update player registry fp fields
  const reg = playerRegistry.get(token);
  if (reg) {
    Object.assign(reg, { country: geo.country, city: geo.city });
  }

  // Update session stage/score in visitor log for live tracking
  const sess = sessions.get(token);
  const tokKey2 = token ? ('tok|' + token) : (ip + '|' + ua.slice(0, 80));
  if (sess && visitorIndex.has(tokKey2)) {
    const v = visitorLog[visitorIndex.get(tokKey2)];
    v.stage = sess.stage;
    v.score = sess.score;
  }

  res.json({ ok: true });
});

app.get('/api/state',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'no session.'});
  res.json({stage:sess.stage,solved:sess.solved,score:sess.score,lives:sess.lives,maxLives:sess.maxLives});
});

app.get('/api/hint/:stage/:idx',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'no session.'});
  const n=parseInt(req.params.stage), idx=parseInt(req.params.idx);
  const ch=CHALLENGES[n];
  if(!ch||!ch.hints||!ch.hints[idx]) return res.status(404).json({error:'no hint.'});
  const key=`${n}-${idx}`;
  if(!sess.hintsUsed.includes(key)){
    sess.hintsUsed.push(key);
    sess.score=Math.max(0,sess.score-ch.hints[idx].cost);
  }
  res.json({text:ch.hints[idx].text,cost:ch.hints[idx].cost,score:sess.score});
});

app.post('/api/check/:stage',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'no session.'});
  const n=parseInt(req.params.stage);
  if(sess.stage!==n) return res.status(400).json({error:'wrong stage.'});
  sess.attempts++;
  const answer=(req.body.answer||'').trim();

  // Direct flag challenges (11 forensics, 12 reverse)
  if(n===11||n===12){
    if(!answer) return res.json({correct:false,code:'empty',message:"when u have no idea, u start trying shit 💀"});
    const correct=DIRECT_FLAGS[n];
    if(answer===correct){
      if(sess.solved.includes(n)) return res.json({correct:false,message:'already solved.'});
      sess.solved.push(n);
      if(n===11){
        sess.stage=Math.max(sess.stage,12);sess.score+=200;sess.lastAnswer=null;sess.sameAnswerCount=0;
        return res.json({correct:true,score:sess.score,message:'+200 pts — now there is no way home. the last door is open. good luck… you\'ll need it. 🕳️'});
      }
      if(n===12){
        sess.stage=Math.max(sess.stage,13);sess.score+=150;sess.lastAnswer=null;sess.sameAnswerCount=0;
        return res.json({correct:true,finalWin:true,flag:FLAG,score:sess.score,maxScore:MAX_SCORE,message:'+150 pts — ALL CLEARED 🎯'});
      }
    }
    if(answer.toUpperCase()===correct.toUpperCase()&&answer!==correct){
      return res.json({correct:false,lives:sess.lives,message:'almost. check the exact casing of the flag.'});
    }
    sess.lives=Math.max(0,sess.lives-1);
    return res.json({correct:false,lives:sess.lives,message:'wrong flag.'});
  }

  const ch=CHALLENGES[n];
  if(!ch) return res.status(400).end();
  const analysis=analyzeAnswer(answer,ch.answer,sess);
  if(analysis.code==='empty')            return res.json({correct:false,code:'empty',message:"when u have no idea, u start trying shit. 💀"});
  if(analysis.code==='repeat'){          return res.json({correct:false,code:'repeat',message:"Einstein once said : \"Insanity is doing the same thing over and over again and expecting different results\""});}
  if(analysis.code==='sqli_wrong_place'){sess.lives=Math.max(0,sess.lives-1); return res.json({correct:false,code:'sqli',lives:sess.lives,message:"that's not gonna work here. wrong challenge maybe? 👀"});}
  if(analysis.code==='spam'){            sess.lives=Math.max(0,sess.lives-1); return res.json({correct:false,code:'spam',lives:sess.lives,message:"now u're spamming shit. find a real answer. 💀"});}
  if(analysis.code==='case')             return res.json({correct:false,wrongCase:true,message:"the letters should be capital btw 👀"});
  if(analysis.code==='case_spam')        return res.json({correct:false,wrongCase:true,message:"CAPS LOCK exists for a reason. use it."});
  if(analysis.code==='correct'){
    if(!sess.solved.includes(n)) sess.solved.push(n);
    sess.stage=Math.max(sess.stage,n+1); sess.score+=ch.points; sess.lastAnswer=null; sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:`+${ch.points} pts`});
  }
  sess.lives=Math.max(0,sess.lives-1);
  return res.json({correct:false,lives:sess.lives,message:'wrong.'});
});

// Clue routes
app.get('/api/c3clue',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage<1) return res.status(403).end();
  res.set('Content-Type','text/plain');
  res.send(`(function(){
  var _x=["\x52\x6c\x56\x4f\x55\x55\x4a\x4b","\x61\x74\x6f\x62","\x72\x65\x70\x6c\x61\x63\x65"];
  var _d=window[_x[1]](_x[0]);
  var _r=_d[_x[2]](/[A-Za-z]/g,function(c){
    var n=c.charCodeAt(0);
    if(n>=65&&n<=90) return String.fromCharCode(((n-65+13)%26)+65);
    if(n>=97&&n<=122) return String.fromCharCode(((n-97+13)%26)+97);
    return c;
  });
  console.log(_r);
})();`);
});

app.get('/api/c4page',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage<1) return res.status(403).end();
  res.set('Content-Type','text/html');
  res.send(`<!DOCTYPE html><html><head><title>maintenance</title></head>
<body style="background:#111;color:#555;font-family:monospace;padding:40px">
<p>nothing to see here.</p>
<!-.. . .-.. - .->
</body></html>`);
});

app.post('/api/c5/token',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'_'});
  const token=signHS256({alg:'HS256',typ:'JWT'},{role:'viewer',uid:42,iat:Math.floor(Date.now()/1000)});
  res.cookie('ctf_auth',token,{httpOnly:false,path:'/'});
  res.json({issued:true});
});
app.post('/api/c5/verify',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'_'});
  const token=req.cookies.ctf_auth||req.body.token||'';
  const decoded=verifyJWT(token);
  if(!decoded) return res.status(401).json({error:'invalid token.'});
  if(decoded.role==='admin'){
    if(!sess.solved.includes(5)) sess.solved.push(5);
    sess.stage=Math.max(sess.stage,6);sess.score+=150;sess.lastAnswer=null;sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:'+150 pts'});
  }
  sess.lives=Math.max(0,sess.lives-1);
  return res.status(403).json({error:'insufficient role.',lives:sess.lives});
});

app.post('/api/c6/verify',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==7) return res.status(403).json({error:'_'});
  const{code,debug}=req.body;
  if(debug!==undefined){
    if(!sess.solved.includes(7)) sess.solved.push(7);
    sess.stage=Math.max(sess.stage,8);sess.score+=150;sess.lastAnswer=null;sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:'+150 pts'});
  }
  if(code==='291847'){
    if(!sess.solved.includes(7)) sess.solved.push(7);
    sess.stage=Math.max(sess.stage,8);sess.score+=150;sess.lastAnswer=null;sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:'+150 pts'});
  }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives,message:'wrong code. or wrong approach entirely. 🤔'});
});

app.post('/api/c7/login',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==1) return res.status(403).json({error:'_'});
  const{username='',password=''}=req.body;

  // ── ARABIC CHECK ──
  const arabicRe=/[\u0600-\u06FF]/;
  if(arabicRe.test(username)||arabicRe.test(password)){
    sess.lives=Math.max(0,sess.lives-1);
    return res.json({correct:false,code:'arabic',lives:sess.lives,message:"now we're writing CTF answers in arabic 💀 switch to EN bro"});
  }

  // ── REPEAT ANSWER CHECK ──
  const combined=(username+'|'+password).toUpperCase();
  if(sess.lastAnswer===combined){
    sess.sameAnswerCount=(sess.sameAnswerCount||0)+1;
    if(sess.sameAnswerCount>=1){
      return res.json({correct:false,code:'repeat',message:'Einstein once said : "Insanity is doing the same thing over and over again and expecting different results"'});
    }
  } else { sess.sameAnswerCount=0; sess.lastAnswer=combined; }

  const sqli=[/'\s*--/,/'\s*OR\s*'1'\s*=\s*'1/i,/'\s*OR\s*1\s*=\s*1/i,/admin'\s*--/i,/'\s*#/,/'\s*\/\*/];
  if(sqli.some(p=>p.test(username)||p.test(password))){
    if(!sess.solved.includes(1)) sess.solved.push(1);
    sess.stage=Math.max(sess.stage,2);sess.score+=50;sess.lastAnswer=null;sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:'+50 pts'});
  }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives,message:"that's not quite SQL injection. keep trying. 👀"});
});

// Exploration-only: GET /api/data/resource (no id → list available)
app.get('/api/data/resource',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==8) return res.status(403).json({error:'_'});
  res.json({resources:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],message:'access them by id: /api/data/resource/:id'});
});
// Fetch a specific resource — reveals base64 data for id 13, guest data otherwise
app.get('/api/data/resource/:id',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==8) return res.status(403).json({error:'_'});
  const r=RESOURCES[req.params.id];
  if(!r) return res.status(404).json({error:'not found.'});
  // id 13 reveals the encoded secret — player must decode and submit via /check/8
  res.json({id:req.params.id,owner:r.owner,data:r.data});
});

app.get('/api/c9/profile',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==9) return res.status(403).json({error:'_'});
  const roleCookie=req.cookies.c9_role;
  if(!roleCookie){ res.cookie('c9_role',Buffer.from('guest').toString('base64'),{httpOnly:false,path:'/'}); return res.json({role:'guest',message:'access level: guest'}); }
  try{
    const role=Buffer.from(roleCookie,'base64').toString('utf8');
    if(role==='superadmin'){
      if(!sess.solved.includes(9)) sess.solved.push(9);
      sess.stage=Math.max(sess.stage,10);sess.score+=200;sess.lastAnswer=null;sess.sameAnswerCount=0;
      return res.json({correct:true,role,score:sess.score,message:'+200 pts'});
    }
    res.json({role,message:`access level: ${role}`});
  }catch(e){res.json({error:'malformed cookie.'});}
});

app.post('/api/c10/gate',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==10) return res.status(403).json({error:'_'});
  const sessionToken=req.headers['x-session']||'';
  const expected=finalHash(sessionToken);
  const{proof}=req.body;
  if(proof===expected){
    if(!sess.solved.includes(10)) sess.solved.push(10);
    sess.stage=Math.max(sess.stage,11);sess.score+=250;sess.lastAnswer=null;sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:'+250 pts — gate cleared!'});
  }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives,message:'wrong proof. check the clue endpoint again. 🔐'});
});

app.get('/api/c10clue',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage<1) return res.status(403).end();
  res.set('Content-Type','text/javascript');
  res.send(`!function(){
  var _a=["api","c10","gate"].join("/"),
  _b=["xpl8"].join(""),
  _h=async function(s){
    var b=new TextEncoder().encode(s),
    d=await crypto.subtle.digest("SHA-256",b),
    r=Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,"0")}).join("");
    return r;
  };
  // proof = H( _b + sessionToken.slice(0,8) )
  // endpoint: "/" + _a
  console.log("figure it out.");
}();`);
});

// File downloads
app.get('/assets/forensics-aint-fun.pptm',(req,res)=>{
  res.download(path.join(__dirname,'public','assets','forensics-aint-fun.pptm'),'forensics-aint-fun.pptm');
});
app.get('/assets/Untitled1.exe',(req,res)=>{
  res.download(path.join(__dirname,'public','assets','Untitled1.exe'),'Untitled1.exe');
});

// Master jump (session-only, no localStorage, resets on refresh)
app.post('/api/master/jump',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'no session.'});
  const {stage}=req.body||{};
  const n=parseInt(stage);
  if(n>=1&&n<=12){
    sess.stage=n;
    return res.json({ok:true,stage:n});
  }
  res.status(400).json({error:'invalid stage.'});
});

// Ban endpoint — called by the client when death count hits 5
app.post('/api/ban',(req,res)=>{
  if (isMod(req)) return res.status(403).json({ error: 'mods cannot be banned.' });
  const sessionToken = req.headers['x-session'] || '';
  const count = banUser(req, res, sessionToken);
  res.json({ banned: true, count });
});

// Unban endpoint — clearing the cookie is enough, but this also wipes the token from the store
app.post('/api/unban',(req,res)=>{
  const { secret } = req.body || {};
  if (secret !== '0x69er_admin_unban') return res.status(403).json({ error: 'wrong secret.' });
  const cookieToken = req.cookies[BAN_COOKIE];
  if (cookieToken) bannedTokens.delete(cookieToken);
  res.clearCookie(BAN_COOKIE, { path: '/' });
  // NOTE: deaths are session-scoped — unban clears the session, new session = full lives
  res.json({ ok: true, message: 'unban OK' });
});


// ── GET /api/mod/players ──
app.get('/api/mod/players', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const now = Date.now();
  const players = [];
  for (const [token, info] of playerRegistry) {
    if (now - info.lastSeen > 5 * 60 * 1000) continue; // inactive > 5min
    const sess = sessions.get(token);
    if (!sess) continue;
    players.push({
      token,
      ip: info.ip,
      name: sess.name || 'anonymous',
      stage: sess.stage,
      lives: sess.lives,
      maxLives: sess.maxLives,
      score: sess.score,
      lastSeen: info.lastSeen,
    });
  }
  res.json({ players });
});

// ── POST /api/mod/set-lives ──
app.post('/api/mod/set-lives', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken, lives } = req.body || {};
  const sess = sessions.get(targetToken);
  if (!sess) return res.status(404).json({ error: 'player not found.' });
  const n = Math.max(0, Math.min(99, parseInt(lives) || 0));
  const delta = n - sess.lives;
  sess.lives = n;
  sess.maxLives = Math.max(sess.maxLives, n);
  // Push notification to the player
  const q = modMsgQueue.get(targetToken) || [];
  if (delta > 0) {
    q.push({ text: `💖 المود أضاف لك ${delta} قلب${delta > 1 ? '' : ''}! (${n} قلوب الآن)`, type: 'ok', from: 'mod', ts: Date.now(), livesUpdate: { lives: n, maxLives: sess.maxLives } });
  } else if (delta < 0) {
    q.push({ text: `💔 المود شال منك ${Math.abs(delta)} قلب! (${n} قلوب الآن)`, type: 'err', from: 'mod', ts: Date.now(), livesUpdate: { lives: n, maxLives: sess.maxLives } });
  }
  modMsgQueue.set(targetToken, q);
  res.json({ ok: true, lives: sess.lives });
});

// ── POST /api/mod/set-own-lives ──
app.post('/api/mod/set-own-lives', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'no session.' });
  const { lives } = req.body || {};
  const n = Math.max(0, Math.min(99, parseInt(lives) || 0));
  sess.lives = n;
  sess.maxLives = Math.max(sess.maxLives, n);
  res.json({ ok: true, lives: sess.lives });
});

// ── POST /api/mod/message ──
app.post('/api/mod/message', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken, text, msgType } = req.body || {};
  if (!targetToken || !text) return res.status(400).json({ error: 'missing fields.' });
  const info = playerRegistry.get(targetToken);
  if (!info) return res.status(404).json({ error: 'player not found.' });
  // Push to poll queue (popup notification)
  const q = modMsgQueue.get(targetToken) || [];
  q.push({ text: String(text).slice(0, 300), type: msgType || 'warn', from: 'mod', ts: Date.now() });
  modMsgQueue.set(targetToken, q);
  // Also add to private chat so it's visible in admin-inbox
  addPrivateMsg('__admin__', targetToken, String(text).slice(0, 300));
  res.json({ ok: true });
});

// ── POST /api/mod/give-hint ──
app.post('/api/mod/give-hint', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken, stage, hintIdx } = req.body || {};
  const info = playerRegistry.get(targetToken);
  if (!info) return res.status(404).json({ error: 'player not found.' });
  const sess = sessions.get(targetToken);
  if (!sess) return res.status(404).json({ error: 'session gone.' });
  const n = parseInt(stage), idx = parseInt(hintIdx);
  const ch = CHALLENGES[n];
  if (!ch || !ch.hints || !ch.hints[idx]) return res.status(404).json({ error: 'hint not found.' });
  // Give hint for free (no point deduction)
  const key = `${n}-${idx}`;
  if (!sess.hintsUsed.includes(key)) sess.hintsUsed.push(key);
  // Queue delivery
  const q = modHintQueue.get(targetToken) || [];
  q.push({ stage: n, hintIdx: idx, text: ch.hints[idx].text, ts: Date.now() });
  modHintQueue.set(targetToken, q);
  res.json({ ok: true });
});

// Sound queue: token -> [{ soundName, msg, ts }]
const modSoundQueue = new Map();

// ══════════════════════════════════════════════════════════════
// ── CHAT SYSTEM ──
// ══════════════════════════════════════════════════════════════

// Anonymous name generator — each player gets one unique chat alias
const CHAT_ADJECTIVES = ['Silent','Ghost','Neon','Shadow','Blazing','Frozen','Crypto','Binary','Rogue','Phantom','Stealth','Void','Cyber','Mystic','Glitch','Fuzzy','Hyper','Dark','Iron','Sonic'];
const CHAT_NOUNS      = ['Falcon','Viper','Wolf','Shark','Eagle','Panther','Cobra','Lynx','Raven','Hawk','Fox','Coyote','Manta','Hydra','Kraken','Phoenix','Specter','Cipher','Vector','Nexus'];
const chatAliasMap   = new Map(); // token -> alias string e.g. "SilentFalcon503"
const usedAliases    = new Set();

function getChatAlias(token) {
  if (chatAliasMap.has(token)) return chatAliasMap.get(token);
  let alias;
  let tries = 0;
  do {
    const adj  = CHAT_ADJECTIVES[Math.floor(Math.random() * CHAT_ADJECTIVES.length)];
    const noun = CHAT_NOUNS[Math.floor(Math.random() * CHAT_NOUNS.length)];
    const num  = Math.floor(100 + Math.random() * 900);
    alias = `${adj}${noun}${num}`;
    tries++;
  } while (usedAliases.has(alias) && tries < 500);
  usedAliases.add(alias);
  chatAliasMap.set(token, alias);
  return alias;
}

// Public chat: array of message objects
// { id, alias, text, ts, deleted, file? }
const publicChat = [];
let chatIdSeq = 1;

// Private chats: Map of "sortedToken1:sortedToken2" -> [{id, from, alias, text, ts, deleted, file?}]
const privateChats = new Map();

function chatRoomKey(a, b) {
  return [a, b].sort().join(':');
}

function addPublicMsg(token, text, file) {
  const alias = getChatAlias(token);
  const msg = { id: chatIdSeq++, alias, token, text: String(text||'').slice(0,500), ts: Date.now(), deleted: false };
  if (file) msg.file = file;
  publicChat.push(msg);
  if (publicChat.length > 1000) publicChat.splice(0, publicChat.length - 1000);
  appendChatLog({ type:'public', alias, text: msg.text, ts: msg.ts, file: file||null });
  return msg;
}

function addPrivateMsg(fromToken, toToken, text, file) {
  const alias = getChatAlias(fromToken);
  const key = chatRoomKey(fromToken, toToken);
  const room = privateChats.get(key) || [];
  const msg = { id: chatIdSeq++, from: fromToken, alias, text: String(text||'').slice(0,500), ts: Date.now(), deleted: false };
  if (file) msg.file = file;
  room.push(msg);
  if (room.length > 500) room.splice(0, room.length - 500);
  privateChats.set(key, room);
  appendChatLog({ type:'private', alias, toAlias: getChatAlias(toToken), text: msg.text, ts: msg.ts, file: file||null });
  return msg;
}

// File store for chat file uploads (base64 in memory)
const chatFiles = new Map(); // fileId -> { name, data, mime, uploader }



// Known available sounds (served from /assets/audio/ or built-in synth)
const KNOWN_SOUNDS = ['rbd', 'correct', 'wrong', 'victory', 'notify', 'death', 'stageUp', 'hint', 'click', 'loseLife'];

// ── GET /api/mod/poll — players call this to receive mod messages ──
app.get('/api/mod/poll', (req, res) => {
  const token = req.headers['x-session'] || '';
  const msgs = modMsgQueue.get(token) || [];
  const hints = modHintQueue.get(token) || [];
  const sounds = modSoundQueue.get(token) || [];
  modMsgQueue.set(token, []);
  modHintQueue.set(token, []);
  modSoundQueue.set(token, []);
  res.json({ msgs, hints, sounds });
});

// ── POST /api/mod/broadcast ──
app.post('/api/mod/broadcast', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { text, msgType } = req.body || {};
  if (!text) return res.status(400).json({ error: 'missing text.' });
  let count = 0;
  const now = Date.now();
  for (const [token, info] of playerRegistry) {
    if (now - info.lastSeen > 5 * 60 * 1000) continue;
    const q = modMsgQueue.get(token) || [];
    q.push({ text: String(text).slice(0, 300), type: msgType || 'warn', from: 'mod', ts: now });
    modMsgQueue.set(token, q);
    count++;
  }
  res.json({ ok: true, count });
});

// ── POST /api/mod/play-sound ──
app.post('/api/mod/play-sound', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { soundName, msg, targetToken, broadcast } = req.body || {};
  if (!soundName) return res.status(400).json({ error: 'missing soundName.' });
  if (!KNOWN_SOUNDS.includes(soundName)) return res.status(400).json({ error: `unknown sound. available: ${KNOWN_SOUNDS.join(', ')}` });
  const now = Date.now();
  const pushSound = (tok) => {
    const q = modSoundQueue.get(tok) || [];
    q.push({ soundName, msg: (msg||'').slice(0,200), ts: now });
    modSoundQueue.set(tok, q);
  };
  if (broadcast) {
    let count = 0;
    for (const [token, info] of playerRegistry) {
      if (now - info.lastSeen > 5 * 60 * 1000) continue;
      pushSound(token); count++;
    }
    return res.json({ ok: true, count });
  }
  if (targetToken) {
    const info = playerRegistry.get(targetToken);
    if (!info) return res.status(404).json({ error: 'player not found.' });
    pushSound(targetToken);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'specify targetToken or broadcast.' });
});

// ── GET /api/mod/ban-list ──
app.get('/api/mod/ban-list', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const banned = [];
  for (const [token, count] of bannedTokens) {
    const info = playerRegistry.get(token);
    banned.push({ token: token.slice(0, 8) + '…', fullToken: token, ip: info ? info.ip : 'unknown', count });
  }
  res.json({ banned });
});

// ── POST /api/mod/ban-player ──
// Bans by session token — the ban cookie on the client holds the token,
// so clearing the cookie is all they need to do to unban themselves locally.
// Mod can re-ban anytime by token.
app.post('/api/mod/ban-player', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken } = req.body || {};
  if (!targetToken) return res.status(400).json({ error: 'missing targetToken.' });
  const prev = bannedTokens.get(targetToken) || 0;
  bannedTokens.set(targetToken, prev + 1);
  // Notify the player via poll queue
  const q = modMsgQueue.get(targetToken) || [];
  q.push({ text: "u have been banned by the mod. get out.", type: 'err', from: 'mod', ts: Date.now(), ban: true, bannedToken: targetToken });
  modMsgQueue.set(targetToken, q);
  const info = playerRegistry.get(targetToken);
  res.json({ ok: true, ip: info ? info.ip : 'unknown', banCount: prev + 1 });
});

// ── POST /api/mod/unban-player ──
app.post('/api/mod/unban-player', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken } = req.body || {};
  if (!targetToken) return res.status(400).json({ error: 'missing targetToken.' });
  bannedTokens.delete(targetToken);
  // Notify the player they're unbanned
  const q = modMsgQueue.get(targetToken) || [];
  q.push({ text: "ur ban has been lifted by the mod.", type: 'ok', from: 'mod', ts: Date.now(), unban: true });
  modMsgQueue.set(targetToken, q);
  res.json({ ok: true, targetToken });
});


// ── SUPER ADMIN PANEL HTML ──
function getSuperAdminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>⛏ super admin</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{--bg:#0a0a0a;--bg2:#111;--bg3:#1a1a1a;--border:#222;--border2:#333;--text:#e0e0e0;--mu:#555;--mu2:#3a3a3a;--red:#f87171;--green:#6ee7a0;--yellow:#fcd34d;--blue:#60a5fa;--purple:#c084fc;--cyan:#22d3ee;}
body{background:var(--bg);color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:12px;min-height:100vh;}
.top{background:var(--bg2);border-bottom:1px solid var(--border2);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
.top-title{color:var(--red);font-weight:600;font-size:14px;letter-spacing:1px;}
.top-sub{color:var(--mu);font-size:10px;margin-top:2px;}
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);overflow-x:auto;}
.tab{padding:10px 20px;background:none;border:none;color:var(--mu);cursor:pointer;font-family:inherit;font-size:11px;border-bottom:2px solid transparent;white-space:nowrap;}
.tab.active{color:var(--text);border-bottom-color:var(--red);}
.tab:hover{color:var(--text);}
.pane{display:none;padding:20px;overflow-x:auto;}
.pane.active{display:block;}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:16px;}
.stat-val{font-size:26px;font-weight:600;color:var(--red);}
.stat-label{color:var(--mu);font-size:10px;margin-top:4px;text-transform:uppercase;letter-spacing:1px;}
table{width:100%;border-collapse:collapse;font-size:11px;}
th{text-align:left;padding:7px 8px;color:var(--mu);font-size:9px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);font-weight:400;white-space:nowrap;}
td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
td.wrap{white-space:normal;word-break:break-all;max-width:200px;}
tr:hover td{background:rgba(255,255,255,.02);}
.badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:.5px;}
.badge-green{background:#052e16;color:var(--green);border:1px solid #16a34a;}
.badge-red{background:#1f0c0c;color:var(--red);border:1px solid #991b1b;}
.badge-yellow{background:#1c1400;color:var(--yellow);border:1px solid #b45309;}
.badge-blue{background:#0c1a2e;color:var(--blue);border:1px solid #1d4ed8;}
.badge-purple{background:#1a0c2e;color:var(--purple);border:1px solid #7c3aed;}
.badge-cyan{background:#0c1e22;color:var(--cyan);border:1px solid #0891b2;}
.badge-gray{background:var(--bg3);color:var(--mu);border:1px solid var(--border2);}
.refresh-btn{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:6px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;}
.refresh-btn:hover{border-color:var(--red);color:var(--red);}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;}
.section-title{color:var(--mu);font-size:10px;text-transform:uppercase;letter-spacing:2px;}
.online-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:4px;box-shadow:0 0 5px var(--green);}
.offline-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--mu);margin-right:4px;}
.dist-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.dist-label{min-width:160px;color:var(--text);font-size:11px;}
.dist-bar-wrap{flex:1;background:var(--bg3);border-radius:2px;height:6px;}
.dist-bar{height:6px;border-radius:2px;}
.dist-count{min-width:36px;text-align:right;color:var(--mu);}
.search{background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:7px 12px;border-radius:4px;font-family:inherit;font-size:11px;width:240px;outline:none;}
.search:focus{border-color:var(--red);}
#toast{position:fixed;bottom:24px;right:24px;background:var(--bg3);border:1px solid var(--border2);padding:10px 18px;border-radius:6px;font-size:11px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:9999;}
/* expandable row */
.expand-row{display:none;background:var(--bg3);}
.expand-row.open{display:table-row;}
.expand-cell{padding:14px 16px;border-bottom:1px solid var(--border);}
.fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;}
.fp-item{background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:8px 10px;}
.fp-key{color:var(--mu);font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}
.fp-val{color:var(--text);font-size:11px;word-break:break-all;}
.fp-val.mono{font-family:'IBM Plex Mono',monospace;color:var(--cyan);}
</style>
</head>
<body>

<div class="top">
  <div>
    <div class="top-title">⛏ SUPER ADMIN PANEL</div>
    <div class="top-sub">xpl8 CTF — restricted access</div>
  </div>
  <div style="color:var(--mu);font-size:10px;" id="clock"></div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('stats')">📊 stats</button>
  <button class="tab" onclick="switchTab('visitors')">👁 all visitors</button>
  <button class="tab" onclick="switchTab('players')">🎮 live players</button>
  <button class="tab" onclick="switchTab('dist')">📈 distributions</button>
  <button class="tab" onclick="switchTab('chat')">💬 chat monitor</button>
</div>

<div id="pane-stats" class="pane active">
  <div id="stats-content" style="color:var(--mu);">loading...</div>
</div>

<div id="pane-visitors" class="pane">
  <div class="section-head">
    <div class="section-title">all visitors — historical log</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button id="vf-all"    onclick="setVisitorFilter('all')"    style="background:var(--bg3);border:1px solid var(--green);color:var(--green);font-family:inherit;font-size:10px;padding:4px 10px;border-radius:4px;cursor:pointer;">ALL</button>
      <button id="vf-online" onclick="setVisitorFilter('online')" style="background:var(--bg3);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:10px;padding:4px 10px;border-radius:4px;cursor:pointer;">ONLINE</button>
      <button id="vf-named"  onclick="setVisitorFilter('named')"  style="background:var(--bg3);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:10px;padding:4px 10px;border-radius:4px;cursor:pointer;">NAMED</button>
      <input class="search" id="visitor-search" placeholder="search ip / name / browser / gpu / ua..." oninput="filterVisitors()">
      <button class="refresh-btn" onclick="loadVisitors()">↺ refresh</button>
    </div>
  </div>
  <div id="visitors-content" style="color:var(--mu);">loading...</div>
</div>

<div id="pane-players" class="pane">
  <div class="section-head">
    <div class="section-title">currently active players</div>
    <button class="refresh-btn" onclick="loadPlayers()">↺ refresh</button>
  </div>
  <div id="players-content" style="color:var(--mu);">loading...</div>
</div>

<div id="pane-dist" class="pane">
  <div id="dist-content" style="color:var(--mu);">loading...</div>
</div>

<div id="pane-chat" class="pane">
  <div class="section-head">
    <div class="section-title">chat monitor & control</div>
    <button class="refresh-btn" onclick="loadChat()">↺ refresh</button>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
    <div style="flex:1;min-width:260px;">
      <div class="section-title" style="margin-bottom:8px;">public chat</div>
      <div id="chat-public" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;height:320px;overflow-y:auto;padding:10px;font-size:11px;display:flex;flex-direction:column;gap:6px;"></div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input class="search" id="chat-pub-input" placeholder="broadcast to public chat..." style="flex:1;">
        <button class="refresh-btn" onclick="adminSendPublic()">send</button>
      </div>
    </div>
    <div style="flex:1;min-width:260px;">
      <div class="section-title" style="margin-bottom:8px;">private rooms</div>
      <div id="chat-rooms" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;height:160px;overflow-y:auto;padding:8px;font-size:11px;"></div>
      <div class="section-title" style="margin:10px 0 8px;">room messages</div>
      <div id="chat-room-msgs" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;height:140px;overflow-y:auto;padding:8px;font-size:11px;"></div>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
const PASS = new URLSearchParams(location.search).get('p') || sessionStorage.getItem('sa_pass') || '';
if (PASS) sessionStorage.setItem('sa_pass', PASS);
if (location.search) history.replaceState({}, '', location.pathname);

const hdr = () => ({ 'x-super-admin': PASS });

function toast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.color = ok ? '#6ee7a0' : '#f87171';
  t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 2500);
}

function switchTab(name) {
  const names = ['stats','visitors','players','dist','chat'];
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', names[i] === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-'+name).classList.add('active');
  if (name === 'stats' || name === 'dist') loadStats();
  if (name === 'visitors') loadVisitors();
  if (name === 'players') loadPlayers();
  if (name === 'chat') loadChat();
}

function fmtAgo(sec) {
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.floor(sec/60) + 'm ago';
  if (sec < 86400) return Math.floor(sec/3600) + 'h ago';
  return Math.floor(sec/86400) + 'd ago';
}
function fmtTime(ts) { return new Date(ts).toLocaleString('en-GB'); }
function esc(s) { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function dash(v) { return v ? esc(v) : '<span style="color:var(--mu2)">—</span>'; }

let _statsCache = null;
async function loadStats() {
  const r = await fetch('/api/superadmin/stats', { headers: hdr() });
  if (!r.ok) { toast('auth failed'); return; }
  const d = await r.json();
  _statsCache = d;

  document.getElementById('stats-content').innerHTML = \`
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">\${d.totalVisitors}</div><div class="stat-label">all visitors ever</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--green)">\${d.liveNow}</div><div class="stat-label">live now (last 5m)</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--blue)">\${d.activeSessions}</div><div class="stat-label">active sessions</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--yellow)">\${d.bannedCount}</div><div class="stat-label">banned tokens</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--cyan)">\${d.cpu ? d.cpu.usagePercent+'%' : '—'}</div><div class="stat-label">cpu load (\${d.cpu ? d.cpu.cores : '?'} cores · 1m avg)</div></div>
      <div class="stat"><div class="stat-val" style="color:var(--purple)">\${d.mem ? d.mem.usedPct+'%' : '—'}</div><div class="stat-label">ram used (\${d.mem ? d.mem.totalMB+'MB total' : '?'})</div></div>
    </div>
    <div style="color:var(--mu);font-size:10px;margin-top:8px;">last refreshed: \${new Date().toLocaleTimeString()}</div>
  \`;
  renderDist(d);
}

function renderDist(d) {
  const section = (title, obj, color) => {
    const entries = Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]);
    if (!entries.length) return '';
    const max = entries[0][1] || 1;
    return \`<div style="margin-bottom:28px;">
      <div class="section-title" style="margin-bottom:12px;">\${title}</div>
      \${entries.map(([k,v])=>\`
        <div class="dist-row">
          <div class="dist-label">\${esc(k)||'unknown'}</div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="width:\${Math.round(v/max*100)}%;background:\${color};"></div></div>
          <div class="dist-count">\${v}</div>
        </div>\`).join('')}
    </div>\`;
  };
  document.getElementById('dist-content').innerHTML =
    section('Device Types',    d.devices,  '#f87171') +
    section('Operating Systems', d.oses,   '#60a5fa') +
    section('Browsers',        d.browsers, '#c084fc') +
    section('Countries',       d.countries,'#22d3ee') +
    section('Timezones',       d.timezones,'#6ee7a0') +
    section('Screen Sizes',    d.screens,  '#fcd34d');
}

let _allVisitors = [];
async function loadVisitors() {
  document.getElementById('visitors-content').innerHTML = '<span style="color:var(--mu)">loading...</span>';
  const r = await fetch('/api/superadmin/visitors', { headers: hdr() });
  if (!r.ok) { toast('auth failed'); return; }
  const d = await r.json();
  _allVisitors = d.visitors;
  renderVisitors(_allVisitors);
}

let _visitorFilter = 'all';
function filterVisitors() {
  const q = (document.getElementById('visitor-search').value||'').toLowerCase();
  let list = _allVisitors;
  // Apply mode filter
  if (_visitorFilter === 'online') list = list.filter(v => v.online);
  if (_visitorFilter === 'named') list = list.filter(v => v.name && v.name !== 'anonymous' && v.name !== '');
  if (!q) return renderVisitors(list);
  renderVisitors(list.filter(v =>
    String(v.ip).includes(q) ||
    String(v.name||'').toLowerCase().includes(q) ||
    String(v.country||'').toLowerCase().includes(q) ||
    String(v.city||'').toLowerCase().includes(q) ||
    String(v.os||'').toLowerCase().includes(q) ||
    String(v.browser||'').toLowerCase().includes(q) ||
    String(v.device||'').toLowerCase().includes(q) ||
    String(v.gpu||'').toLowerCase().includes(q) ||
    String(v.isp||'').toLowerCase().includes(q) ||
    String(v.timezone||'').toLowerCase().includes(q) ||
    String(v.ua||'').toLowerCase().includes(q) ||
    String(v.referer||'').toLowerCase().includes(q)
  ));
}
function setVisitorFilter(mode) {
  _visitorFilter = mode;
  ['vf-all','vf-online','vf-named'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.borderColor = id === 'vf-' + mode ? 'var(--green)' : 'var(--border2)';
    b.style.color = id === 'vf-' + mode ? 'var(--green)' : 'var(--text)';
  });
  filterVisitors();
}

function toggleExpand(id) {
  const row = document.getElementById('exp-'+id);
  if (row) row.classList.toggle('open');
}

function renderVisitors(list) {
  if (!list.length) {
    document.getElementById('visitors-content').innerHTML = '<span style="color:var(--mu)">no visitors yet.</span>';
    return;
  }
  document.getElementById('visitors-content').innerHTML = \`
    <div style="color:var(--mu);margin-bottom:12px;font-size:10px;">\${list.length} result(s) — click row to expand fingerprint</div>
    <table>
      <thead><tr>
        <th>#</th>
        <th>status</th>
        <th>ip</th>
        <th>name</th>
        <th>country</th>
        <th>city</th>
        <th>isp</th>
        <th>os</th>
        <th>browser</th>
        <th>device</th>
        <th>screen</th>
        <th>platform</th>
        <th>cores</th>
        <th>RAM</th>
        <th>touch</th>
        <th>timezone</th>
        <th>lang</th>
        <th>canvas fp</th>
        <th>webgl fp</th>
        <th>audio fp</th>
        <th>gpu</th>
        <th>page visible</th>
        <th>focus lost</th>
        <th>referrer</th>
        <th>stage</th>
        <th>score</th>
        <th>first seen</th>
        <th>last seen</th>
        <th>reqs</th>
      </tr></thead>
      <tbody>
        \${list.map(v => \`
          <tr style="cursor:pointer;" onclick="toggleExpand(\${v.id})">
            <td style="color:var(--mu)">\${v.id}</td>
            <td>\${v.online ? '<span class="online-dot"></span><span style="color:var(--green)">online</span>' : '<span class="offline-dot"></span><span style="color:var(--mu)">offline</span>'}</td>
            <td style="color:var(--yellow);font-weight:600;">\${esc(v.ip)}</td>
            <td style="color:var(--blue)">\${dash(v.name)}</td>
            <td>\${dash(v.country)}</td>
            <td style="color:var(--mu)">\${dash(v.city)}</td>
            <td style="color:var(--mu);max-width:120px;">\${dash(v.isp)}</td>
            <td>\${dash(v.os)}</td>
            <td>\${dash(v.browser)}</td>
            <td><span class="badge badge-purple">\${esc(v.device)||'?'}</span></td>
            <td style="color:var(--mu)">\${dash(v.screen)}</td>
            <td style="color:var(--mu)">\${dash(v.platform)}</td>
            <td style="color:var(--cyan);text-align:center;">\${dash(v.cores)}</td>
            <td style="color:var(--cyan);text-align:center;">\${v.ram ? esc(v.ram)+'GB' : '—'}</td>
            <td style="text-align:center;">\${v.touch ? '<span class="badge badge-green">yes</span>' : '<span class="badge badge-gray">no</span>'}</td>
            <td style="color:var(--mu)">\${dash(v.timezone)}</td>
            <td style="color:var(--mu)">\${esc((v.lang||'').slice(0,10))}</td>
            <td style="color:var(--cyan);font-family:monospace;">\${dash(v.canvasFp)}</td>
            <td style="color:var(--cyan);font-family:monospace;">\${dash(v.webglFp)}</td>
            <td style="color:var(--cyan);font-family:monospace;">\${dash(v.audioFp)}</td>
            <td style="color:var(--mu);max-width:120px;" title="\${esc(v.gpu)}">\${dash((v.gpu||'').slice(0,24))}</td>
            <td style="text-align:center;">\${v.pageVisible !== false ? '<span class="badge badge-green">yes</span>' : '<span class="badge badge-red">no</span>'}</td>
            <td style="color:\${(v.focusLost||0)>3?'var(--red)':'var(--mu)'};">\${v.focusLost||0}</td>
            <td style="color:var(--mu);max-width:100px;" title="\${esc(v.referer)}">\${dash((v.referer||'').slice(0,20))}</td>
            <td><span class="badge badge-blue">s\${v.stage||0}</span></td>
            <td style="color:var(--green)">\${v.score||0}</td>
            <td style="color:var(--mu)">\${fmtTime(v.firstSeen)}</td>
            <td style="color:var(--mu)">\${fmtAgo(v.seenAgo)}</td>
            <td style="color:var(--mu)">\${v.requestCount}</td>
          </tr>
          <tr class="expand-row" id="exp-\${v.id}">
            <td class="expand-cell" colspan="29">
              <div class="fp-grid">
                <div class="fp-item"><div class="fp-key">full ip</div><div class="fp-val">\${esc(v.ip)}</div></div>
                <div class="fp-item"><div class="fp-key">country</div><div class="fp-val">\${esc(v.country)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">city</div><div class="fp-val">\${esc(v.city)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">ISP</div><div class="fp-val">\${esc(v.isp)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">OS</div><div class="fp-val">\${esc(v.os)}</div></div>
                <div class="fp-item"><div class="fp-key">browser</div><div class="fp-val">\${esc(v.browser)}</div></div>
                <div class="fp-item"><div class="fp-key">device</div><div class="fp-val">\${esc(v.device)}</div></div>
                <div class="fp-item"><div class="fp-key">screen</div><div class="fp-val">\${esc(v.screen)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">platform</div><div class="fp-val">\${esc(v.platform)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">cores</div><div class="fp-val">\${esc(v.cores)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">RAM</div><div class="fp-val">\${v.ram ? esc(v.ram)+' GB' : '—'}</div></div>
                <div class="fp-item"><div class="fp-key">touch</div><div class="fp-val">\${v.touch ? 'yes' : 'no'}</div></div>
                <div class="fp-item"><div class="fp-key">timezone</div><div class="fp-val">\${esc(v.timezone)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">language</div><div class="fp-val">\${esc(v.lang)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">canvas fp</div><div class="fp-val mono">\${esc(v.canvasFp)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">webgl fp</div><div class="fp-val mono">\${esc(v.webglFp)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">audio fp</div><div class="fp-val mono">\${esc(v.audioFp)||'—'}</div></div>
                <div class="fp-item" style="grid-column:span 2;"><div class="fp-key">GPU</div><div class="fp-val">\${esc(v.gpu)||'—'}</div></div>
                <div class="fp-item"><div class="fp-key">page visible</div><div class="fp-val">\${v.pageVisible !== false ? 'yes' : 'no'}</div></div>
                <div class="fp-item"><div class="fp-key">focus lost count</div><div class="fp-val" style="color:\${(v.focusLost||0)>3?'var(--red)':'inherit'}">\${v.focusLost||0}</div></div>
                <div class="fp-item"><div class="fp-key">stage / score</div><div class="fp-val">\${v.stage||0} / \${v.score||0}</div></div>
                <div class="fp-item" style="grid-column:span 2;"><div class="fp-key">referrer</div><div class="fp-val">\${esc(v.referer)||'—'}</div></div>
                <div class="fp-item" style="grid-column:span 4;"><div class="fp-key">user-agent</div><div class="fp-val" style="font-size:10px;">\${esc(v.ua)}</div></div>
              </div>
            </td>
          </tr>
        \`).join('')}
      </tbody>
    </table>
  \`;
}

let _playersData = [];
async function loadPlayers() {
  document.getElementById('players-content').innerHTML = '<span style="color:var(--mu)">loading...</span>';
  const r = await fetch('/api/superadmin/players', { headers: hdr() });
  if (!r.ok) { toast('auth failed'); return; }
  const d = await r.json();
  _playersData = d.players || [];

  const unknownCount = _playersData.filter(p => !p.name || p.name === 'anonymous' || p.name === '').length;
  const nc = {};
  _playersData.forEach(p => { const k=(p.name||'anonymous').toLowerCase(); nc[k]=(nc[k]||0)+1; });
  const dupeCount = _playersData.filter(p => nc[(p.name||'anonymous').toLowerCase()] > 1).length;

  document.getElementById('players-content').innerHTML = \`
    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:10px;color:var(--mu);letter-spacing:2px;">FILTER:</span>
      <button id="pf-all"     onclick="applyPlayerFilter('all')"     style="background:var(--bg3);border:1px solid var(--green);color:var(--green);font-family:inherit;font-size:10px;padding:4px 12px;border-radius:4px;cursor:pointer;letter-spacing:1px;">ALL (\${_playersData.length})</button>
      <button id="pf-named"   onclick="applyPlayerFilter('named')"   style="background:var(--bg3);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:10px;padding:4px 12px;border-radius:4px;cursor:pointer;letter-spacing:1px;">NAMED (\${_playersData.length - unknownCount})</button>
      <button id="pf-unknown" onclick="applyPlayerFilter('unknown')" style="background:rgba(255,170,34,.1);border:1px solid rgba(255,170,34,.4);color:#ffaa22;font-family:inherit;font-size:10px;padding:4px 12px;border-radius:4px;cursor:pointer;letter-spacing:1px;">UNNAMED (\${unknownCount})</button>
      <button id="pf-dupes"   onclick="applyPlayerFilter('dupes')"   style="background:rgba(255,68,102,.1);border:1px solid rgba(255,68,102,.4);color:#ff4466;font-family:inherit;font-size:10px;padding:4px 12px;border-radius:4px;cursor:pointer;letter-spacing:1px;">DUPLICATES (\${dupeCount})</button>
    </div>
    <div id="players-tbl"></div>\`;
  applyPlayerFilter('all');
}

function applyPlayerFilter(mode) {
  let filtered = _playersData;
  if (mode === 'unknown') filtered = _playersData.filter(p => !p.name || p.name === 'anonymous' || p.name === '');
  if (mode === 'named')   filtered = _playersData.filter(p => p.name && p.name !== 'anonymous' && p.name !== '');
  if (mode === 'dupes') {
    const c = {};
    _playersData.forEach(p => { const k=(p.name||'anonymous').toLowerCase(); c[k]=(c[k]||0)+1; });
    filtered = _playersData.filter(p => c[(p.name||'anonymous').toLowerCase()] > 1);
  }
  ['all','named','unknown','dupes'].forEach(m => {
    const b = document.getElementById('pf-'+m);
    if (b) b.style.borderColor = m === mode ? 'var(--green)' : (m==='unknown'?'rgba(255,170,34,.4)':m==='dupes'?'rgba(255,68,102,.4)':'var(--border2)');
  });
  const tbl = document.getElementById('players-tbl'); if (!tbl) return;
  if (!filtered.length) { tbl.innerHTML = '<span style="color:var(--mu)">no players match.</span>'; return; }
  const nc2 = {};
  filtered.forEach(p => { const k=(p.name||'anonymous').toLowerCase(); nc2[k]=(nc2[k]||0)+1; });
  const rows = filtered.map(p => {
    const k=(p.name||'anonymous').toLowerCase();
    const isDup=nc2[k]>1, isUnk=!p.name||p.name==='anonymous'||p.name==='';
    const rs=isUnk?'background:rgba(255,170,34,.04);':isDup?'background:rgba(255,68,102,.04);':'';    const db=isDup?\` <span style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(255,68,102,.15);color:#ff4466">×\${nc2[k]}</span>\`:'';    const ub=isUnk?\` <span style="font-size:9px;padding:2px 5px;border-radius:3px;background:rgba(255,170,34,.15);color:#ffaa22">unnamed</span>\`:'';    return \`<tr style="\${rs}">
      <td>\${p.online?'<span class="online-dot"></span><span style="color:var(--green)">online</span>':'<span class="offline-dot"></span><span style="color:var(--mu)">offline</span>'}</td>
      <td style="color:var(--blue)">\${esc(p.name)}\${db}\${ub}</td>
      <td style="color:var(--yellow)">\${esc(p.ip)}</td>
      <td>\${dash(p.country)}</td><td style="color:var(--mu)">\${dash(p.city)}</td>
      <td style="color:var(--mu)">\${dash(p.isp)}</td><td>\${dash(p.os)}</td><td>\${dash(p.browser)}</td>
      <td><span class="badge badge-purple">\${esc(p.device)||'?'}</span></td>
      <td style="color:var(--mu)">\${dash(p.screen)}</td><td style="color:var(--mu)">\${dash(p.platform)}</td>
      <td style="color:var(--cyan);text-align:center;">\${dash(p.cores)}</td>
      <td style="color:var(--cyan);text-align:center;">\${p.ram?esc(p.ram)+'GB':'—'}</td>
      <td style="text-align:center;">\${p.touch?'<span class="badge badge-green">yes</span>':'<span class="badge badge-gray">no</span>'}</td>
      <td style="color:var(--mu)">\${dash(p.timezone)}</td><td style="color:var(--mu)">\${esc((p.lang||'').slice(0,10))}</td>
      <td style="color:var(--cyan);font-family:monospace;">\${dash(p.canvasFp)}</td>
      <td style="color:var(--cyan);font-family:monospace;">\${dash(p.webglFp)}</td>
      <td style="color:var(--cyan);font-family:monospace;">\${dash(p.audioFp)}</td>
      <td style="color:var(--mu);" title="\${esc(p.gpu)}">\${dash((p.gpu||'').slice(0,20))}</td>
      <td style="text-align:center;">\${p.pageVisible!==false?'<span class="badge badge-green">yes</span>':'<span class="badge badge-red">no</span>'}</td>
      <td style="color:\${(p.focusLost||0)>3?'var(--red)':'var(--mu)'};">\${p.focusLost||0}</td>
      <td><span class="badge badge-blue">stage \${p.stage}</span></td>
      <td style="color:var(--green)">\${p.score}</td>
      <td style="color:\${p.lives<=1?'var(--red)':'var(--text)'}">\${p.lives}/\${p.maxLives}</td>
      <td style="color:var(--mu)">\${fmtAgo(Math.floor((Date.now()-p.lastSeen)/1000))}</td>
      <td style="color:var(--mu);font-size:10px;">\${p.token}</td>
    </tr>\`;
  }).join('');
  tbl.innerHTML = \`<table><thead><tr><th>status</th><th>name</th><th>ip</th><th>country</th><th>city</th><th>isp</th><th>os</th><th>browser</th><th>device</th><th>screen</th><th>platform</th><th>cores</th><th>RAM</th><th>touch</th><th>timezone</th><th>lang</th><th>canvas fp</th><th>webgl fp</th><th>audio fp</th><th>gpu</th><th>page visible</th><th>focus lost</th><th>stage</th><th>score</th><th>lives</th><th>last seen</th><th>token</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}


// ── Chat monitor JS ──
async function loadChat() {
  // Load public chat
  const pr = await fetch('/api/chat/admin/public', { headers: hdr() });
  if (pr.ok) {
    const pd = await pr.json();
    const el = document.getElementById('chat-public');
    el.innerHTML = pd.msgs.slice(-60).map(m => \`
      <div style="display:flex;gap:6px;align-items:start;\${m.deleted?'opacity:0.4':''}">
        <span style="color:var(--cyan);min-width:120px;">\${esc(m.alias)}</span>
        <span style="flex:1;color:\${m.deleted?'var(--mu)':'var(--text)'};">\${esc(m.text)}</span>
        \${!m.deleted?\`<button onclick="adminDelMsg(\${m.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:10px;padding:0 4px;">✕</button>\`:''}
      </div>
    \`).join('');
    el.scrollTop = el.scrollHeight;
  }
  // Load private rooms
  const rr = await fetch('/api/chat/admin/privates', { headers: hdr() });
  if (rr.ok) {
    const rd = await rr.json();
    document.getElementById('chat-rooms').innerHTML = rd.rooms.length ? rd.rooms.map(r => {
      // Extract the non-admin token
      const tokens = r.key.split(':');
      const playerToken = tokens.find(t => t !== '__admin__') || tokens[0];
      return \`
      <div style="cursor:pointer;padding:6px 8px;border-radius:4px;margin-bottom:4px;background:var(--bg3);border:1px solid var(--border);">
        <div onclick="loadRoom('\${esc(r.key)}')" style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:var(--blue)">\${esc(r.aliasA)}</span>
          <span style="color:var(--mu)">↔</span>
          <span style="color:var(--blue)">\${esc(r.aliasB)}</span>
          <span style="color:var(--mu)">\${r.count} msgs</span>
        </div>
        <div style="display:flex;gap:4px;">
          <input id="priv-input-\${esc(playerToken)}" placeholder="reply to player..." style="flex:1;background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:4px 8px;border-radius:3px;font-family:inherit;font-size:10px;outline:none;">
          <button onclick="adminSendPrivate('\${esc(playerToken)}')" style="background:var(--bg3);border:1px solid var(--border2);color:var(--green);padding:4px 10px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;">send</button>
        </div>
      </div>\`;
    }).join('') : '<span style="color:var(--mu)">no private rooms yet.</span>';
  }
}

async function loadRoom(key) {
  const r = await fetch(\`/api/chat/admin/private-room/\${encodeURIComponent(key)}\`, { headers: hdr() });
  if (!r.ok) return;
  const d = await r.json();
  const el = document.getElementById('chat-room-msgs');
  el.innerHTML = d.msgs.slice(-40).map(m => \`
    <div style="display:flex;gap:6px;align-items:start;\${m.deleted?'opacity:0.4':''}">
      <span style="color:var(--cyan);min-width:110px;">\${esc(m.alias)}</span>
      <span style="flex:1;color:\${m.deleted?'var(--mu)':'var(--text)'};">\${esc(m.text)}</span>
      \${!m.deleted?\`<button onclick="adminDelMsg(\${m.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:10px;padding:0 4px;">✕</button>\`:''}
    </div>
  \`).join('') || '<span style="color:var(--mu)">empty.</span>';
  el.scrollTop = el.scrollHeight;
}

async function adminDelMsg(id) {
  const r = await fetch(\`/api/chat/admin/message/\${id}\`, { method: 'DELETE', headers: hdr() });
  if (r.ok) { toast('message deleted', true); loadChat(); }
  else toast('delete failed');
}

async function adminSendPublic() {
  const input = document.getElementById('chat-pub-input');
  const text = input.value.trim();
  if (!text) return;
  const r = await fetch('/api/mod/broadcast', {
    method: 'POST',
    headers: { ...hdr(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, msgType: 'info' }),
  });
  if (!r.ok) { toast('send failed'); return; }
  input.value = '';
  loadChat();
  toast('broadcast sent', true);
}

async function adminSendPrivate(targetToken) {
  const input = document.getElementById('priv-input-' + targetToken);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const r = await fetch('/api/mod/message', {
    method: 'POST',
    headers: { ...hdr(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetToken, text, msgType: 'info' }),
  });
  if (!r.ok) { toast('send failed'); return; }
  input.value = '';
  loadChat();
  toast('message sent', true);
}

// Clock
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-GB');
}, 1000);

// Auto-refresh every 30s
setInterval(() => {
  const active = document.querySelector('.tab.active');
  if (active) active.click();
}, 30000);

// Initial load
loadStats();
</script>
</body>
</html>`;
}
// ── SUPER ADMIN ROUTES ──

// Auth check
app.get('/api/superadmin/auth', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'nope.' });
  res.json({ ok: true });
});

// All visitors (historical — never expires)
app.get('/api/superadmin/visitors', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'nope.' });
  const now = Date.now();
  const list = visitorLog.map(v => ({
    ...v,
    sessionTokens: v.sessionTokens.map(t => t.slice(0, 8) + '…'),
    online: (now - v.lastSeen) < 5 * 60 * 1000,
    seenAgo: Math.floor((now - v.lastSeen) / 1000),
  }));
  res.json({ total: list.length, visitors: list.reverse() }); // newest first
});

// Active players (live only — seen in last 5 minutes)
app.get('/api/superadmin/players', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'nope.' });
  const now = Date.now();
  const players = [];
  for (const [token, info] of playerRegistry) {
    if (now - info.lastSeen > 5 * 60 * 1000) continue; // live only
    const sess = sessions.get(token);
    if (!sess) continue;
    // Find visitor log entry for this token to get fp data
    const tokKey = 'tok|' + token;
    let fp = {};
    if (visitorIndex.has(tokKey)) {
      const v = visitorLog[visitorIndex.get(tokKey)];
      fp = {
        country: v.country||'', city: v.city||'', isp: v.isp||'',
        screen: v.screen||'', platform: v.platform||'', cores: v.cores||'',
        ram: v.ram||'', touch: v.touch||false, timezone: v.timezone||'',
        canvasFp: v.canvasFp||'', webglFp: v.webglFp||'', audioFp: v.audioFp||'',
        gpu: v.gpu||'', pageVisible: v.pageVisible, focusLost: v.focusLost||0,
        browser: v.browser||'', os: v.os||'', device: v.device||'',
        lang: v.lang||'', referer: v.referer||'',
      };
    }
    players.push({
      token: token.slice(0,8)+'…', fullToken: token,
      ip: info.ip, name: sess.name || 'anonymous',
      stage: sess.stage, lives: sess.lives, maxLives: sess.maxLives,
      score: sess.score, lastSeen: info.lastSeen,
      online: (now - info.lastSeen) < 5 * 60 * 1000,
      ...fp,
    });
  }
  res.json({ players });
});

// Stats summary
app.get('/api/superadmin/stats', (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'nope.' });
  const now = Date.now();
  // Live players = active session seen in last 5 minutes
  const liveNow = [...playerRegistry.values()].filter(p => now - p.lastSeen < 5 * 60 * 1000).length;
  const devices = {}, oses = {}, browsers = {}, countries = {}, timezones = {}, screens = {};
  for (const v of visitorLog) {
    devices[v.device||'unknown']   = (devices[v.device||'unknown']||0)+1;
    oses[v.os||'unknown']         = (oses[v.os||'unknown']||0)+1;
    browsers[v.browser||'unknown']= (browsers[v.browser||'unknown']||0)+1;
    if (v.country) countries[v.country] = (countries[v.country]||0)+1;
    if (v.timezone) timezones[v.timezone] = (timezones[v.timezone]||0)+1;
    if (v.screen) screens[v.screen] = (screens[v.screen]||0)+1;
  }
  // CPU load average (1m, 5m, 15m)
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const cpuPercent = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));
  const memTotal = os.totalmem();
  const memFree  = os.freemem();
  const memUsedPct = Math.round(((memTotal - memFree) / memTotal) * 100);

  res.json({
    totalVisitors: visitorLog.length,   // ALL visitors ever
    liveNow,                            // only currently active (last 5m)
    activeSessions: sessions.size,
    bannedCount: bannedTokens.size,
    cpu: { load1m: loadAvg[0].toFixed(2), load5m: loadAvg[1].toFixed(2), load15m: loadAvg[2].toFixed(2), cores: cpuCount, usagePercent: cpuPercent },
    mem: { totalMB: Math.round(memTotal/1024/1024), freeMB: Math.round(memFree/1024/1024), usedPct: memUsedPct },
    devices, oses, browsers, countries, timezones, screens,
  });
});

// ══════════════════════════════════════════════════════════════
// ── CHAT API ROUTES ──
// ══════════════════════════════════════════════════════════════

// Helper: is request from admin or superadmin?
function isAdminOrSuper(req) {
  return isMod(req) || isSuperAdmin(req);
}

// GET /api/chat/alias — get my anonymous alias
app.get('/api/chat/alias', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token)) return res.status(401).json({ error: 'no session.' });
  res.json({ alias: getChatAlias(token) });
});

// GET /api/chat/public — get public chat messages (last 100)
app.get('/api/chat/public', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token) && !isAdminOrSuper(req)) return res.status(401).json({ error: 'no session.' });
  const since = parseInt(req.query.since) || 0;
  const msgs = publicChat
    .filter(m => m.ts > since)
    .map(m => ({
      id: m.id,
      alias: m.alias,
      text: m.deleted ? '[deleted]' : m.text,
      ts: m.ts,
      deleted: m.deleted,
      file: m.deleted ? null : (m.file || null),
      isMe: m.token === token,
    }));
  res.json({ msgs });
});

// POST /api/chat/public — send a message to public chat
app.post('/api/chat/public', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token)) return res.status(401).json({ error: 'no session.' });
  const { text, fileId } = req.body || {};
  if (!text && !fileId) return res.status(400).json({ error: 'empty message.' });
  let file = null;
  if (fileId && chatFiles.has(fileId)) {
    const f = chatFiles.get(fileId);
    if (f.uploader !== token) return res.status(403).json({ error: 'not your file.' });
    file = { id: fileId, name: f.name, mime: f.mime };
  }
  const msg = addPublicMsg(token, text || '', file);
  res.json({ ok: true, id: msg.id, alias: msg.alias, ts: msg.ts });
});

// DELETE /api/chat/public/:id — delete a public message
app.delete('/api/chat/public/:id', (req, res) => {
  const token = req.headers['x-session'] || '';
  const isAdmin = isAdminOrSuper(req);
  if (!sessions.has(token) && !isAdmin) return res.status(401).json({ error: 'no session.' });
  const id = parseInt(req.params.id);
  const msg = publicChat.find(m => m.id === id);
  if (!msg) return res.status(404).json({ error: 'not found.' });
  if (!isAdmin && msg.token !== token) return res.status(403).json({ error: 'not your message.' });
  msg.deleted = true;
  res.json({ ok: true });
});

// GET /api/chat/users — list online users (for starting private chat)
app.get('/api/chat/users', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token) && !isAdminOrSuper(req)) return res.status(401).json({ error: 'no session.' });
  const now = Date.now();
  const list = [];
  for (const [tok, info] of playerRegistry) {
    if (now - info.lastSeen > 5 * 60 * 1000) continue;
    if (tok === token) continue;
    list.push({ alias: getChatAlias(tok), token: tok, isAdmin: false });
  }
  // Add admin/superadmin as reachable targets
  list.push({ alias: 'MOD', token: '__mod__', isAdmin: true });
  res.json({ users: list });
});

// GET /api/chat/private/:targetToken — get private chat with someone
app.get('/api/chat/private/:targetToken', (req, res) => {
  const token = req.headers['x-session'] || '';
  const isAdmin = isAdminOrSuper(req);
  if (!sessions.has(token) && !isAdmin) return res.status(401).json({ error: 'no session.' });
  const targetToken = req.params.targetToken;
  const since = parseInt(req.query.since) || 0;
  const resolvedTarget = (targetToken === '__mod__') ? '__admin__' : targetToken;
  const key = chatRoomKey(token === '' ? '__admin__' : token, resolvedTarget);
  const room = (privateChats.get(key) || [])
    .filter(m => m.ts > since)
    .map(m => ({
      id: m.id,
      alias: m.alias,
      text: m.deleted ? '[deleted]' : m.text,
      ts: m.ts,
      deleted: m.deleted,
      file: m.deleted ? null : (m.file || null),
      isMe: m.from === token,
    }));
  res.json({ msgs: room });
});

// POST /api/chat/private/:targetToken — send private message
app.post('/api/chat/private/:targetToken', (req, res) => {
  const token = req.headers['x-session'] || '';
  const isAdmin = isAdminOrSuper(req);
  if (!sessions.has(token) && !isAdmin) return res.status(401).json({ error: 'no session.' });
  const targetToken = req.params.targetToken;
  const { text, fileId } = req.body || {};
  if (!text && !fileId) return res.status(400).json({ error: 'empty message.' });
  const senderToken = isAdmin ? '__admin__' : token;
  // Normalize __mod__ → __admin__ so messages land in the same room
  const resolvedTarget = (targetToken === '__mod__') ? '__admin__' : targetToken;
  // Validate target exists (skip for admin→anyone)
  if (!isAdmin && !sessions.has(resolvedTarget) && resolvedTarget !== '__admin__') {
    return res.status(404).json({ error: 'target not found.' });
  }
  let file = null;
  if (fileId && chatFiles.has(fileId)) {
    const f = chatFiles.get(fileId);
    file = { id: fileId, name: f.name, mime: f.mime };
  }
  const msg = addPrivateMsg(senderToken, resolvedTarget, text || '', file);
  res.json({ ok: true, id: msg.id, alias: msg.alias, ts: msg.ts });
});

// DELETE /api/chat/private/:targetToken/:id — delete a private message
app.delete('/api/chat/private/:targetToken/:id', (req, res) => {
  const token = req.headers['x-session'] || '';
  const isAdmin = isAdminOrSuper(req);
  if (!sessions.has(token) && !isAdmin) return res.status(401).json({ error: 'no session.' });
  const targetToken = req.params.targetToken;
  const id = parseInt(req.params.id);
  const senderToken = isAdmin ? '__admin__' : token;
  const key = chatRoomKey(senderToken, targetToken);
  const room = privateChats.get(key) || [];
  const msg = room.find(m => m.id === id);
  if (!msg) return res.status(404).json({ error: 'not found.' });
  if (!isAdmin && msg.from !== token) return res.status(403).json({ error: 'not your message.' });
  msg.deleted = true;
  res.json({ ok: true });
});

// POST /api/chat/upload — upload a file for sharing in chat
app.post('/api/chat/upload', (req, res) => {
  const token = req.headers['x-session'] || '';
  const isAdmin = isAdminOrSuper(req);
  if (!sessions.has(token) && !isAdmin) return res.status(401).json({ error: 'no session.' });
  const { name, mime, data } = req.body || {};
  if (!name || !data) return res.status(400).json({ error: 'missing file data.' });
  // Limit to 2MB base64
  if (data.length > 2 * 1024 * 1024 * 1.37) return res.status(413).json({ error: 'file too large (max 2MB).' });
  const fileId = uuidv4();
  const uploader = isAdmin ? '__admin__' : token;
  chatFiles.set(fileId, { name: String(name).slice(0, 128), mime: String(mime || 'application/octet-stream').slice(0, 64), data, uploader });
  // Expire after 24h
  setTimeout(() => chatFiles.delete(fileId), 24 * 3600 * 1000);
  res.json({ ok: true, fileId });
});

// GET /api/chat/file/:id — download a chat file
app.get('/api/chat/file/:id', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token) && !isAdminOrSuper(req)) return res.status(401).json({ error: 'no session.' });
  const f = chatFiles.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'file not found.' });
  res.json({ name: f.name, mime: f.mime, data: f.data });
});

// Admin: GET /api/chat/admin/public — see all public messages including deleted (with token info)
app.get('/api/chat/admin/public', (req, res) => {
  if (!isAdminOrSuper(req)) return res.status(403).json({ error: 'nope.' });
  const msgs = publicChat.map(m => ({
    id: m.id,
    alias: m.alias,
    tokenHint: m.token ? m.token.slice(0, 8) + '…' : '—',
    text: m.text,
    ts: m.ts,
    deleted: m.deleted,
    file: m.file || null,
  }));
  res.json({ msgs });
});

// Admin: GET /api/chat/admin/privates — list all private rooms
app.get('/api/chat/admin/privates', (req, res) => {
  if (!isAdminOrSuper(req)) return res.status(403).json({ error: 'nope.' });
  const rooms = [];
  for (const [key, msgs] of privateChats) {
    const [a, b] = key.split(':');
    rooms.push({
      key,
      aliasA: a === '__admin__' ? 'MOD' : getChatAlias(a),
      aliasB: b === '__admin__' ? 'MOD' : getChatAlias(b),
      count: msgs.length,
      lastTs: msgs.length ? msgs[msgs.length - 1].ts : 0,
    });
  }
  rooms.sort((a, b) => b.lastTs - a.lastTs);
  res.json({ rooms });
});

// Admin: GET /api/chat/admin/private-room/:key — read any private room
app.get('/api/chat/admin/private-room/:key', (req, res) => {
  if (!isAdminOrSuper(req)) return res.status(403).json({ error: 'nope.' });
  const room = privateChats.get(req.params.key) || [];
  res.json({ msgs: room });
});

// Admin: DELETE /api/chat/admin/message/:id — delete any message anywhere
app.delete('/api/chat/admin/message/:id', (req, res) => {
  if (!isAdminOrSuper(req)) return res.status(403).json({ error: 'nope.' });
  const id = parseInt(req.params.id);
  // Search public
  let msg = publicChat.find(m => m.id === id);
  if (msg) { msg.deleted = true; return res.json({ ok: true, where: 'public' }); }
  // Search all private rooms
  for (const room of privateChats.values()) {
    msg = room.find(m => m.id === id);
    if (msg) { msg.deleted = true; return res.json({ ok: true, where: 'private' }); }
  }
  res.status(404).json({ error: 'not found.' });
});

// Player → Admin: POST /api/chat/contact-admin — player sends message to admin
app.post('/api/chat/contact-admin', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token)) return res.status(401).json({ error: 'no session.' });
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'empty.' });
  const msg = addPrivateMsg(token, '__admin__', text);
  res.json({ ok: true, id: msg.id, alias: msg.alias });
});

// Player polls for admin replies: GET /api/chat/admin-inbox
app.get('/api/chat/admin-inbox', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token)) return res.status(401).json({ error: 'no session.' });
  const since = parseInt(req.query.since) || 0;
  const key = chatRoomKey(token, '__admin__');
  const room = (privateChats.get(key) || [])
    .filter(m => m.ts > since)
    .map(m => ({
      id: m.id,
      alias: m.alias,
      text: m.deleted ? '[deleted]' : m.text,
      ts: m.ts,
      deleted: m.deleted,
      isMe: m.from === token,
    }));
  res.json({ msgs: room });
});

// ── GET /api/chat/unread — get unread message count for background polling ──
app.get('/api/chat/unread', (req, res) => {
  const token = req.headers['x-session'] || '';
  if (!sessions.has(token)) return res.status(401).json({ error: 'no session.' });
  const since = parseInt(req.query.since) || 0;
  // Count new public messages
  const pubCount = publicChat.filter(m => m.ts > since && !m.deleted && m.token !== token).length;
  // Count new messages in all private rooms involving this token
  let privCount = 0;
  const privRooms = {};
  for (const [key, msgs] of privateChats) {
    if (!key.includes(token) && !key.includes('__admin__')) continue;
    const newMsgs = msgs.filter(m => m.ts > since && !m.deleted && m.from !== token);
    if (newMsgs.length) {
      privCount += newMsgs.length;
      // Find the other party
      const other = key.split(':').find(t => t !== token) || '__admin__';
      privRooms[other] = (privRooms[other] || 0) + newMsgs.length;
    }
  }
  res.json({ pubCount, privCount, privRooms, total: pubCount + privCount });
});

// ── CATCH-ALL (must be last) ──
// Super admin panel — served only when correct password sent via header
// Client-side can NEVER discover this page without knowing the password
app.get('/panel', (req, res) => {
  // Check via query param (only used in initial load, then switches to header auth)
  const pass = req.query.p || req.headers['x-super-admin'];
  if (pass !== SUPER_ADMIN_PASS) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.send(getSuperAdminHTML());
});
// ── POST /api/konami ──
app.post('/api/konami', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ error: 'no session.' });
  sess.lives = Math.min(99, sess.lives + 10);
  sess.maxLives = Math.max(sess.maxLives, sess.lives);
  sess.konamiBonus = (sess.konamiBonus || 0) + 10;
  res.json({ ok: true, lives: sess.lives, maxLives: sess.maxLives });
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});
app.listen(PORT,()=>{console.log(`\n⛏  CTF → http://localhost:${PORT}\n`);});
