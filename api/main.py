"""
SmartRetail — FastAPI Core Verification Engine
Port: 8000

pip install fastapi uvicorn asyncpg rapidfuzz python-dotenv redis aioredis ultralytics opencv-python numpy
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncpg
import os
import cv2
import numpy as np
import base64
from rapidfuzz import fuzz
from dotenv import load_dotenv
import redis.asyncio as aioredis
from datetime import datetime

load_dotenv()

app = FastAPI(title="SmartRetail Verification Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB + Redis ─────────────────────────────────────────────────────────────────
DB_URL     = os.getenv("DATABASE_URL", "postgresql://postgres:1221@localhost:5432/Netra")
REDIS_URL  = os.getenv("REDIS_URL", "redis://localhost:6379")
MODEL_PATH = os.getenv("MODEL_PATH", "./AI_Model/best_final.pt")

db_pool    = None
redis_pool = None
yolo_model = None   # loaded lazily in startup — never at module level

@app.on_event("startup")
async def startup():
    global db_pool, redis_pool, yolo_model

    db_pool    = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)
    redis_pool = await aioredis.from_url(REDIS_URL, decode_responses=True)
    print("✅ FastAPI connected to PostgreSQL + Redis")

    # Load YOLO inside startup so import errors don't crash the whole server
    try:
        from ultralytics import YOLO
        if os.path.exists(MODEL_PATH):
            yolo_model = YOLO(MODEL_PATH)
            print(f"✅ YOLOv8 model loaded from {MODEL_PATH}")
        else:
            print(f"⚠️  YOLO model not found at {MODEL_PATH} — running without visual verification")
    except Exception as e:
        print(f"⚠️  YOLO load failed ({e}) — running without visual verification")

@app.on_event("shutdown")
async def shutdown():
    if db_pool:    await db_pool.close()
    if redis_pool: await redis_pool.close()


# ── MODELS ─────────────────────────────────────────────────────────────────────
class VerifyRequest(BaseModel):
    barcode:  str
    shop_id:  int
    mk_id:    Optional[str] = None   # Manufacturer serial number (MK ID)

class MatchRequest(BaseModel):
    barcode_value: str
    product_ocr:   Optional[str] = ""
    barcode_ocr:   Optional[str] = ""
    yolo_label:    Optional[str] = ""
    image_b64:     Optional[str] = None   # base64 image — triggers YOLO inference


# ── HELPER ─────────────────────────────────────────────────────────────────────
def compute_fraud_risk(db_product: Optional[dict], yolo_label: str, ocr_text: str) -> float:
    """
    Rule-based fraud risk scorer (0.0 – 1.0).
    YOLO label + OCR text are fuzzy-matched against the DB product name.
    Uses partial_ratio for YOLO (class names are often abbreviated)
    and token_set_ratio for OCR (text may contain extra noise).
    """
    if db_product is None:
        return 0.95  # not in inventory → very high risk

    db_name = db_product.get("product_name", "")

    # YOLO class labels are short/abbreviated — use partial_ratio for leniency
    if yolo_label:
        yolo_score = max(
            fuzz.partial_ratio(yolo_label.lower(), db_name.lower()),
            fuzz.token_set_ratio(yolo_label.lower(), db_name.lower())
        ) / 100
    else:
        yolo_score = 0.5  # no YOLO data — neutral

    # OCR text from product image — use token_set_ratio (robust to extra words)
    if ocr_text and ocr_text.strip():
        ocr_score = max(
            fuzz.partial_ratio(ocr_text.lower(), db_name.lower()),
            fuzz.token_set_ratio(ocr_text.lower(), db_name.lower())
        ) / 100
    else:
        ocr_score = 0.5  # no OCR data — neutral

    # If YOLO is not available, rely more on OCR; if both present, weight YOLO less
    # since class labels are unreliable compared to OCR text
    if yolo_label:
        match_score = (yolo_score * 0.4 + ocr_score * 0.6)
    else:
        match_score = ocr_score

    return round(max(0.0, 1.0 - match_score), 2)


def run_yolo(image_b64: str) -> list[str]:
    """
    Decode a base64 image, run YOLOv8 inference, return detected class names.
    Returns [] if YOLO is not loaded or inference fails.
    """
    if yolo_model is None:
        return []
    try:
        img_bytes = base64.b64decode(image_b64)
        img_array = np.frombuffer(img_bytes, np.uint8)
        img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        results   = yolo_model(img, verbose=False)
        return [
            yolo_model.names[int(b.cls)]
            for r in results
            for b in r.boxes
        ]
    except Exception as e:
        print(f"YOLO inference error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "SmartRetail FastAPI Engine", "status": "running"}


@app.get("/health")
async def health():
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        await redis_pool.ping()
        yolo_status = "loaded" if yolo_model is not None else "not_loaded"
        return {"db": "connected", "redis": "connected", "yolo": yolo_status}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── POST /verify — called by Node.js checkout gateway ─────────────────────────
@app.post("/verify")
async def verify_barcode(req: VerifyRequest):
    """
    Primary endpoint for HID scanner → checkout terminal flow.
    Looks up the barcode in the products table and returns
    product info + initial fraud risk score.
    Node.js applies Redis intelligence on top.
    """
    async with db_pool.acquire() as conn:
        product = await conn.fetchrow(
            "SELECT product_name, price, quantity, barcode_format "
            "FROM products WHERE barcode=$1 AND shop_id=$2",
            req.barcode, req.shop_id
        )

    if product is None:
        await _log_audit(req.shop_id, req.barcode, None, "blocked", 0.95)
        return {
            "status":         "blocked",
            "product_name":   None,
            "price":          None,
            "quantity":       None,
            "barcode_format": "UNKNOWN",
            "fraud_risk":     0.95,
            "message":        f"Barcode {req.barcode} not found in inventory — transaction blocked.",
        }

    product    = dict(product)
    fraud_risk = 0.05   # base risk for known products; YOLO/match raises this

    if product["quantity"] is not None and product["quantity"] <= 0:
        status     = "blocked"
        fraud_risk = 0.3
    elif fraud_risk > 0.6:
        status = "blocked"
    elif fraud_risk > 0.3:
        status = "partial"
    else:
        status = "approved"

    await _log_audit(req.shop_id, req.barcode, product["product_name"], status, fraud_risk)

    # MK ID validation (if provided) — checks against mock DB
    mk_id_valid = None
    mk_id_message = None
    if req.mk_id:
        from ai_core import validate_mk_id, MOCK_DB
        mk_id_valid = validate_mk_id(req.barcode, req.mk_id)
        if not mk_id_valid:
            mk_id_message = f"MK ID '{req.mk_id}' does not match barcode {req.barcode} — possible counterfeit unit."
            fraud_risk = min(1.0, fraud_risk + 0.35)
            status = "blocked"

    response = {
        "status":         status,
        "product_name":   product["product_name"],
        "price":          float(product["price"]) if product["price"] else None,
        "quantity":       product["quantity"],
        "barcode_format": product["barcode_format"] or "EAN-13",
        "fraud_risk":     fraud_risk,
        "message":        mk_id_message or f"Product: {product['product_name']}",
    }
    if req.mk_id:
        response["mk_id"] = req.mk_id
        response["mk_id_valid"] = mk_id_valid
    return response


# ── GET /mk-ids — List valid MK IDs for a barcode (demo helper) ────────────────
@app.get("/mk-ids")
async def get_mk_ids(barcode: str):
    """Return the list of valid manufacturer serial numbers for a given barcode."""
    from ai_core import MOCK_DB
    product = MOCK_DB.get(barcode)
    if not product:
        return {"found": False, "barcode": barcode, "mk_ids": []}
    return {
        "found": True,
        "barcode": barcode,
        "product_name": product["product_name"],
        "mk_ids": product.get("mk_ids", []),
    }


# ── POST /match — image upload + YOLO integration point ───────────────────────
@app.post("/match")
async def match_verify(req: MatchRequest):
    """
    Called from home.html image-upload flow and optionally from the
    checkout terminal when a camera image is available.

    Flow:
      1. If image_b64 is provided → run YOLO to detect product label
      2. Look up barcode in DB
      3. Fuzzy-match yolo_label + OCR text against DB product name
      4. Return fraud risk + match verdict
    """
    # Step 1 — YOLO inference if image provided
    yolo_label = req.yolo_label or ""
    if req.image_b64:
        detected = run_yolo(req.image_b64)
        if detected:
            yolo_label = " ".join(detected)
            print(f"🔍 YOLO detected: {yolo_label}")

    # Step 2 — DB lookup (barcode is globally unique across shops)
    async with db_pool.acquire() as conn:
        product = await conn.fetchrow(
            "SELECT product_name, price, quantity, barcode_format "
            "FROM products WHERE barcode=$1",
            req.barcode_value
        )

    if product is None:
        return {
            "found":        False,
            "match":        False,
            "confidence":   0,
            "fraud_type":   "BARCODE_NOT_FOUND",
            "product_name": None,
        }

    product = dict(product)

    # Step 3 — Fraud risk scoring
    combined_ocr = (req.product_ocr or "") + " " + (req.barcode_ocr or "")
    fraud_risk   = compute_fraud_risk(product, yolo_label, combined_ocr)
    yolo_conf    = fuzz.token_sort_ratio(
        yolo_label.lower(), product["product_name"].lower()
    ) if yolo_label else 50

    fraud_type = None
    if fraud_risk > 0.7 and yolo_label:
        fraud_type = "LABEL_SWAP" if yolo_conf < 30 else "PARTIAL_MISMATCH"
    elif fraud_risk > 0.55:
        fraud_type = "LOW_CONFIDENCE"

    return {
        "found":          True,
        "match":          fraud_risk <= 0.5,
        "confidence":     max(0, 100 - int(fraud_risk * 100)),
        "fraud_type":     fraud_type,
        "fraud_risk":     fraud_risk,
        "product_name":   product["product_name"],
        "price":          float(product["price"]) if product["price"] else None,
        "quantity":       product["quantity"],
        "barcode_format": product["barcode_format"],
        "yolo_label":     yolo_label or None,
    }


# ── GET /inventory ─────────────────────────────────────────────────────────────
@app.get("/inventory")
async def get_inventory(shop_id: int):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT barcode, product_name, price, quantity, barcode_format, created_at "
            "FROM products WHERE shop_id=$1 ORDER BY product_name",
            shop_id
        )
    return {"products": [dict(r) for r in rows]}


# ── GET /audit-log ─────────────────────────────────────────────────────────────
@app.get("/audit-log")
async def get_audit_log(shop_id: int, limit: int = 100):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT barcode, product_name, status, fraud_risk, barcode_format, scanned_at
               FROM transactions WHERE shop_id=$1
               ORDER BY scanned_at DESC LIMIT $2""",
            shop_id, limit
        )
    return {"logs": [dict(r) for r in rows]}


# ── Internal audit helper ──────────────────────────────────────────────────────
async def _log_audit(
    shop_id: int,
    barcode: str,
    product_name: Optional[str],
    status: str,
    fraud_risk: float,
):
    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO audit_log (shop_id, barcode, product_name, status, fraud_risk, logged_at)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                shop_id, barcode, product_name, status, fraud_risk, datetime.utcnow()
            )
    except Exception as e:
        print(f"Audit log error: {e}")