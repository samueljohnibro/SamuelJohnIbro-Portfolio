import { Suspense, lazy, useEffect, useState } from 'react'
import './App.css'
import { PortfolioPage } from './components/PortfolioPage.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

function normalizeClientPath(pathname) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

function App({
  initialData,
  initialPathname = null,
  initialYear = null,
  initialReviews = null,
  initialReviewsSummary = null,
}) {
  const [pathname] = useState(() => {
    if (initialPathname) return normalizeClientPath(initialPathname)
    return typeof window !== 'undefined'
      ? normalizeClientPath(window.location.pathname)
      : '/'
  })
  const [routeMode, setRouteMode] = useState(() =>
    pathname === '/' ? 'portfolio' : 'checking'
  )

  useEffect(() => {
    if (pathname === '/') return undefined
    let active = true

    const verifyRoute = async () => {
      try {
        const res = await fetch(
          `/api/portal-check?path=${encodeURIComponent(pathname)}`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const payload = await res.json()
          if (active) {
            setRouteMode(payload?.isAdminRoute ? 'admin' : 'portfolio')
          }
          return
        }
      } catch {
        // Fallback when running standalone Vite dev server without Worker proxy
      }

      if (active) {
        if (import.meta.env.DEV && pathname === '/admin') {
          setRouteMode('admin')
        } else {
          setRouteMode('portfolio')
        }
      }
    }

    verifyRoute()
    return () => {
      active = false
    }
  }, [pathname])

  if (routeMode === 'checking') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#070707',
        }}
        aria-hidden="true"
      />
    )
  }

  if (routeMode === 'admin') {
    return (
      <Suspense
        fallback={
          <div
            style={{
              minHeight: '100vh',
              backgroundColor: '#070707',
            }}
          />
        }
      >
        <AdminApp />
      </Suspense>
    )
  }

  return (
    <PortfolioPage
      initialData={initialData}
      initialYear={initialYear}
      initialReviews={initialReviews}
      initialReviewsSummary={initialReviewsSummary}
    />
  )
}

export default App
