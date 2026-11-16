const PBKDF2_ITERATIONS = 100000

function bytesToBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * Generates a salted PBKDF2-SHA256 hash entirely in the browser using WebCrypto.
 * Plaintext passwords never leave the client when generating a hash for Cloudflare Secrets.
 */
export async function generatePasswordHash(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Use at least 10 characters for your admin password.')
  }
  const encoder = new TextEncoder()
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )

  const hashBytes = new Uint8Array(derivedBits)
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hashBytes)}`
}

export function evaluatePasswordStrength(password) {
  if (!password) return { score: 0, label: 'Empty' }
  let score = 0
  if (password.length >= 10) score += 1
  if (password.length >= 16) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1

  if (score <= 1) return { score, label: 'Weak' }
  if (score <= 3) return { score, label: 'Good' }
  return { score, label: 'Strong' }
}
