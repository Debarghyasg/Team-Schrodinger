import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate()
  const [product, setProduct] = useState({ base64:null, ocrText:'', ready:false })
  const [barcode, setBarcode] = useState({ base64:null, ocrText:'', barcodeValue:'', ready:false })
  const [productAnalyzing, setProductAnalyzing] = useState(false)
  const [barcodeAnalyzing, setBarcodeAnalyzing] = useState(false)
  const [result, setResult]   = useState(null)
  const [matching, setMatching] = useState(false)
  const [toast, setToast]     = useState({ msg:'', type:'', show:false })
  const [camOpen, setCamOpen] = useState(false)
  const [camTarget, setCamTarget] = useState(null)
  const camVideoRef = useRef(null)
  const camStreamRef = useRef(null)
  const productFileRef = useRef(null)
  const barcodeFileRef = useRef(null)

  // Load Tesseract + Quagga from CDN
  useEffect(() => {
    const addScript = (src) => {
      if (document.querySelector(`script[src="${src}"]`)) return
      const s = document.createElement('script')
      s.src = src; document.head.appendChild(s)
    }
    addScript('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.2/tesseract.min.js')
    addScript('https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js')
  }, [])

  function showToast(msg, type='info') {
    setToast({ msg, type, show:true })
    setTimeout(() => setToast(t=>({...t,show:false})), 4000)
  }

  async function logout() {
    await fetch('/api/logout', { credentials:'include' })
    setUser(null); navigate('/')
  }

  function loadImage(file, type) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const b64 = e.target.result
      if (type === 'product') {
        setProduct({ base64:b64, ocrText:'', ready:false })
        setProductAnalyzing(true)
        showToast('Product image loaded — analyzing…', 'info')
        await runProductOCR(b64)
        setProductAnalyzing(false)
      } else {
        setBarcode({ base64:b64, ocrText:'', barcodeValue:'', ready:false })
        setBarcodeAnalyzing(true)
        showToast('Barcode image loaded — analyzing…', 'info')
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
      if (!Tesseract) { setProduct(p=>({...p,ocrText:'(Tesseract not loaded)',ready:true})); return }
      const worker = await Tesseract.createWorker('eng')
      const { data:{ text } } = await worker.recognize(b64)
      await worker.terminate()
      const clean = text.trim().replace(/\s+/g,' ')
      setProduct({ base64:b64, ocrText:clean, ready:true })
      showToast('Product OCR complete', 'success')
    } catch {
      setProduct(p=>({...p,ready:true}))
      showToast('OCR failed — match will use image only', 'error')
    }
  }

  async function runBarcodeAnalysis(b64) {
    let barcodeVal = '', ocrText = ''
    try {
      if (window.Quagga) {
        barcodeVal = await new Promise((res,rej) => {
          window.Quagga.decodeSingle({
            decoder:{ readers:['ean_reader','ean_8_reader','code_128_reader','code_39_reader','upc_reader'] },
            locate:true, src:b64
          }, r => r?.codeResult ? res(r.codeResult.code) : rej(new Error('No barcode')))
        })
      }
    } catch {}
    try {
      if (window.Tesseract) {
        const worker = await window.Tesseract.createWorker('eng')
        const { data:{ text } } = await worker.recognize(b64)
        await worker.terminate()
        ocrText = text.trim().replace(/\s+/g,' ')
      }
    } catch {}
    setBarcode({ base64:b64, ocrText, barcodeValue:barcodeVal, ready:true })
    showToast('Barcode analysis complete', 'success')
  }

  function tokenize(str='') {
    const STOPWORDS = new Set(['the','and','for','with','this','that','from','are','was','has','its','per','can','all','net','wt','oz'])
    return new Set(str.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(t=>t.length>=3&&!STOPWORDS.has(t)))
  }

  async function runMatch() {
    setMatching(true); setResult(null)
    showToast('Running match verification…', 'info')
    await new Promise(r=>setTimeout(r,600))
    try {
      const productTokens = tokenize(product.ocrText)
      const barcodeTokens = tokenize(barcode.ocrText+' '+barcode.barcodeValue)
      const overlap = [...productTokens].filter(t=>barcodeTokens.has(t))
      const union = new Set([...productTokens,...barcodeTokens]).size
      const jaccard = union>0 ? overlap.length/union : 0
      const confidence = Math.round(jaccard*100)

      let inventoryResult = null
      if (barcode.barcodeValue) {
        try {
          const r = await fetch('/api/checkout/match-verify', {
            method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
            body:JSON.stringify({ barcode:barcode.barcodeValue, product_ocr:product.ocrText, barcode_ocr:barcode.ocrText })
          })
          if (r.ok) inventoryResult = await r.json()
        } catch {}
      }

      let verdict, type, icon, sub
      if (inventoryResult && !inventoryResult.found) {
        verdict='Product Not in Inventory'; type='mismatch'; icon='🚫'
        sub=`Barcode ${barcode.barcodeValue} not found in your store's inventory.`
      } else if (confidence>=45 || (inventoryResult?.match)) {
        verdict='Match Verified ✓'; type='match'; icon='✅'
        sub=inventoryResult?`Confirmed in inventory: ${inventoryResult.product_name||''}`:`${confidence}% text overlap detected.`
      } else if (confidence>=20) {
        verdict='Partial Match'; type='partial'; icon='⚠️'
        sub=`Low text overlap (${confidence}%). Verify manually.`
      } else {
        verdict='No Match Detected'; type='mismatch'; icon='❌'
        sub=`Only ${confidence}% text overlap. Product may not match barcode.`
      }
      setResult({ verdict, type, icon, sub, confidence, overlap, inventoryResult, productText:product.ocrText, barcodeText:barcode.ocrText, barcodeVal:barcode.barcodeValue })
      showToast(type==='match'?'✅ Match verified!':type==='mismatch'?'❌ Match failed':'⚠️ Partial match', type==='match'?'success':'error')
    } catch (err) {
      showToast('Match failed: '+err.message, 'error')
    } finally { setMatching(false) }
  }

  async function openCamera(type) {
    setCamTarget(type); setCamOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } })
      camStreamRef.current = stream
      if (camVideoRef.current) camVideoRef.current.srcObject = stream
    } catch { showToast('Camera access denied — use file upload instead', 'error'); closeCamera() }
  }

  function closeCamera() {
    camStreamRef.current?.getTracks().forEach(t=>t.stop())
    camStreamRef.current = null
    if (camVideoRef.current) camVideoRef.current.srcObject = null
    setCamOpen(false); setCamTarget(null)
  }

  function captureFromCamera() {
    const video = camVideoRef.current
    if (!video?.videoWidth) { showToast('Camera not ready','error'); return }
    const canvas = document.createElement('canvas')
    canvas.width=video.videoWidth; canvas.height=video.videoHeight
    canvas.getContext('2d').drawImage(video,0,0)
    const b64 = canvas.toDataURL('image/jpeg',.9)
    const type = camTarget; closeCamera()
    loadImageFromB64(b64, type)
  }

  async function loadImageFromB64(b64, type) {
    if (type==='product') {
      setProduct({ base64:b64, ocrText:'', ready:false })
      setProductAnalyzing(true)
      await runProductOCR(b64)
      setProductAnalyzing(false)
    } else {
      setBarcode({ base64:b64, ocrText:'', barcodeValue:'', ready:false })
      setBarcodeAnalyzing(true)
      await runBarcodeAnalysis(b64)
      setBarcodeAnalyzing(false)
    }
    setResult(null)
  }

  const resultColors = { match:'#00e888', mismatch:'#ff4455', partial:'#f5a623' }
  const resultBg     = { match:'rgba(0,232,136,.04)', mismatch:'rgba(255,68,85,.04)', partial:'rgba(245,166,35,.04)' }
  const resultBorder = { match:'rgba(0,232,136,.3)', mismatch:'rgba(255,68,85,.3)', partial:'rgba(245,166,35,.3)' }

  function DropZone({ type, color, analyzing, imageB64, label, icon, onFile, onCamera, onRemove, fileRef }) {
    const [drag, setDrag] = useState(false)
    return (
      <div style={{background:'#0a1020',border:`1px solid ${color==='cyan'?'#1e3060':'#1e3060'}`,borderRadius:20,overflow:'hidden'}}>
        <div style={{padding:'16px 20px 14px',borderBottom:'1px solid #162240',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,.2)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,letterSpacing:'.5px',textTransform:'uppercase',color:color==='cyan'?'#00e8ff':'#f5a623'}}>
            <div style={{width:28,height:28,borderRadius:8,background:color==='cyan'?'rgba(0,232,255,.12)':'rgba(245,166,35,.12)',border:`1px solid ${color==='cyan'?'rgba(0,232,255,.2)':'rgba(245,166,35,.2)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>{icon}</div>
            {label}
          </div>
          <span style={{fontSize:11,color:'#3a5572',fontFamily:'DM Mono,monospace'}}>{type==='product'?'OCR text extraction':'Barcode decode + OCR'}</span>
        </div>

        <div
          onClick={() => !imageB64 && fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/'))onFile(f)}}
          style={{position:'relative',margin:20,borderRadius:14,border:`2px dashed ${drag||analyzing?color==='cyan'?'#00e8ff':'#f5a623':'#1e3060'}`,aspectRatio:'4/3',overflow:'hidden',cursor:imageB64?'default':'pointer',background:drag?color==='cyan'?'rgba(0,232,255,.08)':'rgba(245,166,35,.08)':'rgba(0,0,0,.2)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,transition:'all .3s'}}
        >
          {imageB64
            ? <img src={imageB64} alt="preview" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',background:'#000',borderRadius:12}} />
            : <>
                <div style={{fontSize:32,opacity:.4}}>{type==='product'?'🖼️':'🔲'}</div>
                <div style={{fontSize:13,color:'#3a5572',textAlign:'center',lineHeight:1.5,pointerEvents:'none'}}>
                  Drop {type==='product'?'product':'barcode'} image here<br/>or click to browse
                  <span style={{display:'block',fontSize:11,marginTop:4,fontFamily:'DM Mono,monospace',letterSpacing:'.5px',textTransform:'uppercase'}}>JPG · PNG · WEBP</span>
                </div>
              </>
          }
          {analyzing && <div style={{position:'absolute',left:0,right:0,height:2,top:'50%',background:`linear-gradient(90deg,transparent,${color==='cyan'?'#00e8ff':'#f5a623'},transparent)`,boxShadow:`0 0 10px ${color==='cyan'?'#00e8ff':'#f5a623'}`,animation:'scanMove 1.5s ease-in-out infinite'}} />}
          {imageB64 && <button onClick={e=>{e.stopPropagation();onRemove()}} style={{position:'absolute',top:10,right:10,width:26,height:26,borderRadius:'50%',background:'rgba(255,68,85,.85)',border:'none',cursor:'pointer',color:'#fff',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>}
        </div>

        {imageB64 && (type==='product'?product.ocrText:barcode.ocrText||barcode.barcodeValue) && (
          <div style={{margin:'0 20px 16px',padding:'12px 14px',borderRadius:10,background:'rgba(0,0,0,.25)',border:'1px solid #162240',fontFamily:'DM Mono,monospace',fontSize:12,lineHeight:1.6}}>
            <div style={{fontSize:10,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6,fontWeight:500,color:color==='cyan'?'#00e8ff':'#f5a623'}}>
              {type==='product'?'OCR Extracted Text':'Decoded Barcode + OCR'}
            </div>
            <div style={{color:'#d0e4f8',wordBreak:'break-all'}}>
              {type==='product' ? product.ocrText||'(No text detected)' : [barcode.barcodeValue?`Barcode: ${barcode.barcodeValue}`:null, barcode.ocrText?`Text: ${barcode.ocrText.slice(0,200)}`:null].filter(Boolean).join('\n')||'(No data decoded)'}
            </div>
          </div>
        )}

        <div style={{padding:'0 20px 20px',display:'flex',gap:8}}>
          <button onClick={()=>fileRef.current?.click()} style={{flex:1,padding:'9px 14px',borderRadius:10,cursor:'pointer',border:`1px solid ${color==='cyan'?'rgba(0,232,255,.25)':'rgba(245,166,35,.25)'}`,background:color==='cyan'?'rgba(0,232,255,.08)':'rgba(245,166,35,.08)',color:color==='cyan'?'#00e8ff':'#f5a623',fontSize:13,fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>⬆ Upload</button>
          <button onClick={()=>openCamera(type)} style={{padding:'9px 14px',borderRadius:10,cursor:'pointer',background:'rgba(255,255,255,.04)',border:'1px solid #1e3060',color:'#3a5572',fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6}}>📷 Camera</button>
        </div>
        <input type="file" ref={fileRef} accept="image/*" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0]);e.target.value=''}} />
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes gridDrift{to{background-position:56px 56px}}
        @keyframes orb1{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-40px)}}
        @keyframes orb2{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,30px)}}
        @keyframes heroIn{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
        @keyframes scanMove{0%{top:8%;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:92%;opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes brandPulse{0%,100%{box-shadow:0 0 10px rgba(0,232,255,.2)}50%{box-shadow:0 0 28px rgba(0,232,255,.5)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes resultIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
      `}</style>

      {/* BG */}
      <div style={{position:'fixed',inset:0,zIndex:0,backgroundImage:'linear-gradient(rgba(0,232,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,255,.03) 1px,transparent 1px)',backgroundSize:'56px 56px',animation:'gridDrift 30s linear infinite'}} />
      <div style={{position:'fixed',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,rgba(0,232,255,.07),transparent 70%)',top:-200,right:-100,animation:'orb1 18s ease-in-out infinite',zIndex:0}} />
      <div style={{position:'fixed',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(124,58,237,.06),transparent 70%)',bottom:-150,left:-80,animation:'orb2 22s ease-in-out infinite',zIndex:0}} />

      <div style={{position:'relative',zIndex:1,minHeight:'100vh',display:'flex',flexDirection:'column'}}>

        {/* Topbar */}
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',height:58,background:'rgba(10,16,32,.92)',borderBottom:'1px solid #1e3060',backdropFilter:'blur(16px)',position:'sticky',top:0,zIndex:50}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:34,height:34,borderRadius:9,background:'linear-gradient(135deg,#00e8ff,#6d28d9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,animation:'brandPulse 3s ease-in-out infinite'}}>🛒</div>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontSize:17,fontWeight:800,letterSpacing:'-.3px',background:'linear-gradient(90deg,#00e8ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SmartRetail</div>
              <div style={{fontSize:10,color:'#3a5572',letterSpacing:'2px',textTransform:'uppercase',marginTop:1}}>Retail Intelligence Platform</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            {[{label:'Checkout Terminal',path:'/checkout'},{label:'Dashboard',path:'/dashboard'}].map(n=>(
              <button key={n.path} onClick={()=>navigate(n.path)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:'DM Mono,monospace',letterSpacing:'.5px',background:'transparent',border:'1px solid #1e3060',color:'#3a5572',cursor:'pointer',transition:'all .2s'}}>
                {n.label}
              </button>
            ))}
            <button onClick={logout} style={{padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:'DM Mono,monospace',background:'linear-gradient(135deg,#00e8ff,#0ea5e9)',color:'#05080f',border:'none',cursor:'pointer'}}>Sign Out</button>
          </div>
        </header>

        {/* Hero */}
        <div style={{textAlign:'center',padding:'52px 24px 36px',animation:'heroIn .8s cubic-bezier(.22,1,.36,1) both'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'5px 14px',borderRadius:20,background:'rgba(0,232,255,.12)',border:'1px solid rgba(0,232,255,.2)',fontSize:11,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase',color:'#00e8ff',marginBottom:20,fontFamily:'DM Mono,monospace'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#00e8ff',boxShadow:'0 0 8px #00e8ff',animation:'blink 2s ease-in-out infinite'}} /> AI Product Verification
          </div>
          <h1 style={{fontFamily:'Syne,sans-serif',fontSize:'clamp(28px,5vw,52px)',fontWeight:800,lineHeight:1.1,letterSpacing:-1.5,background:'linear-gradient(160deg,#fff 30%,#00e8ff 80%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:14}}>
            Scan, Match & Verify<br/>in Seconds
          </h1>
          <p style={{fontSize:15,color:'#3a5572',maxWidth:540,margin:'0 auto',lineHeight:1.7}}>Upload product and barcode images. Our OCR engine extracts text, cross-references your inventory, and gives an instant match verdict.</p>
        </div>

        {/* Scan Arena */}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:24,padding:'0 28px 32px',maxWidth:1160,margin:'0 auto',width:'100%',alignItems:'start'}}>
          <DropZone type="product" color="cyan" analyzing={productAnalyzing} imageB64={product.base64}
            label="Product Image" icon="📦"
            onFile={f=>loadImage(f,'product')}
            onCamera={()=>openCamera('product')}
            onRemove={()=>{setProduct({base64:null,ocrText:'',ready:false});setResult(null)}}
            fileRef={productFileRef} />

          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,paddingTop:90}}>
            <div style={{width:1,height:60,background:'linear-gradient(to bottom,transparent,#1e3060,transparent)'}} />
            <div style={{width:48,height:48,borderRadius:'50%',background:'#0f1a30',border:'1px solid #1e3060',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:800,color:'#3a5572',letterSpacing:1}}>VS</div>
            <div style={{width:1,height:60,background:'linear-gradient(to bottom,transparent,#1e3060,transparent)'}} />
          </div>

          <DropZone type="barcode" color="amber" analyzing={barcodeAnalyzing} imageB64={barcode.base64}
            label="Barcode Image" icon="🔲"
            onFile={f=>loadImage(f,'barcode')}
            onCamera={()=>openCamera('barcode')}
            onRemove={()=>{setBarcode({base64:null,ocrText:'',barcodeValue:'',ready:false});setResult(null)}}
            fileRef={barcodeFileRef} />
        </div>

        {/* Match button */}
        <div style={{maxWidth:1160,margin:'0 auto',width:'100%',padding:'0 28px 32px',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
          <button onClick={runMatch} disabled={!(product.ready&&barcode.ready)||matching}
            style={{padding:'16px 56px',border:'none',borderRadius:14,cursor:'pointer',fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,letterSpacing:'.5px',background:'linear-gradient(135deg,#00e8ff,#61f6d8)',color:'#fff',transition:'transform .2s,box-shadow .3s',boxShadow:'0 4px 32px rgba(0,232,255,.25)',opacity:(!(product.ready&&barcode.ready)||matching)?.4:1,display:'flex',alignItems:'center',gap:10}}>
            {matching ? <span style={{display:'inline-block',width:18,height:18,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}} /> : '⚡ Run Match Verification'}
          </button>
          <p style={{fontSize:12,color:'#3a5572',fontFamily:'DM Mono,monospace'}}>Both images required · OCR + inventory cross-check</p>
        </div>

        {/* Result panel */}
        {result && (
          <div style={{maxWidth:1160,margin:'0 auto',width:'100%',padding:'0 28px 48px',animation:'resultIn .6s cubic-bezier(.22,1,.36,1) both'}}>
            <div style={{borderRadius:20,overflow:'hidden',border:`1px solid ${resultBorder[result.type]}`,background:resultBg[result.type],position:'relative'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${resultColors[result.type]},transparent)`}} />
              <div style={{padding:'24px 28px 20px',display:'flex',alignItems:'center',gap:16,borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{fontSize:40}}>{result.icon}</div>
                <div>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:26,fontWeight:800,letterSpacing:'-.5px',color:resultColors[result.type]}}>{result.verdict}</div>
                  <div style={{fontSize:14,color:'#3a5572',marginTop:4,lineHeight:1.5}}>{result.sub}</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
                {[
                  { label:'Product Image Analysis', color:'#00e8ff',
                    rows:[
                      ['OCR Text', result.productText?.slice(0,200)||'(empty)'],
                      ['Match confidence', `${result.confidence}%`],
                      ['Matching tokens', result.overlap?.slice(0,8).join(', ')||'none'],
                    ]
                  },
                  { label:'Barcode Analysis', color:'#f5a623',
                    rows:[
                      ['Decoded barcode', result.barcodeVal||'(not decoded)'],
                      ['OCR text', result.barcodeText?.slice(0,200)||'(empty)'],
                      ['Inventory', result.inventoryResult?.found?`In stock: ${result.inventoryResult.product_name||''}`:'Not in inventory'],
                    ]
                  }
                ].map((col,i)=>(
                  <div key={i} style={{padding:'20px 28px',borderRight:i===0?'1px solid rgba(255,255,255,.05)':'none'}}>
                    <div style={{fontSize:10,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10,fontFamily:'DM Mono,monospace',fontWeight:500,color:col.color}}>{col.label}</div>
                    {col.rows.map(([k,v],j)=>(
                      <div key={j} style={{marginBottom:12}}>
                        <div style={{fontSize:11,color:'#3a5572',letterSpacing:'.5px'}}>{k}</div>
                        <div style={{fontSize:13,color:'#d0e4f8',fontFamily:'DM Mono,monospace',wordBreak:'break-all',lineHeight:1.4}}>{v}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Camera Modal */}
      {camOpen && (
        <div onClick={e=>{if(e.target===e.currentTarget)closeCamera()}} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,.85)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'#0a1020',border:'1px solid #1e3060',borderRadius:20,width:'100%',maxWidth:520,overflow:'hidden'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid #162240',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,color:'#d0e4f8'}}>{camTarget==='product'?'📦 Capture Product Image':'🔲 Capture Barcode Image'}</span>
              <button onClick={closeCamera} style={{width:28,height:28,borderRadius:'50%',background:'rgba(255,68,85,.15)',border:'1px solid rgba(255,68,85,.3)',color:'#ff4455',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
            <div style={{position:'relative',aspectRatio:'4/3',background:'#000',overflow:'hidden'}}>
              <video ref={camVideoRef} autoPlay playsInline muted style={{width:'100%',height:'100%',objectFit:'cover'}} />
              <div style={{position:'absolute',left:'10%',right:'10%',height:2,background:'linear-gradient(90deg,transparent,#00e8ff,transparent)',boxShadow:'0 0 10px #00e8ff',animation:'scanMove 2s ease-in-out infinite'}} />
            </div>
            <div style={{padding:16,display:'flex',gap:10}}>
              <button onClick={captureFromCamera} style={{flex:1,padding:11,border:'none',borderRadius:10,cursor:'pointer',fontFamily:'Syne,sans-serif',fontSize:14,fontWeight:700,background:'linear-gradient(135deg,#00e8ff,#0ea5e9)',color:'#05080f',transition:'transform .2s'}}>📸 Capture</button>
              <button onClick={closeCamera} style={{padding:'11px 18px',borderRadius:10,cursor:'pointer',background:'transparent',border:'1px solid #1e3060',color:'#3a5572',fontSize:13}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div style={{position:'fixed',bottom:24,right:24,zIndex:999,padding:'12px 20px',borderRadius:12,fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:8,pointerEvents:'none',transform:toast.show?'translateY(0)':'translateY(80px)',opacity:toast.show?1:0,transition:'transform .4s cubic-bezier(.22,1,.36,1),opacity .4s',maxWidth:320,background:toast.type==='success'?'#0a2420':toast.type==='error'?'#200a0c':'#0a1a28',border:`1px solid ${toast.type==='success'?'rgba(0,232,136,.4)':toast.type==='error'?'rgba(255,68,85,.4)':'rgba(0,232,255,.3)'}`,color:toast.type==='success'?'#00e888':toast.type==='error'?'#ff4455':'#00e8ff'}}>
        {toast.msg}
      </div>
    </>
  )
}