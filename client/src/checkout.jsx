import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CheckoutPage({ user, setUser }) {
  const navigate = useNavigate()
  const [mode, setMode]           = useState('hardware')  // 'hardware' | 'manual'
  const [barcodeInput, setBarcodeInput] = useState('')
  const [gateLocked, setGateLocked] = useState(false)
  const [verdict, setVerdict]     = useState(null)        // null | object
  const [loading, setLoading]     = useState(false)
  const [transactions, setTransactions] = useState([])
  const [alerts, setAlerts]       = useState([])
  const [stats, setStats]         = useState({ total:0, approved:0, blocked:0 })
  const [logFilter, setLogFilter] = useState('all')
  const [fraudFlags, setFraudFlags] = useState(0)
  const [redisStatus, setRedisStatus] = useState('checking')
  const [toast, setToast]         = useState({ msg:'', type:'', show:false })
  const [flash, setFlash]         = useState('')
  const scanBufferRef = useRef('')
  const scanTimerRef  = useRef(null)
  const inputRef      = useRef(null)
  const wsRef         = useRef(null)
  const activeBarcode = useRef('')

  // ── Health check on mount
  useEffect(() => {
    fetch('/api/health', { credentials:'include' })
      .then(r=>r.json())
      .then(d=>setRedisStatus(d.redis==='connected'?'connected':'offline'))
      .catch(()=>setRedisStatus('offline'))
    showToast('📡 Checkout Terminal active — HID scanner listening', 'info')
  }, [])

  // ── WebSocket
  useEffect(() => {
    if (!user?.id) return
    const proto = location.protocol==='https:'?'wss':'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ shopId: user.id }))
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'TXN_RESULT') setVerdict(msg.result)
      } catch {}
    }
    ws.onerror = () => {}
    return () => ws.close()
  }, [user?.id])

  // ── HID keyboard listener
  useEffect(() => {
    if (mode !== 'hardware') return
    function onKey(e) {
      if (loading) return
      if (e.key === 'Enter') {
        const code = scanBufferRef.current.trim()
        scanBufferRef.current = ''
        clearTimeout(scanTimerRef.current)
        setBarcodeInput('')
        if (code.length >= 4) handleScan(code)
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        scanBufferRef.current += e.key
        setBarcodeInput(scanBufferRef.current)
        clearTimeout(scanTimerRef.current)
        scanTimerRef.current = setTimeout(() => {
          if (scanBufferRef.current.length >= 6) handleScan(scanBufferRef.current.trim())
          scanBufferRef.current = ''
          setBarcodeInput('')
        }, 120)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(scanTimerRef.current)
    }
  }, [mode, loading])

  function showToast(msg, type='info') {
    setToast({ msg, type, show:true })
    setTimeout(() => setToast(t=>({...t,show:false})), 4500)
  }

  function flashScreen(color) {
    setFlash(color)
    setTimeout(() => setFlash(''), 300)
  }

  async function logout() {
    await fetch('/api/logout', { credentials:'include' })
    setUser(null); navigate('/')
  }

  const handleScan = useCallback(async (barcode) => {
    if (!barcode || barcode.length < 4 || loading) return
    activeBarcode.current = barcode
    setLoading(true)
    setGateLocked(true)
    setBarcodeInput(barcode)
    setVerdict({ _processing: true, barcode })

    try {
      const res = await fetch('/api/checkout/verify', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        credentials:'include',
        body: JSON.stringify({ barcode })
      })
      if (res.status === 429) {
        showToast('⏳ Duplicate scan blocked by Redis gate', 'warn')
        setVerdict(null); return
      }
      if (!res.ok) {
        const err = await res.json().catch(()=>({}))
        throw new Error(err.message || `Server error ${res.status}`)
      }
      const data = await res.json()

      setVerdict({ ...data, barcode })
      setTransactions(prev => [{
        id:Date.now(), barcode,
        time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        product: data.product_name||'(not found)',
        status: data.status,
        method: data.barcode_format||'HID',
      }, ...prev])
      setStats(s => ({
        total: s.total+1,
        approved: s.approved + (data.status==='approved'?1:0),
        blocked:  s.blocked  + (data.status==='blocked' ?1:0),
      }))
      flashScreen(data.status==='approved'?'green':'red')

      if (data.status==='blocked' && data.fraud_risk>0.6) {
        setFraudFlags(f=>f+1)
        try {
          await fetch('/api/alerts/fraud', {
            method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
            body: JSON.stringify({ barcode, product_name:data.product_name||'Unknown', risk_score:data.fraud_risk, timestamp:new Date().toISOString(), action:'TRANSACTION_BLOCKED' })
          })
          addAlert('FRAUD REPORT', `SendGrid alert sent for barcode ${barcode}`, 'fraud')
          showToast('📧 Fraud alert dispatched via SendGrid', 'error')
        } catch {
          addAlert('ALERT FAILED', `Could not dispatch alert for ${barcode}`, 'warn')
        }
      }

      setTimeout(() => setBarcodeInput(''), 2500)
    } catch (err) {
      showToast('❌ Verification failed: '+err.message, 'error')
      setVerdict(null)
    } finally {
      setLoading(false)
      setGateLocked(false)
      activeBarcode.current = ''
    }
  }, [loading])

  function addAlert(type, detail, cls='fraud') {
    setAlerts(prev => [{ type, detail, time:new Date().toLocaleTimeString(), cls }, ...prev])
  }

  function switchMode(m) {
    setMode(m)
    scanBufferRef.current = ''
    setBarcodeInput('')
    if (m==='manual') setTimeout(()=>inputRef.current?.focus(), 50)
  }

  function clearInput() {
    setBarcodeInput('')
    setVerdict(null)
    setGateLocked(false)
    if (mode==='manual') inputRef.current?.focus()
  }

  function triggerVerify() {
    const val = barcodeInput.trim()
    if (val.length >= 4) handleScan(val)
  }

  const filteredLog = transactions.filter(t => logFilter==='all' || t.status===logFilter)

  const statusColor = { approved:'#00e888', blocked:'#ff3b4e', partial:'#f5a623' }
  const verdictIcon  = { approved:'✅', blocked:'❌', partial:'⚠️', _processing:'⏳' }
  const verdictTitle = { approved:'Transaction Approved', blocked:'Transaction Blocked', partial:'Partial Match — Hold', _processing:'Processing…' }

  return (
    <>
      <style>{`
        @keyframes gd{to{background-position:44px 44px}}
        @keyframes oa{0%,100%{transform:translate(0,0)}50%{transform:translate(20px,-30px)}}
        @keyframes ob{0%,100%{transform:translate(0,0)}50%{transform:translate(-15px,20px)}}
        @keyframes bp{0%,100%{box-shadow:0 0 10px rgba(0,232,255,.2)}50%{box-shadow:0 0 24px rgba(0,232,255,.5)}}
        @keyframes td{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes sb{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes cin{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes vdin{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
        @keyframes logIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes scanPulse{0%{transform:scale(1)}50%{transform:scale(1.01)}100%{transform:scale(1)}}
        .hid-input{width:100%;background:rgba(0,0,0,.4);border:2px solid #162f56;border-radius:14px;color:#00e8ff;font-family:'DM Mono',monospace;font-size:26px;font-weight:500;letter-spacing:4px;text-align:center;padding:20px 60px;outline:none;transition:border-color .3s,box-shadow .3s;caret-color:#00e8ff}
        .hid-input:focus{border-color:#00e8ff;box-shadow:0 0 0 4px rgba(0,232,255,.1)}
        .hid-input.locked{border-color:#f5a623;box-shadow:0 0 0 4px rgba(245,166,35,.12)}
        .hid-input.approved{border-color:#00e888;box-shadow:0 0 0 4px rgba(0,232,136,.15)}
        .hid-input.blocked{border-color:#ff3b4e;box-shadow:0 0 0 4px rgba(255,59,78,.15)}
        .log-row:hover{background:rgba(255,255,255,.03)}
      `}</style>

      {/* Flash overlay */}
      <div style={{position:'fixed',inset:0,zIndex:500,pointerEvents:'none',opacity:flash?1:0,background:flash==='green'?'rgba(0,232,136,.08)':flash==='red'?'rgba(255,59,78,.08)':'transparent',transition:'opacity .1s'}} />

      {/* BG */}
      <div style={{position:'fixed',inset:0,zIndex:0,backgroundImage:'linear-gradient(rgba(0,232,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,255,.025) 1px,transparent 1px)',backgroundSize:'44px 44px',animation:'gd 35s linear infinite'}} />
      <div style={{position:'fixed',width:700,height:700,borderRadius:'50%',background:'radial-gradient(circle,rgba(0,232,255,.05),transparent 70%)',top:-300,right:-200,animation:'oa 20s ease-in-out infinite',filter:'blur(100px)',zIndex:0}} />
      <div style={{position:'fixed',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(124,58,237,.04),transparent 70%)',bottom:-200,left:-100,animation:'ob 25s ease-in-out infinite',filter:'blur(100px)',zIndex:0}} />

      {/* Topbar */}
      <header style={{position:'sticky',top:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',height:54,background:'rgba(8,15,30,.95)',borderBottom:'1px solid #162f56',backdropFilter:'blur(20px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#00e8ff,#6d28d9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,animation:'bp 3s ease-in-out infinite'}}>🛒</div>
          <span style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,letterSpacing:'-.3px',background:'linear-gradient(90deg,#00e8ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SmartRetail</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'DM Mono,monospace',fontSize:11,color:'#2d4a66',letterSpacing:1,textTransform:'uppercase'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#00e888',boxShadow:'0 0 8px #00e888',animation:'td 2s ease-in-out infinite'}} />
          Checkout Terminal · Active
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>navigate('/home')} style={{padding:'4px 12px',borderRadius:16,fontSize:11,fontWeight:600,fontFamily:'DM Mono,monospace',background:'transparent',border:'1px solid #162f56',color:'#2d4a66',cursor:'pointer',letterSpacing:'.4px'}}>🔍 Verify</button>
          <button onClick={logout} style={{padding:'4px 12px',borderRadius:16,fontSize:11,fontWeight:600,fontFamily:'DM Mono,monospace',background:'linear-gradient(135deg,#ff3b4e,#c0392b)',color:'#fff',border:'none',cursor:'pointer'}}>Sign Out</button>
        </div>
      </header>

      {/* Main grid */}
      <div style={{position:'relative',zIndex:1,display:'grid',gridTemplateColumns:'1fr 380px',gap:20,padding:'20px 24px',maxWidth:1400,margin:'0 auto',minHeight:'calc(100vh - 54px)'}}>

        {/* Left column */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Section label */}
          <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'DM Mono,monospace',fontSize:10,fontWeight:600,letterSpacing:'2px',textTransform:'uppercase',color:'#2d4a66'}}>
            Barcode Input <div style={{flex:1,height:1,background:'#162f56'}} />
          </div>

          {/* Scanner card */}
          <div style={{background:'#080f1e',border:'1px solid #162f56',borderRadius:18,padding:24,position:'relative',overflow:'hidden',animation:'cin .7s cubic-bezier(.22,1,.36,1) both'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:'linear-gradient(90deg,transparent,#00e8ff,transparent)',animation:'sb 3s ease-in-out infinite'}} />

            {/* HID Status */}
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,background:'rgba(0,0,0,.3)',border:'1px solid #102040',marginBottom:18,fontFamily:'DM Mono,monospace',fontSize:11}}>
              <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:mode==='hardware'?'#00e888':'#f5a623',boxShadow:`0 0 8px ${mode==='hardware'?'#00e888':'#f5a623'}`,animation:'td 1.5s ease-in-out infinite'}} />
              <span style={{color:'#8faec8'}}>{mode==='hardware'?'HID Barcode Scanner — Listening for input…':'Manual Entry Mode — hardware scanner paused'}</span>
              <span style={{marginLeft:'auto',padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,letterSpacing:'.5px',background:mode==='hardware'?'rgba(0,232,136,.1)':'rgba(245,166,35,.1)',border:`1px solid ${mode==='hardware'?'rgba(0,232,136,.3)':'rgba(245,166,35,.3)'}`,color:mode==='hardware'?'#00e888':'#f5a623'}}>{mode.toUpperCase()}</span>
            </div>

            {/* Mode toggle */}
            <div style={{display:'flex',gap:10,marginBottom:14}}>
              {[{id:'hardware',label:'📡 Hardware Scanner'},{id:'manual',label:'⌨️ Manual Entry'}].map(m=>(
                <button key={m.id} onClick={()=>switchMode(m.id)} style={{flex:1,padding:10,borderRadius:10,cursor:'pointer',fontFamily:'DM Mono,monospace',fontSize:12,fontWeight:600,letterSpacing:'.5px',border:`1px solid ${mode===m.id?(m.id==='hardware'?'rgba(0,232,136,.4)':'rgba(245,166,35,.4)'):'#162f56'}`,background:mode===m.id?(m.id==='hardware'?'rgba(0,232,136,.1)':'rgba(245,166,35,.1)'):'rgba(255,255,255,.03)',color:mode===m.id?(m.id==='hardware'?'#00e888':'#f5a623'):'#2d4a66',transition:'all .25s'}}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Barcode input */}
            <div style={{position:'relative',marginBottom:16}}>
              <span style={{position:'absolute',left:18,top:'50%',transform:'translateY(-50%)',fontSize:22,opacity:.5,pointerEvents:'none'}}>🔲</span>
              <input ref={inputRef} className={`hid-input${loading?' locked':verdict&&verdict.status?' '+verdict.status:''}`}
                type="text" placeholder="Scan barcode or type manually…"
                value={barcodeInput}
                readOnly={mode==='hardware'}
                onChange={e=>{ if(mode==='manual') setBarcodeInput(e.target.value) }}
                onKeyDown={e=>{ if(mode==='manual'&&e.key==='Enter'&&barcodeInput.trim().length>=4) triggerVerify() }}
              />
              <button onClick={clearInput} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#2d4a66',transition:'color .2s',padding:4}}>✕</button>
            </div>

            {/* Redis gate */}
            <div style={{margin:'0 0 14px',padding:'8px 12px',borderRadius:8,background:'rgba(0,0,0,.3)',border:`1px solid ${gateLocked?'rgba(245,166,35,.25)':'rgba(0,232,136,.2)'}`,fontFamily:'DM Mono,monospace',fontSize:10,letterSpacing:'.5px',display:'flex',alignItems:'center',gap:8,color:gateLocked?'#f5a623':'#00e888'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:gateLocked?'#f5a623':'#00e888',boxShadow:`0 0 6px ${gateLocked?'#f5a623':'#00e888'}`}} />
              {gateLocked?`REDIS GATE: LOCKED — Processing ${activeBarcode.current}`:'REDIS GATE: UNLOCKED — Ready for next scan'}
            </div>

            {/* Verify button (manual mode) */}
            {mode==='manual' && (
              <button onClick={triggerVerify} disabled={loading||barcodeInput.trim().length<4}
                style={{width:'100%',padding:14,border:'none',borderRadius:12,cursor:'pointer',fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:800,letterSpacing:'.5px',background:'linear-gradient(135deg,#00e8ff,#00b8cc)',color:'#04070d',transition:'transform .2s,box-shadow .3s',boxShadow:'0 4px 28px rgba(0,232,255,.22)',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:(loading||barcodeInput.trim().length<4)?.35:1}}>
                {loading ? <span style={{width:18,height:18,border:'2.5px solid rgba(4,7,13,.3)',borderTopColor:'#04070d',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block'}} /> : '⚡ Verify Transaction'}
              </button>
            )}
          </div>

          {/* Verdict card */}
          {verdict && (
            <div style={{borderRadius:16,border:`1px solid ${verdict._processing?'rgba(0,232,255,.25)':verdict.status==='approved'?'rgba(0,232,136,.35)':'rgba(255,59,78,.35)'}`,background:verdict._processing?'rgba(0,232,255,.03)':verdict.status==='approved'?'rgba(0,232,136,.04)':'rgba(255,59,78,.04)',overflow:'hidden',position:'relative',animation:'vdin .5s cubic-bezier(.22,1,.36,1) both'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${verdict._processing?'#00e8ff':verdict.status==='approved'?'#00e888':'#ff3b4e'},transparent)`,animation:verdict._processing?'sb 1s linear infinite':undefined}} />
              <div style={{padding:'20px 22px 16px',display:'flex',alignItems:'center',gap:14}}>
                <div style={{fontSize:36}}>{verdict._processing?'⏳':verdictIcon[verdict.status]||'❓'}</div>
                <div>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:800,letterSpacing:'-.3px',color:verdict._processing?'#00e8ff':statusColor[verdict.status]||'#c8dff5'}}>
                    {verdict._processing?'Processing…':verdictTitle[verdict.status]||'Unknown'}
                  </div>
                  <div style={{fontSize:13,color:'#8faec8',marginTop:3,lineHeight:1.5}}>
                    {verdict._processing?`Checking barcode ${verdict.barcode} against inventory…`:verdict.message||`Barcode: ${verdict.barcode}`}
                  </div>
                </div>
              </div>
              {!verdict._processing && (
                <>
                  <div style={{margin:'0 22px 16px',padding:'10px 14px',borderRadius:10,fontFamily:'DM Mono,monospace',fontSize:12,fontWeight:700,letterSpacing:'.5px',display:'flex',alignItems:'center',gap:8,border:`1px solid ${verdict.status==='approved'?'rgba(0,232,136,.3)':'rgba(255,59,78,.3)'}`,background:verdict.status==='approved'?'rgba(0,232,136,.1)':'rgba(255,59,78,.1)',color:statusColor[verdict.status]}}>
                    {verdict.status==='approved'?'✅ APPROVED — Product verified. Proceed to checkout.':verdict.status==='blocked'?'🔒 BLOCKED — Mismatch or fraud detected. Do not process.':'⏸ ON HOLD — Manual supervisor review required.'}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderTop:'1px solid rgba(255,255,255,.05)'}}>
                    {[
                      ['Barcode', verdict.barcode, 'mono-big'],
                      ['Format', verdict.barcode_format||'EAN-13', verdict.status==='approved'?'green':''],
                      ['Product', verdict.product_name||'— Not found', verdict.status==='approved'?'green':verdict.status==='blocked'?'red':'amber'],
                      ['Price', verdict.price?`₹${verdict.price.toFixed(2)}`:'—', verdict.status==='approved'?'green':''],
                      ['Stock', verdict.quantity!==undefined?`${verdict.quantity} units`:'—', verdict.quantity>0?'green':'red'],
                      ['Risk Score', verdict.fraud_risk!==undefined?`${(verdict.fraud_risk*100).toFixed(0)}%`:'—', verdict.fraud_risk>0.6?'red':verdict.fraud_risk>0.3?'amber':'green'],
                    ].map(([k,v,cls],i)=>(
                      <div key={i} style={{padding:'14px 22px',borderRight:i%2===0?'1px solid rgba(255,255,255,.05)':'none',borderTop:i>=2?'1px solid rgba(255,255,255,.05)':'none'}}>
                        <div style={{fontSize:10,color:'#2d4a66',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:4,fontFamily:'DM Mono,monospace'}}>{k}</div>
                        <div style={{fontSize:cls==='mono-big'?18:14,color:cls==='green'?'#00e888':cls==='red'?'#ff3b4e':cls==='amber'?'#f5a623':'#c8dff5',fontFamily:'DM Mono,monospace',fontWeight:cls==='mono-big'||cls==='green'||cls==='red'||cls==='amber'?600:400,letterSpacing:cls==='mono-big'?2:0,wordBreak:'break-all'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Transaction log */}
          <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'DM Mono,monospace',fontSize:10,fontWeight:600,letterSpacing:'2px',textTransform:'uppercase',color:'#2d4a66'}}>
            Transaction Log <div style={{flex:1,height:1,background:'#162f56'}} />
          </div>
          <div style={{background:'#080f1e',border:'1px solid #162f56',borderRadius:18,overflow:'hidden',animation:'cin .7s .2s cubic-bezier(.22,1,.36,1) both'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid #102040',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,.25)'}}>
              <span style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:'#c8dff5',letterSpacing:'.3px'}}>Session Transactions</span>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{display:'flex',gap:6}}>
                  {['all','approved','blocked'].map(f=>(
                    <button key={f} onClick={()=>setLogFilter(f)} style={{padding:'3px 10px',borderRadius:8,fontSize:10,fontWeight:600,letterSpacing:'.5px',border:`1px solid ${logFilter===f?'rgba(0,232,255,.35)':'#102040'}`,background:logFilter===f?'rgba(0,232,255,.1)':'transparent',color:logFilter===f?'#00e8ff':'#2d4a66',cursor:'pointer',fontFamily:'DM Mono,monospace',transition:'all .2s'}}>
                      {f==='all'?'All':f==='approved'?'✓':'✗'}
                    </button>
                  ))}
                </div>
                <span style={{fontFamily:'DM Mono,monospace',fontSize:11,color:'#2d4a66',padding:'2px 8px',background:'rgba(255,255,255,.05)',borderRadius:6}}>{transactions.length} scan{transactions.length!==1?'s':''}</span>
              </div>
            </div>
            <div style={{maxHeight:340,overflowY:'auto'}}>
              {filteredLog.length===0
                ? <div style={{padding:32,textAlign:'center',color:'#2d4a66',fontFamily:'DM Mono,monospace',fontSize:12}}>No transactions yet — scan a barcode to begin</div>
                : filteredLog.map((t,i)=>(
                  <div key={t.id} className="log-row" style={{display:'grid',gridTemplateColumns:'20px 90px 1fr 80px 80px',gap:12,alignItems:'center',padding:'11px 20px',borderBottom:'1px solid rgba(255,255,255,.04)',fontFamily:'DM Mono,monospace',fontSize:12,animation:`logIn .3s ${Math.min(i,5)*.04}s ease both`,transition:'background .2s'}}>
                    <div style={{width:7,height:7,borderRadius:'50%',background:statusColor[t.status]||'#888',boxShadow:`0 0 6px ${statusColor[t.status]||'#888'}`}} />
                    <div style={{color:'#2d4a66',fontSize:11}}>{t.time}</div>
                    <div style={{color:'#c8dff5',letterSpacing:1}}>{t.barcode}</div>
                    <div style={{color:'#8faec8',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.product}</div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'.5px',textAlign:'right',color:statusColor[t.status]}}>{t.status.toUpperCase()}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {[
            {label:'Total Scans',   value:stats.total,    color:'#00e8ff', icon:'🔲', sub:'This session'},
            {label:'Approved',      value:stats.approved, color:'#00e888', icon:'✅', sub:'Transactions cleared'},
            {label:'Blocked',       value:stats.blocked,  color:'#ff3b4e', icon:'🚫', sub:'Fraud / mismatch'},
          ].map((s,i)=>(
            <div key={i} style={{background:'#080f1e',border:'1px solid #162f56',borderRadius:16,padding:'18px 20px',position:'relative',overflow:'hidden',animation:`cin .6s ${.1+i*.08}s cubic-bezier(.22,1,.36,1) both`}}>
              <div style={{fontSize:10,color:'#2d4a66',letterSpacing:'1.5px',textTransform:'uppercase',fontFamily:'DM Mono,monospace',marginBottom:8}}>{s.label}</div>
              <div style={{fontFamily:'Syne,sans-serif',fontSize:28,fontWeight:800,lineHeight:1,marginBottom:4,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,color:'#2d4a66',fontFamily:'DM Mono,monospace'}}>{s.sub}</div>
              <div style={{position:'absolute',top:14,right:14,width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,background:'rgba(255,255,255,.05)'}}>{s.icon}</div>
            </div>
          ))}

          {/* Alerts */}
          <div style={{background:'#080f1e',border:'1px solid #162f56',borderRadius:16,overflow:'hidden',animation:'cin .7s .3s cubic-bezier(.22,1,.36,1) both'}}>
            <div style={{padding:'12px 18px',borderBottom:'1px solid #102040',background:'rgba(0,0,0,.2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:'#c8dff5'}}>🔔 Alerts Fired</span>
              <div style={{width:20,height:20,borderRadius:'50%',background:'#ff3b4e',color:'#fff',fontSize:10,fontWeight:800,fontFamily:'DM Mono,monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>{alerts.length}</div>
            </div>
            <div style={{maxHeight:220,overflowY:'auto'}}>
              {alerts.length===0
                ? <div style={{padding:20,textAlign:'center',color:'#2d4a66',fontFamily:'DM Mono,monospace',fontSize:11}}>No alerts yet</div>
                : alerts.map((a,i)=>(
                  <div key={i} style={{padding:'10px 18px',borderBottom:'1px solid rgba(255,255,255,.04)',fontFamily:'DM Mono,monospace',fontSize:11,animation:'logIn .3s ease both'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:10,letterSpacing:'.5px',color:a.cls==='fraud'?'#ff3b4e':a.cls==='warn'?'#f5a623':'#00e888'}}>{a.type}</span>
                      <span style={{color:'#2d4a66',marginLeft:'auto',fontSize:10}}>{a.time}</span>
                    </div>
                    <div style={{color:'#8faec8',fontSize:10,lineHeight:1.5}}>{a.detail}</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Redis widget */}
          <div style={{background:'#080f1e',border:'1px solid #162f56',borderRadius:16,padding:'16px 18px',animation:'cin .7s .38s cubic-bezier(.22,1,.36,1) both'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:12,fontWeight:700,color:'#c8dff5',marginBottom:12,display:'flex',alignItems:'center',gap:7}}>⚡ Redis Gate Status</div>
            {[
              ['Connection',    redisStatus==='connected'?'CONNECTED':'OFFLINE', redisStatus==='connected'?'#00e888':'#f5a623'],
              ['Active Locks',  gateLocked?'1':'0',                              gateLocked?'#f5a623':'#c8dff5'],
              ['Session Store', 'REDIS',                                          '#00e888'],
              ['Gate Strategy', 'SET NX EX 5',                                   '#00e8ff'],
              ['Fraud Flags',   String(fraudFlags),                              fraudFlags>0?'#ff3b4e':'#f5a623'],
            ].map(([k,v,c])=>(
              <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontFamily:'DM Mono,monospace',fontSize:11}}>
                <span style={{color:'#2d4a66'}}>{k}</span>
                <span style={{color:c,fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      <div style={{position:'fixed',bottom:22,right:22,zIndex:999,padding:'12px 18px',borderRadius:12,fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:8,pointerEvents:'none',transform:toast.show?'translateY(0)':'translateY(80px)',opacity:toast.show?1:0,transition:'transform .4s cubic-bezier(.22,1,.36,1),opacity .4s',maxWidth:340,lineHeight:1.4,fontFamily:'DM Mono,monospace',background:toast.type==='success'?'#081f14':toast.type==='error'?'#1a0507':toast.type==='warn'?'#1a1000':'#050f20',border:`1px solid ${toast.type==='success'?'rgba(0,232,136,.4)':toast.type==='error'?'rgba(255,59,78,.4)':toast.type==='warn'?'rgba(245,166,35,.4)':'rgba(0,232,255,.3)'}`,color:toast.type==='success'?'#00e888':toast.type==='error'?'#ff3b4e':toast.type==='warn'?'#f5a623':'#00e8ff'}}>
        {toast.msg}
      </div>
    </>
  )
}