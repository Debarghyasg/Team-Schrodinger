import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/* ── Tiny uid ──────────────────────────────────────────────── */
let _uid = 0
const uid = () => ++_uid

/* ── Particle ring (decorative) ─────────────────────────────── */
function RingOrb({ size = 220, color = '#00e8ff', style }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1px solid ${color}18`,
      boxShadow: `0 0 ${size * .4}px ${color}08, inset 0 0 ${size * .3}px ${color}06`,
      position: 'absolute', pointerEvents: 'none',
      ...style,
    }} />
  )
}

/* ── Scan input card (product + barcode capture) ─────────────── */
function ScanCapture({ onVerified, scanning, setScanning }) {
  const [productB64, setProductB64]   = useState(null)
  const [barcodeB64, setBarcodeB64]   = useState(null)
  const [step, setStep]               = useState('idle')   // idle | product | barcode | verifying
  const [camOpen, setCamOpen]         = useState(false)
  const [camTarget, setCamTarget]     = useState(null)
  const [flash, setFlash]             = useState(false)
  const productRef = useRef(null)
  const barcodeRef = useRef(null)
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)

  /* load Quagga + Tesseract for client-side pre-extract */
  useEffect(() => {
    ['https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.2/tesseract.min.js',
     'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js'].forEach(src => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const s = document.createElement('script'); s.src = src; document.head.appendChild(s)
      }
    })
  }, [])

  function readFile(file, setter, type) {
    const r = new FileReader()
    r.onload = e => { setter(e.target.result); setStep(type === 'product' ? 'barcode' : 'ready') }
    r.readAsDataURL(file)
  }

  async function openCamera(target) {
    setCamTarget(target); setCamOpen(true)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = s
      if (videoRef.current) videoRef.current.srcObject = s
    } catch { closeCamera() }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamOpen(false); setCamTarget(null)
  }

  function captureFromCamera() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    const b64 = c.toDataURL('image/jpeg', .9)
    const tgt = camTarget; closeCamera()
    if (tgt === 'product') { setProductB64(b64); setStep('barcode') }
    else                   { setBarcodeB64(b64); setStep('ready') }
  }

  /* decode barcode client-side (display only) */
  async function decodeBarcodeB64(b64) {
    if (!window.Quagga) return { barcodeValue: '', ocrText: '' }
    let barcodeValue = ''
    try {
      barcodeValue = await new Promise((res, rej) =>
        window.Quagga.decodeSingle({
          decoder: { readers: ['ean_reader','ean_8_reader','code_128_reader','upc_reader'] },
          locate: true, src: b64,
        }, r => r?.codeResult ? res(r.codeResult.code) : rej())
      )
    } catch {}
    let ocrText = ''
    try {
      if (window.Tesseract) {
        const w = await window.Tesseract.createWorker('eng')
        const { data: { text } } = await w.recognize(b64)
        await w.terminate()
        ocrText = text.trim().replace(/\s+/g, ' ')
      }
    } catch {}
    return { barcodeValue, ocrText }
  }

  async function runVerify() {
    if (!productB64 || !barcodeB64) return
    setStep('verifying'); setScanning(true)
    setFlash(true); setTimeout(() => setFlash(false), 350)

    const { barcodeValue, ocrText } = await decodeBarcodeB64(barcodeB64)

    let productOcrText = ''
    try {
      if (window.Tesseract) {
        const w = await window.Tesseract.createWorker('eng')
        const { data: { text } } = await w.recognize(productB64)
        await w.terminate()
        productOcrText = text.trim().replace(/\s+/g, ' ')
      }
    } catch {}

    try {
      const res = await fetch('/api/checkout/match-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          barcode:     barcodeValue || '',
          product_ocr: productOcrText || '',
          barcode_ocr: ocrText || '',
          yolo_label:  '',
          image_b64:   productB64?.split(',')[1] || null,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      await onVerified(data, barcodeValue, productB64)
    } catch (err) {
      await onVerified(null, barcodeValue, productB64, err.message)
    } finally {
      setProductB64(null); setBarcodeB64(null)
      setStep('idle'); setScanning(false)
    }
  }

  /* auto-trigger when both images ready */
  useEffect(() => {
    if (step === 'ready') runVerify()
  }, [step])

  const stepMeta = {
    idle:      { label: 'Step 1 — Product image',  color: '#00e8ff', icon: '📦' },
    product:   { label: 'Step 1 — Product image',  color: '#00e8ff', icon: '📦' },
    barcode:   { label: 'Step 2 — Barcode image',  color: '#a78bfa', icon: '🔲' },
    ready:     { label: 'Sending to AI…',          color: '#f5a623', icon: '⚡' },
    verifying: { label: 'AI Verifying…',           color: '#f5a623', icon: '⚡' },
  }
  const sm = stepMeta[step]

  return (
    <>
      {/* camera modal */}
      {camOpen && (
        <div onClick={e => e.target === e.currentTarget && closeCamera()}
          style={{ position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,.92)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div style={{ width:'100%',maxWidth:480,borderRadius:20,overflow:'hidden',border:'1px solid rgba(0,232,255,.22)',background:'#080f1e' }}>
            <div style={{ padding:'12px 18px',borderBottom:'1px solid #102040',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <span style={{ fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,color:'#c8dff5' }}>
                {camTarget==='product' ? '📦 Capture Product' : '🔲 Capture Barcode'}
              </span>
              <button onClick={closeCamera} style={{ width:26,height:26,borderRadius:'50%',background:'rgba(255,59,78,.14)',border:'none',color:'#ff3b4e',fontSize:13,cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ position:'relative',aspectRatio:'4/3',background:'#000',overflow:'hidden' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width:'100%',height:'100%',objectFit:'cover' }} />
              <div style={{ position:'absolute',left:'10%',right:'10%',height:2,background:'linear-gradient(90deg,transparent,#00e8ff,transparent)',boxShadow:'0 0 14px #00e8ff',animation:'scanLine 1.8s ease-in-out infinite' }} />
            </div>
            <div style={{ padding:14,display:'flex',gap:10 }}>
              <button onClick={captureFromCamera} style={{ flex:1,padding:12,border:'none',borderRadius:10,cursor:'pointer',fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,background:'linear-gradient(135deg,#00e8ff,#00b8cc)',color:'#04070d' }}>📸 Capture</button>
              <button onClick={closeCamera} style={{ padding:'12px 16px',borderRadius:10,cursor:'pointer',background:'transparent',border:'1px solid #162f56',color:'#2d4a66',fontSize:13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        background: flash ? 'rgba(0,232,255,.07)' : '#080f1e',
        border: `1px solid ${sm.color}28`,
        borderRadius: 20, overflow: 'hidden', position: 'relative',
        transition: 'background .2s',
      }}>
        <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${sm.color},transparent)`,animation:'shimmer 2.5s ease-in-out infinite' }} />

        {/* Header */}
        <div style={{ padding:'16px 20px',borderBottom:'1px solid #102040',display:'flex',alignItems:'center',gap:12 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:`${sm.color}18`,border:`1px solid ${sm.color}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>{sm.icon}</div>
          <div>
            <div style={{ fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,color:'#c8dff5' }}>{sm.label}</div>
            <div style={{ fontSize:10,color:'#2d4a66',fontFamily:'DM Mono,monospace',letterSpacing:'1px',marginTop:2 }}>
              {step==='verifying' ? 'YOLOv8 + EasyOCR running…' : 'Upload or capture image'}
            </div>
          </div>
          {step==='verifying' && (
            <div style={{ marginLeft:'auto',width:20,height:20,border:'2px solid rgba(245,166,35,.25)',borderTopColor:'#f5a623',borderRadius:'50%',animation:'spin .7s linear infinite' }} />
          )}
        </div>

        {/* Progress dots */}
        <div style={{ padding:'12px 20px',display:'flex',alignItems:'center',gap:8 }}>
          {['product','barcode'].map((s,i) => {
            const done = (s==='product' && (productB64||step==='barcode'||step==='ready'||step==='verifying')) || (s==='barcode' && (barcodeB64||step==='ready'||step==='verifying'))
            const active = (s==='product' && (step==='idle'||step==='product')) || (s==='barcode' && step==='barcode')
            return (
              <div key={s} style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ width:28,height:28,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,fontFamily:'DM Mono,monospace',background:done?'rgba(0,232,136,.12)':active?'rgba(0,232,255,.1)':'rgba(255,255,255,.04)',border:`1px solid ${done?'rgba(0,232,136,.35)':active?'rgba(0,232,255,.3)':'#162f56'}`,color:done?'#00e888':active?'#00e8ff':'#2d4a66',transition:'all .3s' }}>
                  {done ? '✓' : i+1}
                </div>
                <span style={{ fontSize:11,color:done?'#00e888':active?'#00e8ff':'#2d4a66',fontFamily:'DM Mono,monospace',letterSpacing:'.5px',transition:'color .3s' }}>
                  {s==='product'?'Product':'Barcode'}
                </span>
                {i===0 && <div style={{ width:24,height:1,background:productB64?'rgba(0,232,136,.35)':'#162f56',transition:'background .3s' }} />}
              </div>
            )
          })}
        </div>

        {/* Upload area — product */}
        {(step==='idle' || step==='product') && !productB64 && (
          <div style={{ padding:'0 20px 20px' }}>
            <div onClick={() => productRef.current?.click()}
              style={{ borderRadius:14,border:'1.5px dashed rgba(0,232,255,.25)',padding:'28px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:10,cursor:'pointer',background:'rgba(0,0,0,.3)',transition:'border-color .2s,background .2s' }}
              onMouseOver={e => e.currentTarget.style.borderColor='rgba(0,232,255,.5)'}
              onMouseOut={e => e.currentTarget.style.borderColor='rgba(0,232,255,.25)'}
            >
              <span style={{ fontSize:28 }}>🖼️</span>
              <span style={{ fontSize:13,color:'#8faec8',fontFamily:'DM Mono,monospace' }}>Upload product image</span>
              <span style={{ fontSize:10,color:'#2d4a66',fontFamily:'DM Mono,monospace',letterSpacing:'.8px' }}>JPG · PNG · WEBP</span>
            </div>
            <div style={{ display:'flex',gap:8,marginTop:10 }}>
              <button onClick={() => productRef.current?.click()} style={{ flex:1,padding:10,borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'DM Mono,monospace',border:'1px solid rgba(0,232,255,.25)',background:'rgba(0,232,255,.07)',color:'#00e8ff' }}>↑ Upload</button>
              <button onClick={() => openCamera('product')} style={{ padding:'10px 14px',borderRadius:10,cursor:'pointer',fontSize:14,border:'1px solid #162f56',background:'rgba(255,255,255,.03)',color:'#2d4a66' }}>📷</button>
            </div>
            <input ref={productRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { if(e.target.files[0]) readFile(e.target.files[0], setProductB64, 'product'); e.target.value='' }} />
          </div>
        )}

        {/* Upload area — barcode */}
        {step==='barcode' && !barcodeB64 && (
          <div style={{ padding:'0 20px 20px' }}>
            <div onClick={() => barcodeRef.current?.click()}
              style={{ borderRadius:14,border:'1.5px dashed rgba(167,139,250,.25)',padding:'28px 16px',display:'flex',flexDirection:'column',alignItems:'center',gap:10,cursor:'pointer',background:'rgba(0,0,0,.3)',transition:'border-color .2s' }}
              onMouseOver={e => e.currentTarget.style.borderColor='rgba(167,139,250,.5)'}
              onMouseOut={e => e.currentTarget.style.borderColor='rgba(167,139,250,.25)'}
            >
              <span style={{ fontSize:28 }}>🔲</span>
              <span style={{ fontSize:13,color:'#8faec8',fontFamily:'DM Mono,monospace' }}>Upload barcode image</span>
              <span style={{ fontSize:10,color:'#2d4a66',fontFamily:'DM Mono,monospace',letterSpacing:'.8px' }}>JPG · PNG · WEBP</span>
            </div>
            <div style={{ display:'flex',gap:8,marginTop:10 }}>
              <button onClick={() => barcodeRef.current?.click()} style={{ flex:1,padding:10,borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'DM Mono,monospace',border:'1px solid rgba(167,139,250,.25)',background:'rgba(167,139,250,.07)',color:'#a78bfa' }}>↑ Upload</button>
              <button onClick={() => openCamera('barcode')} style={{ padding:'10px 14px',borderRadius:10,cursor:'pointer',fontSize:14,border:'1px solid #162f56',background:'rgba(255,255,255,.03)',color:'#2d4a66' }}>📷</button>
            </div>
            <input ref={barcodeRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { if(e.target.files[0]) readFile(e.target.files[0], setBarcodeB64, 'barcode'); e.target.value='' }} />
          </div>
        )}

        {/* Verifying state */}
        {step==='verifying' && (
          <div style={{ padding:'24px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:12 }}>
            <div style={{ display:'flex',gap:4 }}>
              {[0,.15,.3].map(d => <div key={d} style={{ width:7,height:7,borderRadius:'50%',background:'#f5a623',animation:`bounce .9s ease-in-out ${d}s infinite` }} />)}
            </div>
            <span style={{ fontFamily:'DM Mono,monospace',fontSize:11,color:'#8faec8',letterSpacing:'.8px' }}>YOLO + OCR running…</span>
          </div>
        )}
      </div>
    </>
  )
}

/* ── Cart item row ─────────────────────────────────────────── */
function CartRow({ item, onRemove, onQtyChange, index }) {
  const statusColor = { match: '#00e888', mismatch: '#ff3b4e', partial: '#f5a623' }
  const sc = statusColor[item.type] || '#8faec8'

  return (
    <div style={{ display:'flex',alignItems:'center',gap:12,padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,.04)',animation:'rowIn .35s ease both',animationDelay:`${index*.04}s`,opacity:item.type==='mismatch'?.55:1 }}>
      {/* status dot */}
      <div style={{ width:8,height:8,borderRadius:'50%',background:sc,boxShadow:`0 0 8px ${sc}`,flexShrink:0 }} />

      {/* thumbnail placeholder */}
      <div style={{ width:40,height:40,borderRadius:9,overflow:'hidden',background:'#0c1628',border:'1px solid #162f56',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>
        {item.productThumb
          ? <img src={item.productThumb} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
          : '📦'}
      </div>

      {/* info */}
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:item.type==='mismatch'?'#ff3b4e':'#c8dff5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
          {item.productName || item.barcode || 'Unknown item'}
        </div>
        <div style={{ fontFamily:'DM Mono,monospace',fontSize:10,color:'#2d4a66',marginTop:2,letterSpacing:'.5px' }}>
          {item.barcode || '—'} · {item.type==='match'?'Verified ✓':item.type==='mismatch'?'⚠ Fraud flag':'Partial ⚠'}
        </div>
      </div>

      {/* qty */}
      <div style={{ display:'flex',alignItems:'center',gap:6,flexShrink:0 }}>
        <button onClick={() => onQtyChange(item.id, -1)} style={{ width:22,height:22,borderRadius:6,border:'1px solid #162f56',background:'rgba(255,255,255,.04)',color:'#8faec8',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700 }}>−</button>
        <span style={{ fontFamily:'DM Mono,monospace',fontSize:13,color:'#c8dff5',minWidth:18,textAlign:'center' }}>{item.qty}</span>
        <button onClick={() => onQtyChange(item.id, +1)} style={{ width:22,height:22,borderRadius:6,border:'1px solid #162f56',background:'rgba(255,255,255,.04)',color:'#8faec8',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700 }}>+</button>
      </div>

      {/* price */}
      <div style={{ fontFamily:'DM Mono,monospace',fontSize:14,fontWeight:600,color:sc,flexShrink:0,minWidth:68,textAlign:'right' }}>
        {item.price ? `₹${(item.price * item.qty).toFixed(2)}` : '—'}
      </div>

      {/* remove */}
      <button onClick={() => onRemove(item.id)} style={{ width:22,height:22,borderRadius:6,border:'none',background:'rgba(255,59,78,.1)',color:'#ff3b4e',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>✕</button>
    </div>
  )
}

/* ── Main Transaction Page ───────────────────────────────── */
export default function TransactionPage({ user, setUser }) {
  const navigate  = useNavigate()
  const location  = useLocation()

  /* first product passed from home.jsx via navigate state */
  const initialMatch = location.state?.matchResult || null
  const initialBarcode = location.state?.barcode   || null
  const initialProduct = location.state?.product   || null

  const [cart, setCart]           = useState([])
  const [scanning, setScanning]   = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)   // gates ScanCapture; only visible after "Add Another Item"
  const [toast, setToast]         = useState({ msg:'', type:'', show:false })
  const [paid, setPaid]           = useState(false)
  const [fraudCount, setFraudCount] = useState(0)

  /* seed cart from the already-verified item that came from home.jsx */
  useEffect(() => {
    if (initialMatch && initialMatch.match !== false) {
      const type = !initialMatch.found ? 'mismatch'
                 : initialMatch.match  ? 'match'
                 : initialMatch.fraud_type === 'LOW_CONFIDENCE' ? 'partial'
                 : 'mismatch'
      addToCart({
        productName:   initialMatch.product_name  || 'Unknown',
        price:         initialMatch.price          || null,
        barcode:       initialBarcode?.barcodeValue || '',
        confidence:    initialMatch.confidence     || 0,
        fraudRisk:     initialMatch.fraud_risk     || 0,
        type,
        productThumb:  initialProduct?.base64      || null,
      })
    }
  }, [])

  function showToast(msg, type = 'info') {
    setToast({ msg, type, show: true })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 4000)
  }

  function addToCart(item) {
    setCart(prev => {
      /* merge quantity if same barcode already in cart */
      const existing = prev.findIndex(c => c.barcode && c.barcode === item.barcode)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { ...next[existing], qty: next[existing].qty + 1 }
        return next
      }
      return [{ ...item, id: uid(), qty: 1 }, ...prev]
    })
  }

  /* called by ScanCapture after each verify round */
  const handleVerified = useCallback(async (data, barcodeValue, productB64, errMsg) => {
    if (errMsg || !data) {
      showToast(`❌ Verification failed${errMsg ? ': ' + errMsg : ''}`, 'error')
      return
    }

    const type = !data.found                             ? 'mismatch'
               : data.match                              ? 'match'
               : data.fraud_type === 'LOW_CONFIDENCE'   ? 'partial'
               : 'mismatch'

    const item = {
      productName:  data.product_name  || 'Unknown',
      price:        data.price         || null,
      barcode:      barcodeValue       || '',
      confidence:   data.confidence    || 0,
      fraudRisk:    data.fraud_risk    || 0,
      fraudType:    data.fraud_type    || null,
      type,
      productThumb: productB64         || null,
    }

    if (type === 'mismatch') {
      setFraudCount(f => f + 1)
      showToast(`🚨 Fraud detected — ${data.fraud_type || 'mismatch'} · Item flagged`, 'error')
    } else if (type === 'partial') {
      showToast(`⚠️ Partial match — ${data.product_name} · Adding with flag`, 'warn')
    } else {
      showToast(`✅ ${data.product_name} verified · Added to cart`, 'success')
    }

    addToCart(item)
    setScannerOpen(false)   // collapse scanner; user must click "Add Another Item" to scan next
  }, [])

  function handleQtyChange(id, delta) {
    setCart(prev => prev.map(c => c.id === id
      ? { ...c, qty: Math.max(1, c.qty + delta) }
      : c
    ))
  }

  function handleRemove(id) {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const verifiedItems = cart.filter(c => c.type === 'match' || c.type === 'partial')
  const flaggedItems  = cart.filter(c => c.type === 'mismatch')
  const subtotal      = verifiedItems.reduce((s, c) => s + (c.price || 0) * c.qty, 0)
  const gst           = subtotal * 0.18
  const total         = subtotal + gst

  async function handlePay() {
    if (cart.length === 0) return
    setPaid(true)
    showToast('✅ Transaction complete — receipt generated', 'success')
    setTimeout(() => navigate('/home'), 3200)
  }

  async function logout() {
    await fetch('/api/logout', { credentials: 'include' })
    setUser(null); navigate('/')
  }

  /* ── Paid screen ─────────────────────────────────────────── */
  if (paid) return (
    <>
      <style>{globalCSS}</style>
      <div style={{ minHeight:'100vh',background:'#04080f',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:24,fontFamily:'DM Mono,monospace' }}>
        <div style={{ fontSize:64,animation:'popIn .5s cubic-bezier(.34,1.56,.64,1) both' }}>✅</div>
        <div style={{ fontFamily:'Syne,sans-serif',fontSize:28,fontWeight:800,color:'#00e888',animation:'popIn .5s .1s cubic-bezier(.34,1.56,.64,1) both' }}>Payment Complete</div>
        <div style={{ fontSize:13,color:'#2d4a66',animation:'popIn .5s .2s cubic-bezier(.34,1.56,.64,1) both' }}>₹{total.toFixed(2)} · {verifiedItems.length} item{verifiedItems.length!==1?'s':''} · Redirecting…</div>
      </div>
    </>
  )

  return (
    <>
      <style>{globalCSS}</style>

      {/* Ambient background */}
      <div style={{ position:'fixed',inset:0,zIndex:0,background:'#04080f' }} />
      <div style={{ position:'fixed',inset:0,zIndex:0,backgroundImage:'linear-gradient(rgba(0,232,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,255,.018) 1px,transparent 1px)',backgroundSize:'44px 44px' }} />
      <RingOrb size={500} color="#00e8ff" style={{ top:-200,right:-160,opacity:.5 }} />
      <RingOrb size={340} color="#a78bfa" style={{ bottom:-120,left:-80,opacity:.45 }} />

      {/* Topbar */}
      <header style={{ position:'sticky',top:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',height:54,background:'rgba(4,8,15,.95)',borderBottom:'1px solid #0e1e38',backdropFilter:'blur(20px)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#00e8ff,#6d28d9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>🛒</div>
          <span style={{ fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:800,letterSpacing:'-.3px',background:'linear-gradient(90deg,#00e8ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>SmartRetail</span>
          <span style={{ fontFamily:'DM Mono,monospace',fontSize:10,color:'#2d4a66',letterSpacing:'1.5px',textTransform:'uppercase',marginLeft:4 }}>/ Transaction</span>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:'#00e888',boxShadow:'0 0 8px #00e888',animation:'blink 2s ease-in-out infinite' }} />
          <span style={{ fontFamily:'DM Mono,monospace',fontSize:10,color:'#2d4a66',letterSpacing:'1px',textTransform:'uppercase' }}>Live Session</span>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={() => navigate('/home')} style={{ padding:'4px 12px',borderRadius:16,fontSize:11,fontFamily:'DM Mono,monospace',background:'transparent',border:'1px solid #162f56',color:'#2d4a66',cursor:'pointer' }}>← Home</button>
          <button onClick={logout} style={{ padding:'4px 12px',borderRadius:16,fontSize:11,fontFamily:'DM Mono,monospace',background:'rgba(255,59,78,.1)',border:'1px solid rgba(255,59,78,.2)',color:'#ff3b4e',cursor:'pointer' }}>Sign Out</button>
        </div>
      </header>

      {/* Main layout */}
      <div style={{ position:'relative',zIndex:1,display:'grid',gridTemplateColumns:'1fr 380px',gap:20,padding:'20px 24px',maxWidth:1380,margin:'0 auto',minHeight:'calc(100vh - 54px)',alignItems:'start' }}>

        {/* ── Left: Cart ─────────────────────────────────────── */}
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>

          {/* Section label */}
          <div style={{ display:'flex',alignItems:'center',gap:8,fontFamily:'DM Mono,monospace',fontSize:10,fontWeight:600,letterSpacing:'2px',textTransform:'uppercase',color:'#2d4a66' }}>
            Cart <div style={{ flex:1,height:1,background:'#0e1e38' }} />
            <span style={{ padding:'2px 8px',borderRadius:6,background:'rgba(0,232,255,.08)',border:'1px solid rgba(0,232,255,.15)',color:'#00e8ff',fontSize:10 }}>{cart.length} item{cart.length!==1?'s':''}</span>
          </div>

          {/* Cart card */}
          <div style={{ background:'#080f1e',border:'1px solid #0e1e38',borderRadius:20,overflow:'hidden',position:'relative',animation:'cardIn .6s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ position:'absolute',top:0,left:0,right:0,height:1,background:'linear-gradient(90deg,transparent,#00e8ff,transparent)',animation:'shimmer 3s ease-in-out infinite' }} />

            {/* cart header */}
            <div style={{ padding:'14px 20px',borderBottom:'1px solid #0e1e38',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,.2)' }}>
              <span style={{ fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,color:'#c8dff5' }}>Session Cart</span>
              <div style={{ display:'flex',gap:16,fontFamily:'DM Mono,monospace',fontSize:11 }}>
                <span style={{ color:'#00e888' }}>✓ {verifiedItems.length} verified</span>
                {flaggedItems.length > 0 && <span style={{ color:'#ff3b4e' }}>⚠ {flaggedItems.length} flagged</span>}
              </div>
            </div>

            {/* rows */}
            <div style={{ minHeight:120,maxHeight:420,overflowY:'auto' }}>
              {cart.length === 0
                ? (
                  <div style={{ padding:'40px 20px',textAlign:'center',color:'#2d4a66',fontFamily:'DM Mono,monospace',fontSize:12 }}>
                    <div style={{ fontSize:32,marginBottom:10,opacity:.3 }}>🛒</div>
                    No items yet — scan a product below
                  </div>
                )
                : cart.map((item, i) => (
                  <CartRow key={item.id} item={item} index={i}
                    onRemove={handleRemove}
                    onQtyChange={handleQtyChange} />
                ))
              }
            </div>

            {/* fraud summary banner */}
            {flaggedItems.length > 0 && (
              <div style={{ margin:'0 16px 16px',padding:'10px 14px',borderRadius:10,background:'rgba(255,59,78,.06)',border:'1px solid rgba(255,59,78,.2)',fontFamily:'DM Mono,monospace',fontSize:11,color:'#ff3b4e',lineHeight:1.6 }}>
                ⚠️ {flaggedItems.length} item{flaggedItems.length!==1?'s':''} flagged for fraud. Review before payment.
              </div>
            )}
          </div>

          {/* Scan capture card */}
          <div style={{ display:'flex',alignItems:'center',gap:8,fontFamily:'DM Mono,monospace',fontSize:10,fontWeight:600,letterSpacing:'2px',textTransform:'uppercase',color:'#2d4a66',marginTop:4 }}>
            Next Item Scan <div style={{ flex:1,height:1,background:'#0e1e38' }} />
            {scanning && <span style={{ color:'#f5a623',fontSize:10,animation:'blink 1s ease-in-out infinite' }}>● PROCESSING</span>}
          </div>

          {scannerOpen ? (
            <>
              <ScanCapture onVerified={handleVerified} scanning={scanning} setScanning={setScanning} />
              <button
                onClick={() => { if (!scanning) setScannerOpen(false) }}
                disabled={scanning}
                style={{
                  padding:'10px 18px', borderRadius:12, cursor: scanning ? 'not-allowed' : 'pointer',
                  fontFamily:'DM Mono,monospace', fontSize:11, letterSpacing:'.8px',
                  border:'1px solid #162f56', background:'transparent', color:'#2d4a66',
                  alignSelf:'center', opacity: scanning ? .5 : 1, transition:'color .2s,border-color .2s',
                }}
                onMouseOver={e => { if (!scanning) { e.currentTarget.style.color='#c8dff5'; e.currentTarget.style.borderColor='#1a3a66' } }}
                onMouseOut={e => { e.currentTarget.style.color='#2d4a66'; e.currentTarget.style.borderColor='#162f56' }}
              >
                ✕ Cancel scan
              </button>
              <div style={{ fontFamily:'DM Mono,monospace',fontSize:10,color:'#1a2d45',textAlign:'center',letterSpacing:'.8px' }}>
                After verification the scanner closes — click "Add Another Item" to scan the next product
              </div>
            </>
          ) : (
            <button
              onClick={() => setScannerOpen(true)}
              disabled={scanning || paid}
              style={{
                padding:'18px 22px', borderRadius:14, border:'1.5px dashed rgba(0,232,255,.35)',
                cursor: scanning || paid ? 'not-allowed' : 'pointer',
                fontFamily:"'Syne', sans-serif", fontSize:14, fontWeight:700, letterSpacing:'.3px',
                background:'rgba(0,232,255,.05)', color:'#00e8ff',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                transition:'background .2s, border-color .2s, transform .15s',
                opacity: scanning || paid ? .4 : 1,
              }}
              onMouseOver={e => { if (!scanning && !paid) { e.currentTarget.style.background='rgba(0,232,255,.1)'; e.currentTarget.style.borderColor='rgba(0,232,255,.6)'; e.currentTarget.style.transform='translateY(-1px)' } }}
              onMouseOut={e => { e.currentTarget.style.background='rgba(0,232,255,.05)'; e.currentTarget.style.borderColor='rgba(0,232,255,.35)'; e.currentTarget.style.transform='none' }}
            >
              <span style={{ fontSize:18 }}>＋</span>
              {cart.length === 0 ? 'Scan First Item' : 'Add Another Item'}
              <span style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#2d4a66', letterSpacing:'1px', marginLeft:6 }}>
                · re-runs YOLO + OCR
              </span>
            </button>
          )}
        </div>

        {/* ── Right: Summary ─────────────────────────────────── */}
        <div style={{ display:'flex',flexDirection:'column',gap:14,position:'sticky',top:74 }}>

          {/* Stats pills */}
          {[
            { label:'Items in Cart',   value:cart.length,          color:'#00e8ff', icon:'📦' },
            { label:'Verified',        value:verifiedItems.length, color:'#00e888', icon:'✅' },
            { label:'Fraud Flagged',   value:flaggedItems.length,  color:'#ff3b4e', icon:'🚨' },
          ].map((s,i) => (
            <div key={i} style={{ background:'#080f1e',border:'1px solid #0e1e38',borderRadius:14,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',animation:`cardIn .5s ${.1+i*.08}s cubic-bezier(.22,1,.36,1) both` }}>
              <div>
                <div style={{ fontFamily:'DM Mono,monospace',fontSize:9,letterSpacing:'1.5px',textTransform:'uppercase',color:'#2d4a66',marginBottom:4 }}>{s.label}</div>
                <div style={{ fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color:s.color,lineHeight:1 }}>{s.value}</div>
              </div>
              <div style={{ width:34,height:34,borderRadius:9,background:'rgba(255,255,255,.04)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17 }}>{s.icon}</div>
            </div>
          ))}

          {/* Bill summary */}
          <div style={{ background:'#080f1e',border:'1px solid #0e1e38',borderRadius:16,overflow:'hidden',animation:'cardIn .6s .3s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ padding:'12px 18px',borderBottom:'1px solid #0e1e38',background:'rgba(0,0,0,.2)' }}>
              <span style={{ fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:'#c8dff5' }}>Bill Summary</span>
            </div>
            <div style={{ padding:'14px 18px' }}>
              {[
                ['Subtotal', `₹${subtotal.toFixed(2)}`, '#8faec8'],
                ['GST (18%)', `₹${gst.toFixed(2)}`, '#8faec8'],
              ].map(([k,v,c]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontFamily:'DM Mono,monospace',fontSize:12 }}>
                  <span style={{ color:'#2d4a66' }}>{k}</span>
                  <span style={{ color:c }}>{v}</span>
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 0 4px',fontFamily:'DM Mono,monospace' }}>
                <span style={{ fontSize:11,color:'#8faec8',letterSpacing:'1px',textTransform:'uppercase' }}>Total</span>
                <span style={{ fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:'#00e888' }}>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pay button */}
          <button onClick={handlePay}
            disabled={cart.length === 0 || scanning}
            style={{
              padding:'16px 20px',border:'none',borderRadius:14,cursor:cart.length===0||scanning?'not-allowed':'pointer',
              fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,letterSpacing:'.2px',
              background:cart.length===0||scanning?'rgba(0,232,136,.1)':'linear-gradient(135deg,#00e888,#00b868)',
              color:cart.length===0||scanning?'#2d4a66':'#04070d',
              opacity:cart.length===0||scanning?.4:1,
              transition:'opacity .2s,transform .2s,box-shadow .2s',
              boxShadow:cart.length>0&&!scanning?'0 4px 28px rgba(0,232,136,.3)':'none',
              display:'flex',alignItems:'center',justifyContent:'center',gap:10,
            }}
            onMouseOver={e => { if(cart.length>0&&!scanning) e.currentTarget.style.transform='translateY(-2px)' }}
            onMouseOut={e => e.currentTarget.style.transform='none'}
          >
            {scanning
              ? <><span style={{ width:16,height:16,border:'2px solid rgba(0,232,136,.25)',borderTopColor:'#00e888',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block' }} />Processing…</>
              : '✅ Done & Pay'}
          </button>

          {/* discard */}
          <button onClick={() => navigate('/home')}
            style={{ padding:'10px 20px',border:'1px solid #0e1e38',borderRadius:14,cursor:'pointer',fontFamily:'DM Mono,monospace',fontSize:12,background:'transparent',color:'#2d4a66',transition:'color .2s,border-color .2s' }}
            onMouseOver={e => { e.currentTarget.style.color='#ff3b4e'; e.currentTarget.style.borderColor='rgba(255,59,78,.25)' }}
            onMouseOut={e => { e.currentTarget.style.color='#2d4a66'; e.currentTarget.style.borderColor='#0e1e38' }}
          >
            ✕ Discard & Exit
          </button>
        </div>
      </div>

      {/* Toast */}
      <div style={{
        position:'fixed',bottom:22,right:22,zIndex:999,padding:'12px 18px',borderRadius:12,fontSize:13,fontWeight:500,
        display:'flex',alignItems:'center',gap:8,pointerEvents:'none',
        transform:toast.show?'translateY(0)':'translateY(80px)',
        opacity:toast.show?1:0,transition:'transform .4s cubic-bezier(.22,1,.36,1),opacity .4s',
        maxWidth:340,lineHeight:1.4,fontFamily:'DM Mono,monospace',
        background:toast.type==='success'?'#081f14':toast.type==='error'?'#1a0507':toast.type==='warn'?'#1a1000':'#050f20',
        border:`1px solid ${toast.type==='success'?'rgba(0,232,136,.4)':toast.type==='error'?'rgba(255,59,78,.4)':toast.type==='warn'?'rgba(245,166,35,.4)':'rgba(0,232,255,.3)'}`,
        color:toast.type==='success'?'#00e888':toast.type==='error'?'#ff3b4e':toast.type==='warn'?'#f5a623':'#00e8ff',
      }}>
        {toast.msg}
      </div>
    </>
  )
}

/* ── Global CSS injected via <style> ──────────────────────── */
const globalCSS = `
  @keyframes shimmer  { 0%,100%{opacity:.4} 50%{opacity:1} }
  @keyframes blink    { 0%,100%{opacity:1}  50%{opacity:.25} }
  @keyframes spin     { to{transform:rotate(360deg)} }
  @keyframes scanLine { 0%{top:5%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:95%;opacity:0} }
  @keyframes bounce   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes cardIn   { from{opacity:0;transform:translateY(18px) scale(.98)} to{opacity:1;transform:none} }
  @keyframes rowIn    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
  @keyframes popIn    { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
`