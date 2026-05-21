import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/* ─── Mascot Intro Animation ────────────────────────────────────────── */
function MascotIntro() {
  const [phase, setPhase] = useState('enter') // enter → zoom → exit → done

  useEffect(() => {
    // Phase timeline: slide-up(0.6s) → zoom loop(1.8s) → slide-down(0.6s) = 3s total
    const t1 = setTimeout(() => setPhase('zoom'),  600)
    const t2 = setTimeout(() => setPhase('exit'),  2400)
    const t3 = setTimeout(() => setPhase('done'),  3000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'done') return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      {/* purple glow on floor */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 340, height: 120,
        background: 'radial-gradient(ellipse, rgba(124,58,237,.32) 0%, transparent 70%)',
        filter: 'blur(12px)',
        opacity: phase === 'zoom' ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }} />

      {/* mascot wrapper — slides up / down */}
      <div style={{
        position: 'relative',
        width: 240, height: 280, marginBottom: -8,
        transform: phase === 'enter'
          ? 'translateY(110%)'
          : phase === 'exit'
          ? 'translateY(110%)'
          : 'translateY(0)',
        transition: phase === 'enter'
          ? 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1)'
          : phase === 'exit'
          ? 'transform 0.55s cubic-bezier(0.55,0,1,0.45)'
          : 'none',
        animation: phase === 'zoom' ? 'mascotBob 1s ease-in-out infinite' : 'none',
      }}>

        {/* pulsing lens ring around the magnifying glass area */}
        {phase === 'zoom' && (
          <>
            <div style={{
              position: 'absolute', top: 68, left: 4,
              width: 76, height: 76, borderRadius: '50%',
              border: '2px solid rgba(167,139,250,.75)',
              animation: 'lensRing 1s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: 78, left: 14,
              width: 56, height: 56, borderRadius: '50%',
              border: '1px solid rgba(167,139,250,.35)',
              animation: 'lensRing 1s ease-in-out 0.15s infinite',
              pointerEvents: 'none',
            }} />
          </>
        )}

        {/* the mascot image */}
        <img
          src="/mascot.png"
          alt="NyatikNayan mascot"
          style={{
            width: '100%', height: '100%',
            objectFit: 'contain',
            objectPosition: 'bottom',
            filter: 'drop-shadow(0 0 32px rgba(124,58,237,.65)) drop-shadow(0 10px 20px rgba(0,0,0,.9))',
            animation: phase === 'zoom' ? 'lensZoom 1s ease-in-out infinite' : 'none',
          }}
        />

        {/* speech bubble — pops in during zoom phase */}
        {phase === 'zoom' && (
          <div style={{
            position: 'absolute', top: -14, right: -38,
            background: 'rgba(8,3,18,.96)',
            border: '1px solid rgba(124,58,237,.55)',
            borderRadius: '12px 12px 12px 3px',
            padding: '7px 13px',
            fontSize: 11, fontWeight: 700,
            color: '#a78bfa', fontFamily: 'monospace',
            letterSpacing: '1.2px', whiteSpace: 'nowrap',
            boxShadow: '0 0 22px rgba(124,58,237,.4), inset 0 0 0 1px rgba(255,255,255,.04)',
            animation: 'bubblePop 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            Let's verify! 🔍
            {/* little tail */}
            <div style={{
              position: 'absolute', bottom: -6, left: 10,
              width: 10, height: 10,
              background: 'rgba(8,3,18,.96)',
              border: '1px solid rgba(124,58,237,.55)',
              borderTop: 'none', borderRight: 'none',
              transform: 'rotate(-45deg)',
            }} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 3-D Floating Shape SVGs (video-matched) ─────────────────────── */
function Shape3D({ style, type = 'cube' }) {
  if (type === 'cube')
    return (
      <svg viewBox="0 0 120 120" style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9d6fff" stopOpacity=".92" />
            <stop offset="100%" stopColor="#5b21b6" stopOpacity=".75" />
          </linearGradient>
          <linearGradient id="cLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4c1d95" stopOpacity=".95" />
            <stop offset="100%" stopColor="#2e1065" stopOpacity=".85" />
          </linearGradient>
          <linearGradient id="cRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6d28d9" stopOpacity=".75" />
            <stop offset="100%" stopColor="#3b0764" stopOpacity=".65" />
          </linearGradient>
          <filter id="cubeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.49  0 0 0 0 0.27  0 0 0 0 0.93  0 0 0 0.6 0" result="shadow" />
            <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g filter="url(#cubeShadow)">
          <polygon points="60,8 102,31 60,54 18,31" fill="url(#cTop)" />
          <polygon points="18,31 60,54 60,102 18,79" fill="url(#cLeft)" />
          <polygon points="60,54 102,31 102,79 60,102" fill="url(#cRight)" />
          <polygon points="60,8 102,31 60,54 18,31" fill="none" stroke="#b794f4" strokeWidth="1" strokeOpacity=".7" />
          <polygon points="18,31 60,54 60,102 18,79" fill="none" stroke="#7c3aed" strokeWidth=".8" strokeOpacity=".45" />
          <polygon points="60,54 102,31 102,79 60,102" fill="none" stroke="#7c3aed" strokeWidth=".8" strokeOpacity=".45" />
        </g>
      </svg>
    )

  if (type === 'bolt')
    return (
      <svg viewBox="0 0 120 120" style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity=".9" />
            <stop offset="100%" stopColor="#6d28d9" stopOpacity=".65" />
          </linearGradient>
          <filter id="boltGlow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.27  0 0 0 0 1  0 0 0 0.7 0" result="glow" />
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g filter="url(#boltGlow)">
          <polygon points="70,10 35,58 58,58 50,110 85,62 62,62" fill="url(#bG)" />
          <polygon points="70,10 35,58 58,58 50,110 85,62 62,62" fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeOpacity=".6" />
        </g>
      </svg>
    )

  if (type === 'star')
    return (
      <svg viewBox="0 0 120 120" style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sG2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ddd6fe" stopOpacity=".9" />
            <stop offset="100%" stopColor="#6d28d9" stopOpacity=".55" />
          </linearGradient>
        </defs>
        {[0, 45, 90, 135].map(r => (
          <rect key={r} x="53" y="10" width="14" height="100" rx="7"
            fill="url(#sG2)" opacity=".8"
            transform={`rotate(${r} 60 60)`} />
        ))}
        <circle cx="60" cy="60" r="11" fill="#a78bfa" opacity=".95" />
        <circle cx="60" cy="60" r="6" fill="#ede9fe" opacity=".7" />
      </svg>
    )

  if (type === 'ring')
    return (
      <svg viewBox="0 0 120 120" style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rG2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9d6fff" stopOpacity=".95" />
            <stop offset="100%" stopColor="#4c1d95" stopOpacity=".5" />
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="60" rx="50" ry="22" stroke="url(#rG2)" strokeWidth="14" fill="none" />
        <ellipse cx="60" cy="60" rx="50" ry="22" stroke="#c4b5fd" strokeWidth="1" fill="none" strokeOpacity=".55" />
      </svg>
    )

  // shopping-bag shape for retail
  return (
    <svg viewBox="0 0 120 120" style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bagG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity=".88" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity=".7" />
        </linearGradient>
      </defs>
      <path d="M30 45 L24 100 H96 L90 45 Z" fill="url(#bagG)" />
      <path d="M44 45 C44 30 76 30 76 45" stroke="#c4b5fd" strokeWidth="5" strokeLinecap="round" fill="none" strokeOpacity=".8" />
      <path d="M30 45 L24 100 H96 L90 45 Z" fill="none" stroke="#b794f4" strokeWidth="1" strokeOpacity=".6" />
      <rect x="52" y="62" width="16" height="3" rx="1.5" fill="#ede9fe" opacity=".5" />
    </svg>
  )
}

/* ─── Floating retail-context particle dots ─────────────────────────── */
function ParticleField() {
  const dots = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${(i * 37 + 7) % 100}%`,
    top: `${(i * 53 + 11) % 100}%`,
    size: 1 + (i % 3),
    delay: `${(i * 0.4) % 6}s`,
    dur: `${5 + (i % 4)}s`,
  }))
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map(d => (
        <div key={d.id} style={{
          position: 'absolute', left: d.left, top: d.top,
          width: d.size, height: d.size, borderRadius: '50%',
          background: '#7c3aed', opacity: 0,
          animation: `particlePulse ${d.dur} ease-in-out ${d.delay} infinite`,
        }} />
      ))}
    </div>
  )
}

/* ─── Glass Browser Card ────────────────────────────────────────────── */
function BrowserCard({ children, glowColor = '#7c3aed', style, urlLabel = 'smartretail.ai/verify' }) {
  return (
    <div style={{
      borderRadius: 18,
      border: `1px solid rgba(124,58,237,.38)`,
      background: 'rgba(8,3,18,.88)',
      backdropFilter: 'blur(14px)',
      boxShadow: `0 0 44px ${glowColor}2e, 0 0 88px ${glowColor}14, inset 0 0 0 1px rgba(255,255,255,.035)`,
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 14px',
        background: 'rgba(0,0,0,.55)',
        borderBottom: '1px solid rgba(109,40,217,.22)',
      }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: .65 }} />
        ))}
        <div style={{
          flex: 1, height: 16, marginLeft: 8, borderRadius: 4,
          background: 'rgba(109,40,217,.14)', border: '1px solid rgba(109,40,217,.22)',
          display: 'flex', alignItems: 'center', paddingLeft: 8,
        }}>
          <span style={{ fontSize: 9, color: '#7c3aed', fontFamily: 'monospace', opacity: .75, letterSpacing: '.4px' }}>{urlLabel}</span>
        </div>
      </div>
      {children}
    </div>
  )
}

/* ─── Retail Stats Ticker ────────────────────────────────────────────── */
function StatsTicker() {
  const stats = [
    { icon: '🛒', label: 'Items Verified', value: '1.2M+' },
    { icon: '⚡', label: 'Avg Scan Time', value: '0.8s' },
    { icon: '✓', label: 'Match Accuracy', value: '98.4%' },
    { icon: '📦', label: 'SKUs Tracked', value: '240K' },
    { icon: '🔲', label: 'Barcodes Decoded', value: '850K+' },
    { icon: '🏪', label: 'Retail Stores', value: '3,800+' },
  ]
  return (
    <div style={{ overflow: 'hidden', position: 'relative', marginBottom: 48 }}>
      <div style={{ display: 'flex', gap: 0, animation: 'tickerScroll 22s linear infinite', width: 'max-content' }}>
        {[...stats, ...stats].map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 28px', whiteSpace: 'nowrap',
            borderRight: '1px solid rgba(109,40,217,.18)',
          }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 9, color: '#4c1d95', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'monospace' }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#a78bfa', fontFamily: "'Sora', sans-serif", letterSpacing: '-.3px' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(to right, #000, transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(to left, #000, transparent)', pointerEvents: 'none' }} />
    </div>
  )
}

/* ─── Drop Zone ─────────────────────────────────────────────────────── */
function DropZone({ type, analyzing, imageB64, label, icon, onFile, onCamera, onRemove, fileRef, product, barcode }) {
  const [drag, setDrag] = useState(false)
  const isProd = type === 'product'
  const accent = isProd ? '#a78bfa' : '#c4b5fd'
  const glowC = isProd ? '#7c3aed' : '#9d6fff'
  const ocrText = isProd ? product.ocrText : (barcode.ocrText || barcode.barcodeValue)

  return (
    <BrowserCard glowColor={glowC} urlLabel={isProd ? 'smartretail.ai/product-ocr' : 'smartretail.ai/barcode-decode'}>
      <div style={{
        padding: '13px 18px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid rgba(109,40,217,.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, fontSize: 16,
            background: `rgba(109,40,217,.18)`, border: `1px solid rgba(124,58,237,.38)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 14px ${glowC}44`,
          }}>{icon}</div>
          <div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 700, color: '#e9d5ff', letterSpacing: '.2px' }}>{label}</div>
            <div style={{ fontSize: 10, color: '#5b21b6', fontFamily: 'monospace', marginTop: 1, letterSpacing: '.5px' }}>
              {isProd ? 'OCR text extraction' : 'Barcode decode + OCR'}
            </div>
          </div>
        </div>
        {imageB64 && (
          <button onClick={onRemove} style={{
            width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(239,68,68,.18)', color: '#f87171', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        )}
      </div>

      <div
        onClick={() => !imageB64 && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) onFile(f) }}
        style={{
          position: 'relative', margin: '14px 14px 0', borderRadius: 11,
          border: `1.5px dashed ${drag || analyzing ? accent : 'rgba(109,40,217,.35)'}`,
          aspectRatio: '4/3', overflow: 'hidden',
          cursor: imageB64 ? 'default' : 'pointer',
          background: drag ? 'rgba(109,40,217,.09)' : 'rgba(0,0,0,.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, transition: 'border-color .3s, background .3s',
          boxShadow: drag ? `inset 0 0 32px rgba(109,40,217,.14)` : 'none',
        }}
      >
        {imageB64
          ? <img src={imageB64} alt="preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', borderRadius: 9 }} />
          : <>
              <div style={{
                width: 54, height: 54, borderRadius: 14, background: 'rgba(109,40,217,.1)',
                border: '1px solid rgba(109,40,217,.22)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 26,
              }}>{isProd ? '🖼️' : '🔲'}</div>
              <div style={{ textAlign: 'center', lineHeight: 1.65, pointerEvents: 'none' }}>
                <div style={{ fontSize: 13, color: '#7c3aed', fontFamily: "'Sora', sans-serif", fontWeight: 500 }}>
                  Drop {isProd ? 'product' : 'barcode'} image
                </div>
                <div style={{ fontSize: 10, color: '#4c1d95', fontFamily: 'monospace', marginTop: 3, letterSpacing: '.8px' }}>JPG · PNG · WEBP</div>
              </div>
            </>
        }
        {analyzing && (
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            boxShadow: `0 0 14px ${accent}`,
            animation: 'scanLine 1.6s ease-in-out infinite',
          }} />
        )}
        {!imageB64 && <>
          {[['tl', 0, 0], ['tr', 0, 'auto'], ['bl', 'auto', 0], ['br', 'auto', 'auto']].map(([id, t, r]) => (
            <svg key={id} width="16" height="16" viewBox="0 0 16 16" style={{
              position: 'absolute',
              top: t === 0 ? 8 : t,
              right: r === 0 ? 8 : r,
              bottom: r === 'auto' && t === 'auto' ? 8 : 'auto',
              left: r === 0 ? 8 : r === 'auto' && t === 0 ? 'auto' : r === 'auto' ? 8 : 'auto',
              opacity: .35,
              transform: id === 'tr' ? 'scaleX(-1)' : id === 'br' ? 'scale(-1,-1)' : id === 'bl' ? 'scaleY(-1)' : 'none',
            }}>
              <path d="M2 14 L2 2 L14 2" stroke={accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          ))}
        </>}
      </div>

      {imageB64 && ocrText && (
        <div style={{
          margin: '12px 14px 0', padding: '10px 12px', borderRadius: 9,
          background: 'rgba(0,0,0,.4)', border: '1px solid rgba(109,40,217,.22)',
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.75,
        }}>
          <div style={{ fontSize: 9, letterSpacing: '1.8px', textTransform: 'uppercase', color: accent, marginBottom: 5, fontWeight: 700 }}>
            {isProd ? 'Extracted Text' : 'Decoded Data'}
          </div>
          <div style={{ color: '#c4b5fd', wordBreak: 'break-all' }}>
            {isProd
              ? (product.ocrText || '(no text detected)')
              : [barcode.barcodeValue && `Barcode: ${barcode.barcodeValue}`, barcode.ocrText && `Text: ${barcode.ocrText.slice(0, 200)}`].filter(Boolean).join('\n') || '(no data decoded)'}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 14px 14px', display: 'flex', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()} style={{
          flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          fontFamily: "'Sora', sans-serif", border: '1px solid rgba(124,58,237,.38)',
          background: 'rgba(109,40,217,.11)', color: '#a78bfa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          transition: 'background .2s, border-color .2s',
        }} className="upload-btn">↑ Upload</button>
        <button onClick={() => onCamera(type)} style={{
          padding: '8px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.03)',
          color: '#5b21b6',
        }}>📷</button>
      </div>
      <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
    </BrowserCard>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────────── */
export default function HomePage({ user, setUser }) {
  const navigate = useNavigate()
  const [product, setProduct] = useState({ base64: null, ocrText: '', ready: false })
  const [barcode, setBarcode] = useState({ base64: null, ocrText: '', barcodeValue: '', ready: false })
  const [productAnalyzing, setProductAnalyzing] = useState(false)
  const [barcodeAnalyzing, setBarcodeAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [matching, setMatching] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: '', show: false })
  const [camOpen, setCamOpen] = useState(false)
  const [camTarget, setCamTarget] = useState(null)
  const camVideoRef = useRef(null)
  const camStreamRef = useRef(null)
  const productFileRef = useRef(null)
  const barcodeFileRef = useRef(null)

  useEffect(() => {
    const addScript = src => {
      if (document.querySelector(`script[src="${src}"]`)) return
      const s = document.createElement('script'); s.src = src; document.head.appendChild(s)
    }
    addScript('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.2/tesseract.min.js')
    addScript('https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap'
    if (!document.querySelector(`link[href="${link.href}"]`)) document.head.appendChild(link)
  }, [])

  function showToast(msg, type = 'info') {
    setToast({ msg, type, show: true })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 4000)
  }

  async function logout() {
    await fetch('/api/logout', { credentials: 'include' })
    setUser(null); navigate('/')
  }

  function loadImage(file, type) {
    const reader = new FileReader()
    reader.onload = async e => {
      const b64 = e.target.result
      if (type === 'product') {
        setProduct({ base64: b64, ocrText: '', ready: false })
        setProductAnalyzing(true)
        showToast('Analyzing product image…', 'info')
        await runProductOCR(b64)
        setProductAnalyzing(false)
      } else {
        setBarcode({ base64: b64, ocrText: '', barcodeValue: '', ready: false })
        setBarcodeAnalyzing(true)
        showToast('Decoding barcode…', 'info')
        await runBarcodeAnalysis(b64)
        setBarcodeAnalyzing(false)
      }
      setResult(null)
    }
    reader.readAsDataURL(file)
  }

  async function runProductOCR(b64) {
    try {
      const Tesseract = window.Tesseract
      if (!Tesseract) { setProduct(p => ({ ...p, ocrText: '(Tesseract not loaded)', ready: true })); return }
      const worker = await Tesseract.createWorker('eng')
      const { data: { text } } = await worker.recognize(b64)
      await worker.terminate()
      setProduct({ base64: b64, ocrText: text.trim().replace(/\s+/g, ' '), ready: true })
      showToast('Product OCR complete', 'success')
    } catch {
      setProduct(p => ({ ...p, ready: true }))
      showToast('OCR failed — match will use image only', 'error')
    }
  }

  async function runBarcodeAnalysis(b64) {
    let barcodeVal = '', ocrText = ''
    try {
      if (window.Quagga)
        barcodeVal = await new Promise((res, rej) => {
          window.Quagga.decodeSingle({
            decoder: { readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'code_39_reader', 'upc_reader'] },
            locate: true, src: b64
          }, r => r?.codeResult ? res(r.codeResult.code) : rej(new Error('No barcode')))
        })
    } catch {}
    try {
      if (window.Tesseract) {
        const worker = await window.Tesseract.createWorker('eng')
        const { data: { text } } = await worker.recognize(b64)
        await worker.terminate()
        ocrText = text.trim().replace(/\s+/g, ' ')
      }
    } catch {}
    setBarcode({ base64: b64, ocrText, barcodeValue: barcodeVal, ready: true })
    showToast('Barcode analysis complete', 'success')
  }

  function tokenize(str = '') {
    const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'has', 'its', 'per', 'can', 'all', 'net', 'wt', 'oz'])
    return new Set(str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !STOP.has(t)))
  }

  async function runMatch() {
    setMatching(true); setResult(null)
    showToast('Running verification…', 'info')
    await new Promise(r => setTimeout(r, 600))
    try {
      const pT = tokenize(product.ocrText)
      const bT = tokenize(barcode.ocrText + ' ' + barcode.barcodeValue)
      const overlap = [...pT].filter(t => bT.has(t))
      const union = new Set([...pT, ...bT]).size
      const confidence = union > 0 ? Math.round(overlap.length / union * 100) : 0

      let inventoryResult = null
      if (barcode.barcodeValue) {
        try {
          const r = await fetch('/api/checkout/match-verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ barcode: barcode.barcodeValue, product_ocr: product.ocrText, barcode_ocr: barcode.ocrText }),
          })
          if (r.ok) inventoryResult = await r.json()
        } catch {}
      }

      let verdict, type, icon, sub
      if (inventoryResult && !inventoryResult.found) {
        verdict = 'Not in Inventory'; type = 'mismatch'; icon = '🚫'
        sub = `Barcode ${barcode.barcodeValue} not found in store inventory.`
      } else if (confidence >= 45 || inventoryResult?.match) {
        verdict = 'Match Verified'; type = 'match'; icon = '✓'
        sub = inventoryResult ? `Confirmed: ${inventoryResult.product_name || ''}` : `${confidence}% text overlap detected.`
      } else if (confidence >= 20) {
        verdict = 'Partial Match'; type = 'partial'; icon = '⚠'
        sub = `Low overlap (${confidence}%). Manual verification recommended.`
      } else {
        verdict = 'No Match'; type = 'mismatch'; icon = '✗'
        sub = `Only ${confidence}% text overlap. Product may not match barcode.`
      }

      setResult({ verdict, type, icon, sub, confidence, overlap, inventoryResult, productText: product.ocrText, barcodeText: barcode.ocrText, barcodeVal: barcode.barcodeValue })
      showToast(type === 'match' ? 'Match verified!' : type === 'mismatch' ? 'Match failed' : 'Partial match', type === 'match' ? 'success' : 'error')
    } catch (err) {
      showToast('Match failed: ' + err.message, 'error')
    } finally { setMatching(false) }
  }

  async function openCamera(type) {
    setCamTarget(type); setCamOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      camStreamRef.current = stream
      if (camVideoRef.current) camVideoRef.current.srcObject = stream
    } catch { showToast('Camera access denied', 'error'); closeCamera() }
  }

  function closeCamera() {
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    if (camVideoRef.current) camVideoRef.current.srcObject = null
    setCamOpen(false); setCamTarget(null)
  }

  function captureFromCamera() {
    const video = camVideoRef.current
    if (!video?.videoWidth) { showToast('Camera not ready', 'error'); return }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const b64 = canvas.toDataURL('image/jpeg', .9)
    const type = camTarget; closeCamera()
    loadImageFromB64(b64, type)
  }

  async function loadImageFromB64(b64, type) {
    if (type === 'product') {
      setProduct({ base64: b64, ocrText: '', ready: false }); setProductAnalyzing(true)
      await runProductOCR(b64); setProductAnalyzing(false)
    } else {
      setBarcode({ base64: b64, ocrText: '', barcodeValue: '', ready: false }); setBarcodeAnalyzing(true)
      await runBarcodeAnalysis(b64); setBarcodeAnalyzing(false)
    }
    setResult(null)
  }

  const rc = { match: '#86efac', mismatch: '#fca5a5', partial: '#fcd34d' }
  const rb = { match: 'rgba(134,239,172,.05)', mismatch: 'rgba(252,165,165,.05)', partial: 'rgba(252,211,77,.05)' }
  const rg = { match: '#16a34a', mismatch: '#dc2626', partial: '#d97706' }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #000; }

        @keyframes floatA { 0%,100% { transform: translateY(0) rotate(0deg) scale(1) } 50% { transform: translateY(-24px) rotate(9deg) scale(1.02) } }
        @keyframes floatB { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(20px) rotate(-7deg) } }
        @keyframes floatC { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-16px) rotate(13deg) } }
        @keyframes floatD { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(22px) rotate(-11deg) } }
        @keyframes floatE { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-18px) rotate(6deg) } }

        @keyframes scanLine {
          0%   { top: 5%;  opacity: 0 }
          8%   { opacity: 1 }
          92%  { opacity: 1 }
          100% { top: 95%; opacity: 0 }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes resultIn { from { opacity:0; transform:translateY(26px) } to { opacity:1; transform:none } }
        @keyframes heroIn { from { opacity:0; transform:translateY(22px) } to { opacity:1; transform:none } }
        @keyframes pulse { 0%,100% { opacity:1; box-shadow:0 0 6px #a78bfa } 50% { opacity:.35; box-shadow:0 0 2px #7c3aed } }
        @keyframes particlePulse { 0%,100%{opacity:0;transform:scale(1)} 50%{opacity:.55;transform:scale(1.6)} }
        @keyframes tickerScroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes matchGlow { 0%,100%{box-shadow:0 4px 32px rgba(124,58,237,.35)} 50%{box-shadow:0 4px 52px rgba(124,58,237,.65),0 0 60px rgba(167,139,250,.2)} }
        @keyframes badgeShimmer {
          0%   { background-position: -200% center }
          100% { background-position:  200% center }
        }

        /* ── Mascot animations ── */
        @keyframes mascotBob {
          0%,100% { transform: translateY(0) }
          50%     { transform: translateY(-10px) }
        }
        @keyframes lensZoom {
          0%,100% { transform: scale(1) }
          40%     { transform: scale(1.06) }
          70%     { transform: scale(0.97) }
        }
        @keyframes lensRing {
          0%   { transform: scale(0.7); opacity: 0.9 }
          100% { transform: scale(1.7); opacity: 0   }
        }
        @keyframes bubblePop {
          0%   { transform: scale(0) translateY(6px); opacity: 0 }
          70%  { transform: scale(1.08) translateY(-2px); opacity: 1 }
          100% { transform: scale(1) translateY(0); opacity: 1 }
        }

        .nav-btn:hover { color: #a78bfa !important; border-color: rgba(167,139,250,.38) !important; }
        .upload-btn:hover { background: rgba(109,40,217,.2) !important; }
        .match-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 48px rgba(124,58,237,.55) !important; }
        .match-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      {/* ── Mascot intro (renders on top of everything for 3s) ── */}
      <MascotIntro />

      {/* ── Background layers ── */}
      <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 0 }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% -5%, rgba(109,40,217,.2) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 90% 50% at 50% 120%, rgba(76,29,149,.12) 0%, transparent 60%)', zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: 60, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(109,40,217,.25), transparent)', zIndex: 1, pointerEvents: 'none' }} />

      <ParticleField />

      {/* ── Floating 3D shapes ── */}
      <Shape3D type="cube"  style={{ position:'fixed', top:28,  left:-14,  width:170, height:170, opacity:.9,  animation:'floatA 8s ease-in-out infinite',      zIndex:0, filter:'drop-shadow(0 0 28px rgba(124,58,237,.55))' }} />
      <Shape3D type="bolt"  style={{ position:'fixed', top:10,  right:22,  width:150, height:150, opacity:.75, animation:'floatB 10s ease-in-out infinite',     zIndex:0, filter:'drop-shadow(0 0 22px rgba(167,139,250,.45))' }} />
      <Shape3D type="cube"  style={{ position:'fixed', bottom:50, left:30, width:140, height:140, opacity:.68, animation:'floatC 12s ease-in-out infinite',     zIndex:0, filter:'drop-shadow(0 0 20px rgba(109,40,217,.5))',  transform:'rotate(28deg)' }} />
      <Shape3D type="ring"  style={{ position:'fixed', bottom:65, right:14, width:160, height:160, opacity:.62, animation:'floatD 9s ease-in-out infinite',    zIndex:0, filter:'drop-shadow(0 0 24px rgba(124,58,237,.42))' }} />
      <Shape3D type="bag"   style={{ position:'fixed', top:'38%', left:8,  width:90,  height:90,  opacity:.45, animation:'floatE 14s ease-in-out infinite',    zIndex:0, filter:'drop-shadow(0 0 16px rgba(124,58,237,.35))' }} />
      <Shape3D type="star"  style={{ position:'fixed', top:'45%', right:10, width:80, height:80,  opacity:.4,  animation:'floatA 11s ease-in-out 2s infinite', zIndex:0, filter:'drop-shadow(0 0 14px rgba(167,139,250,.3))' }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', fontFamily: "'Sora', sans-serif" }}>

        {/* ── Navbar ── */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', height: 60,
          background: 'rgba(0,0,0,.72)', borderBottom: '1px solid rgba(109,40,217,.2)',
          backdropFilter: 'blur(22px)', position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11, fontSize: 19,
              background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 22px rgba(124,58,237,.55)',
            }}>🛒</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-.4px' }}>
                Nyatik<span style={{ color: '#a78bfa' }}>Nayan</span>
              </div>
              <div style={{ fontSize: 9, color: '#4c1d95', letterSpacing: '2.2px', textTransform: 'uppercase' }}>Retail Intelligence</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {[{ label: 'Checkout', path: '/checkout' }, { label: 'Dashboard', path: '/dashboard' }].map(n => (
              <button key={n.path} className="nav-btn" onClick={() => navigate(n.path)} style={{
                padding: '5px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: 'transparent', border: '1px solid rgba(109,40,217,.3)', color: '#6d28d9', cursor: 'pointer',
                transition: 'all .2s',
              }}>{n.label}</button>
            ))}
            <button onClick={logout} style={{
              padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 0 20px rgba(124,58,237,.38)',
            }}>Sign Out</button>
          </div>
        </header>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', padding: '68px 24px 44px', animation: 'heroIn .85s ease both' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 16px', borderRadius: 22, marginBottom: 30,
            background: 'rgba(109,40,217,.14)', border: '1px solid rgba(109,40,217,.32)',
            fontSize: 10, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase',
            color: '#a78bfa', fontFamily: 'monospace',
            backgroundImage: 'linear-gradient(90deg, rgba(109,40,217,.0) 0%, rgba(167,139,250,.12) 50%, rgba(109,40,217,.0) 100%)',
            backgroundSize: '200% auto',
            animation: 'badgeShimmer 3.5s linear infinite',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: 'pulse 2s ease-in-out infinite' }} />
            AI Product Verification
          </div>

          <h1 style={{
            fontSize: 'clamp(38px,6.5vw,76px)', fontWeight: 800, lineHeight: 1.04,
            letterSpacing: '-2.5px', color: '#fff', marginBottom: 18, marginTop: 50,
          }}>
            Scan, Match &{' '}
            <span style={{ color: '#a78bfa' }}>Verify</span>
            <br />in Seconds.
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.28)', maxWidth: 520, margin: '0 auto 10px', lineHeight: 1.75, fontWeight: 400 }}>
            Upload product and barcode images. Our OCR engine extracts text, cross-references your inventory, and delivers an instant match verdict.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#3b1f6a', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: 'monospace' }}>Trusted by retailers on</span>
            {['Zomato', 'Blinkit', 'Zepto', 'Amazon'].map(b => (
              <span key={b} style={{ fontSize: 10, color: '#5b21b6', fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(109,40,217,.2)', background: 'rgba(109,40,217,.06)' }}>{b}</span>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 38 }}>
            <svg width="1" height="50" viewBox="0 0 1 50"><line x1=".5" y1="0" x2=".5" y2="50" stroke="rgba(109,40,217,.4)" strokeWidth="1" strokeDasharray="4 5" /></svg>
          </div>
        </div>

        {/* ── Stats ticker ── */}
        <StatsTicker />

        {/* ── Scan Arena ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 28,
          padding: '0 32px 38px', maxWidth: 1120, margin: '0 auto', width: '100%', alignItems: 'start',
        }}>
          <DropZone type="product" analyzing={productAnalyzing} imageB64={product.base64}
            label="Product Image" icon="📦"
            onFile={f => loadImage(f, 'product')}
            onCamera={openCamera}
            onRemove={() => { setProduct({ base64: null, ocrText: '', ready: false }); setResult(null) }}
            fileRef={productFileRef}
            product={product} barcode={barcode} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 86 }}>
            <svg width="1" height="54" viewBox="0 0 1 54"><line x1=".5" y1="0" x2=".5" y2="54" stroke="rgba(109,40,217,.32)" strokeWidth="1" strokeDasharray="4 5" /></svg>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'rgba(109,40,217,.1)', border: '1px solid rgba(109,40,217,.32)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13, color: '#4c1d95', letterSpacing: 1,
              boxShadow: '0 0 22px rgba(109,40,217,.18)',
            }}>VS</div>
            <svg width="1" height="54" viewBox="0 0 1 54"><line x1=".5" y1="0" x2=".5" y2="54" stroke="rgba(109,40,217,.32)" strokeWidth="1" strokeDasharray="4 5" /></svg>
          </div>

          <DropZone type="barcode" analyzing={barcodeAnalyzing} imageB64={barcode.base64}
            label="Barcode Image" icon="🔲"
            onFile={f => loadImage(f, 'barcode')}
            onCamera={openCamera}
            onRemove={() => { setBarcode({ base64: null, ocrText: '', barcodeValue: '', ready: false }); setResult(null) }}
            fileRef={barcodeFileRef}
            product={product} barcode={barcode} />
        </div>

        {/* ── Match Button ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '0 32px 44px' }}>
          <button className="match-btn" onClick={runMatch}
            disabled={!(product.ready && barcode.ready) || matching}
            style={{
              padding: '17px 70px', border: 'none', borderRadius: 14, cursor: 'pointer',
              fontFamily: "'Sora', sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: '.2px',
              background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              color: '#fff', transition: 'transform .2s, box-shadow .3s',
              animation: (product.ready && barcode.ready && !matching) ? 'matchGlow 2.8s ease-in-out infinite' : 'none',
              boxShadow: '0 4px 32px rgba(124,58,237,.38)',
              opacity: (!(product.ready && barcode.ready) || matching) ? .32 : 1,
              display: 'flex', alignItems: 'center', gap: 11,
            }}>
            {matching
              ? <><span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.28)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Verifying…</>
              : '⚡ Run Match Verification'}
          </button>
          <p style={{ fontSize: 11, color: 'rgba(109,40,217,.65)', fontFamily: 'monospace', letterSpacing: '.6px' }}>
            Both images required · OCR + inventory cross-check
          </p>
        </div>

        {/* ── Result Panel ── */}
        {result && (
          <div style={{ maxWidth: 1120, margin: '0 auto', width: '100%', padding: '0 32px 64px', animation: 'resultIn .6s ease both' }}>
            <BrowserCard glowColor={rg[result.type]} urlLabel="smartretail.ai/result">
              <div style={{
                padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20,
                borderBottom: '1px solid rgba(255,255,255,.045)',
                background: rb[result.type],
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, fontSize: 28,
                  background: `rgba(${result.type === 'match' ? '134,239,172' : result.type === 'mismatch' ? '252,165,165' : '252,211,77'},.1)`,
                  border: `1px solid ${rc[result.type]}38`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', fontWeight: 900, color: rc[result.type],
                  boxShadow: `0 0 26px ${rg[result.type]}40`,
                  flexShrink: 0,
                }}>{result.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.6px', color: rc[result.type] }}>{result.verdict}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.38)', marginTop: 5, lineHeight: 1.55 }}>{result.sub}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.28)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 5, fontFamily: 'monospace' }}>Confidence</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: rc[result.type], fontFamily: 'monospace', lineHeight: 1 }}>{result.confidence}%</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {[
                  {
                    label: 'Product Analysis', color: '#a78bfa',
                    rows: [['OCR Text', result.productText?.slice(0, 200) || '(empty)'], ['Matching tokens', result.overlap?.slice(0, 8).join(', ') || 'none']],
                  },
                  {
                    label: 'Barcode Analysis', color: '#c4b5fd',
                    rows: [['Decoded barcode', result.barcodeVal || '(not decoded)'], ['Inventory', result.inventoryResult?.found ? `In stock: ${result.inventoryResult.product_name || ''}` : 'Not in inventory']],
                  }
                ].map((col, i) => (
                  <div key={i} style={{ padding: '20px 28px', borderRight: i === 0 ? '1px solid rgba(255,255,255,.045)' : 'none' }}>
                    <div style={{ fontSize: 9, letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 14, fontFamily: 'monospace', fontWeight: 700, color: col.color }}>{col.label}</div>
                    {col.rows.map(([k, v], j) => (
                      <div key={j} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: 'rgba(109,40,217,.8)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
                        <div style={{ fontSize: 13, color: '#e9d5ff', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.55 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </BrowserCard>
          </div>
        )}
      </div>

      {/* ── Camera Modal ── */}
      {camOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) closeCamera() }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.93)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <BrowserCard glowColor="#7c3aed" style={{ width: '100%', maxWidth: 520 }} urlLabel="smartretail.ai/camera">
            <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(109,40,217,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#e9d5ff', fontFamily: "'Sora', sans-serif" }}>
                {camTarget === 'product' ? '📦 Capture Product' : '🔲 Capture Barcode'}
              </span>
              <button onClick={closeCamera} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.28)', color: '#f87171', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ position: 'relative', aspectRatio: '4/3', background: '#000', overflow: 'hidden' }}>
              <video ref={camVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: '8%', right: '8%', height: 2, background: 'linear-gradient(90deg,transparent,#a78bfa,transparent)', boxShadow: '0 0 14px #7c3aed', animation: 'scanLine 2s ease-in-out infinite' }} />
            </div>
            <div style={{ padding: 14, display: 'flex', gap: 10 }}>
              <button onClick={captureFromCamera} style={{ flex: 1, padding: 12, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sora', sans-serif", fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff' }}>📸 Capture</button>
              <button onClick={closeCamera} style={{ padding: '12px 18px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(109,40,217,.28)', color: '#6d28d9', fontSize: 13 }}>Cancel</button>
            </div>
          </BrowserCard>
        </div>
      )}

      {/* ── Toast ── */}
      <div style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 999,
        padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
        transform: toast.show ? 'translateY(0)' : 'translateY(84px)',
        opacity: toast.show ? 1 : 0, transition: 'transform .42s ease, opacity .42s ease',
        maxWidth: 320, fontFamily: "'Sora', sans-serif",
        background: toast.type === 'success' ? 'rgba(22,163,74,.14)' : toast.type === 'error' ? 'rgba(220,38,38,.14)' : 'rgba(109,40,217,.14)',
        border: `1px solid ${toast.type === 'success' ? 'rgba(134,239,172,.38)' : toast.type === 'error' ? 'rgba(252,165,165,.38)' : 'rgba(167,139,250,.38)'}`,
        color: toast.type === 'success' ? '#86efac' : toast.type === 'error' ? '#fca5a5' : '#a78bfa',
        backdropFilter: 'blur(14px)',
      }}>
        {toast.msg}
      </div>
    </>
  )
}