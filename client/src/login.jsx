import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage({ setUser }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [remember, setRemember]   = useState(false)
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [toast, setToast]         = useState({ msg: '', type: '', show: false })
  const [emailErr, setEmailErr]   = useState('')
  const [pwdErr, setPwdErr]       = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [fpEmail, setFpEmail]     = useState('')
  const [fpErr, setFpErr]         = useState('')
  const [fpLoading, setFpLoading] = useState(false)
  const particlesRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const container = particlesRef.current
    if (!container) return
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div')
      p.style.cssText = `
        position:absolute;border-radius:50%;background:#00e5ff;
        left:${Math.random()*100}%;bottom:${Math.random()*40}%;
        animation:particleRise ${4+Math.random()*8}s ${Math.random()*8}s linear infinite;
        width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;opacity:0;
      `
      container.appendChild(p)
    }
  }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type, show: true })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 4000)
  }

  function validateEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.'
  }
  function validatePwd(v) {
    return v.length >= 6 ? '' : 'Password must be at least 6 characters.'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const eErr = validateEmail(email)
    const pErr = validatePwd(password)
    setEmailErr(eErr); setPwdErr(pErr)
    if (eErr || pErr) return

    setLoading(true)
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, remember })
      })
      const data = await res.json()
      if (res.ok) {
  setUser(data.user)
  navigate('/home')
  showToast('Welcome back! Redirecting…', 'success')
}
 else {
        showToast(data.message || 'Invalid credentials.', 'error')
      }
    } catch {
      showToast('Connection error. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot() {
    const err = validateEmail(fpEmail)
    if (err) { setFpErr(err); return }
    setFpErr(''); setFpLoading(true)
    await new Promise(r => setTimeout(r, 1800))
    setFpLoading(false)
    showToast('Reset link sent! Check your inbox.', 'success')
    setForgotOpen(false); setFpEmail('')
  }

  return (
    <>
      <style>{`
        @keyframes gridScroll{from{background-position:0 0}to{background-position:48px 48px}}
        @keyframes sweep{to{transform:rotate(360deg)}}
        @keyframes f1{0%,100%{transform:translate(0,0)}50%{transform:translate(24px,-24px)}}
        @keyframes f2{0%,100%{transform:translate(0,0)}50%{transform:translate(-16px,20px)}}
        @keyframes particleRise{0%{opacity:0;transform:translateY(0) scale(1)}10%{opacity:.6}90%{opacity:.3}100%{opacity:0;transform:translateY(-120px) scale(.3)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(40px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes barPulse{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes ringPulse{0%,100%{box-shadow:0 0 16px rgba(0,229,255,.12)}50%{box-shadow:0 0 36px rgba(0,229,255,.32)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes dotBlink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .login-input{width:100%;background:rgba(255,255,255,.04);border:1px solid #1a2540;border-radius:12px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:14px;padding:12px 14px 12px 42px;outline:none;transition:border-color .3s,background .3s,box-shadow .3s,transform .2s}
        .login-input:focus{border-color:#00e5ff;background:rgba(0,229,255,.05);box-shadow:0 0 0 3px rgba(0,229,255,.1);transform:translateY(-1px)}
        .login-input.err{border-color:#f87171!important}
        .login-input.ok{border-color:#34d399!important}
        .login-btn{width:100%;padding:14px;border:none;border-radius:14px;cursor:pointer;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;letter-spacing:.4px;background:linear-gradient(135deg,#00e5ff,#7c3aed);color:#fff;position:relative;overflow:hidden;transition:transform .2s,box-shadow .3s;box-shadow:0 4px 28px rgba(0,229,255,.22)}
        .login-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 36px rgba(0,229,255,.38)}
        .login-btn:disabled{opacity:.6;cursor:not-allowed}
        .oauth-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid #1a2540;border-radius:12px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:border-color .3s,background .3s,transform .2s}
        .oauth-btn:hover{border-color:#00e5ff;background:rgba(0,229,255,.05);transform:translateY(-1px)}
      `}</style>

      {/* Background */}
      <div style={{position:'fixed',inset:0,zIndex:0,backgroundImage:'linear-gradient(rgba(0,229,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.035) 1px,transparent 1px)',backgroundSize:'48px 48px',animation:'gridScroll 25s linear infinite'}} />
      <div style={{position:'fixed',width:600,height:600,borderRadius:'50%',border:'1px solid rgba(0,229,255,.06)',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:0}} />
      <div style={{position:'fixed',width:500,height:500,borderRadius:'50%',background:'rgba(0,229,255,.06)',top:-180,right:-120,filter:'blur(90px)',animation:'f1 14s ease-in-out infinite',zIndex:0}} />
      <div style={{position:'fixed',width:360,height:360,borderRadius:'50%',background:'rgba(124,58,237,.07)',bottom:-80,left:-60,filter:'blur(90px)',animation:'f2 17s ease-in-out infinite',zIndex:0}} />
      <div ref={particlesRef} style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'}} />

      {/* Page */}
      <div style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:24}}>
        <div style={{width:'100%',maxWidth:440,background:'rgba(13,21,37,.9)',border:'1px solid #1a2540',borderRadius:28,padding:'44px 40px 36px',backdropFilter:'blur(24px)',boxShadow:'0 32px 80px rgba(0,0,0,.6)',animation:'cardIn .9s cubic-bezier(.22,1,.36,1) both',position:'relative',overflow:'hidden'}}>

          {/* Top accent bar */}
          <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#00e5ff 40%,#7c3aed 70%,transparent)',animation:'barPulse 3s ease-in-out infinite'}} />

          {/* Forgot panel */}
          <div style={{position:'absolute',inset:0,zIndex:10,background:'rgba(13,21,37,.97)',borderRadius:28,padding:'44px 40px 36px',display:'flex',flexDirection:'column',transform:forgotOpen?'translateX(0)':'translateX(110%)',transition:'transform .5s cubic-bezier(.22,1,.36,1)',backdropFilter:'blur(24px)'}}>
            <button onClick={() => setForgotOpen(false)} style={{display:'flex',alignItems:'center',gap:8,background:'none',border:'none',color:'#64748b',fontSize:13,cursor:'pointer',marginBottom:24,width:'fit-content'}}>← Back to sign in</button>
            <h2 style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:700,marginBottom:6,color:'#e2e8f0'}}>Reset Password</h2>
            <p style={{fontSize:13,color:'#64748b',marginBottom:28,lineHeight:1.6}}>Enter your registered email and we'll send you a reset link.</p>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:11.5,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.7px',display:'block',marginBottom:6}}>Email Address</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:15,pointerEvents:'none'}}>✉️</span>
                <input className={`login-input${fpErr?' err':''}`} type="email" placeholder="you@store.com" value={fpEmail} onChange={e=>{setFpEmail(e.target.value);setFpErr('')}} />
              </div>
              {fpErr && <p style={{fontSize:11,color:'#f87171',marginTop:4}}>{fpErr}</p>}
            </div>
            <button className="login-btn" onClick={handleForgot} disabled={fpLoading}>
              {fpLoading ? <span style={{display:'inline-block',width:18,height:18,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}} /> : 'Send Reset Link →'}
            </button>
          </div>

          {/* Logo */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,marginBottom:32,animation:'fadeUp .7s .2s both'}}>
            <div style={{width:60,height:60,borderRadius:18,background:'linear-gradient(135deg,rgba(0,229,255,.15),rgba(124,58,237,.15))',border:'1.5px solid rgba(0,229,255,.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,animation:'ringPulse 3s ease-in-out infinite'}}>🛒</div>
            <span style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:800,letterSpacing:'-.4px',background:'linear-gradient(90deg,#00e5ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SmartRetail</span>
            <span style={{fontSize:11,color:'#64748b',letterSpacing:'2px',textTransform:'uppercase',marginTop:-6}}>Retail Intelligence Platform</span>
          </div>

          <h2 style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:700,marginBottom:4,animation:'fadeUp .7s .3s both'}}>Welcome back</h2>
          <p style={{fontSize:13,color:'#64748b',marginBottom:28,animation:'fadeUp .7s .38s both'}}>Sign in to access your retail dashboard</p>

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Email */}
            <div style={{marginBottom:16,animation:'fadeUp .6s .4s both'}}>
              <label style={{fontSize:11.5,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.7px',display:'block',marginBottom:6}}>Email Address</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:15,pointerEvents:'none'}}>✉️</span>
                <input className={`login-input${emailErr?' err':email?' ok':''}`} type="email" placeholder="you@store.com" value={email}
                  onChange={e=>{setEmail(e.target.value);if(emailErr)setEmailErr(validateEmail(e.target.value))}}
                  onBlur={()=>setEmailErr(validateEmail(email))} />
              </div>
              {emailErr && <p style={{fontSize:11,color:'#f87171',marginTop:4}}>{emailErr}</p>}
            </div>

            {/* Password */}
            <div style={{marginBottom:16,animation:'fadeUp .6s .5s both'}}>
              <label style={{fontSize:11.5,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.7px',display:'block',marginBottom:6}}>Password</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:15,pointerEvents:'none'}}>🔑</span>
                <input className={`login-input${pwdErr?' err':password?' ok':''}`} type={showPwd?'text':'password'} placeholder="Enter your password" value={password} style={{paddingRight:42}}
                  onChange={e=>{setPassword(e.target.value);if(pwdErr)setPwdErr(validatePwd(e.target.value))}}
                  onBlur={()=>setPwdErr(validatePwd(password))} />
                <button type="button" onClick={()=>setShowPwd(v=>!v)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:15,color:'#64748b'}}>
                  {showPwd?'🙈':'👁️'}
                </button>
              </div>
              {pwdErr && <p style={{fontSize:11,color:'#f87171',marginTop:4}}>{pwdErr}</p>}
            </div>

            {/* Remember + Forgot */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22,animation:'fadeUp .6s .55s both'}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} style={{width:16,height:16,accentColor:'#00e5ff',cursor:'pointer'}} />
                <span style={{fontSize:13,color:'#64748b'}}>Remember me</span>
              </label>
              <button type="button" onClick={()=>setForgotOpen(true)} style={{fontSize:13,color:'#00e5ff',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Forgot password?</button>
            </div>

            <button type="submit" className="login-btn" disabled={loading} style={{animation:'fadeUp .6s .6s both'}}>
              {loading
                ? <span style={{display:'inline-block',width:20,height:20,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}} />
                : 'Sign In →'}
            </button>

            {/* Divider */}
            <div style={{display:'flex',alignItems:'center',gap:12,margin:'22px 0',animation:'fadeUp .6s .65s both'}}>
              <div style={{flex:1,height:1,background:'#1a2540'}} />
              <span style={{fontSize:12,color:'#64748b'}}>or continue with</span>
              <div style={{flex:1,height:1,background:'#1a2540'}} />
            </div>

            {/* OAuth */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,animation:'fadeUp .6s .7s both'}}>
              <button type="button" className="oauth-btn"><span style={{fontSize:16}}>🔵</span> Google</button>
              <button type="button" className="oauth-btn"><span style={{fontSize:16}}>🔗</span> Microsoft</button>
            </div>
          </form>

          <p style={{textAlign:'center',fontSize:13,color:'#64748b',marginTop:22,animation:'fadeUp .6s .75s both'}}>
            Don't have an account? <a href="/signup" style={{color:'#00e5ff',fontWeight:600}} onClick={e=>{e.preventDefault();navigate('/signup')}}>Create store →</a>
          </p>

          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:18,fontSize:11,color:'#64748b',animation:'fadeUp .6s .8s both'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#34d399',boxShadow:'0 0 6px #34d399',animation:'dotBlink 2s ease-in-out infinite'}} />
            256-bit SSL encrypted · SOC 2 compliant
          </div>
        </div>
      </div>

      {/* Toast */}
      <div style={{position:'fixed',bottom:28,right:28,padding:'14px 20px',borderRadius:12,fontSize:13.5,fontWeight:500,display:'flex',alignItems:'center',gap:10,zIndex:999,pointerEvents:'none',transform:toast.show?'translateY(0)':'translateY(80px)',opacity:toast.show?1:0,transition:'transform .4s cubic-bezier(.22,1,.36,1),opacity .4s',maxWidth:320,background:toast.type==='success'?'#0d2b24':'#2b0d0d',border:`1px solid ${toast.type==='success'?'#34d399':'#f87171'}`,color:toast.type==='success'?'#34d399':'#f87171'}}>
        {toast.type==='success'?'✅':'❌'} {toast.msg}
      </div>
    </>
  )
}