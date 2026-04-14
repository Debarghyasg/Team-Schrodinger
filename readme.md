# Nyatik Nayan

An intelligent retail fraud detection platform built for Cognizant Technoverse 2026. SmartRetail lets store owners scan product barcodes at checkout and instantly detect counterfeit or mismatched goods using AI-powered verification, real-time fraud scoring, and automated alerting.

---

## What it does

When a cashier scans a barcode, SmartRetail runs it through a multi-layer verification pipeline in under a second. It cross-references your inventory database, analyzes scan frequency and barcode age for anomalies, computes a fraud risk score, and either approves the transaction or blocks it — flashing the result on screen and firing an email alert if fraud is detected.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + React Router |
| Gateway | Node.js + Express 5 |
| AI engine | FastAPI (Python) + YOLO + EasyOCR |
| Cache / gate | Redis |
| Database | PostgreSQL |
| Email | Nodemailer (SMTP) + SendGrid |
| Real-time | WebSocket (ws) |
| Jobs | node-cron |
|Algorithm | YOLOv10(Class Detection), AWS Rekognition(Cloud level Recognition), RapidFuzz(Fuzzy String Matching), Decision Tree

|Libraries | Python- Ultralytics (YOLOv10 Wrapper), EasyOCR (Label Text extraction), Thefuzz (Fuzzy String Comparison)
---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               React Frontend (Vite)                     │
│  login  ·  signup  ·  home  ·  checkout  ·  dashboard  │
└─────────────────────┬───────────────────────────────────┘
                      │ REST + WebSocket
┌─────────────────────▼───────────────────────────────────┐
│           Node.js Express Gateway  :3000                │
│  Auth & Redis sessions  ·  Redis txn gate               │
│  FastAPI proxy  ·  SendGrid  ·  Nodemailer  ·  Cron     │
└──────────┬──────────────────────────┬───────────────────┘
           │ HTTP proxy               │ read/write
┌──────────▼──────────┐   ┌──────────▼──────────────────┐
│  FastAPI  :8000     │   │  Redis                       │
│  /verify            │   │  Sessions · Txn locks        │
│  /match             │   │  Fraud flag cache            │
│  /inventory         │   └─────────────────────────────┘
│  /audit-log         │   ┌─────────────────────────────┐
└──────────┬──────────┘   │  PostgreSQL                  │
           │              │  retailers · products        │
           └──────────────►  transactions · audit_log    │
                          │  fraud_incidents             │
                          └─────────────────────────────┘
```

---

## Project structure

```
HC2/
├── api/                        # FastAPI Python engine
│   ├── main.py
│   └── __pycache__/
│
├── client/                     # React frontend
│   ├── src/
│   │   ├── app.jsx             # Router + auth guard
│   │   ├── login.jsx
│   │   ├── signup.jsx
│   │   ├── home.jsx            # Image upload + OCR verify
│   │   ├── checkout.jsx        # HID scanner terminal
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── dist/                   # Built output (served by Express)
│
├── index.js                    # Node.js Express gateway
├── .env
├── package.json
└── README.md
```

---

## Getting started

### Prerequisites

- Node.js >= 20
- Python >= 3.10
- PostgreSQL running locally
- Redis running locally (`redis-server`)

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
pip install fastapi uvicorn asyncpg sqlalchemy redis aioredis rapidfuzz python-dotenv
```

### 3. Configure environment

Create a `.env` file in the root:

```env
PORT=3000
FASTAPI_URL=http://localhost:8000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=Netra
DB_USER=postgres
DB_PASSWORD=yourpassword

REDIS_URL=redis://localhost:6379
SESSION_SECRET=your_secret_here

MAIL_USER=your@gmail.com
MAIL_PASS=your_app_password

SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM=alerts@yourdomain.com

APP_URL=http://localhost:3000
```

### 4. Set up the database

Run the following SQL to create the required tables:

```sql
CREATE TABLE retailers (
  id SERIAL PRIMARY KEY,
  owner_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE NOT NULL,
  address TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  barcode TEXT UNIQUE NOT NULL,
  name TEXT,
  price NUMERIC,
  quantity INT,
  image_url TEXT
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  shop_id INT REFERENCES retailers(id),
  barcode TEXT,
  product_name TEXT,
  status TEXT,
  fraud_risk NUMERIC,
  barcode_format TEXT,
  intelligence_flags TEXT,
  scan_count INT,
  barcode_age_mins INT,
  scanned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fraud_incidents (
  id SERIAL PRIMARY KEY,
  shop_id INT REFERENCES retailers(id),
  barcode TEXT,
  product_name TEXT,
  risk_score NUMERIC,
  action TEXT,
  incident_at TIMESTAMP DEFAULT NOW()
);
```

