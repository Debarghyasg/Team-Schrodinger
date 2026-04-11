# SmartRetail — Full Architecture & Integration Playbook
## Cognizant Technoverse 2026 Alignment

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SMARTRETAIL SYSTEM                               │
├──────────────────┬──────────────────────┬───────────────────────────────┤
│   FRONTEND       │   NODE.JS GATEWAY    │    FASTAPI CORE ENGINE        │
│  HTML/CSS/JS     │   (Express)          │    (Python)                   │
│                  │                      │                               │
│  • login.html    │  • Auth routes       │  • /verify  (barcode logic)   │
│  • signup.html   │  • Session → Redis   │  • /match   (OCR result in)   │
│  • home.html     │  • Proxy to FastAPI  │  • /alert   (trigger emails)  │
│  • checkout.html │  • Nodemailer        │  • /inventory CRUD            │
│  • dashboard.html│  • SendGrid triggers │  • /audit-log                 │
└──────────────────┴──────────────┬───────┴───────────────┬───────────────┘
                                  │                       │
                        ┌─────────▼──────┐    ┌──────────▼──────────┐
                        │    REDIS        │    │   POSTGRESQL         │
                        │  • Sessions     │    │  • retailers         │
                        │  • Txn queue    │    │  • products          │
                        │  • Rate limits  │    │  • transactions      │
                        │  • Fraud flags  │    │  • audit_log         │
                        │  • Live locks   │    │  • fraud_incidents   │
                        └────────────────┘    └─────────────────────┘
                                  │
                        ┌─────────▼──────────────────────────────────┐
                        │         BARCODE HARDWARE INPUT              │
                        │   USB/Bluetooth HID Scanner → browser       │
                        │   keydown listener captures scan string     │
                        │   → POST /api/verify → Redis lock check     │
                        └────────────────────────────────────────────┘
```

---

## 2. HOW EACH TECH FITS — PRECISE ROLE MAP

### Frontend: HTML / CSS / JavaScript
| File | Role |
|---|---|
| `login.html` | Session-based auth UI → POST /api/login → Redis session |
| `signup.html` | Retailer onboarding → POST /api/register → Nodemailer welcome mail |
| `home.html` | Product image + barcode image upload → W3C BarcodeDetector → FastAPI verify |
| `checkout.html` | **HID barcode scanner input** → Redis transaction gate → approve/block UI |
| `dashboard.html` | Audit log viewer, fraud incident list, inventory CRUD |

### Node.js (Express) — Gateway Layer
```
Port 3000
├── Auth & Session (express-session → connect-redis → Redis)
├── Static file serving (EJS views)
├── Nodemailer — welcome email on signup
├── SendGrid webhook triggers — fraud alerts, daily digest
├── HTTP proxy to FastAPI (port 8000) for all /api/verify, /api/match
└── WebSocket (ws) — pushes real-time txn status to checkout UI
```

### FastAPI (Python) — Core Verification Engine
```
Port 8000
├── POST /verify
│     • Receives barcode string from scanner
│     • Queries PostgreSQL products table
│     • Returns: { found, product_name, price, quantity, risk_score }
│
├── POST /match
│     • Receives { barcode_value, yolo_label, ocr_text } from YOLO teammate
│     • Compares barcode DB entry vs YOLO product label
│     • Returns: { match: bool, confidence, fraud_type }
│
├── POST /alert
│     • Called by Node.js on fraud detection
│     • Logs to fraud_incidents table
│     • Returns 200 — Node.js fires SendGrid email
│
├── GET /inventory/{barcode}
│     • Inventory lookup by barcode
│
└── GET /audit-log
      • Returns paginated transaction audit log
```

### Redis — 3 Critical Roles

**Role 1: Session Store**
```
Key: sess:{session_id}
Value: { user_id, shop_name, email, login_at }
TTL: 30min (rolling) or 7 days (remember-me)
```

**Role 2: Transaction Gate (NO Checkout Queue)**
```
Key: txn:lock:{barcode}
Value: "processing"
TTL: 5 seconds

Flow:
1. Scanner fires barcode
2. Node.js → SET txn:lock:{barcode} "processing" NX EX 5
3. If SET returns null → "Transaction already processing"  (blocks duplicate)
4. If SET succeeds → call FastAPI /verify
5. On result → DEL txn:lock:{barcode}
6. Publish result to WebSocket → UI updates

