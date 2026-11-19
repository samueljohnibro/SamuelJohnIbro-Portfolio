import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SpaceBackground } from '../components/SpaceBackground.jsx'
import {
  DEFAULT_PORTFOLIO,
  REPO_MEDIA_ASSETS,
  clonePortfolioData,
  isProjectLive,
  normalizePortfolioData,
  resolveHeadlineParts,
  sortProjectsByStatusAndTimeline,
  toEmbedUrl,
} from '../data/defaultPortfolio.js'
import { MediaField } from './MediaField.jsx'
import { formatBytes, uploadMediaFile } from './mediaUpload.js'
import { evaluatePasswordStrength, generatePasswordHash } from './passwordCrypto.js'
import './admin.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'hero', label: 'Hero & Brand' },
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'training', label: 'Training' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'extras', label: 'Extras' },
  { id: 'contact', label: 'Contact' },
  { id: 'media', label: 'Media Vault' },
  { id: 'security', label: 'Security' },
]

function moveItem(list, fromIndex, delta) {
  const targetIndex = fromIndex + delta
  if (targetIndex < 0 || targetIndex >= list.length) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(targetIndex, 0, item)
  return next
}

function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 7)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

function TagChipsEditor({ label, tags = [], onChange, placeholder = 'Add tag...' }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const parts = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const next = [...tags]
    parts.forEach((p) => {
      if (!next.includes(p)) next.push(p)
    })
    onChange(next)
    setInput('')
  }

  return (
    <div className="admin-field">
      {label && <span className="admin-field-label">{label}</span>}
      {tags.length > 0 && (
        <div className="admin-chip-list">
          {tags.map((tag) => (
            <span key={tag} className="admin-chip">
              <span>{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="admin-inline-add">
        <input
          type="text"
          className="admin-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="admin-btn admin-btn-sm" onClick={addTag}>
          Add
        </button>
      </div>
    </div>
  )
}

function HashGeneratorWidget({ title = 'Generate Hidden Cloudflare Secret Hash' }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [generatedHash, setGeneratedHash] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const strength = evaluatePasswordStrength(newPassword)

  const handleGenerate = async (event) => {
    event.preventDefault()
    setError('')
    setCopied(false)
    if (newPassword.length < 10) {
      setError('Use at least 10 characters for strong protection.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const hash = await generatePasswordHash(newPassword)
      setGeneratedHash(hash)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || 'Could not generate hash.')
    } finally {
      setBusy(false)
    }
  }

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div className="admin-item-card">
      <div className="admin-item-head">
        <strong>{title}</strong>
        <span className="admin-item-index">Client-Side WebCrypto</span>
      </div>
      <p className="admin-field-hint">
        Runs 100% inside your browser. Your plaintext password is never sent over
        the network or stored in Git or the database—only the salted PBKDF2-SHA256
        hash goes into Cloudflare Worker Secrets as <code>ADMIN_PASSWORD_HASH</code>.
      </p>

      <form className="admin-stack" onSubmit={handleGenerate}>
        <div className="admin-grid-2">
          <div className="admin-field">
            <label className="admin-field-label">
              <span>New Password</span>
              {newPassword && <span>Strength: {strength.label}</span>}
            </label>
            <div className="admin-password-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                className="admin-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 10 characters..."
                autoComplete="new-password"
              />
              <button
                type="button"
                className="admin-password-toggle"
                onClick={() => setShowPwd((v) => !v)}
              >
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-field-label">Confirm Password</label>
            <input
              type={showPwd ? 'text' : 'password'}
              className="admin-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password..."
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}

        <div>
          <button
            type="submit"
            className="admin-btn admin-btn-gold"
            disabled={busy}
          >
            {busy ? 'Generating Salt & Hash...' : 'Generate Secret Hash'}
          </button>
        </div>
      </form>

      {generatedHash && (
        <div className="admin-stack">
          <div className="admin-alert admin-alert-success">
            Hash generated. Save this value as an encrypted secret named{' '}
            <code>ADMIN_PASSWORD_HASH</code> in Cloudflare Dashboard (Worker →
            Settings → Variables and Secrets) or run{' '}
            <code>npx wrangler secret put ADMIN_PASSWORD_HASH</code>.
          </div>
          <div className="admin-code-block">{generatedHash}</div>
          <div>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={() => copyText(generatedHash)}
            >
              {copied ? 'Copied Hash ✓' : 'Copy ADMIN_PASSWORD_HASH Value'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminApp() {
  const [sessionState, setSessionState] = useState({
    loading: true,
    authenticated: false,
    configured: true,
    storageAvailable: true,
    customAdminPath: false,
    mediaCount: 0,
    mediaBytes: 0,
  })
  const [passwordInput, setPasswordInput] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [activeTab, setActiveTab] = useState('overview')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [draft, setDraft] = useState(() => clonePortfolioData(DEFAULT_PORTFOLIO))
  const [publishedJson, setPublishedJson] = useState(() =>
    JSON.stringify(DEFAULT_PORTFOLIO)
  )
  const [updatedAt, setUpdatedAt] = useState(null)
  const [uploadedMedia, setUploadedMedia] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [vaultUploading, setVaultUploading] = useState(false)
  const [vaultProgress, setVaultProgress] = useState(0)
  const [toast, setToast] = useState(null)

  const vaultFileRef = useRef(null)
  const importJsonRef = useRef(null)

  const notify = useCallback((message, type = 'info') => {
    setToast({ id: Date.now(), message, type })
    setTimeout(() => {
      setToast((prev) => (prev && Date.now() - prev.id >= 3800 ? null : prev))
    }, 4000)
  }, [])

  // Prevent indexing of the unlisted admin portal
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const prevTitle = document.title
    document.title = 'Portfolio Studio — Admin'
    const robots = document.querySelector('meta[name="robots"]')
    const prevRobots = robots?.getAttribute('content') || ''
    robots?.setAttribute('content', 'noindex, nofollow, noarchive')
    return () => {
      document.title = prevTitle
      if (robots && prevRobots) {
        robots.setAttribute('content', prevRobots)
      }
    }
  }, [])

  const loadAdminWorkspace = useCallback(async () => {
    const [portfolioRes, mediaRes] = await Promise.all([
      fetch('/api/admin/portfolio', { cache: 'no-store' }),
      fetch('/api/admin/media', { cache: 'no-store' }),
    ])

    if (portfolioRes.ok) {
      const pPayload = await portfolioRes.json()
      const normalized = normalizePortfolioData(pPayload.data)
      setDraft(normalized)
      setPublishedJson(JSON.stringify(normalized))
      setUpdatedAt(pPayload.updatedAt || null)
    }

    if (mediaRes.ok) {
      const mPayload = await mediaRes.json()
      setUploadedMedia(mPayload.files || [])
    }
  }, [])

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' })
      if (!res.ok) {
        setSessionState((prev) => ({
          ...prev,
          loading: false,
          storageAvailable: false,
        }))
        return
      }
      const info = await res.json()
      setSessionState({
        loading: false,
        authenticated: Boolean(info.authenticated),
        configured: Boolean(info.configured),
        storageAvailable: Boolean(info.storageAvailable),
        customAdminPath: Boolean(info.customAdminPath),
        mediaCount: Number(info.mediaCount || 0),
        mediaBytes: Number(info.mediaBytes || 0),
      })
      if (info.authenticated) {
        await loadAdminWorkspace()
      }
    } catch {
      setSessionState((prev) => ({
        ...prev,
        loading: false,
        storageAvailable: false,
      }))
    }
  }, [loadAdminWorkspace])

  useEffect(() => {
    let active = true
    const init = async () => {
      if (!active) return
      await checkSession()
    }
    void init()
    return () => {
      active = false
    }
  }, [checkSession])

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== publishedJson,
    [draft, publishedJson]
  )

  useEffect(() => {
    if (!isDirty) return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoginError('')

    const formData = new FormData(event.currentTarget)
    const rawPassword =
      passwordInput || String(formData.get('password') || '')
    const rawUsername = String(formData.get('username') || '').trim()

    if (!rawPassword) {
      setLoginError('Please enter your admin password.')
      return
    }

    setLoginBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: rawPassword }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoginError(payload.error || 'Authentication failed.')
        return
      }

      if (
        typeof window !== 'undefined' &&
        typeof window.PasswordCredential === 'function' &&
        navigator.credentials?.store
      ) {
        try {
          const cred = new window.PasswordCredential({
            id: rawUsername || 'admin',
            name: 'Samuel John-Ibro Portfolio Admin',
            password: rawPassword,
          })
          await navigator.credentials.store(cred)
        } catch {
          // Ignore if browser declines credential store
        }
      }

      setPasswordInput('')
      await checkSession()
      notify('Unlocked Portfolio Studio.', 'success')
    } catch {
      setLoginError('Network error while contacting authentication server.')
    } finally {
      setLoginBusy(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    setSessionState((prev) => ({ ...prev, authenticated: false }))
    notify('Signed out.', 'info')
  }

  const handlePublish = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: draft }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to publish changes.')
      }
      const normalized = normalizePortfolioData(payload.data)
      setDraft(normalized)
      setPublishedJson(JSON.stringify(normalized))
      setUpdatedAt(payload.updatedAt || new Date().toISOString())

      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('sji-portfolio-updates')
        ch.postMessage({ type: 'portfolio-updated', data: normalized })
        ch.close()
      }
      notify('Published live to Cloudflare D1.', 'success')
    } catch (error) {
      notify(error.message || 'Publish failed.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    try {
      setDraft(normalizePortfolioData(JSON.parse(publishedJson)))
      notify('Reverted unsaved edits.', 'info')
    } catch {
      setDraft(clonePortfolioData(DEFAULT_PORTFOLIO))
    }
  }

  const handleResetDefaults = async () => {
    if (
      !window.confirm(
        'Reset all live portfolio sections back to the original baseline content?'
      )
    ) {
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/portfolio/reset', { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to reset.')
      }
      const normalized = normalizePortfolioData(payload.data)
      setDraft(normalized)
      setPublishedJson(JSON.stringify(normalized))
      setUpdatedAt(payload.updatedAt || null)
      notify('Portfolio reset to defaults and published.', 'success')
    } catch (error) {
      notify(error.message || 'Reset failed.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Exported portfolio JSON backup.', 'success')
  }

  const handleImportJson = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setDraft(normalizePortfolioData(parsed))
      notify('Imported JSON into draft. Click "Publish Live" to save.', 'info')
    } catch {
      notify('Invalid JSON backup file.', 'error')
    }
  }

  const handleVaultUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    setVaultUploading(true)
    try {
      for (const file of files) {
        setVaultProgress(0)
        const uploaded = await uploadMediaFile(file, setVaultProgress)
        setUploadedMedia((prev) => [uploaded, ...prev])
      }
      notify(
        `Uploaded ${files.length} ${files.length === 1 ? 'file' : 'files'}.`,
        'success'
      )
    } catch (error) {
      notify(error.message || 'Upload failed.', 'error')
    } finally {
      setVaultUploading(false)
      setVaultProgress(0)
    }
  }

  const handleDeleteMedia = async (file) => {
    if (!window.confirm(`Delete "${file.filename}" permanently from D1?`)) return
    try {
      const res = await fetch(
        `/api/admin/media/${encodeURIComponent(file.id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Delete failed.')
      setUploadedMedia((prev) => prev.filter((item) => item.id !== file.id))
      notify(`Deleted "${file.filename}".`, 'info')
    } catch (error) {
      notify(error.message || 'Could not delete file.', 'error')
    }
  }

  const sortedProjectPreview = useMemo(
    () => sortProjectsByStatusAndTimeline(draft.projects),
    [draft.projects]
  )

  const heroPreviewSplit = useMemo(
    () => resolveHeadlineParts(draft.hero.headline, draft.hero.accentPhrase),
    [draft.hero.headline, draft.hero.accentPhrase]
  )

  const totalVaultBytes = useMemo(
    () => uploadedMedia.reduce((sum, f) => sum + Number(f.byteSize || 0), 0),
    [uploadedMedia]
  )

  const openTab = useCallback((tabId) => {
    setActiveTab(tabId)
    setIsMobileMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false)
      }
    }

    const handleResize = () => {
      if (window.innerWidth > 960) {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isMobileMenuOpen])

  if (sessionState.loading) {
    return (
      <div className="admin-shell">
        <SpaceBackground />
        <div className="admin-auth-wrap">
          <div className="admin-auth-card">
            <span className="admin-auth-badge">chomkaTECH™ // Vault</span>
            <h1>Checking session...</h1>
            <p className="admin-auth-subtitle">
              Verifying Cloudflare edge security state.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionState.authenticated) {
    return (
      <div className="admin-shell">
        <SpaceBackground />
        <div className="admin-auth-wrap">
          <div className="admin-auth-card">
            <span className="admin-auth-badge">chomkaTECH™ // Portfolio Admin</span>
            <h1>
              {sessionState.configured
                ? 'Unlock Portfolio Studio'
                : 'Complete Hidden Password Setup'}
            </h1>
            <p className="admin-auth-subtitle">
              {sessionState.configured
                ? 'Enter your hidden admin password to edit live portfolio content and media.'
                : 'To keep your password completely hidden from Git, source code, and the database, set ADMIN_PASSWORD_HASH in Cloudflare Worker Secrets.'}
            </p>

            {!sessionState.storageAvailable && (
              <div className="admin-alert admin-alert-error" style={{ marginTop: 16 }}>
                Cloudflare D1 binding (<code>DB</code>) is not connected yet in this
                runtime. Deploy via <code>npx wrangler deploy</code> or run{' '}
                <code>npm run dev:worker</code>.
              </div>
            )}

            {sessionState.configured ? (
              <form
                id="admin-login-form"
                className="admin-auth-form"
                method="post"
                action="/api/admin/login"
                autoComplete="on"
                onSubmit={handleLogin}
              >
                <div className="admin-field">
                  <label className="admin-field-label" htmlFor="admin-username-input">
                    <span>Account / Username</span>
                    <span className="admin-field-hint">Optional (for browser autofill)</span>
                  </label>
                  <input
                    id="admin-username-input"
                    name="username"
                    type="text"
                    className="admin-input"
                    autoComplete="username"
                    placeholder="Optional — e.g. your email or admin label"
                  />
                </div>

                <div className="admin-field">
                  <label className="admin-field-label" htmlFor="admin-password-input">
                    Admin Password
                  </label>
                  <div className="admin-password-wrap">
                    <input
                      id="admin-password-input"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      className="admin-input"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Enter your secret password..."
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="admin-password-toggle"
                      onClick={() => setShowLoginPassword((v) => !v)}
                    >
                      {showLoginPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="admin-alert admin-alert-error">{loginError}</div>
                )}

                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={loginBusy}
                >
                  {loginBusy ? 'Verifying...' : 'Sign In to Studio'}
                </button>
              </form>
            ) : (
              <div style={{ marginTop: 20 }}>
                <HashGeneratorWidget title="Step 1: Generate Secret Hash Offline" />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const activeTabLabel =
    TABS.find((t) => t.id === activeTab)?.label || 'Overview'

  const getTabCount = (tabId) => {
    if (tabId === 'projects') return draft.projects.length
    if (tabId === 'skills') return draft.skills.length
    if (tabId === 'training') return draft.training.media.length
    if (tabId === 'credentials') return draft.credentials.length
    if (tabId === 'extras') return draft.extras.length
    if (tabId === 'media') return uploadedMedia.length
    return null
  }

  return (
    <div className="admin-shell">
      <SpaceBackground />

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-topbar-brand"
              onClick={() => openTab('overview')}
              title="Back to Portfolio Overview"
            >
              <span className="brand-orbit-icon" aria-hidden="true" />
              <div className="admin-topbar-title">
                <strong>{draft.site.brandName || 'Portfolio'} — Admin Studio</strong>
                <span>
                  {updatedAt
                    ? `Last published ${new Date(updatedAt).toLocaleString()}`
                    : 'Connected to Cloudflare D1'}
                </span>
              </div>
            </button>

            <span
              className={`admin-status-pill ${isDirty ? 'is-dirty' : 'is-synced'}`}
            >
              {isDirty ? 'Unsaved draft edits' : 'Live & synced'}
            </span>
          </div>

          <div className="admin-topbar-actions">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="admin-btn admin-btn-sm"
            >
              View Live Site ↗
            </a>

            {isDirty && (
              <button
                type="button"
                className="admin-btn admin-btn-sm"
                onClick={handleDiscard}
              >
                Discard
              </button>
            )}

            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              disabled={isSaving || !isDirty}
              onClick={handlePublish}
            >
              {isSaving ? 'Publishing...' : 'Publish Live'}
            </button>

            <button
              type="button"
              className="admin-btn admin-btn-sm"
              onClick={handleLogout}
            >
              Lock & Sign Out
            </button>
          </div>

          <div className="admin-topbar-mobile-right">
            {isDirty && (
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-primary"
                disabled={isSaving}
                onClick={handlePublish}
              >
                {isSaving ? 'Saving...' : 'Publish'}
              </button>
            )}

            <button
              type="button"
              className={`admin-nav-toggle${isMobileMenuOpen ? ' active' : ''}`}
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={
                isMobileMenuOpen
                  ? 'Close admin navigation menu'
                  : 'Open admin navigation menu'
              }
              aria-expanded={isMobileMenuOpen}
            >
              <span className="admin-nav-toggle-bar" />
              <span className="admin-nav-toggle-bar" />
              <span className="admin-nav-toggle-bar" />
            </button>
          </div>
        </header>

        <div
          className={`admin-mobile-drawer${isMobileMenuOpen ? ' is-open' : ''}`}
          aria-hidden={!isMobileMenuOpen}
        >
          <div className="admin-mobile-drawer-inner">
            <div className="admin-mobile-drawer-head">
              <span>Studio Navigation</span>
              <span
                className={`admin-status-pill ${isDirty ? 'is-dirty' : 'is-synced'}`}
              >
                {isDirty ? 'Unsaved draft' : 'Live & synced'}
              </span>
            </div>

            <nav className="admin-mobile-drawer-nav" aria-label="Admin sections">
              {TABS.map((tab) => {
                const count = getTabCount(tab.id)
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`admin-nav-item${activeTab === tab.id ? ' active' : ''}`}
                    onClick={() => openTab(tab.id)}
                  >
                    <span>{tab.label}</span>
                    {count !== null && (
                      <span className="admin-nav-count">{count}</span>
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="admin-mobile-drawer-actions">
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={isSaving || !isDirty}
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  handlePublish()
                }}
              >
                {isSaving ? 'Publishing...' : 'Publish Live'}
              </button>

              {isDirty && (
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    handleDiscard()
                  }}
                >
                  Discard Unsaved Edits
                </button>
              )}

              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="admin-btn"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                View Live Site ↗
              </a>

              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  handleLogout()
                }}
              >
                Lock & Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="admin-body">
          <aside className="admin-sidebar" aria-label="Admin sections">
            {TABS.map((tab) => {
              const count = getTabCount(tab.id)
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`admin-nav-item${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => openTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {count !== null && (
                    <span className="admin-nav-count">{count}</span>
                  )}
                </button>
              )
            })}
          </aside>

          <main className="admin-main">
            <div className="admin-mobile-breadcrumb">
              {activeTab !== 'overview' ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-sm"
                  onClick={() => openTab('overview')}
                >
                  ← Overview
                </button>
              ) : (
                <span className="admin-mobile-crumb-label">Dashboard</span>
              )}
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-gold"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                {activeTabLabel} ☰
              </button>
            </div>

            {activeTab === 'overview' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Portfolio Overview</h2>
                    <p>
                      Click any card below to jump straight into editing that
                      section—changes go live in Cloudflare D1 when you click
                      Publish Live.
                    </p>
                  </div>
                </div>

                <div className="admin-stats-grid">
                  {[
                    {
                      tabId: 'projects',
                      label: 'Projects (Live / Total)',
                      value: `${draft.projects.filter((p) => isProjectLive(p)).length} / ${draft.projects.length}`,
                      sub: 'Edit projects & order',
                    },
                    {
                      tabId: 'skills',
                      label: 'Skill Groups',
                      value: String(draft.skills.length),
                      sub: `${draft.skills.reduce((sum, s) => sum + (s.items?.length || 0), 0)} total skills`,
                    },
                    {
                      tabId: 'training',
                      label: 'Training Slides',
                      value: String(draft.training.media.length),
                      sub: `${draft.training.details.length} detail cards`,
                    },
                    {
                      tabId: 'media',
                      label: 'D1 Media Vault',
                      value: formatBytes(totalVaultBytes),
                      sub: `${uploadedMedia.length} uploaded ${uploadedMedia.length === 1 ? 'file' : 'files'}`,
                    },
                  ].map((card) => (
                    <button
                      key={card.tabId}
                      type="button"
                      className="admin-stat-card admin-card-link"
                      onClick={() => openTab(card.tabId)}
                    >
                      <div className="admin-card-top">
                        <span>{card.label}</span>
                        <span className="admin-card-arrow" aria-hidden="true">
                          →
                        </span>
                      </div>
                      <strong>{card.value}</strong>
                      <span className="admin-card-sub">{card.sub}</span>
                    </button>
                  ))}
                </div>

                <div className="admin-section-links-grid" style={{ marginTop: 18 }}>
                  {[
                    {
                      tabId: 'hero',
                      title: 'Hero & Brand',
                      summary: draft.hero.headline,
                      sub: `${draft.site.navLinks.filter((l) => l.visible !== false).length} nav links • Footer & SEO`,
                    },
                    {
                      tabId: 'about',
                      title: 'About Section',
                      summary: draft.about.heading,
                      sub: `${draft.about.visible !== false ? 'Visible' : 'Hidden'} • ${draft.about.paragraphs.length} paragraphs & portrait`,
                    },
                    {
                      tabId: 'credentials',
                      title: 'Credentials',
                      summary: draft.credentialsSection.heading,
                      sub: `${draft.credentialsSection.visible !== false ? 'Visible' : 'Hidden'} • ${draft.credentials.length} entries`,
                    },
                    {
                      tabId: 'extras',
                      title: 'Extras & Creative',
                      summary: draft.extrasSection.heading,
                      sub: `${draft.extrasSection.visible !== false ? 'Visible' : 'Hidden'} • ${draft.extras.length} showcase ${draft.extras.length === 1 ? 'item' : 'items'}`,
                    },
                    {
                      tabId: 'contact',
                      title: 'Contact & Socials',
                      summary: draft.contact.heading,
                      sub: `${draft.contact.visible !== false ? 'Visible' : 'Hidden'} • ${draft.contact.actions.length} action buttons`,
                    },
                    {
                      tabId: 'security',
                      title: 'Security & Password',
                      summary: 'Encrypted Cloudflare Secrets & Cookies',
                      sub: sessionState.customAdminPath
                        ? 'Custom stealth path active'
                        : 'Rotate password hash or path',
                    },
                  ].map((card) => (
                    <button
                      key={card.tabId}
                      type="button"
                      className="admin-section-card admin-card-link"
                      onClick={() => openTab(card.tabId)}
                    >
                      <div className="admin-card-top">
                        <strong>{card.title}</strong>
                        <span className="admin-card-arrow" aria-hidden="true">
                          →
                        </span>
                      </div>
                      <p>{card.summary}</p>
                      <span className="admin-card-sub">{card.sub}</span>
                    </button>
                  ))}
                </div>

                <div className="admin-item-card" style={{ marginTop: 20 }}>
                  <div className="admin-item-head">
                    <strong>Backups & Recovery</strong>
                  </div>
                  <p className="admin-field-hint">
                    Download a full JSON snapshot of your portfolio anytime, restore
                    from a backup file, or revert to the original baseline copy.
                  </p>
                  <div className="admin-media-buttons">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={handleExportJson}
                    >
                      Export JSON Backup
                    </button>
                    <input
                      ref={importJsonRef}
                      type="file"
                      accept="application/json"
                      onChange={handleImportJson}
                      hidden
                    />
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      onClick={() => importJsonRef.current?.click()}
                    >
                      Import JSON Backup
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-danger"
                      onClick={handleResetDefaults}
                    >
                      Reset to Original Defaults
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'hero' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Hero, Navigation, Footer & SEO</h2>
                    <p>
                      Control your opening headline, gold accent phrase, bio, CTAs,
                      navigation links, and browser tab metadata.
                    </p>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-item-card">
                    <strong>Hero Section</strong>
                    <div className="admin-field">
                      <label className="admin-field-label">Eyebrow Badge</label>
                      <input
                        className="admin-input"
                        value={draft.hero.eyebrow}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            hero: { ...d.hero, eyebrow: e.target.value },
                          }))
                        }
                      />
                    </div>

                    <div className="admin-grid-2">
                      <div className="admin-field">
                        <label className="admin-field-label">
                          Typewriter Headline
                        </label>
                        <input
                          className="admin-input"
                          value={draft.hero.headline}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              hero: { ...d.hero, headline: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <label className="admin-field-label">
                          Gold Highlight Phrase
                        </label>
                        <input
                          className="admin-input"
                          value={draft.hero.accentPhrase}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              hero: { ...d.hero, accentPhrase: e.target.value },
                            }))
                          }
                          placeholder="Exact substring to highlight in gold..."
                        />
                      </div>
                    </div>

                    <div className="admin-preview-box">
                      <div className="admin-preview-box-label">
                        Live Headline Accent Preview
                      </div>
                      <div className="admin-hero-live-preview">
                        <span className="hero-primary-text">
                          {heroPreviewSplit.before}
                        </span>
                        <span className="hero-accent-text">
                          {heroPreviewSplit.accent}
                        </span>
                        <span className="hero-primary-text">
                          {heroPreviewSplit.after}
                        </span>
                      </div>
                    </div>

                    <div className="admin-field">
                      <label className="admin-field-label">
                        Hero Intro Description
                      </label>
                      <textarea
                        className="admin-textarea"
                        value={draft.hero.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            hero: { ...d.hero, description: e.target.value },
                          }))
                        }
                      />
                    </div>

                    <div className="admin-grid-2">
                      <div className="admin-item-card">
                        <strong>Primary CTA Button (Wine)</strong>
                        <div className="admin-field">
                          <label className="admin-field-label">Label</label>
                          <input
                            className="admin-input"
                            value={draft.hero.primaryCta.label}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hero: {
                                  ...d.hero,
                                  primaryCta: {
                                    ...d.hero.primaryCta,
                                    label: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="admin-field">
                          <label className="admin-field-label">Target Link</label>
                          <input
                            className="admin-input"
                            value={draft.hero.primaryCta.href}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hero: {
                                  ...d.hero,
                                  primaryCta: {
                                    ...d.hero.primaryCta,
                                    href: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="admin-item-card">
                        <strong>Secondary CTA Button (Glass)</strong>
                        <div className="admin-field">
                          <label className="admin-field-label">Label</label>
                          <input
                            className="admin-input"
                            value={draft.hero.secondaryCta.label}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hero: {
                                  ...d.hero,
                                  secondaryCta: {
                                    ...d.hero.secondaryCta,
                                    label: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="admin-field">
                          <label className="admin-field-label">Target Link</label>
                          <input
                            className="admin-input"
                            value={draft.hero.secondaryCta.href}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hero: {
                                  ...d.hero,
                                  secondaryCta: {
                                    ...d.hero.secondaryCta,
                                    href: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="admin-item-card">
                    <div className="admin-item-head">
                      <strong>Brand, Footer & Navigation Links</strong>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-gold"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            site: {
                              ...d.site,
                              navLinks: [
                                ...d.site.navLinks,
                                {
                                  id: makeId('nav'),
                                  label: 'New Link',
                                  href: '#about',
                                  visible: true,
                                },
                              ],
                            },
                          }))
                        }
                      >
                        + Add Nav Link
                      </button>
                    </div>

                    <div className="admin-grid-3">
                      <div className="admin-field">
                        <label className="admin-field-label">Navbar Brand</label>
                        <input
                          className="admin-input"
                          value={draft.site.brandName}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              site: { ...d.site, brandName: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <label className="admin-field-label">
                          Footer Left ({'{year}'} auto-updates)
                        </label>
                        <input
                          className="admin-input"
                          value={draft.site.footerLeft}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              site: { ...d.site, footerLeft: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="admin-field">
                        <label className="admin-field-label">Footer Right</label>
                        <input
                          className="admin-input"
                          value={draft.site.footerRight}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              site: { ...d.site, footerRight: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>

                    {draft.site.navLinks.map((link, idx) => (
                      <div key={link.id} className="admin-item-card">
                        <div className="admin-grid-3">
                          <input
                            className="admin-input"
                            value={link.label}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                site: {
                                  ...d.site,
                                  navLinks: d.site.navLinks.map((n, i) =>
                                    i === idx ? { ...n, label: e.target.value } : n
                                  ),
                                },
                              }))
                            }
                            placeholder="Label"
                          />
                          <input
                            className="admin-input"
                            value={link.href}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                site: {
                                  ...d.site,
                                  navLinks: d.site.navLinks.map((n, i) =>
                                    i === idx ? { ...n, href: e.target.value } : n
                                  ),
                                },
                              }))
                            }
                            placeholder="#section"
                          />
                          <div className="admin-item-actions">
                            <label className="admin-switch-row">
                              <input
                                type="checkbox"
                                checked={link.visible !== false}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    site: {
                                      ...d.site,
                                      navLinks: d.site.navLinks.map((n, i) =>
                                        i === idx
                                          ? { ...n, visible: e.target.checked }
                                          : n
                                      ),
                                    },
                                  }))
                                }
                              />
                              Show
                            </label>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-icon"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  site: {
                                    ...d.site,
                                    navLinks: moveItem(d.site.navLinks, idx, -1),
                                  },
                                }))
                              }
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-icon"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  site: {
                                    ...d.site,
                                    navLinks: moveItem(d.site.navLinks, idx, 1),
                                  },
                                }))
                              }
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-danger"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  site: {
                                    ...d.site,
                                    navLinks: d.site.navLinks.filter(
                                      (_, i) => i !== idx
                                    ),
                                  },
                                }))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-item-card">
                    <strong>Page Title & SEO</strong>
                    <div className="admin-field">
                      <label className="admin-field-label">Browser Tab Title</label>
                      <input
                        className="admin-input"
                        value={draft.site.seo.title}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            site: {
                              ...d.site,
                              seo: { ...d.site.seo, title: e.target.value },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Meta Description</label>
                      <textarea
                        className="admin-textarea"
                        value={draft.site.seo.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            site: {
                              ...d.site,
                              seo: { ...d.site.seo, description: e.target.value },
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'about' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>About Section</h2>
                    <p>
                      Use <code>**text**</code> around phrases like{' '}
                      <code>**chomkaTECH™**</code> to highlight them in bold white.
                    </p>
                  </div>
                  <label className="admin-switch-row">
                    <input
                      type="checkbox"
                      checked={draft.about.visible !== false}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          about: { ...d.about, visible: e.target.checked },
                        }))
                      }
                    />
                    Section Visible
                  </label>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.about.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            about: { ...d.about, label: e.target.value },
                          }))
                        }
                      />
                    </div>

                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.about.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            about: { ...d.about, heading: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <MediaField
                    label="Portrait Image"
                    value={draft.about.image.src}
                    onChange={(src) =>
                      setDraft((d) => ({
                        ...d,
                        about: { ...d.about, image: { ...d.about.image, src } },
                      }))
                    }
                    uploadedMedia={uploadedMedia}
                    onMediaUploaded={(file) =>
                      setUploadedMedia((prev) => [file, ...prev])
                    }
                    onNotify={notify}
                  />

                  <div className="admin-field">
                    <label className="admin-field-label">Portrait Alt Text</label>
                    <input
                      className="admin-input"
                      value={draft.about.image.alt}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          about: {
                            ...d.about,
                            image: { ...d.about.image, alt: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="admin-item-head" style={{ marginTop: 8 }}>
                    <strong>Bio Paragraphs</strong>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          about: {
                            ...d.about,
                            paragraphs: [...d.about.paragraphs, 'New paragraph...'],
                          },
                        }))
                      }
                    >
                      + Add Paragraph
                    </button>
                  </div>

                  {draft.about.paragraphs.map((para, idx) => (
                    <div key={idx} className="admin-item-card">
                      <div className="admin-item-head">
                        <span className="admin-item-index">
                          Paragraph {idx + 1}
                        </span>
                        <div className="admin-item-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                about: {
                                  ...d.about,
                                  paragraphs: moveItem(d.about.paragraphs, idx, -1),
                                },
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                about: {
                                  ...d.about,
                                  paragraphs: moveItem(d.about.paragraphs, idx, 1),
                                },
                              }))
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                about: {
                                  ...d.about,
                                  paragraphs: d.about.paragraphs.filter(
                                    (_, i) => i !== idx
                                  ),
                                },
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="admin-textarea"
                        value={para}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            about: {
                              ...d.about,
                              paragraphs: d.about.paragraphs.map((p, i) =>
                                i === idx ? e.target.value : p
                              ),
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'projects' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Projects</h2>
                    <p>
                      LIVE projects automatically appear first and number{' '}
                      <code>01..NN</code> in the balanced 2-column masonry grid.
                    </p>
                  </div>
                  <div className="admin-item-actions">
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={draft.projectsSection.visible !== false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            projectsSection: {
                              ...d.projectsSection,
                              visible: e.target.checked,
                            },
                          }))
                        }
                      />
                      Section Visible
                    </label>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          projects: [
                            {
                              id: makeId('project'),
                              status: 'LIVE',
                              isLive: true,
                              date: new Date().toISOString().slice(0, 10),
                              logo: null,
                              title: 'New Project',
                              description: '',
                              tags: [],
                              liveUrl: '',
                              liveLabel: 'VIEW LIVE PROJECT',
                              liveAriaLabel: '',
                              showPreview: true,
                              developmentNote: '',
                              visible: true,
                            },
                            ...d.projects,
                          ],
                        }))
                      }
                    >
                      + Add Project
                    </button>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.projectsSection.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            projectsSection: {
                              ...d.projectsSection,
                              label: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.projectsSection.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            projectsSection: {
                              ...d.projectsSection,
                              heading: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {draft.projects.map((project, idx) => {
                    const livePos = sortedProjectPreview.find(
                      (p) => p.id === project.id
                    )?.number

                    return (
                      <div
                        key={project.id}
                        className={`admin-item-card${project.visible === false ? ' is-hidden-item' : ''}`}
                      >
                        <div className="admin-item-head">
                          <div className="admin-item-title-group">
                            <span className="admin-item-index">
                              {livePos ? `#${livePos} on site` : 'Hidden'}
                            </span>
                            <strong>{project.title || 'Untitled Project'}</strong>
                          </div>

                          <div className="admin-item-actions">
                            <label className="admin-switch-row">
                              <input
                                type="checkbox"
                                checked={project.visible !== false}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    projects: d.projects.map((p, i) =>
                                      i === idx
                                        ? { ...p, visible: e.target.checked }
                                        : p
                                    ),
                                  }))
                                }
                              />
                              Visible
                            </label>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-icon"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: moveItem(d.projects, idx, -1),
                                }))
                              }
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-icon"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: moveItem(d.projects, idx, 1),
                                }))
                              }
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-danger"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="admin-grid-3">
                          <div className="admin-field">
                            <label className="admin-field-label">Title</label>
                            <input
                              className="admin-input"
                              value={project.title}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx ? { ...p, title: e.target.value } : p
                                  ),
                                }))
                              }
                            />
                          </div>

                          <div className="admin-field">
                            <label className="admin-field-label">Status Badge</label>
                            <input
                              className="admin-input"
                              value={project.status}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx ? { ...p, status: e.target.value } : p
                                  ),
                                }))
                              }
                            />
                          </div>

                          <div className="admin-field">
                            <label className="admin-field-label">
                              Timeline Date (Optional Sort)
                            </label>
                            <input
                              type="date"
                              className="admin-input"
                              value={project.date || ''}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx ? { ...p, date: e.target.value } : p
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="admin-media-buttons">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={Boolean(project.isLive)}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx
                                      ? {
                                          ...p,
                                          isLive: e.target.checked,
                                          status: e.target.checked
                                            ? 'LIVE'
                                            : 'IN DEVELOPMENT',
                                        }
                                      : p
                                  ),
                                }))
                              }
                            />
                            Glowing Live Status (places project in top LIVE group)
                          </label>

                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={project.showPreview !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx
                                      ? { ...p, showPreview: e.target.checked }
                                      : p
                                  ),
                                }))
                              }
                            />
                            Show Live Site Iframe Preview
                          </label>
                        </div>

                        <MediaField
                          label="Project Logo (Optional)"
                          value={project.logo?.src || ''}
                          allowClear
                          onChange={(src) =>
                            setDraft((d) => ({
                              ...d,
                              projects: d.projects.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      logo: src
                                        ? {
                                            src,
                                            alt: `${p.title || 'Project'} logo`,
                                          }
                                        : null,
                                    }
                                  : p
                              ),
                            }))
                          }
                          uploadedMedia={uploadedMedia}
                          onMediaUploaded={(file) =>
                            setUploadedMedia((prev) => [file, ...prev])
                          }
                          onNotify={notify}
                        />

                        <div className="admin-field">
                          <label className="admin-field-label">Description</label>
                          <textarea
                            className="admin-textarea"
                            value={project.description}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                projects: d.projects.map((p, i) =>
                                  i === idx
                                    ? { ...p, description: e.target.value }
                                    : p
                                ),
                              }))
                            }
                          />
                        </div>

                        <div className="admin-grid-3">
                          <div className="admin-field">
                            <label className="admin-field-label">
                              Live Project URL
                            </label>
                            <input
                              className="admin-input"
                              value={project.liveUrl}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx
                                      ? { ...p, liveUrl: e.target.value }
                                      : p
                                  ),
                                }))
                              }
                              placeholder="https://..."
                            />
                          </div>

                          <div className="admin-field">
                            <label className="admin-field-label">
                              Live Button Label
                            </label>
                            <input
                              className="admin-input"
                              value={project.liveLabel}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx
                                      ? { ...p, liveLabel: e.target.value }
                                      : p
                                  ),
                                }))
                              }
                            />
                          </div>

                          <div className="admin-field">
                            <label className="admin-field-label">
                              In-Development Note (when no Live URL)
                            </label>
                            <input
                              className="admin-input"
                              value={project.developmentNote}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  projects: d.projects.map((p, i) =>
                                    i === idx
                                      ? { ...p, developmentNote: e.target.value }
                                      : p
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>

                        <TagChipsEditor
                          label="Tech Stack Tags"
                          tags={project.tags}
                          onChange={(nextTags) =>
                            setDraft((d) => ({
                              ...d,
                              projects: d.projects.map((p, i) =>
                                i === idx ? { ...p, tags: nextTags } : p
                              ),
                            }))
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {activeTab === 'skills' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Skills Toolkit</h2>
                    <p>Manage skill categories and individual skill items.</p>
                  </div>
                  <div className="admin-item-actions">
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={draft.skillsSection.visible !== false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            skillsSection: {
                              ...d.skillsSection,
                              visible: e.target.checked,
                            },
                          }))
                        }
                      />
                      Section Visible
                    </label>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          skills: [
                            ...d.skills,
                            {
                              id: makeId('skill'),
                              title: 'New Category',
                              items: [],
                              visible: true,
                            },
                          ],
                        }))
                      }
                    >
                      + Add Category
                    </button>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.skillsSection.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            skillsSection: {
                              ...d.skillsSection,
                              label: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.skillsSection.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            skillsSection: {
                              ...d.skillsSection,
                              heading: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {draft.skills.map((group, idx) => (
                    <div
                      key={group.id}
                      className={`admin-item-card${group.visible === false ? ' is-hidden-item' : ''}`}
                    >
                      <div className="admin-item-head">
                        <strong>{group.title}</strong>
                        <div className="admin-item-actions">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={group.visible !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  skills: d.skills.map((s, i) =>
                                    i === idx
                                      ? { ...s, visible: e.target.checked }
                                      : s
                                  ),
                                }))
                              }
                            />
                            Visible
                          </label>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                skills: moveItem(d.skills, idx, -1),
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                skills: moveItem(d.skills, idx, 1),
                              }))
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                skills: d.skills.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="admin-field">
                        <label className="admin-field-label">Category Title</label>
                        <input
                          className="admin-input"
                          value={group.title}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              skills: d.skills.map((s, i) =>
                                i === idx ? { ...s, title: e.target.value } : s
                              ),
                            }))
                          }
                        />
                      </div>

                      <TagChipsEditor
                        label="Skills (separated by • on public site)"
                        tags={group.items}
                        onChange={(items) =>
                          setDraft((d) => ({
                            ...d,
                            skills: d.skills.map((s, i) =>
                              i === idx ? { ...s, items } : s
                            ),
                          }))
                        }
                        placeholder="Add skill (e.g. TypeScript)..."
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'training' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Training & Showcase Carousel</h2>
                    <p>
                      Upload photos or videos, paste direct video/image links or
                      YouTube/Vimeo links, and edit detail cards.
                    </p>
                  </div>
                  <label className="admin-switch-row">
                    <input
                      type="checkbox"
                      checked={draft.training.visible !== false}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          training: { ...d.training, visible: e.target.checked },
                        }))
                      }
                    />
                    Section Visible
                  </label>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.training.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            training: { ...d.training, label: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.training.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            training: { ...d.training, heading: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="admin-field">
                    <label className="admin-field-label">Description</label>
                    <textarea
                      className="admin-textarea"
                      value={draft.training.description}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          training: {
                            ...d.training,
                            description: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Meta Badge Label</label>
                      <input
                        className="admin-input"
                        value={draft.training.metaLabel}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            training: { ...d.training, metaLabel: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Meta Organization</label>
                      <input
                        className="admin-input"
                        value={draft.training.metaValue}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            training: { ...d.training, metaValue: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="admin-item-head" style={{ marginTop: 10 }}>
                    <strong>Carousel Media Slides</strong>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          training: {
                            ...d.training,
                            media: [
                              ...d.training.media,
                              {
                                id: makeId('slide'),
                                type: 'image',
                                src: '',
                                alt: 'Training showcase media',
                                maxDurationMs: 4000,
                                visible: true,
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Add Slide
                    </button>
                  </div>

                  {draft.training.media.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className={`admin-item-card${slide.visible === false ? ' is-hidden-item' : ''}`}
                    >
                      <div className="admin-item-head">
                        <span className="admin-item-index">
                          Slide {idx + 1} ({slide.type.toUpperCase()})
                        </span>
                        <div className="admin-item-actions">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={slide.visible !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  training: {
                                    ...d.training,
                                    media: d.training.media.map((m, i) =>
                                      i === idx
                                        ? { ...m, visible: e.target.checked }
                                        : m
                                    ),
                                  },
                                }))
                              }
                            />
                            Visible
                          </label>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                training: {
                                  ...d.training,
                                  media: moveItem(d.training.media, idx, -1),
                                },
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                training: {
                                  ...d.training,
                                  media: moveItem(d.training.media, idx, 1),
                                },
                              }))
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                training: {
                                  ...d.training,
                                  media: d.training.media.filter(
                                    (_, i) => i !== idx
                                  ),
                                },
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="admin-grid-2">
                        <div className="admin-field">
                          <label className="admin-field-label">Media Type</label>
                          <select
                            className="admin-select"
                            value={slide.type}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                training: {
                                  ...d.training,
                                  media: d.training.media.map((m, i) =>
                                    i === idx ? { ...m, type: e.target.value } : m
                                  ),
                                },
                              }))
                            }
                          >
                            <option value="image">Image</option>
                            <option value="video">Video (MP4 / WebM)</option>
                            <option value="embed">YouTube / Vimeo Link</option>
                          </select>
                        </div>

                        <div className="admin-field">
                          <label className="admin-field-label">
                            Alt / Caption Text
                          </label>
                          <input
                            className="admin-input"
                            value={slide.alt}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                training: {
                                  ...d.training,
                                  media: d.training.media.map((m, i) =>
                                    i === idx ? { ...m, alt: e.target.value } : m
                                  ),
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <MediaField
                        label="Source File or URL"
                        value={slide.src}
                        accept="image/*,video/*"
                        allowVideo
                        placeholder="Upload file, pick library asset, or paste image/video/YouTube URL..."
                        onChange={(src, detectedType) =>
                          setDraft((d) => ({
                            ...d,
                            training: {
                              ...d.training,
                              media: d.training.media.map((m, i) => {
                                if (i !== idx) return m
                                const nextType = toEmbedUrl(src)
                                  ? 'embed'
                                  : detectedType || m.type
                                return { ...m, src, type: nextType }
                              }),
                            },
                          }))
                        }
                        uploadedMedia={uploadedMedia}
                        onMediaUploaded={(file) =>
                          setUploadedMedia((prev) => [file, ...prev])
                        }
                        onNotify={notify}
                      />
                    </div>
                  ))}

                  <div className="admin-item-head" style={{ marginTop: 10 }}>
                    <strong>Training Detail Cards</strong>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          training: {
                            ...d.training,
                            details: [
                              ...d.training.details,
                              {
                                id: makeId('detail'),
                                label: 'HIGHLIGHT',
                                title: 'New Detail',
                                description: '',
                                visible: true,
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Add Detail Card
                    </button>
                  </div>

                  {draft.training.details.map((detail, idx) => (
                    <div key={detail.id} className="admin-item-card">
                      <div className="admin-item-head">
                        <strong>{detail.title || detail.label}</strong>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              training: {
                                ...d.training,
                                details: d.training.details.filter(
                                  (_, i) => i !== idx
                                ),
                              },
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="admin-grid-2">
                        <input
                          className="admin-input"
                          value={detail.label}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              training: {
                                ...d.training,
                                details: d.training.details.map((item, i) =>
                                  i === idx
                                    ? { ...item, label: e.target.value }
                                    : item
                                ),
                              },
                            }))
                          }
                          placeholder="Label (e.g. ROLE)"
                        />
                        <input
                          className="admin-input"
                          value={detail.title}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              training: {
                                ...d.training,
                                details: d.training.details.map((item, i) =>
                                  i === idx
                                    ? { ...item, title: e.target.value }
                                    : item
                                ),
                              },
                            }))
                          }
                          placeholder="Card Heading"
                        />
                      </div>
                      <textarea
                        className="admin-textarea"
                        value={detail.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            training: {
                              ...d.training,
                              details: d.training.details.map((item, i) =>
                                i === idx
                                  ? { ...item, description: e.target.value }
                                  : item
                              ),
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'credentials' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Education & Credentials</h2>
                    <p>Manage degrees, cloud certifications, and milestones.</p>
                  </div>
                  <div className="admin-item-actions">
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={draft.credentialsSection.visible !== false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            credentialsSection: {
                              ...d.credentialsSection,
                              visible: e.target.checked,
                            },
                          }))
                        }
                      />
                      Section Visible
                    </label>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          credentials: [
                            ...d.credentials,
                            {
                              id: makeId('cred'),
                              label: 'CERTIFICATION',
                              title: 'New Credential',
                              institution: '',
                              description: '',
                              attachment: null,
                              visible: true,
                            },
                          ],
                        }))
                      }
                    >
                      + Add Credential
                    </button>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.credentialsSection.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            credentialsSection: {
                              ...d.credentialsSection,
                              label: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.credentialsSection.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            credentialsSection: {
                              ...d.credentialsSection,
                              heading: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {draft.credentials.map((cred, idx) => (
                    <div
                      key={cred.id}
                      className={`admin-item-card${cred.visible === false ? ' is-hidden-item' : ''}`}
                    >
                      <div className="admin-item-head">
                        <strong>{cred.title || 'Credential'}</strong>
                        <div className="admin-item-actions">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={cred.visible !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  credentials: d.credentials.map((c, i) =>
                                    i === idx
                                      ? { ...c, visible: e.target.checked }
                                      : c
                                  ),
                                }))
                              }
                            />
                            Visible
                          </label>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                credentials: moveItem(d.credentials, idx, -1),
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                credentials: moveItem(d.credentials, idx, 1),
                              }))
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                credentials: d.credentials.filter(
                                  (_, i) => i !== idx
                                ),
                              }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="admin-grid-3">
                        <div className="admin-field">
                          <label
                            className="admin-field-label"
                            htmlFor={`cred-label-${cred.id}`}
                          >
                            Category Badge
                          </label>
                          <input
                            id={`cred-label-${cred.id}`}
                            className="admin-input"
                            value={cred.label ?? ''}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                credentials: d.credentials.map((c, i) =>
                                  i === idx ? { ...c, label: e.target.value } : c
                                ),
                              }))
                            }
                            placeholder="DEGREE, CERTIFICATION..."
                          />
                        </div>

                        <div className="admin-field">
                          <label
                            className="admin-field-label"
                            htmlFor={`cred-title-${cred.id}`}
                          >
                            Credential Title
                          </label>
                          <input
                            id={`cred-title-${cred.id}`}
                            className="admin-input"
                            value={cred.title ?? ''}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                credentials: d.credentials.map((c, i) =>
                                  i === idx ? { ...c, title: e.target.value } : c
                                ),
                              }))
                            }
                            placeholder="e.g. B.Sc. Software Engineering"
                          />
                        </div>

                        <div className="admin-field">
                          <label
                            className="admin-field-label"
                            htmlFor={`cred-inst-${cred.id}`}
                          >
                            Institution / Issuer
                          </label>
                          <input
                            id={`cred-inst-${cred.id}`}
                            className="admin-input"
                            value={cred.institution ?? ''}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                credentials: d.credentials.map((c, i) =>
                                  i === idx
                                    ? { ...c, institution: e.target.value }
                                    : c
                                ),
                              }))
                            }
                            placeholder="Institution / Issuer"
                          />
                        </div>
                      </div>

                      <div className="admin-field">
                        <label
                          className="admin-field-label"
                          htmlFor={`cred-desc-${cred.id}`}
                        >
                          Description
                        </label>
                        <textarea
                          id={`cred-desc-${cred.id}`}
                          className="admin-textarea"
                          value={cred.description ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              credentials: d.credentials.map((c, i) =>
                                i === idx
                                  ? { ...c, description: e.target.value }
                                  : c
                              ),
                            }))
                          }
                        />
                      </div>

                      <MediaField
                        label="Certificate or Badge (Image or PDF)"
                        value={cred.attachment?.src || ''}
                        accept="image/*,application/pdf"
                        allowPdf
                        forcedType={cred.attachment?.type || null}
                        allowClear
                        placeholder="Upload image/PDF, pick from Library, or paste URL..."
                        onChange={(src, detectedType) =>
                          setDraft((d) => ({
                            ...d,
                            credentials: d.credentials.map((c, i) => {
                              if (i !== idx) return c
                              if (!src) {
                                return { ...c, attachment: null }
                              }
                              const resolvedType =
                                detectedType === 'pdf' || detectedType === 'image'
                                  ? detectedType
                                  : /\.pdf(\?|$|#)/i.test(src)
                                    ? 'pdf'
                                    : c.attachment?.type || 'image'
                              return {
                                ...c,
                                attachment: {
                                  src,
                                  type: resolvedType,
                                  label:
                                    c.attachment?.label ||
                                    (resolvedType === 'pdf'
                                      ? 'View Certificate (PDF)'
                                      : 'View Certificate'),
                                },
                              }
                            }),
                          }))
                        }
                        uploadedMedia={uploadedMedia}
                        onMediaUploaded={(file) =>
                          setUploadedMedia((prev) => [file, ...prev])
                        }
                        onNotify={notify}
                      />

                      {cred.attachment?.src && (
                        <div className="admin-grid-2">
                          <div className="admin-field">
                            <label
                              className="admin-field-label"
                              htmlFor={`cred-attach-type-${cred.id}`}
                            >
                              Attachment Format
                            </label>
                            <select
                              id={`cred-attach-type-${cred.id}`}
                              className="admin-select"
                              value={cred.attachment.type || 'image'}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  credentials: d.credentials.map((c, i) =>
                                    i === idx && c.attachment
                                      ? {
                                          ...c,
                                          attachment: {
                                            ...c.attachment,
                                            type: e.target.value,
                                          },
                                        }
                                      : c
                                  ),
                                }))
                              }
                            >
                              <option value="image">Image / Badge</option>
                              <option value="pdf">PDF Document</option>
                            </select>
                          </div>

                          <div className="admin-field">
                            <label
                              className="admin-field-label"
                              htmlFor={`cred-attach-label-${cred.id}`}
                            >
                              Public Card Button Label
                            </label>
                            <input
                              id={`cred-attach-label-${cred.id}`}
                              className="admin-input"
                              value={cred.attachment.label ?? ''}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  credentials: d.credentials.map((c, i) =>
                                    i === idx && c.attachment
                                      ? {
                                          ...c,
                                          attachment: {
                                            ...c.attachment,
                                            label: e.target.value,
                                          },
                                        }
                                      : c
                                  ),
                                }))
                              }
                              placeholder="View Certificate"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="admin-field">
                    <label className="admin-field-label">
                      Bottom Summary Statement
                    </label>
                    <textarea
                      className="admin-textarea"
                      value={draft.credentialsSection.summary}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          credentialsSection: {
                            ...d.credentialsSection,
                            summary: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'extras' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Extras & Creative Pursuits</h2>
                    <p>
                      Showcase music, sound design, or creative ventures beyond
                      engineering.
                    </p>
                  </div>
                  <div className="admin-item-actions">
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={draft.extrasSection.visible !== false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            extrasSection: {
                              ...d.extrasSection,
                              visible: e.target.checked,
                            },
                          }))
                        }
                      />
                      Section Visible
                    </label>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          extras: [
                            ...d.extras,
                            {
                              id: makeId('extra'),
                              status: 'LIVE',
                              isLive: true,
                              logo: null,
                              title: 'New Showcase Item',
                              subtitle: '',
                              liveUrl: '',
                              showPreview: true,
                              description: '',
                              tags: [],
                              ctaLabel: 'VISIT SITE',
                              ctaHref: '',
                              ctaAriaLabel: '',
                              visible: true,
                            },
                          ],
                        }))
                      }
                    >
                      + Add Extra Item
                    </button>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.extrasSection.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            extrasSection: {
                              ...d.extrasSection,
                              label: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.extrasSection.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            extrasSection: {
                              ...d.extrasSection,
                              heading: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="admin-field">
                    <label className="admin-field-label">
                      Intro Paragraph (supports <code>**bold**</code>)
                    </label>
                    <textarea
                      className="admin-textarea"
                      value={draft.extrasSection.intro}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          extrasSection: {
                            ...d.extrasSection,
                            intro: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>

                  {draft.extras.map((extra, idx) => (
                    <div
                      key={extra.id}
                      className={`admin-item-card${extra.visible === false ? ' is-hidden-item' : ''}`}
                    >
                      <div className="admin-item-head">
                        <strong>{extra.title}</strong>
                        <div className="admin-item-actions">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={extra.visible !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  extras: d.extras.map((item, i) =>
                                    i === idx
                                      ? { ...item, visible: e.target.checked }
                                      : item
                                  ),
                                }))
                              }
                            />
                            Visible
                          </label>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                extras: d.extras.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="admin-grid-3">
                        <input
                          className="admin-input"
                          value={extra.title}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, title: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Title"
                        />
                        <input
                          className="admin-input"
                          value={extra.subtitle}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, subtitle: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Subtitle"
                        />
                        <input
                          className="admin-input"
                          value={extra.status}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, status: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Status (e.g. LIVE)"
                        />
                      </div>

                      <div className="admin-media-buttons">
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={Boolean(extra.isLive)}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                extras: d.extras.map((item, i) =>
                                  i === idx
                                    ? { ...item, isLive: e.target.checked }
                                    : item
                                ),
                              }))
                            }
                          />
                          Glowing LIVE badge
                        </label>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={extra.showPreview !== false}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                extras: d.extras.map((item, i) =>
                                  i === idx
                                    ? { ...item, showPreview: e.target.checked }
                                    : item
                                ),
                              }))
                            }
                          />
                          Show Live Iframe Preview
                        </label>
                      </div>

                      <MediaField
                        label="Logo (Optional)"
                        value={extra.logo?.src || ''}
                        allowClear
                        onChange={(src) =>
                          setDraft((d) => ({
                            ...d,
                            extras: d.extras.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    logo: src
                                      ? {
                                          src,
                                          alt: `${item.title || 'Extra'} logo`,
                                        }
                                      : null,
                                  }
                                : item
                            ),
                          }))
                        }
                        uploadedMedia={uploadedMedia}
                        onMediaUploaded={(file) =>
                          setUploadedMedia((prev) => [file, ...prev])
                        }
                        onNotify={notify}
                      />

                      <div className="admin-grid-3">
                        <input
                          className="admin-input"
                          value={extra.liveUrl}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, liveUrl: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Preview Site URL (https://...)"
                        />
                        <input
                          className="admin-input"
                          value={extra.ctaLabel}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, ctaLabel: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Button Label"
                        />
                        <input
                          className="admin-input"
                          value={extra.ctaHref}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              extras: d.extras.map((item, i) =>
                                i === idx
                                  ? { ...item, ctaHref: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="Button URL (https://...)"
                        />
                      </div>

                      <textarea
                        className="admin-textarea"
                        value={extra.description}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            extras: d.extras.map((item, i) =>
                              i === idx
                                ? { ...item, description: e.target.value }
                                : item
                            ),
                          }))
                        }
                      />

                      <TagChipsEditor
                        label="Tags"
                        tags={extra.tags}
                        onChange={(tags) =>
                          setDraft((d) => ({
                            ...d,
                            extras: d.extras.map((item, i) =>
                              i === idx ? { ...item, tags } : item
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'contact' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Contact & Social Links</h2>
                    <p>
                      Customize contact buttons, email, LinkedIn, GitHub, or even
                      link a PDF resume uploaded to your Media Vault.
                    </p>
                  </div>
                  <div className="admin-item-actions">
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={draft.contact.visible !== false}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            contact: { ...d.contact, visible: e.target.checked },
                          }))
                        }
                      />
                      Section Visible
                    </label>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-gold"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          contact: {
                            ...d.contact,
                            actions: [
                              ...d.contact.actions,
                              {
                                id: makeId('contact'),
                                label: 'New Link ↗',
                                href: 'https://',
                                variant: 'secondary',
                                newTab: true,
                                visible: true,
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Add Button
                    </button>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-grid-2">
                    <div className="admin-field">
                      <label className="admin-field-label">Section Label</label>
                      <input
                        className="admin-input"
                        value={draft.contact.label}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            contact: { ...d.contact, label: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="admin-field">
                      <label className="admin-field-label">Section Heading</label>
                      <input
                        className="admin-input"
                        value={draft.contact.heading}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            contact: { ...d.contact, heading: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="admin-field">
                    <label className="admin-field-label">Description</label>
                    <textarea
                      className="admin-textarea"
                      value={draft.contact.description}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          contact: { ...d.contact, description: e.target.value },
                        }))
                      }
                    />
                  </div>

                  {draft.contact.actions.map((action, idx) => (
                    <div key={action.id} className="admin-item-card">
                      <div className="admin-item-head">
                        <strong>{action.label}</strong>
                        <div className="admin-item-actions">
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={action.visible !== false}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  contact: {
                                    ...d.contact,
                                    actions: d.contact.actions.map((a, i) =>
                                      i === idx
                                        ? { ...a, visible: e.target.checked }
                                        : a
                                    ),
                                  },
                                }))
                              }
                            />
                            Visible
                          </label>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                contact: {
                                  ...d.contact,
                                  actions: moveItem(d.contact.actions, idx, -1),
                                },
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-icon"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                contact: {
                                  ...d.contact,
                                  actions: moveItem(d.contact.actions, idx, 1),
                                },
                              }))
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                contact: {
                                  ...d.contact,
                                  actions: d.contact.actions.filter(
                                    (_, i) => i !== idx
                                  ),
                                },
                              }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="admin-grid-3">
                        <input
                          className="admin-input"
                          value={action.label}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              contact: {
                                ...d.contact,
                                actions: d.contact.actions.map((a, i) =>
                                  i === idx ? { ...a, label: e.target.value } : a
                                ),
                              },
                            }))
                          }
                          placeholder="Button Text"
                        />
                        <input
                          className="admin-input"
                          value={action.href}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              contact: {
                                ...d.contact,
                                actions: d.contact.actions.map((a, i) =>
                                  i === idx ? { ...a, href: e.target.value } : a
                                ),
                              },
                            }))
                          }
                          placeholder="mailto:... or https://..."
                        />
                        <select
                          className="admin-select"
                          value={action.variant}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              contact: {
                                ...d.contact,
                                actions: d.contact.actions.map((a, i) =>
                                  i === idx
                                    ? { ...a, variant: e.target.value }
                                    : a
                                ),
                              },
                            }))
                          }
                        >
                          <option value="primary">Primary (Wine Button)</option>
                          <option value="secondary">Secondary (Glass Button)</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'media' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Cloudflare D1 Media Vault</h2>
                    <p>
                      Upload images, logos, videos (MP4/WebM), or PDFs up to 25 MB
                      each—stored free in Cloudflare D1 with zero credit card
                      required ({formatBytes(totalVaultBytes)} used of 500 MB).
                    </p>
                  </div>
                  <div>
                    <input
                      ref={vaultFileRef}
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf"
                      onChange={handleVaultUpload}
                      hidden
                    />
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-primary"
                      disabled={vaultUploading}
                      onClick={() => vaultFileRef.current?.click()}
                    >
                      {vaultUploading
                        ? `Uploading ${vaultProgress}%...`
                        : '+ Upload Files'}
                    </button>
                  </div>
                </div>

                {uploadedMedia.length === 0 ? (
                  <div className="admin-alert admin-alert-info">
                    No files uploaded to D1 yet. Upload new images, logos, videos,
                    or PDFs here—or browse your existing repository assets below.
                  </div>
                ) : (
                  <div className="admin-vault-grid" style={{ marginBottom: 26 }}>
                    {uploadedMedia.map((file) => (
                      <div key={file.id} className="admin-vault-card">
                        <div className="admin-vault-preview">
                          {file.mimeType?.startsWith('video/') ? (
                            <video src={file.url} controls muted playsInline />
                          ) : file.mimeType === 'application/pdf' ? (
                            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                              PDF DOCUMENT
                            </span>
                          ) : (
                            <img src={file.url} alt={file.filename} />
                          )}
                        </div>
                        <div className="admin-vault-meta">
                          <strong title={file.filename}>{file.filename}</strong>
                          <span>
                            {formatBytes(file.byteSize)} • {file.mimeType}
                          </span>
                          <div className="admin-media-buttons">
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm"
                              onClick={() => {
                                navigator.clipboard?.writeText(file.url)
                                notify('Copied media URL.', 'info')
                              }}
                            >
                              Copy URL
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-danger"
                              onClick={() => handleDeleteMedia(file)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <h3 style={{ marginBottom: 14, fontSize: '1rem' }}>
                  Built-in Repository Assets ({REPO_MEDIA_ASSETS.length})
                </h3>
                <div className="admin-vault-grid">
                  {REPO_MEDIA_ASSETS.map((asset) => (
                    <div key={asset.id} className="admin-vault-card">
                      <div className="admin-vault-preview">
                        {asset.type === 'video' ? (
                          <video src={asset.src} controls muted playsInline />
                        ) : (
                          <img src={asset.src} alt={asset.label} />
                        )}
                      </div>
                      <div className="admin-vault-meta">
                        <strong title={asset.label}>{asset.label}</strong>
                        <span>{asset.src}</span>
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm"
                          onClick={() => {
                            navigator.clipboard?.writeText(asset.src)
                            notify('Copied asset path.', 'info')
                          }}
                        >
                          Copy Path
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <h2>Security & Hidden Password Vault</h2>
                    <p>
                      Your password is verified strictly at the Cloudflare edge
                      using a salted PBKDF2-SHA256 secret hash and signed{' '}
                      <code>HttpOnly; SameSite=Strict</code> cookies.
                    </p>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-item-card">
                    <strong>Active Hardening Status</strong>
                    <ul
                      style={{
                        paddingLeft: 18,
                        color: '#cfcfcf',
                        fontSize: '0.84rem',
                        lineHeight: 1.85,
                      }}
                    >
                      <li>
                        <strong>Encrypted Worker Secret:</strong> Password hash
                        lives exclusively inside Cloudflare Secrets (
                        <code>ADMIN_PASSWORD_HASH</code>), never in Git, JS
                        bundles, or D1.
                      </li>
                      <li>
                        <strong>Brute-Force Protection:</strong> D1 rate limiting
                        locks out an IP hash for 15 minutes after 5 failed attempts.
                      </li>
                      <li>
                        <strong>Stealth Admin Path:</strong>{' '}
                        {sessionState.customAdminPath
                          ? 'Custom secret ADMIN_PATH is active—/admin is invisible.'
                          : 'Using default unlisted /admin route (noindex, no links on public site). To hide the URL completely too, set an encrypted Cloudflare Worker Variable/Secret named ADMIN_PATH (e.g. /chomka-vault-9x4).'}
                      </li>
                    </ul>
                  </div>

                  <HashGeneratorWidget title="Rotate or Change Admin Password" />
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className={`admin-toast admin-alert-${toast.type === 'error' ? 'error' : toast.type === 'success' ? 'success' : 'info'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
