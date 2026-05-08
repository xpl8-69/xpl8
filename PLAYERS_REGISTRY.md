/* ═══════════════════════════════════════════════════════════════
   PLAYERS_REGISTRY.md
   ⚠️  THIS FILE IS NOT SERVED BY THE SERVER ⚠️
   Not reachable via any API, URL, or admin panel.
   Only accessible to whoever has direct access to the server files.
   The super admin panel does NOT expose this file.

   HOW TO READ:
   This is a snapshot format. Live data is in server memory (visitorLog).
   To export live data as JSON, run from server console:
     node -e "const s=require('./server'); console.log(JSON.stringify(s.dumpVisitors(),null,2))"

   FIELDS:
   id          — sequential visitor number
   name        — player-entered name (may be 'anonymous' or blank)
   ip          — raw IP address
   os          — detected OS from UA
   browser     — detected browser + version
   device      — Desktop / iPhone / Android Phone / etc.
   screen      — reported screen resolution
   country     — geo IP country
   city        — geo IP city
   isp         — ISP name
   timezone    — browser timezone
   lang        — Accept-Language header
   canvasFp    — canvas fingerprint hash
   webglFp     — webGL fingerprint hash
   audioFp     — audio fingerprint hash
   gpu         — GPU renderer string
   stage       — last known challenge stage (1–12)
   score       — last known score
   lives       — lives remaining at last seen
   firstSeen   — Unix timestamp of first visit
   lastSeen    — Unix timestamp of last activity
   sessionTokens — list of session token prefixes (truncated)
   requestCount— total API requests made
   focusLost   — times player left the tab
   pageVisible — was tab visible last check
   referer     — HTTP referer if any

   NOTES:
   - "anonymous" / blank names = player skipped the name screen or entered nothing
   - Multiple entries with same name = different sessions or different people using same name
   - High focusLost = player may be looking up answers or cheating
   - Duplicate canvasFp + webglFp = almost certainly the same device

   ── LIVE DATA IS IN SERVER MEMORY ──
   This file documents the schema only.
   Actual player records are stored in the runtime `visitorLog` array in server.js.
   They persist only as long as the server process is running (no database).

   To get a snapshot of current visitors while server is running:
     curl -H "x-super-admin: mahmoud is a fucker" http://localhost:3000/api/superadmin/visitors
   
   ── ACCESS CONTROL ──
   /api/superadmin/visitors  → requires x-super-admin header (SUPER_ADMIN_PASS)
   /api/superadmin/players   → requires x-super-admin header (live players only)
   /api/mod/players          → requires x-mod-secret header (limited view)
   THIS FILE                 → only accessible via server filesystem (you're reading it now)

═══════════════════════════════════════════════════════════════ */

// No actual data stored here at rest — live data only exists in server memory.
// See server.js visitorLog array and /api/superadmin/visitors endpoint.