### 5. Build the frontend

```bash
cd client
npx vite build
cd ..
```

### 6. Start the FastAPI engine

```bash
cd api
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 7. Start the Node.js gateway

```bash
node index.js
```

Open `http://localhost:3000`.

---

## How a scan works

1. Cashier scans a barcode — the HID scanner types the string as keystrokes into the checkout terminal.
2. A `keydown` burst listener captures characters into a buffer and fires on `Enter`.
3. Node.js checks a Redis lock (`SET txn:lock:{shopId}:{barcode} NX EX 5`). If already locked, the duplicate is rejected with a 429.
4. The request is proxied to FastAPI `/verify`, which queries PostgreSQL and returns product details and a base fraud risk score.
5. Two fraud intelligence checks run in parallel — scan frequency in the past hour and barcode age (first-seen timestamp). Each adds to the risk score.
6. If the final score exceeds 0.7, the transaction is blocked and a SendGrid fraud alert fires to the store owner.
7. The result is logged to PostgreSQL and pushed to the checkout UI via WebSocket.
8. The Redis lock is released.

---

## Fraud intelligence

Beyond the basic inventory lookup, SmartRetail tracks two signals in Redis:

**Scan frequency** (`scan:freq:{shopId}:{barcode}`, TTL 1h)
- 5+ scans in an hour → +0.20 risk
- 10+ scans in an hour → +0.40 risk (critical)

**Barcode age** (`barcode:first_seen:{shopId}:{barcode}`, TTL 30d)
- Never seen before → +0.30 risk (new barcode flag)
- First seen less than 30 minutes ago → +0.25 risk (fresh label flag)

If a barcode is blocked 3 or more times within 24 hours, an escalated incident report is sent automatically via SendGrid.

---

## Alerting

| Event | System | Email |
|---|---|---|
| Retailer signs up | Nodemailer (SMTP) | Welcome + onboarding |
| Transaction blocked | SendGrid | Real-time fraud alert |
| Fraud flag count >= 3 in 24h | SendGrid | Escalated incident report |
| Daily at 20:00 | SendGrid (cron) | Transaction digest |

**Nodemailer** handles signup emails — simple SMTP, no dependencies on third-party delivery infrastructure.

**SendGrid** handles all fraud-related mail — high-deliverability API ensures alerts reach the inbox, not the spam folder.

---

## YOLO / EasyOCR integration

For image-based verification (home page), your ML teammate sends results to:

```
POST /api/checkout/match-verify
{
  "barcode":      "8901030823437",
  "product_ocr":  "Milo 500g Nestle",
  "barcode_ocr":  "8901030823437",
  "yolo_label":   "Nestle Milo"
}
```

FastAPI `/match` fuzzy-matches the YOLO label against the inventory product name using `rapidfuzz` and returns:

```json
{
  "match": true,
  "confidence": 87,
  "fraud_type": null
}
```

Possible `fraud_type` values: `"LABEL_SWAP"`, `"COUNTERFEIT"`, `null`.

---

## API reference

### Node.js endpoints (port 3000)

| Method | Path | Description |
|---|---|---|
| POST | `/api/register` | Register a new retailer |
| POST | `/api/login` | Login + create Redis session |
| GET | `/api/logout` | Destroy session |
| GET | `/api/me` | Return current session user |
| POST | `/api/checkout/verify` | Gate + verify a barcode scan |
| POST | `/api/checkout/match-verify` | Image OCR + YOLO match |
| POST | `/api/alerts/fraud` | Manually trigger fraud alert |
| GET | `/api/inventory` | Proxy to FastAPI inventory |
| GET | `/api/audit-log` | Proxy to FastAPI audit log |
| GET | `/api/health` | Redis + DB health check |

### FastAPI endpoints (port 8000)

| Method | Path | Description |
|---|---|---|
| POST | `/verify` | Barcode lookup + risk score |
| POST | `/match` | OCR + YOLO fuzzy match |
| GET | `/inventory` | Product inventory list |
| GET | `/audit-log` | Paginated audit log |

---

## Demo script (30 seconds)

1. **Register** → welcome email fires via Nodemailer
2. **Login** → session stored in Redis
3. **Checkout terminal** → HID scanner field is live and listening
4. **Scan a valid barcode** → Redis gate fires → FastAPI checks DB → green APPROVED banner
5. **Scan a mismatched barcode** → risk score > 0.7 → red BLOCKED banner + SendGrid alert fires
6. **Dashboard** → audit log shows both transactions with timestamps and risk scores
7. **Email inbox** → fraud alert arrived in real time

---

## Team

Built by Team Schrödinger for Cognizant Technoverse 2026.