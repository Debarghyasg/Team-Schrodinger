/**
 * SmartRetail — Node.js Express Gateway
 * ─────────────────────────────────────
 * Responsibilities:
 *  1. Auth (login/signup) with Redis-backed sessions
 *  2. Nodemailer — welcome email on signup
 *  3. SendGrid   — fraud alerts + daily digest via cron
 *  4. Redis Transaction Gate — NX lock for checkout
 *  5. HTTP Proxy → FastAPI :8000 for verify / match / inventory
 *  6. WebSocket  — real-time txn results to checkout UI
 *
 * npm install express pg bcrypt express-session connect-redis redis
 *             multer axios nodemailer @sendgrid/mail node-cron ws dotenv
 */

require('dotenv').config();

const express        = require('express');
const path           = require('path');
const bcrypt         = require('bcrypt');
const session        = require('express-session');
const { Client }     = require('pg');
const multer         = require('multer');
const axios          = require('axios');
const fs             = require('fs');
const nodemailer     = require('nodemailer');
const sgMail         = require('@sendgrid/mail');
const cron           = require('node-cron');
const { WebSocketServer } = require('ws');
const { createClient }    = require('redis');
const { RedisStore } = require('connect-redis');

const app         = express();
const PORT        = process.env.PORT || 3000;
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const SALT_ROUNDS = 10;

// ── SendGrid Setup ────────────────────────────────────────────────────────────
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// ── Redis Client ──────────────────────────────────────────────────────────────
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});
redisClient.connect()
    .then(() => console.log('✅ Redis connected'))
    .catch(err => { console.error('❌ Redis connection failed:', err.message); });

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD INTELLIGENCE — Scan Frequency + Barcode Age Tracking
// ─────────────────────────────────────────────────────────────────────────────

async function trackScanFrequency(shopId, barcode) {
    const scanKey = `scan:freq:${shopId}:${barcode}`;
    try {
        const count = await redisClient.incr(scanKey);
        if (count === 1) await redisClient.expire(scanKey, 3600);
        console.log(`📊 Barcode ${barcode} scanned ${count}x in last hour`);
        if (count >= 10) return { status: 'CRITICAL', count, riskAdd: 0.40, flag: `HIGH_FREQUENCY: ${count} scans in 1 hour` };
        if (count >= 5)  return { status: 'WARNING',  count, riskAdd: 0.20, flag: `ELEVATED_FREQUENCY: ${count} scans in 1 hour` };
        return { status: 'NORMAL', count, riskAdd: 0, flag: null };
    } catch (err) {
        console.warn('Scan frequency tracking error:', err.message);
        return { status: 'NORMAL', count: 0, riskAdd: 0, flag: null };
    }
}

