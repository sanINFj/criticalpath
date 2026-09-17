import { useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
} from "reactflow"

import "reactflow/dist/style.css"
import "./App.css"

type ComponentNodeData = {
  label: string
  type: string
  value?: string
}

const initialNodes: Node<ComponentNodeData>[] = [
  {
    id: "r1",
    position: { x: 300, y: 180 },
    data: {
      label: "R1",
      type: "resistor",
      value: "1k",
    },
    style: {
      width: 100,
      padding: 12,
      border: "2px solid #444",
      borderRadius: 6,
      background: "#ffffff",
      textAlign: "center",
    },
  },
]

const initialEdges: Edge[] = []

function App() {
  const [nodes, setNodes] = useState<Node<ComponentNodeData>[]>(
    initialNodes,
  )

  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  const [selectedNode, setSelectedNode] =
    useState<Node<ComponentNodeData> | null>(null)

  const addResistor = () => {
    const id = `R${nodes.length + 1}`

    const newNode: Node<ComponentNodeData> = {
      id,
      position: {
        x: 200 + nodes.length * 30,
        y: 100 + nodes.length * 30,
      },
      data: {
        label: id,
        type: "resistor",
        value: "1k",
      },
      style: {
        width: 100,
        padding: 12,
        border: "2px solid #444",
        borderRadius: 6,
        background: "#ffffff",
        textAlign: "center",
      },
    }

    setNodes((current) => [...current, newNode])
  }

  return (
    <div className="app">
      {/* Top toolbar */}
      <header className="topbar">
        <div className="logo">CriticalPath</div>

        <nav>
          <button>File</button>
          <button>Edit</button>
          <button>Simulation</button>
          <button>Analysis</button>
          <button>AI</button>
        </nav>

        <div className="toolbar-actions">
          <button className="run-button">▶ Run</button>
        </div>
      </header>

      {/* Main workspace */}
      <main className="workspace">
        {/* Component palette */}
        <aside className="left-panel">
          <h3>Components</h3>

          <button onClick={addResistor}>
            + Resistor
          </button>

          <button>+ Capacitor</button>
          <button>+ Inductor</button>
          <button>+ Voltage Source</button>
          <button>+ Current Source</button>
          <button>+ Diode</button>
          <button>+ Transistor</button>
          <button>+ Op-Amp</button>
          <button>+ Logic Gate</button>
          <button>+ Ground</button>
        </aside>

        {/* Schematic canvas */}
        <section className="canvas-area">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(_, node) => {
                setSelectedNode(node)
              }}
              onNodesChange={(changes) => {
                setNodes((current) =>
                  applyNodeChanges(changes, current),
                )
              }}
              onEdgesChange={(changes) => {
                setEdges((current) =>
                  applyEdgeChanges(changes, current),
                )
              }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </ReactFlowProvider>
        </section>

        {/* Properties panel */}
        <aside className="right-panel">
          <h3>Properties</h3>

          {selectedNode ? (
            <div className="properties">
              <label>Component</label>

              <input
                value={selectedNode.data.label}
                readOnly
              />

              <label>Type</label>

              <input
                value={selectedNode.data.type}
                readOnly
              />

              <label>Value</label>

              <input
                value={selectedNode.data.value ?? ""}
                readOnly
              />
            </div>
          ) : (
            <p>Select a component.</p>
          )}
        </aside>
      </main>

      {/* Status bar */}
      <footer className="statusbar">
        <span>Simulation: Ready</span>

        <span>
          Components: {nodes.length}
        </span>

        <span>
          Connections: {edges.length}
        </span>
      </footer>
    </div>
  )
}

export default App
