export function PlatformIcon({ platform = 'website' }) {
  switch (platform) {
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="currentColor"
            d="M6.94 8.5H3.56V19.5H6.94V8.5ZM5.25 3.5C4.14 3.5 3.25 4.39 3.25 5.5C3.25 6.6 4.14 7.5 5.25 7.5C6.35 7.5 7.25 6.6 7.25 5.5C7.25 4.39 6.35 3.5 5.25 3.5ZM20.44 13.02C20.44 9.88 18.76 8.22 16.16 8.22C14.37 8.22 13.48 9.2 13.02 9.93V8.5H9.65C9.7 9.48 9.65 19.5 9.65 19.5H13.02V13.36C13.02 13.02 13.05 12.69 13.15 12.45C13.42 11.78 14.03 11.09 15.07 11.09C16.41 11.09 17.06 12.11 17.06 13.6V19.5H20.44V13.02Z"
          />
        </svg>
      )
    case 'github':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.58 2 12.23C2 16.75 4.87 20.58 8.84 21.93C9.34 22.02 9.52 21.71 9.52 21.44C9.52 21.2 9.51 20.4 9.51 19.55C7 20.02 6.35 18.92 6.15 18.35C6.04 18.06 5.55 17.18 5.12 16.94C4.77 16.75 4.27 16.28 5.11 16.27C5.9 16.26 6.46 17.01 6.65 17.32C7.55 18.87 8.99 18.43 9.56 18.17C9.65 17.5 9.91 17.06 10.2 16.81C7.98 16.55 5.66 15.67 5.66 11.77C5.66 10.66 6.05 9.74 6.69 9.03C6.59 8.77 6.24 7.72 6.79 6.3C6.79 6.3 7.63 6.03 9.54 7.35C10.34 7.12 11.19 7.01 12.04 7.01C12.89 7.01 13.74 7.12 14.54 7.35C16.45 6.02 17.29 6.3 17.29 6.3C17.84 7.72 17.49 8.77 17.39 9.03C18.03 9.74 18.42 10.65 18.42 11.77C18.42 15.68 16.09 16.55 13.87 16.81C14.24 17.13 14.56 17.75 14.56 18.71C14.56 20.09 14.55 21.1 14.55 21.44C14.55 21.71 14.73 22.03 15.24 21.93C19.14 20.58 22 16.74 22 12.23C22 6.58 17.52 2 12 2Z"
          />
        </svg>
      )
    case 'x':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="currentColor"
            d="M18.244 2.25H21.552L14.325 10.51L22.827 21.75H16.17L10.956 14.933L4.99 21.75H1.68L9.41 12.915L1.254 2.25H8.08L12.793 8.481L18.244 2.25ZM17.083 19.77H18.916L7.084 4.126H5.117L17.083 19.77Z"
          />
        </svg>
      )
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            d="M7.5 3.5H16.5C18.71 3.5 20.5 5.29 20.5 7.5V16.5C20.5 18.71 18.71 20.5 16.5 20.5H7.5C5.29 20.5 3.5 18.71 3.5 16.5V7.5C3.5 5.29 5.29 3.5 7.5 3.5Z"
          />
          <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
        </svg>
      )
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="currentColor"
            d="M21.58 7.19C21.35 6.33 20.67 5.65 19.81 5.42C18.25 5 12 5 12 5C12 5 5.75 5 4.19 5.42C3.33 5.65 2.65 6.33 2.42 7.19C2 8.75 2 12 2 12C2 12 2 15.25 2.42 16.81C2.65 17.67 3.33 18.35 4.19 18.58C5.75 19 12 19 12 19C12 19 18.25 19 19.81 18.58C20.67 18.35 21.35 17.67 21.58 16.81C22 15.25 22 12 22 12C22 12 22 8.75 21.58 7.19ZM10 15V9L15.2 12L10 15Z"
          />
        </svg>
      )
    case 'portfolio':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7.5C4 6.4 4.9 5.5 6 5.5H18C19.1 5.5 20 6.4 20 7.5V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V7.5ZM9 5.5V4.5C9 3.67 9.67 3 10.5 3H13.5C14.33 3 15 3.67 15 4.5V5.5"
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="review-platform-icon">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            d="M3.6 9H20.4M3.6 15H20.4M12 3C14.5 5.4 15.9 8.6 15.9 12C15.9 15.4 14.5 18.6 12 21M12 3C9.5 5.4 8.1 8.6 8.1 12C8.1 15.4 9.5 18.6 12 21"
          />
        </svg>
      )
  }
}

export function ProfileTagLink({ profile, reviewerName = 'Reviewer' }) {
  if (!profile?.url) return null

  return (
    <a
      href={profile.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`review-profile-chip platform-${profile.platform || 'website'}`}
      aria-label={`Visit ${reviewerName}'s ${profile.label || 'profile'} (${profile.display || profile.url})`}
      title={profile.url}
    >
      <PlatformIcon platform={profile.platform} />
      <span className="review-profile-chip-text">
        {profile.display || profile.label || 'Profile'}
      </span>
      <span className="review-profile-chip-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  )
}