async function trackBarcodeAge(shopId, barcode) {
    const ageKey = `barcode:first_seen:${shopId}:${barcode}`;
    try {
        const firstSeen = await redisClient.get(ageKey);
        if (!firstSeen) {
            const now = new Date().toISOString();
            await redisClient.set(ageKey, now, { EX: 2592000 });
            console.log(`🆕 New barcode ${barcode} — first time seen at shop ${shopId}`);
            return { status: 'NEW_BARCODE', firstSeen: now, ageMinutes: 0, riskAdd: 0.30, flag: 'NEW_BARCODE: Never scanned at this store before' };
        }
        const ageMinutes = Math.floor((new Date() - new Date(firstSeen)) / 60000);
        if (ageMinutes < 30) return { status: 'SUSPICIOUSLY_NEW', firstSeen, ageMinutes, riskAdd: 0.25, flag: `FRESH_LABEL: First seen only ${ageMinutes} min ago` };
        return { status: 'ESTABLISHED', firstSeen, ageMinutes, riskAdd: 0, flag: null };
    } catch (err) {
        console.warn('Barcode age tracking error:', err.message);
        return { status: 'UNKNOWN', riskAdd: 0, flag: null };
    }
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────
const db = new Client({
    user:     process.env.DB_USER     || 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    database: process.env.DB_NAME     || 'Netra',
    password: process.env.DB_PASSWORD || '1221',
    port:     parseInt(process.env.DB_PORT) || 5432,
});
db.connect()
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => { console.error('❌ DB failed:', err.message); process.exit(1); });

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync('uploads', { recursive: true }); cb(null, 'uploads/'); },
    filename:    (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.use('/uploads', express.static('uploads'));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Redis-backed Session Store ────────────────────────────────────────────────
app.use(session({
    store:             new RedisStore({ client: redisClient }),
    secret:            process.env.SESSION_SECRET || 'smartretail_secret',
    resave:            false,
        secure: false,    
    sameSite: 'lax',
    saveUninitialized: false,
    rolling:           true,
    cookie: { maxAge: 30 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production' },
}));

// ── View Engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Serve React static build ──────────────────────────────────────────────────
// NOTE: Must come BEFORE auth guard and routes so assets (.js/.css) are served
app.use(express.static(path.join(__dirname, 'client/dist')));

// ── Auth Guard ────────────────────────────────────────────────────────────────
const isAuth = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/');
};

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — must all be defined BEFORE the catch-all wildcard below
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/me
app.get('/api/me', (req, res) => {
    if (req.session.user) return res.json({ user: req.session.user });
    return res.status(401).json({ user: null });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

// POST /api/register
app.post('/api/register', async (req, res) => {
    const { owner_name, shop_name, phone, email, address, password } = req.body;

    if (!owner_name || !shop_name || !phone || !email || !address || !password)
        return res.status(400).json({ message: 'All fields are required.' });
    if (password.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    try {
        const existing = await db.query('SELECT id FROM retailers WHERE email = $1', [email.trim().toLowerCase()]);
        if (existing.rows.length > 0)
            return res.status(409).json({ message: 'An account with this email already exists.' });

        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await db.query(
            `INSERT INTO retailers (owner_name, shop_name, phone, email, address, password_hash, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, owner_name, shop_name, email`,
            [owner_name.trim(), shop_name.trim(), phone.trim(), email.trim().toLowerCase(), address.trim(), password_hash]
        );

        const user = result.rows[0];
        sendWelcomeEmail(user.email, user.owner_name, user.shop_name).catch(console.error);
        console.log(`✅ Registered: ${user.email} (ID: ${user.id})`);
        return res.status(201).json({ message: 'Store registered successfully!', redirect: '/' });

    } catch (err) {
        console.error('❌ Registration error:', err.message);
        return res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password, remember } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password are required.' });

    try {
        const result = await db.query(
            'SELECT id, owner_name, shop_name, email, password_hash FROM retailers WHERE email = $1',
            [email.trim().toLowerCase()]
        );
        if (result.rows.length === 0)
            return res.status(401).json({ message: 'Invalid email or password.' });

        const user  = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ message: 'Invalid email or password.' });

        if (remember) req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;

        req.session.user = { id: user.id, name: user.owner_name, shop_name: user.shop_name, email: user.email };
        console.log(`✅ Login: ${user.email}`);
        return res.status(200).json({ message: 'Login successful.', redirect: '/home' });

    } catch (err) {
        console.error('❌ Login error:', err.message);
        return res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// ── CHECKOUT ──────────────────────────────────────────────────────────────────

app.post('/api/checkout/verify', isAuth, async (req, res) => {
    const { barcode } = req.body;
    if (!barcode || typeof barcode !== 'string' || barcode.trim().length < 4)
        return res.status(400).json({ message: 'Invalid barcode.' });

    const shop    = req.session.user;
    const lockKey = `txn:lock:${shop.id}:${barcode.trim()}`;

    let locked;
    try {
        locked = await redisClient.set(lockKey, '1', { NX: true, EX: 5 });
    } catch (redisErr) {
        console.warn('Redis gate error (fail-open):', redisErr.message);
        locked = 'OK';
    }

    if (!locked) {
        return res.status(429).json({
            status:  'duplicate',
            message: 'Duplicate scan — Redis gate active for this barcode.',
        });
    }

    try {
        let verifyResult;
        try {
            const faResp = await axios.post(`${FASTAPI_URL}/verify`, {
                barcode:  barcode.trim(),
                shop_id:  shop.id,
            }, { timeout: 8000 });
            verifyResult = faResp.data;
        } catch (faErr) {
            console.warn('FastAPI unavailable:', faErr.message);
            verifyResult = {
                status:         'partial',
                product_name:   null,
                price:          null,
                quantity:       null,
                barcode_format: 'UNKNOWN',
                fraud_risk:     0,
                message:        'Inventory service temporarily unavailable.',
            };
        }

        const [freqResult, ageResult] = await Promise.all([
            trackScanFrequency(shop.id, barcode.trim()),
            trackBarcodeAge(shop.id, barcode.trim())
        ]);

        const intelligenceFlags = [freqResult.flag, ageResult.flag].filter(Boolean);

        let boostedRisk = verifyResult.fraud_risk || 0;
        boostedRisk = Math.min(1.0, boostedRisk + freqResult.riskAdd + ageResult.riskAdd);

        if (boostedRisk > 0.7 && verifyResult.status !== 'blocked') {
            verifyResult.status  = 'blocked';
            verifyResult.message = `Intelligence flags raised: ${intelligenceFlags.join(' | ')}`;
        }

        verifyResult.fraud_risk         = parseFloat(boostedRisk.toFixed(2));
        verifyResult.intelligence_flags = intelligenceFlags;
        verifyResult.scan_count         = freqResult.count;
        verifyResult.barcode_age_mins   = ageResult.ageMinutes || 0;

        if (intelligenceFlags.length > 0) {
            console.warn(`🧠 Intelligence flags for ${barcode}:`, intelligenceFlags);
        }

        try {
            await db.query(
                `INSERT INTO transactions 
                 (shop_id, barcode, product_name, status, fraud_risk, 
                  barcode_format, intelligence_flags, scan_count, 
                  barcode_age_mins, scanned_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
                [
                    shop.id,
                    barcode.trim(),
                    verifyResult.product_name,
                    verifyResult.status,
                    verifyResult.fraud_risk || 0,
                    verifyResult.barcode_format || 'UNKNOWN',
                    intelligenceFlags.join(' | ') || null,
                    freqResult.count || 0,
                    ageResult.ageMinutes || 0
                ]
            );
        } catch (dbErr) {
            console.error('Transaction log error:', dbErr.message);
        }

        if (verifyResult.status === 'blocked' && (verifyResult.fraud_risk || 0) > 0.6) {
            const fraudKey = `fraud:flag:${shop.id}:${barcode.trim()}`;
            let flagData   = { count: 0, first_seen: new Date().toISOString() };
            try {
                const existing = await redisClient.get(fraudKey);
                if (existing) flagData = JSON.parse(existing);
            } catch {}
            flagData.count++;
            flagData.last_seen = new Date().toISOString();
            await redisClient.set(fraudKey, JSON.stringify(flagData), { EX: 86400 }).catch(() => {});

            sendFraudAlertEmail(shop, {
                barcode:      barcode.trim(),
                product_name: verifyResult.product_name,
                risk_score:   verifyResult.fraud_risk,
                timestamp:    new Date().toISOString(),
                action:       'TRANSACTION_BLOCKED'
            }).catch(console.error);

            if (flagData.count >= 3 && !flagData.escalated) {
                flagData.escalated = true;
                await redisClient.set(fraudKey, JSON.stringify(flagData), { EX: 86400 }).catch(() => {});
                sendFraudIncidentReport(shop, barcode.trim(), verifyResult, flagData).catch(console.error);
                console.warn(`🚨 Escalated fraud incident: barcode ${barcode} flagged ${flagData.count}x`);
            }
        }

        broadcastToShop(shop.id, { type: 'TXN_RESULT', barcode: barcode.trim(), result: verifyResult });
        return res.status(200).json(verifyResult);

    } finally {
        await redisClient.del(lockKey).catch(() => {});
    }
});

app.post('/api/checkout/match-verify', isAuth, async (req, res) => {
    const { barcode, product_ocr, barcode_ocr, yolo_label } = req.body;
    try {
        const faResp = await axios.post(`${FASTAPI_URL}/match`, {
            barcode_value: barcode,
            product_ocr:   product_ocr  || '',
            barcode_ocr:   barcode_ocr   || '',
            yolo_label:    yolo_label    || '',
        }, { timeout: 10000 });
        return res.status(200).json(faResp.data);
    } catch {
        return res.status(503).json({ found: false, match: false, message: 'Inventory service unavailable.' });
    }
});

// ── POST /api/checkout/pay ────────────────────────────────────────────────────
// Finalise the cart: decrement stock for each item in a single SQL transaction,
// collect any product whose new stock is < threshold, and email the retailer
// once (deduped per shop+barcode per 24h via Redis to avoid notification spam).
//
// Request body: { items: [{ barcode: string, qty: number }, ...] }
// Response:    { ok: true, lowStock: [{ product_name, barcode, quantity }, ...] }
const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD) || 5;
const LOW_STOCK_NOTIFY_TTL = 24 * 60 * 60; // 24h dedup window

// Filter items that haven't been notified about in the last 24h.
// Sets the dedup keys in Redis for the items we WILL notify about.
async function dedupLowStockNotifications(shopId, lowStockItems) {
    if (lowStockItems.length === 0) return [];
    const fresh = [];
    for (const item of lowStockItems) {
        const key = `lowstock:notified:${shopId}:${item.barcode}`;
        try {
            // SET ... NX EX 86400 → only succeeds if no notification was sent recently
            const set = await redisClient.set(key, new Date().toISOString(),
                { NX: true, EX: LOW_STOCK_NOTIFY_TTL });
            if (set) fresh.push(item);
        } catch (err) {
            // Redis down? Fail open — better to send the email than miss it.
            console.warn('Low-stock dedup error (fail-open):', err.message);
            fresh.push(item);
        }
    }
    return fresh;
}

app.post('/api/checkout/pay', isAuth, async (req, res) => {
    const shop  = req.session.user;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (items.length === 0)
        return res.status(400).json({ ok: false, message: 'Cart is empty.' });

    const cleanItems = items
        .map(i => ({ barcode: String(i.barcode || '').trim(), qty: Math.max(1, parseInt(i.qty) || 1) }))
        .filter(i => i.barcode.length >= 4);

    if (cleanItems.length === 0)
        return res.status(400).json({ ok: false, message: 'No valid items to pay for.' });

    const lowStock      = [];     // products whose new quantity < threshold
    const insufficient  = [];     // requested qty exceeded available
    const notFound      = [];     // barcode not in this shop's inventory

    try {
        await db.query('BEGIN');

        for (const { barcode, qty } of cleanItems) {
            // Atomic decrement: only succeed if enough stock is available.
            const r = await db.query(
                `UPDATE products
                    SET quantity = quantity - $1
                  WHERE barcode = $2
                    AND shop_id = $3
                    AND quantity >= $1
                  RETURNING product_name, quantity`,
                [qty, barcode, shop.id]
            );

            if (r.rowCount === 0) {
                // Either not in inventory or insufficient stock — figure out which.
                const probe = await db.query(
                    'SELECT product_name, quantity FROM products WHERE barcode=$1 AND shop_id=$2',
                    [barcode, shop.id]
                );
                if (probe.rowCount === 0) notFound.push({ barcode });
                else                       insufficient.push({ barcode, available: probe.rows[0].quantity, requested: qty });
                continue;
            }

            const { product_name, quantity } = r.rows[0];
            if (quantity < LOW_STOCK_THRESHOLD) {
                lowStock.push({ product_name, barcode, quantity });
            }
        }

        // Roll back the whole sale if anything was missing — keeps DB consistent.
        if (notFound.length > 0 || insufficient.length > 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                ok: false,
                message: 'Some items could not be sold.',
                notFound,
                insufficient,
            });
        }

        await db.query('COMMIT');
        console.log(`💰 Sale committed for shop ${shop.id}: ${cleanItems.length} item(s)`);
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch {}
        console.error('❌ Pay transaction failed:', err.message);
        return res.status(500).json({ ok: false, message: 'Sale failed. Please retry.' });
    }

    // Dedup against Redis: if we've already emailed about this barcode within
    // the last 24h, skip it. Prevents one slow-moving SKU from spamming the
    // retailer every time it's sold.
    const toNotify = await dedupLowStockNotifications(shop.id, lowStock);

    // Fire-and-forget low-stock email; never block the checkout response on it.
    if (toNotify.length > 0) {
        sendLowStockEmail(shop, toNotify)
            .catch(err => console.error('Low-stock email error:', err.message));
    }

    return res.status(200).json({ ok: true, lowStock });
});

// ── ALERTS ────────────────────────────────────────────────────────────────────

app.post('/api/alerts/fraud', isAuth, async (req, res) => {
    const { barcode, product_name, risk_score, timestamp, action } = req.body;
    const shop = req.session.user;
    try {
        await sendFraudAlertEmail(shop, { barcode, product_name, risk_score, timestamp, action });
        await db.query(
            `INSERT INTO fraud_incidents (shop_id, barcode, product_name, risk_score, action, incident_at)
             VALUES ($1,$2,$3,$4,$5,NOW())`,
            [shop.id, barcode, product_name || 'Unknown', risk_score || 0, action || 'BLOCKED']
        ).catch(() => {});
        return res.status(200).json({ sent: true });
    } catch (err) {
        console.error('Fraud alert route error:', err.message);
        return res.status(500).json({ sent: false, message: err.message });
    }
});

// ── PROXY → FastAPI ───────────────────────────────────────────────────────────

// GET /api/inventory/low-stock — list every product currently below threshold
// for the logged-in shop. Used by the UI to show a low-stock dashboard banner.
app.get('/api/inventory/low-stock', isAuth, async (req, res) => {
    const shop = req.session.user;
    try {
        const r = await db.query(
            `SELECT product_name, barcode, quantity, price
               FROM products
              WHERE shop_id = $1 AND quantity < $2
              ORDER BY quantity ASC, product_name ASC`,
            [shop.id, LOW_STOCK_THRESHOLD]
        );
        res.json({ threshold: LOW_STOCK_THRESHOLD, count: r.rowCount, items: r.rows });
    } catch (err) {
        console.error('Low-stock query error:', err.message);
        res.status(500).json({ threshold: LOW_STOCK_THRESHOLD, count: 0, items: [] });
    }
});

app.get('/api/audit-log', isAuth, async (req, res) => {
    try { const r = await axios.get(`${FASTAPI_URL}/audit-log`, { params: { shop_id: req.session.user.id } }); res.json(r.data); }
    catch { res.json({ logs: [] }); }
});

app.get('/api/inventory', isAuth, async (req, res) => {
    try { const r = await axios.get(`${FASTAPI_URL}/inventory`, { params: { shop_id: req.session.user.id } }); res.json(r.data); }
    catch { res.json({ products: [] }); }
});

app.get('/api/health', async (req, res) => {
    let redisOk = false, dbOk = false;
    try { await redisClient.ping(); redisOk = true; } catch {}
    try { await db.query('SELECT 1'); dbOk = true; } catch {}
    res.json({ redis: redisOk ? 'connected' : 'disconnected', db: dbOk ? 'connected' : 'disconnected', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATCH-ALL — React Router (MUST be last, after all /api/* routes)
// ─────────────────────────────────────────────────────────────────────────────
app.get('*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(email, ownerName, shopName) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
    await transporter.sendMail({
        from: `"SmartRetail" <${process.env.MAIL_USER}>`,
        to:    email,
        subject: `Welcome to Nyatik Nayan, ${ownerName}! 🛒`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#060912;color:#e2e8f0;padding:32px;border-radius:16px;border:1px solid #1a2540">
          <h1 style="font-size:24px;background:linear-gradient(90deg,#00e5ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 8px">
            Welcome to SmartRetail!
          </h1>
          <p style="color:#64748b;margin:0 0 24px">Your intelligent retail platform is ready.</p>
          <div style="background:#0d1525;border:1px solid #1a2540;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 8px"><strong>👤 Owner:</strong> ${ownerName}</p>
            <p style="margin:0"><strong>🏪 Store:</strong> ${shopName}</p>
          </div>
          <a href="${process.env.APP_URL || 'https://github.com/Debarghyasg/Nyatik-Nayan'}"
             style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#00e5ff,#7c3aed);color:#fff;font-weight:700;border-radius:10px;text-decoration:none">
            Open Dashboard →
          </a>
        </div>`,
    });
    console.log(`📧 Welcome email → ${email}`);
}

async function sendFraudAlertEmail(shop, { barcode, product_name, risk_score, timestamp, action }) {
    await sgMail.send({
        to:      shop.email,
        from:    process.env.SENDGRID_FROM || 'alerts@smartretail.com',
        subject: `🚨 Fraud Alert — ${barcode} blocked at ${shop.shop_name}`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0507;color:#e2e8f0;padding:32px;border-radius:16px;border:1px solid #4a0d0f">
          <h1 style="color:#ff4455;font-size:22px;margin:0 0 8px">🚨 Fraud Incident Detected</h1>
          <table style="width:100%;border-collapse:collapse;background:#1a0507;border-radius:10px;overflow:hidden;margin-top:16px">
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px;border-bottom:1px solid #2a0d0f">STORE</td>
                <td style="padding:12px 16px;border-bottom:1px solid #2a0d0f">${shop.shop_name}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px;border-bottom:1px solid #2a0d0f">BARCODE</td>
                <td style="padding:12px 16px;font-family:monospace;letter-spacing:2px;border-bottom:1px solid #2a0d0f">${barcode}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px;border-bottom:1px solid #2a0d0f">PRODUCT</td>
                <td style="padding:12px 16px;border-bottom:1px solid #2a0d0f">${product_name || 'Not in inventory'}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px;border-bottom:1px solid #2a0d0f">RISK SCORE</td>
                <td style="padding:12px 16px;color:#ff4455;font-weight:700;border-bottom:1px solid #2a0d0f">${((risk_score||0)*100).toFixed(0)}%</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px;border-bottom:1px solid #2a0d0f">ACTION</td>
                <td style="padding:12px 16px;color:#ff4455;font-weight:700;border-bottom:1px solid #2a0d0f">${action}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:12px">TIME</td>
                <td style="padding:12px 16px;font-family:monospace;font-size:12px">${timestamp}</td></tr>
          </table>
        </div>`,
    });
    console.log(`🚨 SendGrid fraud alert → ${shop.email}`);
}

async function sendLowStockEmail(shop, lowStockItems) {
    const rows = lowStockItems.map(it => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2a1a07">${it.product_name}</td>
          <td style="padding:12px 16px;font-family:monospace;letter-spacing:1.5px;color:#cbd5e1;border-bottom:1px solid #2a1a07">${it.barcode}</td>
          <td style="padding:12px 16px;color:${it.quantity === 0 ? '#ff4455' : '#f5a623'};font-weight:700;text-align:right;border-bottom:1px solid #2a1a07">${it.quantity}</td>
        </tr>`).join('');

    await sgMail.send({
        to:      shop.email,
        from:    process.env.SENDGRID_FROM || 'alerts@smartretail.com',
        subject: `⚠️ Low Stock Warning — ${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} at ${shop.shop_name}`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0a05;color:#e2e8f0;padding:32px;border-radius:16px;border:1px solid #4a3a0d">
          <h1 style="color:#f5a623;font-size:22px;margin:0 0 8px">⚠️ Low Stock Warning</h1>
          <p style="color:#94a3b8;margin:0 0 20px;font-size:13px;line-height:1.6">
            Hi ${shop.name || shop.owner_name || 'there'}, after the latest sale at <strong>${shop.shop_name}</strong>
            the following item${lowStockItems.length > 1 ? 's are' : ' is'} below the
            <strong>${LOW_STOCK_THRESHOLD}-unit</strong> reorder threshold. Time to restock.
          </p>
          <table style="width:100%;border-collapse:collapse;background:#1a1407;border-radius:10px;overflow:hidden;margin-top:8px">
            <thead>
              <tr style="background:#2a1f0a">
                <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Product</th>
                <th style="padding:12px 16px;text-align:left;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Barcode</th>
                <th style="padding:12px 16px;text-align:right;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Stock Left</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:24px;font-size:12px;color:#64748b">
            Threshold: ${LOW_STOCK_THRESHOLD} units · Sent automatically by SmartRetail · ${new Date().toLocaleString('en-IN')}
          </p>
        </div>`,
    });
    console.log(`📦 Low-stock email → ${shop.email} (${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''})`);
}

async function sendFraudIncidentReport(shop, barcode, verifyResult, flagData) {
    await sgMail.send({
        to:      shop.email,
        from:    process.env.SENDGRID_FROM || 'alerts@smartretail.com',
        subject: `🔴 INCIDENT REPORT — Barcode ${barcode} flagged ${flagData.count}× in 24h at ${shop.shop_name}`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d0507;color:#e2e8f0;padding:32px;border-radius:16px;border:2px solid #ff4455">
          <h1 style="color:#ff4455;font-size:22px">🔴 ESCALATED INCIDENT</h1>
          <p><strong>Barcode:</strong> <code style="background:#1a0507;padding:3px 8px;border-radius:4px;letter-spacing:2px">${barcode}</code></p>
          <p><strong>Flagged:</strong> ${flagData.count} times in 24 hours</p>
          <p><strong>First seen:</strong> ${flagData.first_seen}</p>
          <p><strong>Last seen:</strong>  ${flagData.last_seen}</p>
          <p><strong>Product:</strong> ${verifyResult.product_name || 'Not found in inventory'}</p>
          <p style="color:#64748b;font-size:12px;margin-top:20px">Immediate action required. Contact SmartRetail support if you suspect counterfeit goods.</p>
        </div>`,
    });
    console.log(`📧 Incident report → ${shop.email} for barcode ${barcode}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────

cron.schedule('0 20 * * *', async () => {
    console.log('📊 Daily digest cron running…');
    try {
        const shops = await db.query('SELECT id, email, owner_name, shop_name FROM retailers');
        for (const shop of shops.rows) {
            const stats = await db.query(
                `SELECT COUNT(*) FILTER (WHERE status='approved') AS approved,
                        COUNT(*) FILTER (WHERE status='blocked')  AS blocked,
                        COUNT(*) AS total
                 FROM transactions WHERE shop_id=$1 AND scanned_at::date = CURRENT_DATE`,
                [shop.id]
            );
            const s = stats.rows[0];
            if (parseInt(s.total) === 0) continue;

            await sgMail.send({
                to:   shop.email,
                from: process.env.SENDGRID_FROM || 'alerts@smartretail.com',
                subject: `📊 Daily Summary — ${shop.shop_name} — ${new Date().toLocaleDateString('en-IN')}`,
                html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#060912;color:#e2e8f0;padding:28px;border-radius:14px;border:1px solid #1a2540">
                  <h2 style="margin:0 0 4px">Daily Scan Summary</h2>
                  <p style="color:#64748b;margin:0 0 20px;font-size:13px">${shop.shop_name} · ${new Date().toLocaleDateString('en-IN')}</p>
                  <div style="display:flex;gap:12px;text-align:center">
                    <div style="flex:1;background:#0d1525;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#00e5ff">${s.total}</div><div style="font-size:11px;color:#64748b">TOTAL</div></div>
                    <div style="flex:1;background:#0d2520;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#34d399">${s.approved}</div><div style="font-size:11px;color:#64748b">APPROVED</div></div>
                    <div style="flex:1;background:#2b0d0d;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#f87171">${s.blocked}</div><div style="font-size:11px;color:#64748b">BLOCKED</div></div>
                  </div>
                </div>`,
            }).catch(e => console.error('Digest email error:', e.message));
        }
    } catch (err) { console.error('Digest cron error:', err.message); }
});

// ── Daily 09:00 IST low-stock sweep ──────────────────────────────────────────
// Catches products that are silently below threshold (e.g., quantity=2 but
// haven't sold all day, so the per-sale path never fired). Respects the same
// Redis dedup keys, so a retailer never gets two emails for the same SKU
// within a 24h window.
cron.schedule('0 9 * * *', async () => {
    console.log('📦 Low-stock sweep cron running…');
    try {
        const shops = await db.query('SELECT id, owner_name, shop_name, email FROM retailers');
        for (const shopRow of shops.rows) {
            const lowQ = await db.query(
                `SELECT product_name, barcode, quantity
                   FROM products
                  WHERE shop_id = $1 AND quantity < $2
                  ORDER BY quantity ASC`,
                [shopRow.id, LOW_STOCK_THRESHOLD]
            );
            if (lowQ.rowCount === 0) continue;

            const shop = {
                id:         shopRow.id,
                name:       shopRow.owner_name,
                shop_name:  shopRow.shop_name,
                email:      shopRow.email,
            };
            const fresh = await dedupLowStockNotifications(shop.id, lowQ.rows);
            if (fresh.length === 0) continue;

            sendLowStockEmail(shop, fresh)
                .catch(err => console.error(`Low-stock sweep email error (${shop.email}):`, err.message));
        }
    } catch (err) {
        console.error('Low-stock sweep cron error:', err.message);
    }
});

cron.schedule('0 * * * *', async () => {
    try {
        const keys = await redisClient.keys('fraud:flag:*');
        for (const key of keys) {
            const raw = await redisClient.get(key).catch(() => null);
            if (!raw) continue;
            const data = JSON.parse(raw);
            if (data.count >= 3 && !data.escalated) {
                data.escalated = true;
                await redisClient.set(key, JSON.stringify(data), { EX: 86400 }).catch(() => {});
                const parts   = key.split(':');
                const shopId  = parts[2];
                const barcode = parts[3];
                const shopRes = await db.query('SELECT * FROM retailers WHERE id=$1', [shopId]).catch(() => ({ rows: [] }));
                if (shopRes.rows.length > 0) {
                    sendFraudIncidentReport(shopRes.rows[0], barcode, { product_name: null }, data).catch(console.error);
                }
            }
        }
    } catch (err) { console.error('Fraud cron error:', err.message); }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET — real-time txn pushes to checkout UI
// ─────────────────────────────────────────────────────────────────────────────
const shopClients = new Map();

function broadcastToShop(shopId, payload) {
    const clients = shopClients.get(String(shopId));
    if (!clients) return;
    const msg = JSON.stringify(payload);
    clients.forEach(ws => { try { if (ws.readyState === 1) ws.send(msg); } catch {} });
}

const server = app.listen(PORT, () => {
    console.log(`🚀 SmartRetail → http://localhost:${PORT}`);
    console.log(`   Redis sessions: enabled`);
    console.log(`   FastAPI proxy:  ${FASTAPI_URL}`);
    console.log(`   WebSocket:      ws://localhost:${PORT}/ws`);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        try {
            const { shopId } = JSON.parse(msg.toString());
            if (shopId) {
                if (!shopClients.has(String(shopId))) shopClients.set(String(shopId), new Set());
                shopClients.get(String(shopId)).add(ws);
            }
        } catch {}
    });
    ws.on('close', () => { shopClients.forEach(set => set.delete(ws)); });
    ws.on('error', (e) => console.error('WS error:', e.message));
});