This prevents the SAME barcode being scanned twice in rapid succession
(cashier mis-scan, conveyor belt double-read) — no queue needed.
```

**Role 3: Fraud Flag Cache**
```
Key: fraud:flag:{barcode}
Value: { count, first_seen, last_seen }
TTL: 24 hours

If count > 3 → auto-trigger SendGrid fraud incident report
```

### PostgreSQL — Tables
```sql
retailers      — registered store owners
products       — inventory (barcode, name, price, quantity, image_url)
transactions   — every scan result (approved/blocked/partial)
audit_log      — immutable append-only record of all actions
fraud_incidents — fraud event log linked to transactions
```

---

## 3. BARCODE HARDWARE INPUT — THE RIGHT WAY

### Why HID Scanner beats camera for POS:
Traditional USB/Bluetooth barcode scanners emulate a **keyboard (HID device)**. They type the barcode string + `Enter` directly into whatever input is focused. This is:
- Instant (< 50ms per scan)
- No image processing needed at checkout
- Works offline
- Industry standard at every retail POS

### Implementation in `checkout.html`:
```javascript
// HID scanners type fast — detect burst keystrokes
let scanBuffer = '';
let scanTimer  = null;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && scanBuffer.length >= 6) {
    handleScan(scanBuffer.trim());
    scanBuffer = '';
    return;
  }
  if (e.key.length === 1) {
    scanBuffer += e.key;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanBuffer = ''; }, 150); // 150ms burst window
  }
});
```

### Manual fallback input:
A visible `<input>` field with autofocus for manual entry when scanner is unavailable.

---

## 4. TRANSACTION GATING WITHOUT A QUEUE

Traditional queue problem: Scanner fires 3 times before response → 3 duplicate DB writes.

**Redis NX (Not eXists) lock solves this:**
```
Scan fires → Node checks Redis → if locked: show "Processing..." → if free: lock + verify → unlock
```

No queue. No race condition. Sub-millisecond gate. Scales to any number of checkout terminals because each terminal uses its own barcode as the lock key.

```javascript
// Node.js gateway code
async function gateTransaction(barcode, shopId) {
  const lockKey = `txn:lock:${shopId}:${barcode}`;
  const locked  = await redis.set(lockKey, '1', 'NX', 'EX', 5);
  if (!locked) return { status: 'duplicate', message: 'Scan already processing' };

  try {
    const result = await axios.post('http://localhost:8000/verify', { barcode, shopId });
    await logTransaction(barcode, result.data, shopId);
    if (result.data.fraud_risk > 0.7) await triggerFraudAlert(barcode, result.data);
    return result.data;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## 5. ALERTING SYSTEM — NODEMAILER + SENDGRID

### Trigger Map:
| Event | System | Email Type |
|---|---|---|
| Retailer signs up | Nodemailer (SMTP) | Welcome + onboarding guide |
| Password reset | Nodemailer (SMTP) | Reset link |
| Transaction BLOCKED | SendGrid API | Real-time fraud alert to store owner |
| Fraud flag > 3 in 24h | SendGrid API | Incident report with barcode details |
| Daily summary (cron) | SendGrid API | Daily transaction digest |
| 0 inventory warning | SendGrid API | Low stock alert |

### Why two systems:
- **Nodemailer**: Transactional, triggered by Node.js events, uses SMTP (Gmail/own server). Simple and free.
- **SendGrid**: Templated, high-deliverability, built for automated/bulk triggers. Has open-rate tracking. Required for fraud reports that must not land in spam.

### Nodemailer — Welcome Email (existing signup flow):
```javascript
// Already in server.js — triggered in POST /api/register
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
await transporter.sendMail({
  from: '"SmartRetail" <noreply@smartretail.com>',
  to: newUser.email,
  subject: `Welcome to SmartRetail, ${newUser.owner_name}! 🛒`,
  html: welcomeTemplate(newUser)
});
```

### SendGrid — Fraud Alert (FastAPI triggers → Node.js fires):
```javascript
// node.js fraud alert trigger
async function triggerFraudAlert(barcode, verifyResult) {
  await sgMail.send({
    to: sessionUser.email,
    from: 'alerts@smartretail.com',
    templateId: 'd-SENDGRID_TEMPLATE_ID',
    dynamicTemplateData: {
      barcode, product_name: verifyResult.product_name,
      risk_score: verifyResult.risk_score,
      timestamp: new Date().toISOString(),
      action_taken: 'TRANSACTION_BLOCKED'
    }
  });
}
```

---

## 6. FASTAPI ↔ NODE.JS INTEGRATION PATTERN

Node.js does NOT duplicate FastAPI's logic. It only:
1. Validates session (Redis check)
2. Applies Redis transaction gate
3. Proxies verified request to FastAPI
4. Receives result → fires email if needed → pushes to WebSocket

```
Browser → POST /api/scan (Node, port 3000)
              ↓ check Redis session
              ↓ apply txn gate
              ↓ proxy → POST http://localhost:8000/verify (FastAPI)
              ↓ receive result
              ↓ log to DB (via FastAPI /audit)
              ↓ if fraud → SendGrid
              ↓ WebSocket push to checkout UI
              ↓ return JSON to browser
```

---

## 7. YOLO/EasyOCR TEAMMATE INTEGRATION POINT

Your teammate's ML model sends its result to:
```
POST /api/match
Body: {
  barcode_value: "8901030823437",   // from hardware scanner
  yolo_label:    "Nestle Milo",     // from YOLO detection
  ocr_text:      "Milo 500g Nestle" // from EasyOCR
}
```

FastAPI `/match` endpoint:
1. Looks up `barcode_value` in PostgreSQL → gets `db_product_name`
2. Fuzzy-matches `yolo_label` vs `db_product_name` (using `rapidfuzz`)
3. Returns `{ match: bool, confidence: 0-100, fraud_type: "LABEL_SWAP"|"COUNTERFEIT"|null }`

---

## 8. FILE STRUCTURE (FINAL)

```
smartretail/
├── views/                    ← EJS templates (served by Node.js)
│   ├── login.ejs
│   ├── signup.ejs
│   ├── home.ejs              ← product image + barcode upload
│   ├── checkout.ejs          ← HID scanner terminal
│   └── dashboard.ejs         ← audit + fraud log
│
├── public/                   ← static assets
│   ├── css/
│   └── js/
│
├── server.js                 ← Node.js Express gateway
├── routes/
│   ├── auth.js               ← login, signup, logout
│   ├── scan.js               ← txn gate + FastAPI proxy
│   └── alerts.js             ← Nodemailer + SendGrid
│
├── api/                      ← FastAPI (Python)
│   ├── main.py
│   ├── routes/
│   │   ├── verify.py
│   │   ├── match.py
│   │   ├── inventory.py
│   │   └── audit.py
│   └── db.py
│
├── .env
├── requirements.txt          ← FastAPI deps
└── package.json              ← Node deps
```

---

## 9. REDIS SETUP (connect-redis + ioredis)

```javascript
// server.js — replace current session with Redis-backed session
const session      = require('express-session');
const RedisStore   = require('connect-redis').default;
const { createClient } = require('redis');

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

app.use(session({
  store:             new RedisStore({ client: redisClient }),
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  rolling:           true,
  cookie: { maxAge: 30 * 60 * 1000, httpOnly: true, secure: false }
}));
```

---

## 10. CRON JOBS (node-cron — already imported)

```javascript
// Daily digest at 8 PM
cron.schedule('0 20 * * *', async () => {
  const shops = await client.query('SELECT email, shop_name FROM retailers');
  for (const shop of shops.rows) {
    const stats = await getDailyStats(shop.email);
    await sendDailyDigest(shop.email, shop.shop_name, stats);
  }
});

// Fraud check every hour
cron.schedule('0 * * * *', async () => {
  const keys = await redisClient.keys('fraud:flag:*');
  for (const key of keys) {
    const data = JSON.parse(await redisClient.get(key));
    if (data.count >= 3) await escalateFraudIncident(key, data);
  }
});
```

---

## 11. npm install ONE-LINER

```bash
npm install express pg bcrypt express-session connect-redis redis ioredis \
            multer axios form-data nodemailer @sendgrid/mail \
            node-cron ws http-proxy-middleware dotenv
```

```bash
pip install fastapi uvicorn asyncpg sqlalchemy redis aioredis rapidfuzz python-dotenv
```

---

## 12. HACKATHON PITCH FLOW (30-second demo script)

1. **Register** → welcome email fires (Nodemailer)
2. **Login** → session stored in Redis
3. **Go to Checkout Terminal** → HID scanner input field is live
4. **Scan a VALID barcode** → Redis gate fires → FastAPI checks DB → APPROVED banner + green flash
5. **Scan a MISMATCHED barcode** → FastAPI returns fraud risk > 0.7 → BLOCKED banner + SendGrid alert fires to owner email
6. **Show Dashboard** → audit log shows both transactions with timestamps
7. **Show email inbox** → fraud alert email arrived in real-time