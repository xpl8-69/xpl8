# CTF Challenge — built by 0x69erツ

## Setup
```bash
npm install
node server.js
# http://localhost:3000
```

## Security model
| What | Where | Visible in source? |
|------|-------|---------------------|
| FLAG | server.js only | ❌ No |
| Answers | server.js only | ❌ No |
| JWT secret | server.js only | ❌ No |
| 2FA code | server.js only | ❌ No |
| Clues | Generated as PNG server-side | ❌ No |
| HTML/JS/CSS | Empty shell + API calls only | ✅ Yes — useless |

## Zones
- Zone 01 — Hex → ASCII (EASY)
- Zone 02 — Binary → ASCII (MEDIUM)
- Zone 03 — Caesar -7 + Reverse (MEDIUM)
- Zone 04 — Deobfuscate JavaScript (MEDIUM)
- Zone 05 — JWT Auth (HARD)
- Zone 06 — 2FA Bypass (HARD)
- Zone 07 — Authentication Bypass (HARD)
