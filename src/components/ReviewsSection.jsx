import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatRemainingSeconds,
  formatReviewDate,
  getMyReviewSessions,
  getReviewerInitials,
} from '../data/reviewsMeta.js'
import { useMasonryGrid } from '../hooks/useMasonryGrid.js'
import { PlatformIcon } from './ProfilePlatformBadge.jsx'
import { StarDisplay } from './StarRating.jsx'

function ReviewAuthorAvatar({
  review,
  isPopoverOpen,
  onOpenPopover,
  onClosePopover,
  onTogglePopover,
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const profiles = Array.isArray(review.profiles) ? review.profiles : []
  const hasProfiles = profiles.length > 0
  const showImage = Boolean(
    review.avatarUrl && failedAvatarUrl !== review.avatarUrl
  )
  const initials = getReviewerInitials(review.reviewerName)

  const avatarVisual = showImage ? (
    <img
      src={review.avatarUrl}
      alt={review.reviewerName}
      className="review-author-avatar-img"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedAvatarUrl(review.avatarUrl)}
    />
  ) : (
    <span className="review-author-avatar-initials" aria-hidden="true">
      {initials}
    </span>
  )

  if (!hasProfiles) {
    return (
      <div className="review-author-avatar" aria-hidden="true">
        {avatarVisual}
      </div>
    )
  }

  return (
    <div
      className={`review-avatar-popover-wrap${isPopoverOpen ? ' is-open' : ''}`}
      onMouseEnter={onOpenPopover}
      onMouseLeave={onClosePopover}
    >
      <button
        type="button"
        className="review-author-avatar review-author-avatar-interactive"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePopover()
        }}
        onFocus={onOpenPopover}
        aria-expanded={isPopoverOpen}
        aria-haspopup="true"
        aria-label={`View ${review.reviewerName}'s tagged ${profiles.length === 1 ? 'profile' : 'profiles'}`}
        title={`Hover or tap to view ${review.reviewerName}'s tagged ${profiles.length === 1 ? 'profile' : 'profiles'}`}
      >
        {avatarVisual}
        <span className="review-avatar-link-badge" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M6.7 9.3L9.3 6.7M5.5 7.5L4.4 8.6C3.5 9.5 3.5 10.9 4.4 11.8C5.3 12.7 6.7 12.7 7.6 11.8L8.7 10.7M10.5 8.5L11.6 7.4C12.5 6.5 12.5 5.1 11.6 4.2C10.7 3.3 9.3 3.3 8.4 4.2L7.3 5.3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      <div
        className="review-avatar-popover"
        role="region"
        aria-label={`${review.reviewerName}'s tagged profiles`}
      >
        <div className="review-popover-head">
          <span className="review-popover-title">
            Tagged {profiles.length === 1 ? 'Profile' : 'Profiles'}
          </span>
          <span className="review-popover-sub">{review.reviewerName}</span>
        </div>

        <div className="review-popover-links">
          {profiles.map((profile, idx) => (
            <a
              key={`${review.id}-pop-${idx}`}
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className={`review-popover-link platform-${profile.platform || 'website'}`}
              title={profile.url}
            >
              <PlatformIcon platform={profile.platform} />
              <span className="review-popover-link-meta">
                <strong className="review-popover-platform">
                  {profile.label || 'Profile'}
                </strong>
                <span className="review-popover-handle">
                  {profile.handle || profile.display || profile.url}
                </span>
              </span>
              <span className="review-popover-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ReviewsSection({
  sectionConfig,
  projects = [],
  reviews = [],
  summary,
  activeFilter = 'all',
  onChangeFilter,
  onOpenWriteReview,
  onEditReview,
  onDeleteReview,
  deletingReviewId = null,
  actionFeedback = null,
  onDismissFeedback,
  loading = false,
}) {
  const [sortBy, setSortBy] = useState('featured')
  const [ratingFilter, setRatingFilter] = useState(null)
  const [openPopoverId, setOpenPopoverId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [clientNow, setClientNow] = useState(null)
  const gridRef = useRef(null)

  // Sync client clock asynchronously after hydration so SSR and initial render always match
  useEffect(() => {
    const id = window.setTimeout(() => {
      setClientNow(Date.now())
    }, 0)
    return () => window.clearTimeout(id)
  }, [reviews])

  const manageableById = useMemo(() => {
    if (clientNow === null) return {}
    const localSessions = getMyReviewSessions()
    const map = {}

    for (const review of reviews) {
      if (!review?.id) continue
      const local = localSessions[review.id]
      const localExpiresMs = local?.expiresAt ? Date.parse(local.expiresAt) : 0
      const serverExpiresMs =
        review.canManage && review.editExpiresAt
          ? Date.parse(review.editExpiresAt)
          : 0
      const bestExpiresMs = Math.max(
        Number.isFinite(localExpiresMs) ? localExpiresMs : 0,
        Number.isFinite(serverExpiresMs) ? serverExpiresMs : 0
      )
      const remainingSec = Math.ceil((bestExpiresMs - clientNow) / 1000)
      if (remainingSec > 0) {
        map[review.id] = {
          editToken: local?.editToken || '',
          expiresMs: bestExpiresMs,
          remainingSec,
        }
      }
    }
    return map
  }, [reviews, clientNow])

  const hasActiveEditWindow = Object.keys(manageableById).length > 0

  useEffect(() => {
    if (!hasActiveEditWindow) return undefined
    const timer = window.setInterval(() => {
      setClientNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasActiveEditWindow])

  // Close touch/click-opened popover on outside click or Escape
  useEffect(() => {
    if (!openPopoverId) return undefined
    const handleOutsideClick = (event) => {
      if (!event.target.closest('.review-avatar-popover-wrap')) {
        setOpenPopoverId(null)
      }
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenPopoverId(null)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openPopoverId])

  const totalCount = Number(summary?.totalCount || 0)
  const averageRating = Number(summary?.averageRating || 0)
  const verifiedCount = Number(summary?.verifiedCount || 0)
  const distribution = summary?.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  const byTarget = summary?.byTarget || {}

  const filteredReviews = useMemo(() => {
    const base = reviews.filter((review) => {
      if (activeFilter === 'overall') {
        if (review.targetType !== 'overall' && review.targetId !== 'overall') {
          return false
        }
      } else if (activeFilter !== 'all') {
        if (review.targetId !== activeFilter) {
          return false
        }
      }

      if (ratingFilter !== null && Number(review.rating) !== ratingFilter) {
        return false
      }
      return true
    })

    const sorted = [...base]
    sorted.sort((a, b) => {
      if (sortBy === 'featured') {
        if (Boolean(a.featured) !== Boolean(b.featured)) {
          return a.featured ? -1 : 1
        }
      } else if (sortBy === 'highest') {
        if (Number(a.rating) !== Number(b.rating)) {
          return Number(b.rating) - Number(a.rating)
        }
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return sorted
  }, [reviews, activeFilter, ratingFilter, sortBy])

  useMasonryGrid({
    gridRef,
    cardSelector: ':scope > .review-card',
    gapCssVar: '--reviews-gap',
    defaultGap: 18,
    items: filteredReviews,
  })

  const activeFilterProject =
    activeFilter !== 'all' && activeFilter !== 'overall'
      ? projects.find((p) => p.id === activeFilter) || null
      : null

  const writeTarget = activeFilterProject ? activeFilterProject.id : 'overall'

  return (
    <section
      id="reviews"
      className="section reviews-section"
      aria-labelledby="reviews-heading"
    >
      <p className="section-label">
        {sectionConfig?.label || '07 — REVIEWS'}
      </p>
      <h2 id="reviews-heading">
        {sectionConfig?.heading || 'Words from collaborators.'}
      </h2>

      {sectionConfig?.intro && (
        <p className="reviews-section-intro">{sectionConfig.intro}</p>
      )}

      <div className="reviews-overview-card">
        <div className="reviews-score-block">
          <div className="reviews-score-number-row">
            <span className="reviews-score-big">
              {totalCount > 0 ? averageRating.toFixed(1) : '—'}
            </span>
            <span className="reviews-score-denom">/ 5.0</span>
          </div>

          <StarDisplay
            rating={averageRating}
            size="lg"
            label={
              totalCount > 0
                ? `Average rating ${averageRating.toFixed(1)} out of 5 across ${totalCount} reviews`
                : 'No ratings submitted yet'
            }
          />

          <p className="reviews-score-meta">
            {totalCount > 0 ? (
              <>
                Based on <strong>{totalCount}</strong>{' '}
                {totalCount === 1 ? 'review' : 'reviews'}
                {verifiedCount > 0 && ` · ${verifiedCount} verified`}
              </>
            ) : (
              'Open for collaborator, client & user feedback'
            )}
          </p>
        </div>

        <div className="reviews-distribution" aria-label="Rating distribution">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = Number(distribution[star] || 0)
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
            const isSelected = ratingFilter === star
            return (
              <button
                key={star}
                type="button"
                className={`reviews-dist-row${isSelected ? ' is-selected' : ''}`}
                disabled={count === 0 && !isSelected}
                onClick={() =>
                  setRatingFilter((prev) => (prev === star ? null : star))
                }
                aria-pressed={isSelected}
                aria-label={`Filter by ${star} star reviews (${count})`}
              >
                <span className="reviews-dist-label">{star} ★</span>
                <span className="reviews-dist-bar">
                  <span
                    className="reviews-dist-fill"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="reviews-dist-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="reviews-cta-block">
          <button
            type="button"
            className="primary-button reviews-write-btn"
            onClick={(e) => onOpenWriteReview(writeTarget, e.currentTarget)}
          >
            <span>★ Write a Review</span>
          </button>
          <p className="reviews-cta-hint">
            No login required. Attach a photo or tag your real profiles — hover
            any reviewer&apos;s picture to view their tagged pages.
          </p>
        </div>
      </div>

      <div className="reviews-toolbar">
        <div
          className="reviews-filter-pills"
          role="tablist"
          aria-label="Filter reviews by scope"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'all'}
            className={`reviews-filter-pill${activeFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => onChangeFilter('all')}
          >
            <span>All</span>
            <span className="reviews-pill-count">{totalCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'overall'}
            className={`reviews-filter-pill${activeFilter === 'overall' ? ' is-active' : ''}`}
            onClick={() => onChangeFilter('overall')}
          >
            <span>Overall · Samuel</span>
            <span className="reviews-pill-count">
              {byTarget.overall?.count || 0}
            </span>
          </button>

          {projects.map((project) => {
            const stats = byTarget[project.id]
            return (
              <button
                key={project.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === project.id}
                className={`reviews-filter-pill${activeFilter === project.id ? ' is-active' : ''}`}
                onClick={() => onChangeFilter(project.id)}
              >
                <span>{project.title}</span>
                {stats?.count > 0 ? (
                  <span className="reviews-pill-count">
                    ★ {stats.average.toFixed(1)} · {stats.count}
                  </span>
                ) : (
                  <span className="reviews-pill-count">0</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="reviews-sort-controls">
          {ratingFilter !== null && (
            <button
              type="button"
              className="reviews-clear-star-chip"
              onClick={() => setRatingFilter(null)}
            >
              <span>{ratingFilter}★ only</span>
              <span aria-hidden="true">✕</span>
            </button>
          )}

          <label htmlFor="reviews-sort-select" className="sr-only">
            Sort reviews
          </label>
          <select
            id="reviews-sort-select"
            className="reviews-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="featured">Featured &amp; Newest</option>
            <option value="newest">Newest First</option>
            <option value="highest">Highest Rated</option>
          </select>
        </div>
      </div>

      {actionFeedback?.text && (
        <div
          className={`reviews-action-feedback${actionFeedback.type === 'error' ? ' is-error' : ' is-success'}`}
          role={actionFeedback.type === 'error' ? 'alert' : 'status'}
        >
          <span>{actionFeedback.text}</span>
          {onDismissFeedback && (
            <button
              type="button"
              className="reviews-action-feedback-close"
              onClick={onDismissFeedback}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="reviews-empty-card">
          <p className="reviews-empty-title">Loading reviews...</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="reviews-empty-card">
          <div className="reviews-empty-stars" aria-hidden="true">
            ★★★★★
          </div>
          <h3>
            {totalCount === 0
              ? 'Be the first to leave a review'
              : activeFilterProject
                ? `No reviews for ${activeFilterProject.title} yet`
                : 'No reviews match this filter'}
          </h3>
          <p>
            {totalCount === 0
              ? 'Worked with Samuel, attended his AWS cloud training, or used one of his products? Leave a 5-star review and tag your real profile page so visitors can connect with who you are.'
              : 'Share your experience or clear the active filter to browse other reviews.'}
          </p>
          <div className="reviews-empty-actions">
            <button
              type="button"
              className="primary-button"
              onClick={(e) => onOpenWriteReview(writeTarget, e.currentTarget)}
            >
              {activeFilterProject
                ? `Review ${activeFilterProject.title} ★`
                : 'Write a Review ★'}
            </button>
            {(activeFilter !== 'all' || ratingFilter !== null) && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  onChangeFilter('all')
                  setRatingFilter(null)
                }}
              >
                Show All Reviews
              </button>
            )}
          </div>
        </div>
      ) : (
        <div ref={gridRef} className="reviews-grid">
          {filteredReviews.map((review) => {
            const isOverall =
              review.targetType === 'overall' || review.targetId === 'overall'
            const paragraphs = String(review.comment || '')
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
            const manageInfo = manageableById[review.id] || null
            const isPopoverOpen = openPopoverId === review.id
            const isConfirmingDelete = confirmDeleteId === review.id
            const isDeleting = deletingReviewId === review.id

            return (
              <article
                key={review.id}
                className={`review-card${review.featured ? ' is-featured' : ''}${isPopoverOpen ? ' is-popover-open' : ''}`}
              >
                <div className="review-card-top">
                  <div className="review-card-badges">
                    <button
                      type="button"
                      className={`review-scope-badge${isOverall ? ' is-overall' : ' is-project'}`}
                      onClick={() =>
                        onChangeFilter(isOverall ? 'overall' : review.targetId)
                      }
                      title={`Filter reviews for ${review.targetTitle}`}
                    >
                      {isOverall ? 'Overall · Samuel' : `Project · ${review.targetTitle}`}
                    </button>

                    {review.verified && (
                      <span className="review-verified-badge">
                        <span aria-hidden="true">✓</span>
                        <span>{review.verifiedLabel || 'Verified'}</span>
                      </span>
                    )}

                    {review.featured && (
                      <span className="review-featured-badge">★ Featured</span>
                    )}
                  </div>

                  <div className="review-card-rating-meta">
                    <StarDisplay rating={review.rating} size="sm" />
                    <time
                      dateTime={review.createdAt}
                      className="review-card-date"
                    >
                      {formatReviewDate(review.createdAt)}
                    </time>
                  </div>
                </div>

                <blockquote className="review-card-quote">
                  {paragraphs.map((para, pIdx) => (
                    <p key={pIdx}>{para}</p>
                  ))}
                </blockquote>

                <div className="review-card-author-block">
                  <div className="review-author-row">
                    <ReviewAuthorAvatar
                      review={review}
                      isPopoverOpen={isPopoverOpen}
                      onOpenPopover={() => setOpenPopoverId(review.id)}
                      onClosePopover={() =>
                        setOpenPopoverId((prev) =>
                          prev === review.id ? null : prev
                        )
                      }
                      onTogglePopover={() =>
                        setOpenPopoverId((prev) =>
                          prev === review.id ? null : review.id
                        )
                      }
                    />

                    <div className="review-author-meta">
                      <div className="review-author-name-line">
                        <strong>{review.reviewerName}</strong>
                        {review.relationship && (
                          <span className="review-relationship-tag">
                            {review.relationship}
                          </span>
                        )}
                      </div>
                      {review.reviewerRole && (
                        <p className="review-author-role">
                          {review.reviewerRole}
                        </p>
                      )}
                    </div>
                  </div>

                  {manageInfo && (
                    <div className="review-client-manage-bar">
                      <span className="review-countdown-pill">
                        <span className="countdown-pulse" aria-hidden="true" />
                        <span>
                          Editable for{' '}
                          <strong>
                            {formatRemainingSeconds(manageInfo.remainingSec)}
                          </strong>
                        </span>
                      </span>

                      {isConfirmingDelete ? (
                        <div className="review-delete-confirm">
                          <span className="review-delete-confirm-label">
                            Delete?
                          </span>
                          <button
                            type="button"
                            className="review-client-btn review-btn-delete-confirm"
                            disabled={isDeleting}
                            onClick={async () => {
                              await onDeleteReview?.(
                                review,
                                manageInfo.editToken
                              )
                              setConfirmDeleteId(null)
                            }}
                          >
                            {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                          <button
                            type="button"
                            className="review-client-btn review-btn-cancel"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="review-client-btns">
                          <button
                            type="button"
                            className="review-client-btn review-btn-edit"
                            onClick={(e) =>
                              onEditReview?.(
                                review,
                                manageInfo.editToken,
                                e.currentTarget
                              )
                            }
                            disabled={isDeleting}
                          >
                            ✎ Edit
                          </button>
                          <button
                            type="button"
                            className="review-client-btn review-btn-delete"
                            onClick={() => setConfirmDeleteId(review.id)}
                            disabled={isDeleting}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {review.ownerReply && (
                  <div className="review-owner-reply">
                    <div className="review-owner-reply-head">
                      <span>Reply from Samuel John-Ibro</span>
                      {review.ownerReplyAt && (
                        <time dateTime={review.ownerReplyAt}>
                          {formatReviewDate(review.ownerReplyAt)}
                        </time>
                      )}
                    </div>
                    <p>{review.ownerReply}</p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
