// ═══════════════════════════════════════════════
//  CTF SERVER — built by 0x69erツ
//  All sensitive data server-side only.
// ═══════════════════════════════════════════════

const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { createCanvas } = require('canvas');
const cookieParser = require('cookie-parser');
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

// ═══════════════════════════════════════════════
//  SESSIONS
// ═══════════════════════════════════════════════
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

// ═══════════════════════════════════════════════
//  ANSWERS & FLAG — server only, never in client
// ═══════════════════════════════════════════════
const ANSWERS = {
  1: 'VAULT',
  2: 'SHIELD',
  3: 'STORM',
  4: 'DECODE',
};
const FLAG = 'FLAG{5k1ll_1ssu3_but_y0u_m4d3_1t}';
const JWT_SECRET = 'secret123';
const TOTP_CODE  = '133337';

// ═══════════════════════════════════════════════
//  JWT helpers (no jsonwebtoken dep needed)
// ═══════════════════════════════════════════════
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function parseB64(str) {
  return JSON.parse(Buffer.from(str.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
}
const crypto = require('crypto');
function signHS256(header, payload) {
  const data = b64url(header) + '.' + b64url(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return data + '.' + sig;
}
function verifyJWT(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header  = parseB64(parts[0]);
    const payload = parseB64(parts[1]);
    // Vulnerability: accepts alg=none
    if (header.alg === 'none') return payload;
    // Normal HS256
    const expected = signHS256(header, payload).split('.')[2];
    if (parts[2] === expected) return payload;
    return null;
  } catch(e) { return null; }
}

// ═══════════════════════════════════════════════
//  IMAGE GENERATORS
// ═══════════════════════════════════════════════
function drawBase(W, H, borderColor) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = borderColor||'#00C8FF'; ctx.lineWidth=2;
  ctx.strokeRect(8,8,W-16,H-16);
  return { canvas, ctx };
}

function genStage1Image() {
  const {canvas,ctx} = drawBase(600,280,'#00C8FF');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ SKIN VAULT — COLOR LOCK ]',18,36);
  const hexes=['#56','#41','#55','#4C','#54'];
  const sc=['#8B0000','#006400','#008000','#004080','#004040'];
  hexes.forEach((h,i)=>{
    const x=20+i*104;
    ctx.fillStyle=sc[i]; ctx.fillRect(x,60,96,80);
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.strokeRect(x,60,96,80);
    ctx.font='bold 16px monospace'; ctx.fillStyle='#F5C518'; ctx.fillText(h,x+22,165);
    ctx.font='11px monospace'; ctx.fillStyle='rgba(0,200,255,0.6)';
    ctx.fillText('hex→dec',x+14,182); ctx.fillText('→ascii',x+20,196);
  });
  ctx.font='12px monospace'; ctx.fillStyle='rgba(180,210,255,0.5)';
  ctx.fillText('parseInt("HEX",16) → decimal → String.fromCharCode(n)',18,252);
  ctx.fillText('Combine all 5 characters → UPPERCASE',18,268);
  return canvas.toBuffer('image/png');
}

function genStage2Image() {
  const {canvas,ctx} = drawBase(600,320,'#00C8FF');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ MAP SEED — BINARY GRID ]',18,36);
  const rows=['01010011','01001000','01001001','01000101','01001100','01000100'];
  rows.forEach((bits,i)=>{
    const y=68+i*36;
    ctx.font='11px monospace'; ctx.fillStyle='rgba(0,200,255,0.5)'; ctx.fillText(`ROW ${i+1}:`,18,y);
    bits.split('').forEach((bit,j)=>{
      ctx.font='bold 18px monospace';
      ctx.fillStyle=bit==='1'?'#F5C518':'rgba(0,200,255,0.25)';
      ctx.fillText(bit,90+j*26,y);
    });
    ctx.font='14px monospace'; ctx.fillStyle='#C84BFF'; ctx.fillText('→  ?',310,y);
  });
  ctx.font='12px monospace'; ctx.fillStyle='rgba(180,210,255,0.5)';
  ctx.fillText('binary → decimal → ASCII  |  combine 6 chars → UPPERCASE',18,306);
  return canvas.toBuffer('image/png');
}

