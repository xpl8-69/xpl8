// CTF SERVER — built by 0x69erツ
const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── BAN STORE ──
const bannedIPs = new Map();
const BAN_COOKIE = 'ctf_ban';

function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim());
    return ips[ips.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}
function isBanned(req) {
  const ip = getIP(req);
  if (!bannedIPs.has(ip)) return 0;
  const count = bannedIPs.get(ip);
  return count > 0 ? count : 0;
}
function banUser(req, res) {
  const ip = getIP(req);
  const prev = bannedIPs.get(ip) || 0;
  const count = prev + 1;
  bannedIPs.set(ip, count);
  res.cookie(BAN_COOKIE, String(count), { maxAge: 365*24*3600*1000, httpOnly: false, path:'/' });
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

app.use(express.static(path.join(__dirname, 'public')));
const limiter = rateLimit({
  windowMs: 10*60*1000,
  max: 200,
  message: { error: 'slow down.' },
  skip: (req) => {
    // Skip rate limit for mod requests (by secret header or body)
    const modSecret = req.headers['x-mod-secret'] || req.body?.modSecret;
    return modSecret === MOD_SECRET;
  }
});
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/mod/')) return next(); // no rate limit for mod routes
  limiter(req, res, next);
});

// ── SESSIONS ──
const sessions = new Map();
function makeSession(lives) {
  const token = uuidv4();
  sessions.set(token, {
    stage: 1, solved: [], attempts: 0, score: 0,
    hintsUsed: [], lives: lives||5, maxLives: lives||5,
    lastAnswer: null, sameAnswerCount: 0, spamCount: 0, caseSpamCount: 0,
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
const CHALLENGES = {
  1:{points:50,answer:'GHOST',hints:[{cost:10,text:'the output of each operation feeds into the next.'},{cost:15,text:'one of these operations is reversible by reading backwards.'}]},
  2:{points:75,answer:'CIPHER',hints:[{cost:15,text:'raw binary is not always what it seems. something was applied to each byte.'},{cost:20,text:'XOR is self-inverse. if you know the key, you can undo it.'}]},
  3:{points:100,answer:'SHADOW',hints:[{cost:20,text:'two layers. the outer one is just encoding, not encryption.'},{cost:25,text:'ROT13 applied after decoding the outer layer.'}]},
  4:{points:125,answer:'DELTA',hints:[{cost:20,text:'not everything visible on screen is the whole story.'},{cost:25,text:'the page source holds more than meets the eye. dots and dashes.'}]},
};
const RESOURCES = {
  '1':{owner:'guest',data:'nothing interesting here.'},
  '2':{owner:'admin',data:'admin_secret_token: Z3JFZW4='},
  '3':{owner:'guest',data:'also nothing.'},
};
function finalHash(sessionToken) {
  return crypto.createHash('sha256').update('0x69er'+sessionToken.slice(0,8)).digest('hex');
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
      if (sess.sameAnswerCount >= 2) return { code:'repeat' };
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
  const {resetFull, deathCount} = req.body||{};
  const dc = resetFull ? 0 : (parseInt(deathCount)||0);
  // lives = 5 - deathCount, but never below 1 until we decide to ban
  const lives = Math.max(1, 5 - dc);
  const token = makeSession(lives);
  registerPlayer(req, token);
  res.json({token, stage:1, lives, maxLives:lives, score:0});
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
      sess.solved.push(n);
      if(n===11){ sess.stage=12; sess.score+=200; return res.json({correct:true,score:sess.score,message:'+200 pts'}); }
      if(n===12){ sess.stage=13; sess.score+=150; return res.json({correct:true,finalWin:true,flag:FLAG,score:sess.score,maxScore:MAX_SCORE,message:'+150 pts — ALL CLEARED 🎯'}); }
    }
    sess.lives=Math.max(0,sess.lives-1);
    return res.json({correct:false,lives:sess.lives,message:'wrong flag.'});
  }

  const ch=CHALLENGES[n];
  if(!ch) return res.status(400).end();
  const analysis=analyzeAnswer(answer,ch.answer,sess);
  if(analysis.code==='empty')            return res.json({correct:false,code:'empty',message:"when u have no idea, u start trying shit. 💀"});
  if(analysis.code==='repeat')           return res.json({correct:false,code:'repeat',message:"Einstein once said : \"Insanity is doing the same thing over and over again and expecting different results\""});
  if(analysis.code==='sqli_wrong_place') return res.json({correct:false,code:'sqli',message:"that's not gonna work here. wrong challenge maybe? 👀"});
  if(analysis.code==='spam')             return res.json({correct:false,code:'spam',message:"now u're spamming shit. find a real answer. 💀"});
  if(analysis.code==='case')             return res.json({correct:false,wrongCase:true,message:"the letters should be capital btw 👀"});
  if(analysis.code==='case_spam')        return res.json({correct:false,wrongCase:true,message:"CAPS LOCK exists for a reason. use it."});
  if(analysis.code==='correct'){
    sess.solved.push(n); sess.stage=n+1; sess.score+=ch.points; sess.lastAnswer=null; sess.sameAnswerCount=0;
    return res.json({correct:true,score:sess.score,message:`+${ch.points} pts`});
  }
  sess.lives=Math.max(0,sess.lives-1);
  return res.json({correct:false,lives:sess.lives,message:'wrong.'});
});

