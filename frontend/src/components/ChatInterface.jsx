import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  BookOpen, Bot, Check, ChevronLeft, ChevronRight, Clock,
  Database, ExternalLink, File, Image, Loader2, MessageSquare,
  Mic, Pencil, Plus, RefreshCw, Send, Square, Trash2, User, Video, X,
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const MODALITY_BADGE = { text: 'bg-neutral-800', image: 'bg-neutral-700', audio: 'bg-neutral-800', video: 'bg-neutral-900' }
const MODALITY_ICON = { text: File, image: Image, audio: Mic, video: Video }
const MODALITY_COLOR = { text: 'text-gray-400', image: 'text-gray-300', audio: 'text-gray-400', video: 'text-gray-500' }

function makeWelcome() {
  return {
    role: 'assistant',
    content: "Hello! I'm **datamesh GraphRAG** — your Multi-Modal AI assistant.\n\nUpload documents, images, or audio using the **Upload Files** tab, then ask me anything. I use vector search + knowledge graph traversal to retrieve context.",
    sources: [],
    ts: Date.now(),
  }
}

function newConversation() {
  return { id: crypto.randomUUID(), title: 'New Chat', createdAt: Date.now(), messages: [makeWelcome()] }
}

function loadConversations() {
  try {
    const raw = localStorage.getItem('dm_conversations')
    if (raw) return JSON.parse(raw)
  } catch {}
  return [newConversation()]
}

