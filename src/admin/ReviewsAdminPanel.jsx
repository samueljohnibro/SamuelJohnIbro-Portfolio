import { useState } from 'react'
import { formatReviewDate } from '../data/reviewsMeta.js'

function broadcastReviewsUpdated() {
  if (typeof BroadcastChannel === 'undefined') return
  const ch = new BroadcastChannel('sji-portfolio-updates')
  ch.postMessage({ type: 'reviews-updated' })
  ch.close()
}

export function ReviewsAdminPanel({
  draft,
  setDraft,
  reviewsState,
  onReloadReviews,
  notify,
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyId, setBusyId] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [inviteLabel, setInviteLabel] = useState('Verified Collaborator')
  const [inviteTarget, setInviteTarget] = useState('')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState({})
  const [openReplyId, setOpenReplyId] = useState('')

  const reviews = reviewsState?.reviews || []
  const counts = reviewsState?.counts || {
    total: 0,
    approved: 0,
    pending: 0,
    hidden: 0,
  }
  const summary = reviewsState?.summary || { averageRating: 0, totalCount: 0 }
  const settings = reviewsState?.settings || {
    moderationMode: 'auto',
    publicSubmissionsEnabled: true,
  }
  const invites = reviewsState?.invites || []

  const reviewsSection = draft.reviewsSection || {
    visible: true,
    label: '07 — REVIEWS',
    heading: 'Words from collaborators.',
    intro: '',
    showProjectBadges: true,
  }

  const updateSection = (patch) => {
    setDraft((d) => ({
      ...d,
      reviewsSection: {
        ...d.reviewsSection,
        ...patch,
      },
    }))
  }

  const filteredReviews = reviews.filter((item) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'verified') return Boolean(item.verified)
    return item.status === statusFilter
  })

  const handleSavePolicy = async (nextSettings) => {
    setSettingsBusy(true)
    try {
      const res = await fetch('/api/admin/reviews/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Could not update review settings.')
      }
      await onReloadReviews()
      broadcastReviewsUpdated()
      notify('Updated live review policy.', 'success')
    } catch (error) {
      notify(error.message || 'Settings update failed.', 'error')
    } finally {
      setSettingsBusy(false)
    }
  }

  const handleCreateInvite = async (event) => {
    event.preventDefault()
    setInviteBusy(true)
    try {
      const targetType =
        inviteTarget === 'overall'
          ? 'overall'
          : inviteTarget
            ? 'project'
            : ''
      const res = await fetch('/api/admin/reviews/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: inviteLabel.trim() || 'Verified Collaborator',
          targetType,
          targetId: inviteTarget,
          maxUses: Number(inviteMaxUses),
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Could not create invite link.')
      }
      await onReloadReviews()
      if (payload?.invite?.code && typeof navigator !== 'undefined' && navigator.clipboard) {
        const shareUrl = `${window.location.origin}/?invite=${payload.invite.code}#reviews`
        navigator.clipboard.writeText(shareUrl).catch(() => {})
        notify('Invite link created & copied to clipboard.', 'success')
      } else {
        notify('Verified invite link created.', 'success')
      }
    } catch (error) {
      notify(error.message || 'Could not generate invite.', 'error')
    } finally {
      setInviteBusy(false)
    }
  }

  const handleDeleteInvite = async (invite) => {
    if (!window.confirm(`Revoke invite code "${invite.code}"?`)) return
    setBusyId(invite.id)
    try {
      const res = await fetch(
        `/api/admin/reviews/invites/${encodeURIComponent(invite.id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Could not revoke invite.')
      await onReloadReviews()
      notify(`Revoked invite "${invite.code}".`, 'info')
    } catch (error) {
      notify(error.message || 'Delete failed.', 'error')
    } finally {
      setBusyId('')
    }
  }

  const handlePatchReview = async (reviewId, patch, successMsg) => {
    setBusyId(reviewId)
    try {
      const res = await fetch(
        `/api/admin/reviews/${encodeURIComponent(reviewId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      )
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Could not update review.')
      }
      await onReloadReviews()
      broadcastReviewsUpdated()
      notify(successMsg || 'Review updated.', 'success')
    } catch (error) {
      notify(error.message || 'Update failed.', 'error')
    } finally {
      setBusyId('')
    }
  }

  const handleDeleteReview = async (review) => {
    if (
      !window.confirm(
        `Permanently delete the review from "${review.reviewerName}"?`
      )
    ) {
      return
    }
    setBusyId(review.id)
    try {
      const res = await fetch(
        `/api/admin/reviews/${encodeURIComponent(review.id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Delete failed.')
      await onReloadReviews()
      broadcastReviewsUpdated()
      notify(`Deleted review by ${review.reviewerName}.`, 'info')
    } catch (error) {
      notify(error.message || 'Could not delete review.', 'error')
    } finally {
      setBusyId('')
    }
  }

  const copyInviteUrl = async (invite) => {
    const shareUrl = `${window.location.origin}/?invite=${invite.code}#reviews`
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify('Copied collaborator invite link.', 'success')
    } catch {
      notify(shareUrl, 'info')
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h2>Reviews, Ratings &amp; Collaborator Invites</h2>
          <p>
            Manage section layout, moderate public reviews, generate verified
            one-click invite links (no login required), and reply as Samuel
            John-Ibro.
          </p>
        </div>

        <label className="admin-switch-row">
          <input
            type="checkbox"
            checked={reviewsSection.visible !== false}
            onChange={(e) => updateSection({ visible: e.target.checked })}
          />
          Section Visible
        </label>
      </div>

      <div className="admin-stack">
        <div className="admin-item-card">
          <div className="admin-item-head">
            <strong>Section Presentation (Click Publish Live to save)</strong>
            <span className="admin-item-index">
              Live Avg: {summary.totalCount > 0 ? `${summary.averageRating.toFixed(1)} ★` : '—'} ({counts.approved} published)
            </span>
          </div>

          <div className="admin-grid-2">
            <div className="admin-field">
              <label className="admin-field-label">Section Label</label>
              <input
                className="admin-input"
                value={reviewsSection.label}
                onChange={(e) => updateSection({ label: e.target.value })}
              />
            </div>

            <div className="admin-field">
              <label className="admin-field-label">Section Heading</label>
              <input
                className="admin-input"
                value={reviewsSection.heading}
                onChange={(e) => updateSection({ heading: e.target.value })}
              />
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-field-label">Section Intro</label>
            <textarea
              className="admin-textarea"
              value={reviewsSection.intro}
              onChange={(e) => updateSection({ intro: e.target.value })}
            />
          </div>

          <label className="admin-switch-row">
            <input
              type="checkbox"
              checked={reviewsSection.showProjectBadges !== false}
              onChange={(e) =>
                updateSection({ showProjectBadges: e.target.checked })
              }
            />
            Show star rating &amp; quick review buttons on Project cards
          </label>
        </div>

        <div className="admin-item-card">
          <div className="admin-item-head">
            <strong>Live Moderation &amp; Anti-Spam Policy (Instant D1)</strong>
          </div>

          <div className="admin-grid-2">
            <div className="admin-field">
              <span className="admin-field-label">Public Review Mode</span>
              <div className="admin-media-buttons">
                <button
                  type="button"
                  disabled={settingsBusy}
                  className={`admin-btn admin-btn-sm${settings.moderationMode === 'auto' ? ' admin-btn-gold' : ''}`}
                  onClick={() =>
                    handleSavePolicy({
                      ...settings,
                      moderationMode: 'auto',
                    })
                  }
                >
                  Auto-Publish Immediately
                </button>
                <button
                  type="button"
                  disabled={settingsBusy}
                  className={`admin-btn admin-btn-sm${settings.moderationMode === 'manual' ? ' admin-btn-gold' : ''}`}
                  onClick={() =>
                    handleSavePolicy({
                      ...settings,
                      moderationMode: 'manual',
                    })
                  }
                >
                  Hold for Approval ({counts.pending} pending)
                </button>
              </div>
            </div>

            <div className="admin-field">
              <span className="admin-field-label">Who Can Submit</span>
              <div className="admin-media-buttons">
                <button
                  type="button"
                  disabled={settingsBusy}
                  className={`admin-btn admin-btn-sm${settings.publicSubmissionsEnabled ? ' admin-btn-gold' : ''}`}
                  onClick={() =>
                    handleSavePolicy({
                      ...settings,
                      publicSubmissionsEnabled: true,
                    })
                  }
                >
                  Open Public + Invite Links
                </button>
                <button
                  type="button"
                  disabled={settingsBusy}
                  className={`admin-btn admin-btn-sm${!settings.publicSubmissionsEnabled ? ' admin-btn-gold' : ''}`}
                  onClick={() =>
                    handleSavePolicy({
                      ...settings,
                      publicSubmissionsEnabled: false,
                    })
                  }
                >
                  Invite Links Only
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-item-card">
          <div className="admin-item-head">
            <strong>Verified Collaborator Invite Links</strong>
            <span className="admin-item-index">
              Zero login · Auto-badges review as Verified
            </span>
          </div>
          <p className="admin-field-hint">
            Generate a private short link for someone you worked with. When they
            open it, they type their review and tag their real LinkedIn/GitHub/site
            with zero login, and their review receives your Verified badge
            automatically.
          </p>

          <form className="admin-stack" onSubmit={handleCreateInvite}>
            <div className="admin-grid-3">
              <div className="admin-field">
                <label className="admin-field-label">Verified Badge Label</label>
                <input
                  className="admin-input"
                  value={inviteLabel}
                  onChange={(e) => setInviteLabel(e.target.value)}
                  placeholder="Verified Collaborator"
                />
              </div>

              <div className="admin-field">
                <label className="admin-field-label">Suggested Target</label>
                <select
                  className="admin-select"
                  value={inviteTarget}
                  onChange={(e) => setInviteTarget(e.target.value)}
                >
                  <option value="">Reviewer chooses</option>
                  <option value="overall">Samuel John-Ibro (Overall)</option>
                  {(draft.projects || []).map((project) => (
                    <option key={project.id} value={project.id}>
                      Project: {project.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-field">
                <label className="admin-field-label">Max Uses</label>
                <select
                  className="admin-select"
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                >
                  <option value={1}>1 use (Single person)</option>
                  <option value={5}>5 uses (Small team)</option>
                  <option value={25}>25 uses (Group / cohort)</option>
                  <option value={0}>Unlimited until revoked</option>
                </select>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="admin-btn admin-btn-sm admin-btn-primary"
                disabled={inviteBusy}
              >
                {inviteBusy ? 'Generating...' : '+ Create & Copy Invite Link'}
              </button>
            </div>
          </form>

          {invites.length > 0 && (
            <div className="admin-stack" style={{ marginTop: 10 }}>
              {invites.map((inv) => {
                const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/?invite=${inv.code}#reviews`
                return (
                  <div key={inv.id} className="admin-invite-row">
                    <div className="admin-invite-meta">
                      <strong>
                        {inv.code} · {inv.label}
                      </strong>
                      <span>
                        {inv.active ? 'Active' : inv.exhausted ? 'Used up' : 'Inactive'}{' '}
                        • {inv.useCount}
                        {inv.maxUses > 0 ? ` / ${inv.maxUses}` : ''} used
                        {inv.targetId ? ` • Target: ${inv.targetId}` : ''}
                      </span>
                      <code className="admin-invite-url">{shareUrl}</code>
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-gold"
                        onClick={() => copyInviteUrl(inv)}
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-danger"
                        disabled={busyId === inv.id}
                        onClick={() => handleDeleteInvite(inv)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="admin-item-card">
          <div className="admin-item-head">
            <strong>Submitted Reviews ({counts.total})</strong>
            <div className="admin-media-buttons">
              {[
                { id: 'all', label: `All (${counts.total})` },
                { id: 'approved', label: `Published (${counts.approved})` },
                { id: 'pending', label: `Pending (${counts.pending})` },
                { id: 'hidden', label: `Hidden (${counts.hidden})` },
                { id: 'verified', label: 'Verified' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`admin-btn admin-btn-sm${statusFilter === tab.id ? ' admin-btn-gold' : ''}`}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredReviews.length === 0 ? (
            <div className="admin-alert admin-alert-info">
              No reviews in this view yet. Share your portfolio or an invite link
              above to start collecting authentic collaborator reviews.
            </div>
          ) : (
            <div className="admin-stack">
              {filteredReviews.map((review) => {
                const isReplying = openReplyId === review.id
                const replyValue =
                  replyDrafts[review.id] !== undefined
                    ? replyDrafts[review.id]
                    : review.ownerReply || ''

                return (
                  <div key={review.id} className="admin-review-item">
                    <div className="admin-item-head">
                      <div className="admin-review-head-meta">
                        <strong>{review.reviewerName}</strong>
                        <span className="admin-item-index">
                          {'★'.repeat(review.rating)}
                          {'☆'.repeat(5 - review.rating)} ({review.rating}/5)
                        </span>
                        <span className="admin-chip">
                          {review.targetTitle}
                        </span>
                        <span
                          className={`admin-chip admin-status-${review.status}`}
                        >
                          {review.status}
                        </span>
                        {review.verified && (
                          <span className="admin-chip">
                            ✓ {review.verifiedLabel || 'Verified'}
                          </span>
                        )}
                        {review.featured && (
                          <span className="admin-chip">★ Featured</span>
                        )}
                      </div>

                      <span className="admin-field-hint">
                        {formatReviewDate(review.createdAt)}
                      </span>
                    </div>

                    {(review.reviewerRole || review.relationship) && (
                      <p className="admin-field-hint">
                        {[review.reviewerRole, review.relationship]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                    <p className="admin-review-comment">{review.comment}</p>

                    {review.profiles?.length > 0 && (
                      <div className="admin-chip-list">
                        {review.profiles.map((prof, idx) => (
                          <a
                            key={`${review.id}-p-${idx}`}
                            href={prof.url}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-chip"
                          >
                            {prof.display || prof.url} ↗
                          </a>
                        ))}
                      </div>
                    )}

                    {review.ownerReply && !isReplying && (
                      <div className="admin-alert admin-alert-info">
                        <strong>Your reply:</strong> {review.ownerReply}
                      </div>
                    )}

                    {isReplying && (
                      <div className="admin-stack">
                        <textarea
                          className="admin-textarea"
                          placeholder="Write an official reply from Samuel John-Ibro (leave empty and save to clear)..."
                          value={replyValue}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [review.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="admin-media-buttons">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            disabled={busyId === review.id}
                            onClick={async () => {
                              await handlePatchReview(
                                review.id,
                                { ownerReply: replyValue },
                                replyValue.trim()
                                  ? 'Saved author reply.'
                                  : 'Cleared author reply.'
                              )
                              setOpenReplyId('')
                            }}
                          >
                            Save Reply
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm"
                            onClick={() => setOpenReplyId('')}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="admin-media-buttons">
                      {review.status !== 'approved' && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-primary"
                          disabled={busyId === review.id}
                          onClick={() =>
                            handlePatchReview(
                              review.id,
                              { status: 'approved' },
                              'Review published live.'
                            )
                          }
                        >
                          Approve &amp; Publish
                        </button>
                      )}
                      {review.status === 'approved' && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm"
                          disabled={busyId === review.id}
                          onClick={() =>
                            handlePatchReview(
                              review.id,
                              { status: 'hidden' },
                              'Review hidden from public site.'
                            )
                          }
                        >
                          Hide
                        </button>
                      )}
                      <button
                        type="button"
                        className={`admin-btn admin-btn-sm${review.verified ? ' admin-btn-gold' : ''}`}
                        disabled={busyId === review.id}
                        onClick={() =>
                          handlePatchReview(
                            review.id,
                            {
                              verified: !review.verified,
                              verifiedLabel: !review.verified
                                ? review.verifiedLabel || 'Verified Collaborator'
                                : '',
                            },
                            !review.verified
                              ? 'Marked review as Verified.'
                              : 'Removed Verified badge.'
                          )
                        }
                      >
                        {review.verified ? 'Verified ✓' : 'Mark Verified'}
                      </button>
                      <button
                        type="button"
                        className={`admin-btn admin-btn-sm${review.featured ? ' admin-btn-gold' : ''}`}
                        disabled={busyId === review.id}
                        onClick={() =>
                          handlePatchReview(
                            review.id,
                            { featured: !review.featured },
                            !review.featured
                              ? 'Pinned review as Featured.'
                              : 'Unpinned review.'
                          )
                        }
                      >
                        {review.featured ? 'Featured ★' : 'Pin Featured'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm"
                        onClick={() =>
                          setOpenReplyId((prev) =>
                            prev === review.id ? '' : review.id
                          )
                        }
                      >
                        {review.ownerReply ? 'Edit Reply' : 'Reply'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-danger"
                        disabled={busyId === review.id}
                        onClick={() => handleDeleteReview(review)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