// Clue routes
app.get('/api/c3clue',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==3) return res.status(403).end();
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
  if(!sess||sess.stage!==4) return res.status(403).end();
  res.set('Content-Type','text/html');
  res.send(`<!DOCTYPE html><html><head><title>maintenance</title></head>
<body style="background:#111;color:#555;font-family:monospace;padding:40px">
<p>nothing to see here.</p>
<!-- -.. . .-.. - ..- -->
</body></html>`);
});

app.post('/api/c5/token',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'not yet.'});
  const token=signHS256({alg:'HS256',typ:'JWT'},{role:'viewer',uid:42,iat:Math.floor(Date.now()/1000)});
  res.cookie('ctf_auth',token,{httpOnly:false,path:'/'});
  res.json({issued:true});
});
app.post('/api/c5/verify',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'not yet.'});
  const token=req.cookies.ctf_auth||req.body.token||'';
  const decoded=verifyJWT(token);
  if(!decoded) return res.status(401).json({error:'invalid token.'});
  if(decoded.role==='admin'){ sess.solved.push(5);sess.stage=6;sess.score+=150; return res.json({correct:true,score:sess.score,message:'+150 pts'}); }
  sess.lives=Math.max(0,sess.lives-1);
  return res.status(403).json({error:'insufficient role.',lives:sess.lives});
});

app.post('/api/c6/verify',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==6) return res.status(403).json({error:'not yet.'});
  const{code,debug}=req.body;
  if(debug!==undefined){ sess.solved.push(6);sess.stage=7;sess.score+=150; return res.json({correct:true,score:sess.score,message:'+150 pts'}); }
  if(code==='291847'){ sess.solved.push(6);sess.stage=7;sess.score+=150; return res.json({correct:true,score:sess.score,message:'+150 pts'}); }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives});
});

app.post('/api/c7/login',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==7) return res.status(403).json({error:'not yet.'});
  const{username='',password=''}=req.body;
  const sqli=[/'\s*--/,/'\s*OR\s*'1'\s*=\s*'1/i,/'\s*OR\s*1\s*=\s*1/i,/admin'\s*--/i,/'\s*#/,/'\s*\/\*/];
  if(sqli.some(p=>p.test(username)||p.test(password))){ sess.solved.push(7);sess.stage=8;sess.score+=175; return res.json({correct:true,score:sess.score,message:'+175 pts'}); }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives});
});

app.get('/api/c8/resource/:id',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==8) return res.status(403).json({error:'not yet.'});
  const r=RESOURCES[req.params.id];
  if(!r) return res.status(404).json({error:'not found.'});
  if(req.params.id==='2'){ sess.solved.push(8);sess.stage=9;sess.score+=175; return res.json({correct:true,data:r.data,score:sess.score,message:'+175 pts'}); }
  res.json({data:r.data});
});

app.get('/api/c9/profile',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==9) return res.status(403).json({error:'not yet.'});
  const roleCookie=req.cookies.c9_role;
  if(!roleCookie){ res.cookie('c9_role',Buffer.from('guest').toString('base64'),{httpOnly:false,path:'/'}); return res.json({role:'guest',message:'access level: guest'}); }
  try{
    const role=Buffer.from(roleCookie,'base64').toString('utf8');
    if(role==='superadmin'){ sess.solved.push(9);sess.stage=10;sess.score+=200; return res.json({correct:true,role,score:sess.score,message:'+200 pts'}); }
    res.json({role,message:`access level: ${role}`});
  }catch(e){res.json({error:'malformed cookie.'});}
});

