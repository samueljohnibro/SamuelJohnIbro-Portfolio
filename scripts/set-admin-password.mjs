#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PBKDF2_ITERATIONS = 100000

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    32,
    'sha256'
  )
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`
}

let pipedLines = null
let pipedIndex = 0

async function readHiddenLine(promptText) {
  process.stdout.write(promptText)

  if (!process.stdin.isTTY) {
    if (pipedLines === null) {
      let data = ''
      process.stdin.setEncoding('utf8')
      for await (const chunk of process.stdin) {
        data += chunk
      }
      pipedLines = data.replace(/\r\n/g, '\n').split('\n')
    }
    process.stdout.write('\n')
    return (pipedLines[pipedIndex++] || '').trim()
  }

  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let input = ''
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(Boolean(wasRaw))
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(input)
      } else if (ch === '\u0003') {
        process.stdout.write('\n')
        process.exit(1)
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1)
        }
      } else {
        input += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const mode = process.argv[2] || 'secret'
  const password = await readHiddenLine('Enter new admin password (hidden): ')
  if (password.length < 10) {
    console.error('Error: Password must be at least 10 characters.')
    process.exit(1)
  }

  const confirm = await readHiddenLine('Confirm admin password (hidden): ')
  if (password !== confirm) {
    console.error('Error: Passwords did not match.')
    process.exit(1)
  }

  const hash = hashPassword(password)

  if (mode === 'dev') {
    const devVarsPath = path.resolve(process.cwd(), '.dev.vars')
    const sessionSecret = toBase64Url(crypto.randomBytes(32))
    const lines = [
      `ADMIN_PASSWORD_HASH="${hash}"`,
      `SESSION_SECRET="${sessionSecret}"`,
    ]
    fs.writeFileSync(devVarsPath, `${lines.join('\n')}\n`, 'utf8')
    console.log('\nSaved local development secrets to .dev.vars (gitignored).')
    console.log('Run `npm run dev:worker` to test the full portfolio + admin locally.')
    return
  }

  if (mode === 'hash-only') {
    console.log('\nGenerated ADMIN_PASSWORD_HASH (salted PBKDF2-SHA256):')
    console.log(hash)
    console.log(
      '\nAdd this as an encrypted secret named ADMIN_PASSWORD_HASH in Cloudflare Dashboard -> Workers & Pages -> sji -> Settings -> Variables and Secrets.'
    )
    return
  }

  console.log('\nPushing salted password hash to Cloudflare Worker Secret `ADMIN_PASSWORD_HASH`...')
  const wranglerScript = path.resolve(
    process.cwd(),
    'node_modules',
    'wrangler',
    'bin',
    'wrangler.js'
  )
  const res = spawnSync(
    process.execPath,
    [wranglerScript, 'secret', 'put', 'ADMIN_PASSWORD_HASH'],
    {
      input: `${hash}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  )

  if (res.status !== 0) {
    console.log('\nCould not auto-push via Wrangler CLI (run `npx wrangler login` first, or paste the hash manually in Cloudflare Dashboard Secrets):')
    console.log(hash)
    process.exit(res.status || 1)
  }

  console.log('\nADMIN_PASSWORD_HASH secret updated on Cloudflare Worker.')
}

main()
