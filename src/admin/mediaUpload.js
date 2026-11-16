const CHUNK_SIZE_BYTES = 256 * 1024

function inferMimeType(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
  }
  return map[ext] || 'application/octet-stream'
}

export async function uploadMediaFile(file, onProgress) {
  if (!file) throw new Error('No file selected.')

  const mimeType = file.type || inferMimeType(file.name)
  const initRes = await fetch('/api/admin/media/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType,
      byteSize: file.size,
    }),
  })
  const initData = await initRes.json()
  if (!initRes.ok) {
    throw new Error(initData?.error || 'Could not initialize file upload.')
  }

  const totalChunks = initData.chunkCount
  const chunkSize = initData.chunkSize || CHUNK_SIZE_BYTES

  for (let idx = 0; idx < totalChunks; idx += 1) {
    const start = idx * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const sliceBuffer = await file.slice(start, end).arrayBuffer()

    const putRes = await fetch(
      `/api/admin/media/${encodeURIComponent(initData.id)}/chunk/${idx}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: sliceBuffer,
      }
    )
    if (!putRes.ok) {
      const errBody = await putRes.json().catch(() => ({}))
      throw new Error(errBody?.error || `Chunk ${idx + 1} failed to upload.`)
    }
    if (typeof onProgress === 'function') {
      onProgress(Math.round(((idx + 1) / totalChunks) * 100))
    }
  }

  const doneRes = await fetch(
    `/api/admin/media/${encodeURIComponent(initData.id)}/complete`,
    { method: 'POST' }
  )
  const doneData = await doneRes.json()
  if (!doneRes.ok) {
    throw new Error(doneData?.error || 'Could not finalize upload.')
  }
  return doneData.file
}

export function formatBytes(bytes) {
  const num = Number(bytes || 0)
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  return `${(num / (1024 * 1024)).toFixed(2)} MB`
}
