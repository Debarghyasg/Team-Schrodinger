import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const validators = {
  ownerName: v => v.trim().length >= 2 ? '' : 'Enter a valid owner name.',
  shopName:  v => v.trim().length >= 2 ? '' : 'Enter a valid shop name.',
  phone:     v => /^[+]?[\d\s\-()]{7,15}$/.test(v.trim()) ? '' : 'Enter a valid phone number.',
  email:     v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address.',
  address:   v => v.trim().length >= 10 ? '' : 'Address must be at least 10 characters.',
  password:  v => v.length >= 8 ? '' : 'Password must be at least 8 characters.',
  confirmPwd:v => ''
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ ownerName:'', shopName:'', phone:'', email:'', address:'', password:'', confirmPwd:'' })
  const [errors, setErrors] = useState({})
  const [showPwd, setShowPwd]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState({ msg:'', type:'', show:false })

  function showToast(msg, type='success') {
    setToast({ msg, type, show:true })
    setTimeout(() => setToast(t=>({...t,show:false})), 4000)
  }

  function validate(field, value) {
    if (field === 'confirmPwd') return value === form.password ? '' : 'Passwords do not match.'
    return validators[field](value)
  }

  function setField(field, value) {
    setForm(f => ({...f, [field]: value}))
    if (errors[field]) setErrors(e => ({...e, [field]: validate(field, value)}))
  }

  function onBlur(field) {
    setErrors(e => ({...e, [field]: validate(field, form[field])}))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const newErrors = {}
    Object.keys(form).forEach(k => { newErrors[k] = validate(k, form[k]) })
    setErrors(newErrors)
    if (Object.values(newErrors).some(Boolean)) return

    setLoading(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_name: form.ownerName.trim(),
          shop_name:  form.shopName.trim(),
          phone:      form.phone.trim(),
          email:      form.email.trim(),
          address:    form.address.trim(),
          password:   form.password
        })
      })
      const data = await res.json()
      if (res.ok) {
        showToast('🎉 Store registered successfully! Welcome aboard.', 'success')
        setTimeout(() => navigate('/'), 1800)
      } else {
        showToast(data.message || 'Registration failed. Please try again.', 'error')
      }
    } catch {
      showToast('Server error. Please check your connection.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field) => ({
    width:'100%', background:'rgba(255,255,255,.04)', border:`1px solid ${errors[field]?'#f87171':form[field]?'#34d399':'#1a2540'}`,
    borderRadius:10, color:'#e2e8f0', fontFamily:"'DM Sans',sans-serif", fontSize:14,
    padding:'11px 14px 11px 40px', outline:'none', transition:'border-color .3s,background .3s,box-shadow .3s'
  })

  return (
    <>
      <style>{`
        @keyframes gridShift{0%{background-position:0 0}100%{background-position:48px 48px}}
        @keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-30px)}}
        @keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,20px)}}
        @keyframes slideInLeft{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{box-shadow:0 0 12px rgba(0,229,255,.25)}50%{box-shadow:0 0 28px rgba(0,229,255,.55)}}
        @keyframes scanline{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .su-input:focus{border-color:#00e5ff!important;background:rgba(0,229,255,.05)!important;box-shadow:0 0 0 3px rgba(0,229,255,.12)!important}
        .feature-item{display:flex;align-items:center;gap:12px;padding:14px 18px;border:1px solid #1a2540;border-radius:12px;background:rgba(255,255,255,.02);transition:border-color .3s,background .3s,transform .3s}
        .feature-item:hover{border-color:#00e5ff;background:rgba(0,229,255,.04);transform:translateX(6px)}
        @media(max-width:820px){.su-wrapper{grid-template-columns:1fr!important;padding:32px 16px!important}.su-left{align-items:center!important;text-align:center!important}}
        @media(max-width:520px){.su-grid{grid-template-columns:1fr!important}.su-card{padding:28px 20px!important}}
      `}</style>

      {/* BG */}
      <div style={{position:'fixed',inset:0,zIndex:0,backgroundImage:'linear-gradient(rgba(0,229,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.04) 1px,transparent 1px)',backgroundSize:'48px 48px',animation:'gridShift 20s linear infinite'}} />
      <div style={{position:'fixed',width:520,height:520,borderRadius:'50%',background:'rgba(0,229,255,.07)',top:-120,right:-120,filter:'blur(80px)',animation:'float1 12s ease-in-out infinite',zIndex:0}} />
      <div style={{position:'fixed',width:400,height:400,borderRadius:'50%',background:'rgba(124,58,237,.08)',bottom:-80,left:-80,filter:'blur(80px)',animation:'float2 15s ease-in-out infinite',zIndex:0}} />

      <div className="su-wrapper" style={{position:'relative',zIndex:1,display:'grid',gridTemplateColumns:'1fr 1fr',minHeight:'100vh',width:'100%',maxWidth:1200,margin:'0 auto',padding:'40px 24px',gap:48,alignItems:'center'}}>

        {/* Left panel */}
        <div className="su-left" style={{display:'flex',flexDirection:'column',gap:32,animation:'slideInLeft .9s cubic-bezier(.22,1,.36,1) both'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:44,height:44,background:'linear-gradient(135deg,#00e5ff,#7c3aed)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,animation:'pulse 3s ease-in-out infinite'}}>🛒</div>
            <span style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,letterSpacing:'-.5px',background:'linear-gradient(90deg,#00e5ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SmartRetail</span>
          </div>
          <h1 style={{fontFamily:'Syne,sans-serif',fontSize:'clamp(32px,4vw,52px)',fontWeight:800,lineHeight:1.1,letterSpacing:-1}}>
            Power Your<br/>Store with{' '}
            <span style={{background:'linear-gradient(90deg,#00e5ff,#7c3aed)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Smart</span><br/>Technology
          </h1>
          <p style={{fontSize:16,color:'#64748b',lineHeight:1.7,maxWidth:380}}>Join thousands of retailers using our intelligent platform to manage inventory, track sales, and grow their business.</p>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {[
              {icon:'📊',title:'Real-Time Analytics',sub:'Live sales dashboards and intelligent reporting'},
              {icon:'📦',title:'Inventory Automation',sub:'Smart restocking alerts and stock prediction'},
              {icon:'🔒',title:'Secure & Compliant',sub:'End-to-end encryption with full data privacy'},
            ].map((f,i) => (
              <div key={i} className="feature-item" style={{animationDelay:`${.2+i*.15}s`,animation:'fadeUp .8s cubic-bezier(.22,1,.36,1) both'}}>
                <span style={{fontSize:22}}>{f.icon}</span>
                <div>
                  <strong style={{display:'block',fontSize:14,fontWeight:500,color:'#e2e8f0'}}>{f.title}</strong>
                  <span style={{fontSize:12,color:'#64748b'}}>{f.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="su-card" style={{background:'rgba(13,21,37,.85)',border:'1px solid #1a2540',borderRadius:24,padding:'40px 36px',backdropFilter:'blur(20px)',boxShadow:'0 24px 80px rgba(0,0,0,.5)',animation:'slideInRight .9s cubic-bezier(.22,1,.36,1) both',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#00e5ff,#7c3aed,transparent)',animation:'scanline 3s linear infinite'}} />
          <h2 style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:700,marginBottom:4}}>Create Your Account</h2>
          <p style={{fontSize:13,color:'#64748b',marginBottom:28}}>Register your store and get started in minutes.</p>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="su-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {[
                {id:'ownerName', label:'Owner Name',    icon:'👤', type:'text',  ph:'John Doe'},
                {id:'shopName',  label:'Shop Name',     icon:'🏪', type:'text',  ph:'My Retail Store'},
                {id:'phone',     label:'Phone Number',  icon:'📞', type:'tel',   ph:'+91 98765 43210'},
                {id:'email',     label:'Email Address', icon:'✉️', type:'email', ph:'you@store.com'},
              ].map(f => (
                <div key={f.id} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label style={{fontSize:12,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.6px'}}>{f.label}</label>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',fontSize:16,pointerEvents:'none'}}>{f.icon}</span>
                    <input className="su-input" type={f.type} placeholder={f.ph} value={form[f.id]}
                      style={inputStyle(f.id)}
                      onChange={e=>setField(f.id,e.target.value)}
                      onBlur={()=>onBlur(f.id)} />
                  </div>
                  {errors[f.id] && <p style={{fontSize:11,color:'#f87171'}}>{errors[f.id]}</p>}
                </div>
              ))}

              {/* Address — full width */}
              <div style={{gridColumn:'1/-1',display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:12,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.6px'}}>Store Address</label>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:13,top:12,fontSize:16,pointerEvents:'none'}}>📍</span>
                  <textarea className="su-input" placeholder="123 Main Street, City, State - PIN" value={form.address}
                    style={{...inputStyle('address'),paddingTop:11,resize:'vertical',minHeight:72}}
                    onChange={e=>setField('address',e.target.value)}
                    onBlur={()=>onBlur('address')} />
                </div>
                {errors.address && <p style={{fontSize:11,color:'#f87171'}}>{errors.address}</p>}
              </div>

              {/* Password */}
              {[
                {id:'password',   label:'Password',         icon:'🔑', show:showPwd,     toggle:()=>setShowPwd(v=>!v)},
                {id:'confirmPwd', label:'Confirm Password', icon:'🔒', show:showConfirm, toggle:()=>setShowConfirm(v=>!v)},
              ].map(f => (
                <div key={f.id} style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label style={{fontSize:12,fontWeight:500,color:'#64748b',textTransform:'uppercase',letterSpacing:'.6px'}}>{f.label}</label>
                  <div style={{position:'relative'}}>
                    <span style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',fontSize:16,pointerEvents:'none'}}>{f.icon}</span>
                    <input className="su-input" type={f.show?'text':'password'} placeholder="Min 8 characters" value={form[f.id]}
                      style={{...inputStyle(f.id),paddingRight:42}}
                      onChange={e=>setField(f.id,e.target.value)}
                      onBlur={()=>onBlur(f.id)} />
                    <button type="button" onClick={f.toggle} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:16,color:'#64748b'}}>
                      {f.show?'🙈':'👁️'}
                    </button>
                  </div>
                  {errors[f.id] && <p style={{fontSize:11,color:'#f87171'}}>{errors[f.id]}</p>}
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading} style={{marginTop:20,width:'100%',padding:14,border:'none',borderRadius:12,cursor:'pointer',fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:700,letterSpacing:'.5px',background:'linear-gradient(135deg,#00e5ff,#7c3aed)',color:'#fff',transition:'transform .2s,box-shadow .3s',boxShadow:'0 4px 24px rgba(0,229,255,.25)',opacity:loading?.6:1}}>
              {loading
                ? <span style={{display:'inline-block',width:20,height:20,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}} />
                : 'Create Store Account →'}
            </button>
            <p style={{textAlign:'center',fontSize:13,color:'#64748b',marginTop:16}}>
              Already have an account?{' '}
              <a href="/" style={{color:'#00e5ff',fontWeight:500}} onClick={e=>{e.preventDefault();navigate('/')}}>Sign in</a>
            </p>
          </form>
        </div>
      </div>

      {/* Toast */}
      <div style={{position:'fixed',bottom:28,right:28,padding:'14px 22px',borderRadius:12,fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:10,zIndex:999,pointerEvents:'none',transform:toast.show?'translateY(0)':'translateY(80px)',opacity:toast.show?1:0,transition:'transform .45s cubic-bezier(.22,1,.36,1),opacity .45s',background:toast.type==='success'?'#0d2b24':'#2b0d0d',border:`1px solid ${toast.type==='success'?'#34d399':'#f87171'}`,color:toast.type==='success'?'#34d399':'#f87171'}}>
        {toast.type==='success'?'✅':'❌'} {toast.msg}
      </div>
    </>
  )
}