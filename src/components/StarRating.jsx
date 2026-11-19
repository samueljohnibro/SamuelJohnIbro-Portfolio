import { useId, useState } from 'react'
import { RATING_LABELS } from '../data/reviewsMeta.js'

function StarIcon({ fillPercent = 100, className = '' }) {
  const clipId = useId()
  const clamped = Math.max(0, Math.min(100, fillPercent))

  return (
    <svg
      viewBox="0 0 24 24"
      className={`review-star-svg ${className}`.trim()}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={(24 * clamped) / 100} height="24" />
        </clipPath>
      </defs>
      <path
        d="M12 2.4l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.3l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.4z"
        className="review-star-track"
      />
      {clamped > 0 && (
        <path
          d="M12 2.4l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.3l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.4z"
          className="review-star-fill"
          clipPath={`url(#${clipId})`}
        />
      )}
    </svg>
  )
}

export function StarDisplay({
  rating = 0,
  size = 'md',
  showValue = false,
  label,
}) {
  const numeric = Math.max(0, Math.min(5, Number(rating) || 0))
  const accessibleText =
    label || `${numeric.toFixed(numeric % 1 === 0 ? 0 : 1)} out of 5 stars`

  return (
    <span
      className={`review-stars review-stars-${size}`}
      role="img"
      aria-label={accessibleText}
    >
      <span className="review-stars-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const rawFill = (numeric - (starIndex - 1)) * 100
          const fillPercent = Math.max(0, Math.min(100, rawFill))
          return <StarIcon key={starIndex} fillPercent={fillPercent} />
        })}
      </span>
      {showValue && (
        <span className="review-stars-value">{numeric.toFixed(1)}</span>
      )}
    </span>
  )
}

export function StarSelector({ value = 5, onChange, disabled = false }) {
  const [hovered, setHovered] = useState(0)
  const displayValue = hovered || value || 0

  const handleKeyDown = (event, starValue) => {
    if (disabled) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(Math.min(5, starValue + 1))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(Math.max(1, starValue - 1))
    }
  }

  return (
    <div className="review-star-picker">
      <div
        className="review-star-picker-buttons"
        role="radiogroup"
        aria-label="5-star rating"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((starValue) => {
          const active = starValue <= displayValue
          const isChecked = starValue === value
          return (
            <button
              key={starValue}
              type="button"
              role="radio"
              aria-checked={isChecked}
              aria-label={`${starValue} ${starValue === 1 ? 'star' : 'stars'} — ${RATING_LABELS[starValue]}`}
              disabled={disabled}
              className={`review-star-btn${active ? ' is-active' : ''}`}
              onMouseEnter={() => !disabled && setHovered(starValue)}
              onFocus={() => !disabled && setHovered(starValue)}
              onBlur={() => setHovered(0)}
              onClick={() => !disabled && onChange(starValue)}
              onKeyDown={(e) => handleKeyDown(e, starValue)}
            >
              <StarIcon fillPercent={active ? 100 : 0} />
            </button>
          )
        })}
      </div>

      <span className="review-star-caption">
        {displayValue > 0
          ? `${displayValue} / 5 — ${RATING_LABELS[displayValue] || ''}`
          : 'Select rating'}
      </span>
    </div>
  )
}