function genStage3Image() {
  const {canvas,ctx} = drawBase(600,260,'#C84BFF');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ FINAL BOSS — CHEST INSCRIPTION ]',18,36);
  ctx.font='bold 56px monospace'; ctx.fillStyle='#F5C518';
  ctx.shadowColor='rgba(245,197,24,0.6)'; ctx.shadowBlur=18;
  ctx.fillText('TYVAZ',140,118); ctx.shadowBlur=0;
  ['STEP 1 — The word was reversed before being carved',
   'STEP 2 — Then Caesar +7 was applied on top',
   'To decode: undo Caesar first (shift -7), then reverse'
  ].forEach((s,i)=>{
    ctx.font='12px monospace';
    ctx.fillStyle=i===2?'rgba(0,200,255,0.7)':'rgba(180,210,255,0.6)';
    ctx.fillText(s,18,152+i*22);
  });
  ctx.font='11px monospace'; ctx.fillStyle='rgba(200,75,255,0.5)';
  ctx.fillText('"TYVAZ".replace(/[A-Z]/g,c=>String.fromCharCode((c.charCodeAt(0)-65-7+26)%26+65))',18,234);
  ctx.fillText('Then reverse the result → UPPERCASE',18,250);
  return canvas.toBuffer('image/png');
}

function genStage4Image() {
  const {canvas,ctx} = drawBase(600,310,'#00FF85');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ DEOBFUSCATE THE SCRIPT ]',18,36);
  ctx.font='11px monospace'; ctx.fillStyle='rgba(0,255,133,0.85)';
  const lines=[
    'var _$=['+'\\x44\\x45'+'','+'\\x43\\x4F'+'','+'\\x44\\x45'+'];',
    '(function(a,b){',
    '  var c=function(d){while(--d){a.push(a.shift());}};',
    '  c(++b);',
    '})(_$,0x2);',
    'var _get=function(i){return _$[i];};',
    '',
    '// Part 1: _get(0)  →  ??',
    '// Part 2: _get(1)  →  ??',
    '// Part 3: _get(2)  →  ??',
    '',
    '// Hint: \\x44=D \\x45=E \\x43=C \\x4F=O',
    '// Combine Part1+Part2+Part3 → UPPERCASE word',
  ];
  lines.forEach((l,i)=>{ ctx.fillText(l,18,62+i*18); });
  return canvas.toBuffer('image/png');
}

function genStage5Image() {
  const {canvas,ctx} = drawBase(600,300,'#F5C518');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ JWT AUTH CHALLENGE ]',18,36);
  ctx.font='12px monospace'; ctx.fillStyle='rgba(180,210,255,0.85)';
  const lines=[
    'You received a JWT cookie: ctf_jwt',
    'Open Cookie Editor → copy the token value',
    'Go to jwt.io → paste the token → read the payload',
    '',
    'Payload looks like:',
    '  { "role": "guest", "user": "player" }',
    '',
    'The server only gives the flag to role: "admin"',
    'The JWT uses a weak secret — try to crack it,',
    'or use the known algorithm weakness.',
    '',
    'Change role to admin → send the new token → claim flag',
  ];
  lines.forEach((l,i)=>{ ctx.fillText(l,18,62+i*20); });
  return canvas.toBuffer('image/png');
}