app.post('/api/c10/gate',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==10) return res.status(403).json({error:'not yet.'});
  const sessionToken=req.headers['x-session']||'';
  const expected=finalHash(sessionToken);
  const{proof}=req.body;
  if(proof===expected){ sess.solved.push(10);sess.stage=11;sess.score+=250; return res.json({correct:true,score:sess.score,message:'+250 pts — gate cleared!'}); }
  sess.lives=Math.max(0,sess.lives-1);
  res.json({correct:false,lives:sess.lives});
});

app.get('/api/c10clue',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==10) return res.status(403).end();
  res.set('Content-Type','text/javascript');
  res.send(`!function(){
  var _a=["api","c10","gate"].join("/"),
  _b=["0x69er"].join(""),
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

// Ban endpoint
app.post('/api/ban',(req,res)=>{
  if (isMod(req)) return res.status(403).json({ error: 'mods cannot be banned.' });
  const count=banUser(req,res);
  res.json({banned:true,count});
});

// Unban endpoint (secret — use: POST /api/unban with body {ip:'x.x.x.x'} or just clears cookie)
app.post('/api/unban',(req,res)=>{
  const {ip:targetIP, secret}=req.body||{};
  if(secret!=='0x69er_admin_unban') return res.status(403).json({error:'wrong secret.'});
  if(targetIP && bannedIPs.has(targetIP)){
    bannedIPs.delete(targetIP);
    res.clearCookie(BAN_COOKIE,{path:'/'});
    return res.json({ok:true,message:`unban OK for ${targetIP}`});
  }
  // If no IP given, just clear cookie for current requester
  const selfIP=getIP(req);
  bannedIPs.delete(selfIP);
  res.clearCookie(BAN_COOKIE,{path:'/'});
  res.json({ok:true,message:`unban OK for ${selfIP}`});
});


app.listen(PORT,()=>{console.log(`\n⛏  CTF → http://localhost:${PORT}\n`);});

// ═══════════════════════════════════════════
// ── MOD SYSTEM ──
// ═══════════════════════════════════════════
const MOD_SECRET = 'Ma7m0ud_iS_n0t_g00d';

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
  playerRegistry.set(token, { ip, token, lastSeen: Date.now(), stage: sess.stage, lives: sess.lives, maxLives: sess.maxLives, score: sess.score });
}

// Middleware: refresh player registry on every API call
app.use('/api/', (req, res, next) => {
  refreshPlayer(req);
  next();
});

function isMod(req) {
  return (req.headers['x-mod-secret'] || req.body?.modSecret) === MOD_SECRET;
}

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
  sess.lives = n;
  sess.maxLives = Math.max(sess.maxLives, n);
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
  const q = modMsgQueue.get(targetToken) || [];
  q.push({ text: String(text).slice(0, 300), type: msgType || 'warn', from: 'mod', ts: Date.now() });
  modMsgQueue.set(targetToken, q);
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
  for (const [ip, count] of bannedIPs) {
    banned.push({ ip, count });
  }
  res.json({ banned });
});

// ── POST /api/mod/ban-player ──
app.post('/api/mod/ban-player', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { targetToken } = req.body || {};
  const info = playerRegistry.get(targetToken);
  if (!info) return res.status(404).json({ error: 'player not found.' });
  const ip = info.ip;
  const prev = bannedIPs.get(ip) || 0;
  bannedIPs.set(ip, prev + 1);
  // Push ban notification via token-based queue
  const q = modMsgQueue.get(targetToken) || [];
  q.push({ text: "u have been banned by the mod. get out.", type: 'err', from: 'mod', ts: Date.now(), ban: true });
  modMsgQueue.set(targetToken, q);
  res.json({ ok: true, ip, banCount: prev + 1 });
});

// ── POST /api/mod/ban-ip ──
app.post('/api/mod/ban-ip', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'missing ip.' });
  const prev = bannedIPs.get(ip) || 0;
  bannedIPs.set(ip, prev + 1);
  res.json({ ok: true, ip, banCount: prev + 1 });
});

// ── POST /api/mod/unban-ip ──
app.post('/api/mod/unban-ip', (req, res) => {
  if (!isMod(req)) return res.status(403).json({ error: 'nope.' });
  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'missing ip.' });
  bannedIPs.delete(ip);
  res.clearCookie('ctf_ban', { path: '/' });
  res.json({ ok: true, ip });
});

// ── CATCH-ALL (must be last) ──
app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});
