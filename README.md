# 0x69er-ctf

a web-based CTF with 7 zones. starts easy, gets nasty.
no handholding. figure it out.

---

## stack

- Node.js + Express
- clues are server-generated PNGs — nothing useful in the client
- flag only leaves the server when you earn it

---

## run it

```bash
npm install
node server.js
```

open `http://localhost:3000`

---

## zones

```
01  hex → ascii          [ easy   ]
02  binary → ascii       [ medium ]
03  caesar cipher        [ medium ]
04  js deobfuscation     [ medium ]
05  jwt manipulation     [ hard   ]
06  2fa bypass           [ hard   ]
07  auth bypass          [ hard   ]
```

---

## can you read the source?

yes. go ahead.

```
index.html   →  empty shell
main.js      →  just api calls
main.css     →  just styles
server.js    →  not served to the client
```

everything that matters lives on the server.
inspecting the client gets you nothing.

---

*built by 0x69erツ*