function genStage6Image() {
  const {canvas,ctx} = drawBase(600,280,'#C84BFF');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ 2FA BYPASS CHALLENGE ]',18,36);
  ctx.font='12px monospace'; ctx.fillStyle='rgba(180,210,255,0.85)';
  const lines=[
    'A login endpoint is protected by 2FA.',
    'Endpoint: POST /api/zone6/verify',
    '',
    'Normal request body:',
    '  { "code": "123456" }',
    '',
    'The developer added a debug parameter',
    'that was never removed from production.',
    '',
    'Find the hidden parameter that bypasses 2FA.',
    'Hint: think about what devs use during testing...',
  ];
  lines.forEach((l,i)=>{ ctx.fillText(l,18,62+i*19); });
  return canvas.toBuffer('image/png');
}

function genStage7Image() {
  const {canvas,ctx} = drawBase(600,290,'#FF4455');
  ctx.font='bold 13px monospace'; ctx.fillStyle='#F5C518';
  ctx.fillText('[ AUTHENTICATION BYPASS ]',18,36);
  ctx.font='12px monospace'; ctx.fillStyle='rgba(180,210,255,0.85)';
  const lines=[
    'A login form exists at /zone7',
    'Endpoint: POST /api/zone7/login',
    'Body: { "username": "...", "password": "..." }',
    '',
    'The backend builds its query like this:',
    "  \"SELECT * FROM users WHERE",
    "   username='\" + input + \"'\"",
    '',
    'The developer forgot to sanitize input.',
    'Use a classic injection to bypass authentication.',
    "Classic payload example: admin'--",
  ];
  lines.forEach((l,i)=>{ ctx.fillText(l,18,62+i*19); });
  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════
//  API — Zones 1-4
// ═══════════════════════════════════════════════
app.post('/api/init',(req,res)=>{
  const token=makeSession();
  res.json({token,stage:1});
});

app.get('/api/state',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'No session.'});
  res.json({stage:sess.stage,solved:sess.solved});
});

app.get('/api/clue/:stage',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'No session.'});
  const n=parseInt(req.params.stage);
  if(n<1||n>7||n>sess.stage) return res.status(403).end();
  let buf;
  try{
    if(n===1) buf=genStage1Image();
    else if(n===2) buf=genStage2Image();
    else if(n===3) buf=genStage3Image();
    else if(n===4) buf=genStage4Image();
    else if(n===5) buf=genStage5Image();
    else if(n===6) buf=genStage6Image();
    else if(n===7) buf=genStage7Image();
  }catch(e){return res.status(500).json({error:'Image error.'});}
  res.set('Content-Type','image/png');
  res.set('Cache-Control','no-store');
  res.send(buf);
});

app.get('/api/hint/:stage',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'No session.'});
  const n=parseInt(req.params.stage);
  const hints={
    1:`parseInt("56",16)=86 → String.fromCharCode(86)="V"<br>Do all 5 hex values → combine → UPPERCASE`,
    2:`parseInt("01010011",2)=83 → "S"<br>Do all 6 rows → combine → UPPERCASE`,
    3:`<code>"TYVAZ".replace(/[A-Z]/g,c=>String.fromCharCode((c.charCodeAt(0)-65-7+26)%26+65))</code><br>Then reverse the result`,
    4:`The array is <code>["DE","CO","DE"]</code> after the shuffle.<br>\\x44=D \\x45=E \\x43=C \\x4F=O<br>Combine → UPPERCASE`,
    5:`Go to <a href="https://jwt.io" target="_blank">jwt.io</a> — paste your token.<br>Change role to <code>admin</code>, set alg to <code>none</code>, remove signature.<br>Format: <code>header.payload.</code> (empty signature)`,
    6:`Try adding <code>"skip2fa": ""</code> to the request body.<br>Use browser console or curl:<br><code>fetch('/api/zone6/verify',{method:'POST',headers:{'Content-Type':'application/json','x-session':token},body:JSON.stringify({skip2fa:""})})</code>`,
    7:`The username field is injectable.<br>Try: <code>admin'--</code> as username, anything as password.<br>This comments out the password check in the query.`,
  };
  res.json({html:hints[n]||''});
});

