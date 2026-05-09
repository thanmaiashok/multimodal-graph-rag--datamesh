import { useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import axios from 'axios'
import { Info, RefreshCw, X } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const NODE_COLORS = {
  PERSON: '#818cf8',
  ORGANIZATION: '#34d399',
  CONCEPT: '#fbbf24',
  LOCATION: '#60a5fa',
  EVENT: '#f87171',
  TECHNOLOGY: '#c084fc',
  DEFAULT: '#94a3b8',
}

export default function GraphVisualization() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDims({ w: containerRef.current.offsetWidth, h: containerRef.current.offsetHeight })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const fetchGraph = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${API_URL}/api/graph`)
      setGraphData({
        nodes: data.nodes.map((n) => ({
          ...n,
          color: NODE_COLORS[n.type] || NODE_COLORS.DEFAULT,
        })),
        links: data.edges.map((e) => ({
          source: e.source,
          target: e.target,
          label: e.relationship,
        })),
      })
    } catch (err) {
      console.error('Graph fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGraph() }, [])

  const nodeNeighbors = selected
    ? graphData.links
        .filter((l) => l.source === selected.id || l.target === selected.id || l.source?.id === selected.id || l.target?.id === selected.id)
        .map((l) => {
          const srcId = typeof l.source === 'object' ? l.source.id : l.source
          const tgtId = typeof l.target === 'object' ? l.target.id : l.target
          const otherId = srcId === selected.id ? tgtId : srcId
          const other = graphData.nodes.find((n) => n.id === otherId)
          return { label: l.label, other: other?.label || otherId }
        })
    : []

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
        <div>
          <h2 className="font-semibold">Knowledge Graph</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {graphData.nodes.length} entities · {graphData.links.length} relationships
          </p>
        </div>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="flex-1 relative" ref={containerRef}>
          {graphData.nodes.length === 0 && !loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Info className="w-12 h-12 text-gray-700 mx-auto" />
                <p className="text-gray-400 font-medium">No entities in graph yet</p>
                <p className="text-gray-600 text-sm">Upload files to build the knowledge graph</p>
              </div>
            </div>
          ) : (
            <ForceGraph2D
              width={dims.w}
              height={dims.h}
              graphData={graphData}
              backgroundColor="#030712"
              nodeLabel={(n) => `${n.label} (${n.type})`}
              nodeColor={(n) => n.color}
              nodeRelSize={6}
              linkColor={() => '#1f2937'}
              linkWidth={1.5}
              linkLabel={(l) => l.label}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(node) => setSelected(node)}
              nodeCanvasObject={(node, ctx, scale) => {
                const r = 5
                ctx.beginPath()
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
                ctx.fillStyle = node.color
                ctx.fill()

                if (selected && node.id === selected.id) {
                  ctx.beginPath()
                  ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI)
                  ctx.strokeStyle = node.color
                  ctx.lineWidth = 2
                  ctx.stroke()
                }

                if (scale > 1.2) {
                  const fontSize = Math.max(8 / scale, 3)
                  ctx.font = `${fontSize}px Sans-Serif`
                  ctx.fillStyle = 'rgba(255,255,255,0.85)'
                  ctx.textAlign = 'center'
                  ctx.fillText(node.label, node.x, node.y + r + fontSize + 1)
                }
              }}
            />
          )}
        </div>

        {/* Panel */}
        <div className="w-56 border-l border-gray-800 flex flex-col bg-gray-900/30">
          {/* Legend */}
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Entity Types</h3>
            <div className="space-y-2">
              {Object.entries(NODE_COLORS)
                .filter(([k]) => k !== 'DEFAULT')
                .map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-gray-400">{type}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Selected node */}
          {selected && (
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Selected</h3>
                <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-gray-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selected.color }} />
                  <span className="font-medium text-sm">{selected.label}</span>
                </div>
                <span className="text-xs text-gray-500">{selected.type}</span>
              </div>
              {nodeNeighbors.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Connections ({nodeNeighbors.length})</p>
                  <div className="space-y-1.5">
                    {nodeNeighbors.map((n, i) => (
                      <div key={i} className="bg-gray-900 rounded-lg px-2.5 py-1.5 text-xs">
                        <p className="text-purple-400 font-medium">{n.label}</p>
                        <p className="text-gray-400">{n.other}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