function saveConversations(convs) {
  try { localStorage.setItem('dm_conversations', JSON.stringify(convs)) } catch {}
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getAutoTitle(messages) {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return 'New Chat'
  return first.content.slice(0, 32) + (first.content.length > 32 ? '…' : '')
}

export default function ChatInterface() {
  const [conversations, setConversations] = useState(() => loadConversations())
  const [activeId, setActiveId] = useState(() => loadConversations()[0]?.id)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modality, setModality] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [filesOpen, setFilesOpen] = useState(false)
  const [indexedFiles, setIndexedFiles] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const editRef = useRef(null)

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/files`)
      const data = await res.json()
      setIndexedFiles(data.files || [])
    } catch {}
    finally { setFilesLoading(false) }
  }, [])

  useEffect(() => { if (filesOpen) fetchFiles() }, [filesOpen, fetchFiles])

  const active = conversations.find((c) => c.id === activeId) || conversations[0]

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [active?.messages])
  useEffect(() => { saveConversations(conversations) }, [conversations])
  useEffect(() => { if (editingId) editRef.current?.focus() }, [editingId])

  const updateActive = useCallback((updater) => {
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, ...updater(c) } : c)))
  }, [activeId])

  const createNew = () => {
    const c = newConversation()
    setConversations((prev) => [c, ...prev])
    setActiveId(c.id)
    setInput('')
  }

  const deleteConversation = (id, e) => {
    e.stopPropagation()
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (next.length === 0) { const fresh = newConversation(); setActiveId(fresh.id); return [fresh] }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
  }

  const startEdit = (conv, e) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const commitEdit = () => {
    if (editTitle.trim()) {
      setConversations((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, title: editTitle.trim() } : c))
      )
    }
    setEditingId(null)
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const query = input.trim()
    const history = (active?.messages || [])
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const userMsg = { role: 'user', content: query, sources: [], ts: Date.now() }
    const assistantMsg = { role: 'assistant', content: '', sources: [], ts: Date.now() }

    updateActive((c) => ({
      messages: [...c.messages, userMsg, assistantMsg],
      title: c.messages.filter((m) => m.role === 'user').length === 0
        ? getAutoTitle([userMsg]) : c.title,
    }))
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, history, modality }),
        signal: controller.signal,
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE events are separated by \n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'sources') {
                updateActive((c) => { const m = [...c.messages]; m[m.length - 1] = { ...m[m.length - 1], sources: event.data }; return { messages: m } })
              } else if (event.type === 'token') {
                updateActive((c) => { const m = [...c.messages]; m[m.length - 1] = { ...m[m.length - 1], content: m[m.length - 1].content + event.data }; return { messages: m } })
              }
            } catch (e) { console.error('SSE parse error:', e, line) }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        updateActive((c) => { const m = [...c.messages]; m[m.length - 1] = { ...m[m.length - 1], content: '**Error:** Could not connect to backend.' }; return { messages: m } })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  const RD = {
    sidebar:   { background: '#080808', borderRight: '1px solid #1a1a1a' },
    header:    { background: '#0a0a0a', borderBottom: '1px solid #1a1a1a' },
    input:     { background: '#0a0a0a', borderTop: '1px solid #1a1a1a' },
    msgBox:    { background: '#111', border: '1px solid #1e1e1e' },
    userBubble:{ background: '#fff', color: '#000' },
    drawer:    { background: '#080808', borderLeft: '1px solid #1a1a1a' },
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Collapsible history sidebar ── */}
      <div
        className={`relative flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-60' : 'w-0'} overflow-hidden`}
        style={RD.sidebar}
      >
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={RD.header}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#555' }}>Chats</span>
          <span className="text-xs" style={{ color: '#444' }}>{conversations.length}</span>
        </div>

        <div className="px-3 pt-2 pb-1 flex-shrink-0">
          <button
            onClick={createNew}
            className="w-full flex items-center justify-center gap-2 text-white text-xs font-semibold py-2 rounded-xl transition-all"
            style={{ background: '#fff', color: '#000', boxShadow: '0 0 12px rgba(255,255,255,0.1)' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 12px rgba(255,255,255,0.1)'}
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {conversations.map((conv) => {
            const isActive = conv.id === activeId
            const isEditing = editingId === conv.id
            return (
              <div
                key={conv.id}
                onClick={() => { if (!isEditing) setActiveId(conv.id) }}
                onDoubleClick={(e) => startEdit(conv, e)}
                className="group relative flex flex-col px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none"
                style={isActive
                  ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }
                  : { border: '1px solid transparent' }
                }
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div className="flex items-start gap-2 pr-12">
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: isActive ? '#e8e8e8' : '#444' }} />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={editRef}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                          className="flex-1 text-xs rounded px-1.5 py-0.5 text-white outline-none"
                          style={{ background: '#111', border: '1px solid #444' }}
                        />
                        <button onClick={commitEdit} style={{ color: '#4ade80' }}><Check className="w-3 h-3" /></button>
                        <button onClick={() => setEditingId(null)} style={{ color: '#555' }}><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <p className="text-xs font-medium truncate leading-tight" style={{ color: isActive ? '#e8e8e8' : '#9ca3af' }}>{conv.title}</p>
                    )}
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#444' }}>
                      <Clock className="w-2.5 h-2.5" />{formatDate(conv.createdAt)}
                    </p>
                  </div>
                </div>
                {!isEditing && (
                  <div className="absolute right-2 top-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => startEdit(conv, e)} className="p-1 rounded transition-colors" style={{ color: '#555' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#e8e8e8'}
                      onMouseLeave={e => e.currentTarget.style.color = '#555'}
                      title="Rename (or double-click)">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => deleteConversation(conv.id, e)} className="p-1 rounded transition-colors" style={{ color: '#555' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                      onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Toggle button ── */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="absolute z-20 flex items-center justify-center w-5 h-10 rounded-r-lg transition-all"
        style={{
          left: sidebarOpen ? '240px' : '0px',
          top: '50%', transform: 'translateY(-50%)',
          transition: 'left 0.3s ease',
          background: '#111',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#555',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e8e8e8'; e.currentTarget.style.boxShadow = '0 0 8px rgba(255,255,255,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.boxShadow = 'none' }}
      >
        {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* ── Chat area ── */}
      <div className="relative flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={RD.header}>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate" style={{ color: '#e8e8e8' }}>{active?.title || 'New Chat'}</h2>
            <p className="text-xs" style={{ color: '#444' }}>
              {active?.messages.filter((m) => m.role === 'user').length} messages
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setFilesOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
              style={filesOpen
                ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#e8e8e8' }
                : { background: '#111', border: '1px solid rgba(255,255,255,0.08)', color: '#555' }
              }
            >
              <Database className="w-3.5 h-3.5" /> Files
            </button>
            <span className="text-xs" style={{ color: '#444' }}>Mode:</span>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#e8e8e8' }}
            >
              <option value="text">Text</option>
              <option value="image">+ Images</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {/* Files drawer */}
        {filesOpen && (
          <div className="absolute right-0 top-12 bottom-0 w-72 z-30 flex flex-col" style={{ ...RD.drawer, boxShadow: '-4px 0 24px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={RD.header}>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" style={{ color: '#fff' }} />
                <span className="text-sm font-semibold" style={{ color: '#e8e8e8' }}>Indexed Files</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#111', color: '#555' }}>{indexedFiles.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={fetchFiles} className="p-1.5 rounded-lg transition-colors" style={{ color: '#555' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#e8e8e8'}
                  onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                  <RefreshCw className={`w-3.5 h-3.5 ${filesLoading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setFilesOpen(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: '#555' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#e8e8e8'}
                  onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {indexedFiles.length === 0 && !filesLoading && (
                <p className="text-xs text-center pt-8" style={{ color: '#444' }}>No files indexed yet.</p>
              )}
              {['image','text','audio','video'].map(mod => {
                const files = indexedFiles.filter(f => f.modality === mod)
                if (!files.length) return null
                const Icon = MODALITY_ICON[mod] || File
                const color = MODALITY_COLOR[mod]
                return (
                  <div key={mod}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className={`w-3 h-3 ${color}`} />
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555' }}>{mod} · {files.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {files.map(file => {
                        const fileUrl = `${API_URL}/api/files/${file.file_id}/serve`
                        const isImg = file.modality === 'image'
                        return (
                          <div key={file.file_id} className="rounded-xl overflow-hidden transition-all"
                            style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
                            {isImg && (
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                <img src={fileUrl} alt={file.filename} className="w-full h-28 object-cover hover:opacity-85 transition-opacity cursor-pointer" />
                              </a>
                            )}
                            <div className="flex items-center gap-2 px-3 py-2">
                              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                              <span className="text-xs flex-1 truncate" style={{ color: '#d1d5db' }}>{file.filename}</span>
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 transition-colors" style={{ color: '#444' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#e8e8e8'}
                                onMouseLeave={e => e.currentTarget.style.color = '#444'}>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ background: '#000' }}>
          {(active?.messages || []).map((msg, i) => {
            const isLast = i === (active?.messages.length ?? 0) - 1
            const isStreaming = loading && isLast && msg.role === 'assistant'
            return (
              <div key={i} className={`flex gap-3 fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-5"
                    style={{ background: '#fff' }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: '#000' }} />
                  </div>
                )}

                <div className={`max-w-xl flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-xs px-1" style={{ color: '#444' }}>{formatTime(msg.ts)}</span>

                  <div className="w-full rounded-2xl overflow-hidden"
                    style={msg.role === 'user'
                      ? { ...RD.userBubble, borderRadius: '18px 4px 18px 18px', boxShadow: '0 0 16px rgba(255,255,255,0.08)' }
                      : { ...RD.msgBox, borderRadius: '4px 18px 18px 18px' }
                    }>

                    <div className="px-4 py-3">
                      {msg.role === 'assistant' ? (
                        isStreaming && !msg.content ? (
                          /* Typing indicator */
                          <div className="flex items-center gap-1.5 py-1">
                            <span className="w-2 h-2 rounded-full typing-dot" style={{ background: '#fff' }} />
                            <span className="w-2 h-2 rounded-full typing-dot" style={{ background: '#fff' }} />
                            <span className="w-2 h-2 rounded-full typing-dot" style={{ background: '#fff' }} />
                          </div>
                        ) : (
                          <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
                            {msg.content + (isStreaming ? '▋' : '')}
                          </ReactMarkdown>
                        )
                      ) : (
                        <p className="text-sm leading-relaxed" style={{ color: '#000' }}>{msg.content}</p>
                      )}
                    </div>

                    {/* Sources panel */}
                    {msg.sources?.filter(s => s.url).length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                        {/* Image grid */}
                        {msg.sources.filter(s => s.modality === 'image' && s.url).length > 0 && (
                          <div className={`grid gap-0.5 ${msg.sources.filter(s => s.modality === 'image' && s.url).length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {msg.sources.filter(s => s.modality === 'image' && s.url).map((src) => (
                              <div key={src.id} className="relative overflow-hidden">
                                <img src={`${API_URL}${src.url}`} alt={src.text} className="w-full h-40 object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 px-2 py-2 flex items-end justify-between gap-2"
                                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
                                  <span className="text-white text-xs font-medium truncate max-w-[65%] drop-shadow">
                                    {src.text.split('|')[0].replace('Image file:', '').trim()}
                                  </span>
                                  <a href={`${API_URL}${src.url}`} target="_blank" rel="noopener noreferrer"
                                    className="source-badge flex items-center gap-1 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors"
                                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                                    onClick={e => e.stopPropagation()}>
                                    <ExternalLink className="w-3 h-3" /> View
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Audio */}
                        {msg.sources.filter(s => s.modality === 'audio' && s.url).map((src) => (
                          <div key={src.id} className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Mic className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e8e8e8' }} />
                              <span className="text-xs flex-1 truncate" style={{ color: '#d1d5db' }}>{src.text.slice(0, 50)}</span>
                              <a href={`${API_URL}${src.url}`} target="_blank" rel="noopener noreferrer"
                                className="source-badge flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 transition-colors"
                                style={{ background: 'rgba(255,255,255,0.08)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.12)' }}>
                                <ExternalLink className="w-3 h-3" /> Download
                              </a>
                            </div>
                            <audio controls className="w-full h-8" style={{ colorScheme: 'dark' }}>
                              <source src={`${API_URL}${src.url}`} />
                            </audio>
                          </div>
                        ))}

                        {/* Video */}
                        {msg.sources.filter(s => s.modality === 'video' && s.url).map((src) => (
                          <div key={src.id} className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <Video className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#e8e8e8' }} />
                            <span className="text-xs flex-1 truncate" style={{ color: '#d1d5db' }}>{src.text.slice(0, 50)}</span>
                            <a href={`${API_URL}${src.url}`} target="_blank" rel="noopener noreferrer"
                              className="source-badge flex items-center gap-1 text-xs px-2.5 py-1 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(255,255,255,0.08)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.12)' }}>
                              <ExternalLink className="w-3 h-3" /> Watch
                            </a>
                          </div>
                        ))}

                        {/* Text / PDF */}
                        {msg.sources.filter(s => s.modality === 'text' && s.url).map((src) => (
                          <div key={src.id} className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: 'rgba(255,255,255,0.08)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.12)' }}>
                              [{src.id}]
                            </span>
                            <span className="text-xs flex-1 truncate" style={{ color: '#9ca3af' }}>{src.text.slice(0, 55)}{src.text.length > 55 ? '…' : ''}</span>
                            <a href={`${API_URL}${src.url}`} target="_blank" rel="noopener noreferrer"
                              className="source-badge flex items-center gap-1 text-xs px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap"
                              style={{ background: 'rgba(255,255,255,0.08)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.12)' }}>
                              <ExternalLink className="w-3 h-3" /> Open
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-5"
                    style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <User className="w-3.5 h-3.5" style={{ color: '#e8e8e8' }} />
                  </div>
                )}
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 py-3 flex-shrink-0" style={RD.input}>
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                rows={1}
                disabled={loading}
                className="w-full text-white placeholder-neutral-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none overflow-hidden transition-all"
                style={{
                  background: '#0d0d0d',
                  border: '1px solid rgba(255,255,255,0.1)',
                  lineHeight: '1.5',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.35)'; e.target.style.boxShadow = '0 0 12px rgba(255,255,255,0.06)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {loading ? (
              <button onClick={stopGeneration}
                className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-all flex-shrink-0"
                style={{ background: '#222', border: '1px solid rgba(255,255,255,0.18)' }}
                onMouseEnter={e => e.currentTarget.style.background = '#991b1b'}
                onMouseLeave={e => e.currentTarget.style.background = '#222'}>
                <Square className="w-3.5 h-3.5 fill-white" /> Stop
              </button>
            ) : (
              <button onClick={sendMessage} disabled={!input.trim()}
                className="flex items-center justify-center w-10 h-10 text-white rounded-xl transition-all flex-shrink-0"
                style={{ background: input.trim() ? 'linear-gradient(135deg,#dc2626,#7f1d1d)' : '#111', border: '1px solid rgba(255,255,255,0.12)', opacity: input.trim() ? 1 : 0.3 }}
                onMouseEnter={e => { if (input.trim()) e.currentTarget.style.boxShadow = '0 0 16px rgba(220,38,38,0.5)' }}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
