import { useCallback, useState } from "react"

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
} from "reactflow"

import "reactflow/dist/style.css"
import "./App.css"

import ResistorNode from "./components/ResistorNode"

type ComponentNodeData = {
  label: string
  type: string
  value?: string
}

const nodeTypes = {
  resistor: ResistorNode,
}

const initialNodes: Node<ComponentNodeData>[] = [
  {
    id: "r1",
    type: "resistor",
    position: {
      x: 300,
      y: 180,
    },
    data: {
      label: "R1",
      type: "resistor",
      value: "1k",
    },
  },
]

const initialEdges: Edge[] = []

function App() {
  const [nodes, setNodes] =
    useState<Node<ComponentNodeData>[]>(initialNodes)

  const [edges, setEdges] =
    useState<Edge[]>(initialEdges)

  const [selectedNode, setSelectedNode] =
    useState<Node<ComponentNodeData> | null>(null)

  const onConnect = useCallback((connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          animated: false,
        },
        currentEdges,
      ),
    )
  }, [])

  const addResistor = () => {
    const resistorNumber =
      nodes.filter((node) => node.type === "resistor").length + 1

    const id = `r${resistorNumber}`

    const newNode: Node<ComponentNodeData> = {
      id,
      type: "resistor",
      position: {
        x: 200 + nodes.length * 40,
        y: 100 + nodes.length * 40,
      },
      data: {
        label: `R${resistorNumber}`,
        type: "resistor",
        value: "1k",
      },
    }

    setNodes((currentNodes) => [
      ...currentNodes,
      newNode,
    ])
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          CriticalPath
        </div>

        <nav>
          <button>File</button>
          <button>Edit</button>
          <button>Simulation</button>
          <button>Analysis</button>
          <button>AI</button>
        </nav>

        <div className="toolbar-actions">
          <button className="run-button">
            ▶ Run
          </button>
        </div>
      </header>

      <main className="workspace">
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

        <section className="canvas-area">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                setSelectedNode(node)
              }}
              onNodesChange={(changes) => {
                setNodes((current) =>
                  applyNodeChanges(
                    changes,
                    current,
                  ),
                )
              }}
              onEdgesChange={(changes) => {
                setEdges((current) =>
                  applyEdgeChanges(
                    changes,
                    current,
                  ),
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
                value={
                  selectedNode.data.value ?? ""
                }
                readOnly
              />
            </div>
          ) : (
            <p>Select a component.</p>
          )}
        </aside>
      </main>

      <footer className="statusbar">
        <span>
          Simulation: Ready
        </span>

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
