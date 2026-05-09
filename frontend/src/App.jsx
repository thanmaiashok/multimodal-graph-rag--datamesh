import { useState } from 'react'
import { Brain, MessageSquare, Network, Upload } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import ChatInterface from './components/ChatInterface'
import FileUpload from './components/FileUpload'
import GraphVisualization from './components/GraphVisualization'

const TABS = [
  { id: 'chat',   label: 'AI Chat',        icon: MessageSquare },
  { id: 'upload', label: 'Upload Files',    icon: Upload },
  { id: 'graph',  label: 'Knowledge Graph', icon: Network },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#000', color: '#e8e8e8' }}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111',
            color: '#e8e8e8',
            border: '1px solid #2a2a2a',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
            borderRadius: '10px',
            fontSize: '13px',
          },
        }}
      />

      {/* Sidebar */}
      <aside className="w-56 flex flex-col flex-shrink-0" style={{ background: '#080808', borderRight: '1px solid #1a1a1a' }}>

        {/* Logo */}
        <div className="p-5" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#fff' }}>
              <Brain className="w-4 h-4" style={{ color: '#000' }} />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight" style={{ color: '#fff' }}>datamesh GraphRAG</h1>
              <p className="text-xs" style={{ color: '#555' }}>Multi-Modal AI</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2.5 space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${active ? 'nav-active' : ''}`}
                style={active
                  ? { background: '#fff', color: '#000', fontWeight: 600 }
                  : { color: '#666', fontWeight: 400 }
                }
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#141414'; e.currentTarget.style.color = '#ccc' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666' } }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Model info */}
        <div className="p-4 space-y-1.5" style={{ borderTop: '1px solid #1a1a1a' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full pulse-white" style={{ background: '#fff' }} />
            <span className="text-xs font-medium" style={{ color: '#888' }}>Groq API</span>
          </div>
          {['llama-3.3-70b-versatile', 'llama-4-scout (vision)', 'whisper-large-v3', 'CLIP + MiniLM'].map(m => (
            <p key={m} className="text-xs" style={{ color: '#333' }}>{m}</p>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat'   && <ChatInterface />}
        {activeTab === 'upload' && <FileUpload />}
        {activeTab === 'graph'  && <GraphVisualization />}
      </main>
    </div>
  )
}
