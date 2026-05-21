import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage    from './login.jsx'
import SignupPage   from './signup.jsx'
import HomePage     from './home.jsx'
import CheckoutPage from './checkout.jsx'

function AuthGuard({ user, children }) {
  if (user === undefined) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: '#64748b',
        fontFamily: 'DM Mono, monospace', fontSize: '13px', letterSpacing: '1px'
      }}>
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    // Abort the fetch if it takes longer than 5 seconds,
    // so the app never stays stuck on "Loading…" forever.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch('/api/me', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => setUser(null))   // abort, network error, or 4xx all resolve to null
      .finally(() => clearTimeout(timeout))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<LoginPage setUser={setUser} />} />
        <Route path="/signup"   element={<SignupPage />} />
        <Route path="/home"     element={<AuthGuard user={user}><HomePage     user={user} setUser={setUser} /></AuthGuard>} />
        <Route path="/checkout" element={<AuthGuard user={user}><CheckoutPage user={user} setUser={setUser} /></AuthGuard>} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}