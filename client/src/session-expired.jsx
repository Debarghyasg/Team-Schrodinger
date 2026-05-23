import { useNavigate } from 'react-router-dom'

export default function SessionExpiredPage() {
  const navigate = useNavigate()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; }
        @keyframes popIn { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      <div style={{ position:'fixed', inset:0, background:'#000', zIndex:0 }} />
      <div style={{ position:'fixed', inset:0, background:'radial-gradient(ellipse 75% 55% at 50% 50%, rgba(220,38,38,.08) 0%, transparent 70%)', zIndex:0, pointerEvents:'none' }} />

      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px', fontFamily:"'Sora', sans-serif", textAlign:'center' }}>
        <div style={{ fontSize:72, marginBottom:20, animation:'popIn .5s cubic-bezier(.34,1.56,.64,1) both' }}>⏱️</div>
        <h1 style={{ fontSize:32, fontWeight:800, color:'#fca5a5', letterSpacing:'-1px', marginBottom:8, animation:'popIn .5s .1s cubic-bezier(.34,1.56,.64,1) both' }}>Session Ended</h1>
        <p style={{ fontSize:15, color:'rgba(255,255,255,.3)', maxWidth:400, lineHeight:1.7, marginBottom:32, animation:'popIn .5s .2s cubic-bezier(.34,1.56,.64,1) both' }}>
          Your checkout session has been completed by the billing counter admin. Thank you for shopping!
        </p>
        <button onClick={() => navigate('/customer-login')} style={{
          padding:'14px 32px', borderRadius:12, border:'none', cursor:'pointer',
          fontFamily:"'Sora', sans-serif", fontSize:14, fontWeight:700,
          background:'rgba(109,40,217,.12)', border:'1px solid rgba(109,40,217,.3)',
          color:'#a78bfa', animation:'popIn .5s .3s cubic-bezier(.34,1.56,.64,1) both',
        }}>
          ← Back to Customer Login
        </button>
      </div>
    </>
  )
}
