import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage       from './login.jsx'
import SignupPage      from './signup.jsx'
import HomePage        from './home.jsx'
import CheckoutPage    from './checkout.jsx'

function LoadingScreen() {
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', gap: 16,
        background: '#000',
        fontFamily: 'monospace',
      }}>
        {/* Radial glow, matching your background */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 75% 55% at 50% -5%, rgba(109,40,217,.2) 0%, transparent 70%)',
        }} />
        {/* Spinner */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '2px solid rgba(109,40,217,.25)',
          borderTopColor: '#7c3aed',
          animation: 'spin .8s linear infinite',
        }} />
        {/* Pulsing dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#a78bfa',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, color: '#4c1d95', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Authenticating
          </span>
        </div>
      </div>
    </>
  )
}

function AuthGuard({ user, children }) {
  if (user === undefined) return <LoadingScreen />
  if (!user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500) // reduced from 5s

    fetch('/api/me', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => clearTimeout(timeout))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<LoginPage setUser={setUser} />} />
        <Route path="/signup"      element={<SignupPage />} />
        <Route path="/home"        element={<AuthGuard user={user}><HomePage        user={user} setUser={setUser} /></AuthGuard>} />
        <Route path="/checkout"    element={<AuthGuard user={user}><CheckoutPage    user={user} setUser={setUser} /></AuthGuard>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}