import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootEl = document.getElementById('root')
const bootstrap =
  typeof window !== 'undefined' ? window.__PORTFOLIO_BOOTSTRAP__ : null

const appNode = (
  <StrictMode>
    <App
      initialData={bootstrap?.data}
      initialPathname={bootstrap?.pathname || null}
      initialYear={bootstrap?.year || null}
      initialReviews={bootstrap?.reviews || null}
      initialReviewsSummary={bootstrap?.reviewsSummary || null}
    />
  </StrictMode>
)

if (rootEl && rootEl.hasChildNodes() && bootstrap?.data) {
  hydrateRoot(rootEl, appNode)
} else if (rootEl) {
  createRoot(rootEl).render(appNode)
}
