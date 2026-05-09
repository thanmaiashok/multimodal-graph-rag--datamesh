import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CheckCircle, Database, ExternalLink, File, Image,
  Loader2, Mic, RefreshCw, ScanSearch, Trash2, Upload, Video, XCircle,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/mp4': ['.m4a'],
  'audio/ogg': ['.ogg'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
}

const MODALITY_META = {
  text:  { icon: File,  color: 'text-gray-400', bg: 'border-neutral-800', badge: 'bg-neutral-900 text-gray-400' },
  image: { icon: Image, color: 'text-gray-300', bg: 'border-neutral-800', badge: 'bg-neutral-900 text-gray-300' },
  audio: { icon: Mic,   color: 'text-gray-400', bg: 'border-neutral-800', badge: 'bg-neutral-900 text-gray-400' },
  video: { icon: Video, color: 'text-gray-500', bg: 'border-neutral-800', badge: 'bg-neutral-900 text-gray-500' },
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function FileUpload() {
  const [uploading, setUploading] = useState([])
  const [indexed, setIndexed]     = useState([])
  const [deleting, setDeleting]   = useState(new Set())
  const [reindexing, setReindexing] = useState(new Set())
  const [loadingFiles, setLoadingFiles] = useState(false)

  const fetchIndexed = async () => {
    setLoadingFiles(true)
    try {
      const { data } = await axios.get(`${API_URL}/api/files`)
      setIndexed(data.files || [])
    } catch {}
    finally { setLoadingFiles(false) }
  }

  useEffect(() => { fetchIndexed() }, [])

  const onDrop = useCallback(async (files) => {
    // Register all slots immediately so UI shows all uploads at once
    const entries = files.map((file) => ({
      uid: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      status: 'uploading',
    }))
    setUploading((prev) => [...prev, ...entries])

    // Upload all files in parallel
    await Promise.all(
      files.map(async (file, idx) => {
        const uid = entries[idx].uid
        const form = new FormData()
        form.append('file', file)
        try {
          const { data } = await axios.post(`${API_URL}/api/upload`, form)
          setUploading((prev) => prev.map((u) => (u.uid === uid ? { ...u, status: 'done', result: data } : u)))
          toast.success(`${file.name} indexed!`)
        } catch (err) {
          const detail = err.response?.data?.detail || 'Upload failed'
          setUploading((prev) => prev.map((u) => (u.uid === uid ? { ...u, status: 'error', error: detail } : u)))
          toast.error(detail)
        }
      })
    )
    fetchIndexed()
  }, [])

  const handleReindex = async (file) => {
    setReindexing((prev) => new Set([...prev, file.file_id]))
    try {
      await axios.post(`${API_URL}/api/files/${file.file_id}/reindex`)
      toast.success(`Re-captioning ${file.filename} in background…`, { duration: 4000 })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Reindex failed')
    } finally {
      setReindexing((prev) => { const s = new Set(prev); s.delete(file.file_id); return s })
    }
  }

  const handleDelete = async (file) => {
    const confirm = window.confirm(
      `Delete "${file.filename}"?\n\nThis removes:\n• ${file.chunks} vector chunks from ChromaDB\n• ${file.entities} entities from Neo4j\n• The graph will auto-reconnect affected nodes\n\nThis cannot be undone.`
    )
    if (!confirm) return

    setDeleting((prev) => new Set([...prev, file.file_id]))
    try {
      const { data } = await axios.delete(`${API_URL}/api/files/${file.file_id}`)
      toast.success(
        `Deleted "${file.filename}" — ${data.entities_removed} entities removed, ${data.reconnect_candidates} graph reconnections queued`,
        { duration: 5000 }
      )
      fetchIndexed()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed')
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(file.file_id); return s })
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, multiple: true })

  const grouped = MODALITY_META
    ? Object.keys(MODALITY_META).reduce((acc, key) => {
        acc[key] = indexed.filter((f) => f.modality === key)
        return acc
      }, {})
    : {}

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#000' }}>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#e8e8e8' }}>File Manager</h2>
          <p className="text-sm mt-1" style={{ color: '#555' }}>Upload files to index into ChromaDB + Neo4j. Delete to remove and auto-heal the graph.</p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            isDragActive ? 'scale-[1.01]' : ''
          }`}
          style={isDragActive
            ? { borderColor: '#fff', background: 'rgba(255,255,255,0.03)', boxShadow: '0 0 24px rgba(255,255,255,0.06)' }
            : { borderColor: '#222', background: 'transparent' }
          }
          onMouseEnter={e => { if (!isDragActive) e.currentTarget.style.borderColor = '#444' }}
          onMouseLeave={e => { if (!isDragActive) e.currentTarget.style.borderColor = '#222' }}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: isDragActive ? '#fff' : '#333' }} />
          {isDragActive ? (
            <p className="font-medium" style={{ color: '#e8e8e8' }}>Drop files to index...</p>
          ) : (
            <>
              <p className="font-medium" style={{ color: '#d1d5db' }}>Drag & drop files here</p>
              <p className="text-sm mt-1" style={{ color: '#444' }}>PDF · TXT · MD · JPG · PNG · MP3 · WAV · MP4 · MOV</p>
            </>
          )}
        </div>

        {/* In-progress uploads */}
        {uploading.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Processing</h3>
            {uploading.map((u) => {
              const mod = u.result?.modality || 'text'
              const meta = MODALITY_META[mod] || MODALITY_META.text
              const Icon = meta.icon
              return (
                <div key={u.uid} className={`flex items-center gap-3 border rounded-xl px-4 py-3 bg-gray-900/60 ${meta.bg}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    {u.result && (
                      <p className="text-xs text-gray-500">{u.result.chunks_indexed} chunks · {u.result.entities_extracted} entities</p>
                    )}
                    {u.error && <p className="text-xs text-red-400">{u.error}</p>}
                  </div>
                  {u.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-purple-400 flex-shrink-0" />}
                  {u.status === 'done'     && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                  {u.status === 'error'    && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        )}

        {/* Indexed files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" style={{ color: '#fff' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#e8e8e8' }}>Indexed Files</h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#111', color: '#555' }}>{indexed.length}</span>
            </div>
            <button onClick={fetchIndexed} className="p-1 rounded-lg transition-colors" style={{ color: '#444' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fca5a5'}
              onMouseLeave={e => e.currentTarget.style.color = '#4a1515'}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {indexed.length === 0 && !loadingFiles && (
            <div className="text-center py-10" style={{ color: '#444' }}>
              <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No files indexed yet. Upload some files above.</p>
            </div>
          )}

          {/* Group by modality */}
          {Object.entries(grouped).map(([mod, files]) => {
            if (!files.length) return null
            const meta = MODALITY_META[mod]
            const Icon = meta.icon
            return (
              <div key={mod}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{mod} · {files.length}</span>
                </div>
                <div className="space-y-1.5">
                  {files.map((file) => {
                    const isDel = deleting.has(file.file_id)
                    const fileUrl = `${API_URL}/api/files/${file.file_id}/serve`
                    const isImage = file.modality === 'image'
                    return (
                      <div
                        key={file.file_id}
                        className={`group border rounded-xl bg-gray-900/40 transition-all overflow-hidden ${
                          isDel ? 'opacity-50 border-red-800/40' : `${meta.bg} hover:bg-gray-800/40`
                        }`}
                      >
                        {/* Image thumbnail */}
                        {isImage && (
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={fileUrl}
                              alt={file.filename}
                              className="w-full max-h-40 object-cover border-b border-gray-700/50 hover:opacity-90 transition-opacity cursor-pointer"
                            />
                          </a>
                        )}

                        <div className="flex items-center gap-3 px-4 py-3">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-200 truncate">{file.filename}</p>
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 text-gray-600 hover:text-purple-400 transition-colors"
                                title="Open file"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-gray-500">{file.chunks} chunks</span>
                              <span className="text-xs text-gray-500">{file.entities} entities</span>
                              <span className="text-xs text-gray-600">{fmtDate(file.created_at)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Re-caption (images only) */}
                            {isImage && (
                              <button
                                onClick={() => handleReindex(file)}
                                disabled={reindexing.has(file.file_id) || isDel}
                                title="Re-run vision captioning"
                                className="p-1.5 rounded-lg text-gray-600 hover:text-purple-400 hover:bg-purple-900/20 transition-all disabled:opacity-40"
                              >
                                {reindexing.has(file.file_id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                              </button>
                            )}
                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(file)}
                              disabled={isDel}
                              title="Delete file and heal graph"
                              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-40"
                            >
                              {isDel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Info box */}
        <div className="rounded-xl p-4 flex gap-3" style={{ background: '#0a0a0a', border: '1px solid #222' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#888' }} />
          <div className="text-xs space-y-1" style={{ color: '#555' }}>
            <p className="font-medium" style={{ color: '#e8e8e8' }}>Graph Auto-Heal on Delete</p>
            <p>When you delete a file, its vector chunks and graph entities are removed. Entities that were previously connected <em>through</em> the deleted file's entities are analyzed by the LLM — if a direct relationship makes sense, it's automatically created to keep the graph connected.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