app.post('/api/check/:stage',(req,res)=>{
  const sess=getSession(req);
  if(!sess) return res.status(401).json({error:'No session.'});
  const n=parseInt(req.params.stage);
  if(sess.stage!==n) return res.status(400).json({error:'Wrong stage.'});
  sess.attempts++;
  const answer=(req.body.answer||'').trim().toUpperCase();
  if(answer===ANSWERS[n]){
    sess.solved.push(n);
    sess.stage=n+1;
    const msgs={1:'⛏ VAULT CRACKED! Zone 2 unlocked...',2:'🛡 SHIELD FOUND! Zone 3 loading...',3:'⚡ STORM UNLEASHED! Zone 4 loading...',4:'🟢 SCRIPT DECODED! Zone 5 loading...'};
    return res.json({correct:true,message:msgs[n]});
  }
  res.json({correct:false,message:'✘ Wrong. Try again.'});
});

// ═══════════════════════════════════════════════
//  ZONE 5 — JWT
// ═══════════════════════════════════════════════
app.post('/api/zone5/login',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'Complete previous zones first.'});
  const header={alg:'HS256',typ:'JWT'};
  const payload={role:'guest',user:'player',iat:Math.floor(Date.now()/1000)};
  const token=signHS256(header,payload);
  res.cookie('ctf_jwt',token,{httpOnly:false,path:'/'});
  res.json({message:'Logged in as guest. Admins only get the flag.',token});
});

app.post('/api/zone5/flag',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==5) return res.status(403).json({error:'Complete previous zones first.'});
  const token=req.cookies.ctf_jwt||req.body.token||req.headers['authorization']?.replace('Bearer ','');
  const decoded=verifyJWT(token);
  if(!decoded) return res.status(401).json({error:'Invalid token.'});
  if(decoded.role==='admin'){
    sess.solved.push(5); sess.stage=6;
    return res.json({correct:true,message:'🔑 JWT CRACKED! Zone 6 loading...'});
  }
  return res.status(403).json({error:'Guests not allowed. You need role: admin'});
});

// ═══════════════════════════════════════════════
//  ZONE 6 — 2FA Bypass
// ═══════════════════════════════════════════════
app.post('/api/zone6/verify',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==6) return res.status(403).json({error:'Complete previous zones first.'});
  const {code,skip2fa}=req.body;
  if(skip2fa!==undefined){
    sess.solved.push(6); sess.stage=7;
    return res.json({correct:true,message:'🛡 2FA BYPASSED! Zone 7 loading...'});
  }
  if(code===TOTP_CODE){
    sess.solved.push(6); sess.stage=7;
    return res.json({correct:true,message:'🛡 2FA PASSED! Zone 7 loading...'});
  }
  res.json({correct:false,message:'✘ Wrong 2FA code.'});
});

// ═══════════════════════════════════════════════
//  ZONE 7 — Auth Bypass (SQLi simulation)
// ═══════════════════════════════════════════════
app.post('/api/zone7/login',(req,res)=>{
  const sess=getSession(req);
  if(!sess||sess.stage!==7) return res.status(403).json({error:'Complete previous zones first.'});
  const {username='',password=''}=req.body;
  const sqli=[/'\s*--/,/'\s*OR\s*'1'\s*=\s*'1/i,/'\s*OR\s*1\s*=\s*1/i,/admin'\s*--/i,/'\s*#/];
  if(sqli.some(p=>p.test(username)||p.test(password))){
    sess.solved.push(7); sess.stage=8;
    return res.json({correct:true,flag:FLAG,message:'🏆 ALL ZONES CLEARED!'});
  }
  if(username==='admin'&&password==='Sup3r$ecretP@ss!'){
    sess.solved.push(7); sess.stage=8;
    return res.json({correct:true,flag:FLAG,message:'🏆 ALL ZONES CLEARED!'});
  }
  res.json({correct:false,message:'✘ Invalid credentials.'});
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT,()=>{ console.log(`\n⛏  CTF running → http://localhost:${PORT}\n`); });
