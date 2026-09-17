import { useCallback, useEffect, useState } from "react"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from "reactflow"

import "reactflow/dist/style.css"

import SchematicNode from "./components/schematic/SchematicNode"
import JunctionNode from "./components/schematic/JunctionNode"

import "./assets/main.css"

type SchematicComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "voltage-source"
  | "current-source"
  | "diode"
  | "ground"

interface SchematicNodeData {
  label: string
  type: SchematicComponentType
  value?: string
  rotation?: number
}

const nodeTypes = {
  schematic: SchematicNode,
  junction: JunctionNode,
}

const initialNodes: Node<SchematicNodeData>[] = [
  {
    id: "R1",
    type: "schematic",
    position: {
      x: 350,
      y: 250,
    },
    data: {
      label: "R1",
      type: "resistor",
      value: "1k",
      rotation: 0,
    },
  },
]

const initialEdges: Edge[] = []

function App() {
  const [nodes, setNodes] =
    useState<Node<SchematicNodeData>[]>(initialNodes)

  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const [, setComponentCounter] = useState({
    resistor: 1,
    capacitor: 0,
    inductor: 0,
    "voltage-source": 0,
    "current-source": 0,
    diode: 0,
    ground: 0,
    junction: 0,
  })

  /*
   * ---------------------------------------------------------
   * NODE CHANGES
   * ---------------------------------------------------------
   */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((currentNodes) =>
        applyNodeChanges(changes, currentNodes),
      )
    },
    [],
  )

  /*
   * ---------------------------------------------------------
   * EDGE CHANGES
   * ---------------------------------------------------------
   */

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((currentEdges) =>
        applyEdgeChanges(changes, currentEdges),
      )
    },
    [],
  )

  /*
   * ---------------------------------------------------------
   * CREATE CONNECTION
   * ---------------------------------------------------------
   */

  const onConnect = useCallback((connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          type: "step",
          animated: false,
          style: {
            strokeWidth: 2,
          },
        },
        currentEdges,
      ),
    )
  }, [])

  /*
   * ---------------------------------------------------------
   * NODE CLICK
   * ---------------------------------------------------------
   */

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
    },
    [],
  )

  /*
   * ---------------------------------------------------------
   * CANVAS CLICK
   * ---------------------------------------------------------
   */

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  /*
   * ---------------------------------------------------------
   * ADD COMPONENT
   * ---------------------------------------------------------
   */

  const addComponent = useCallback(
    (type: SchematicComponentType) => {
      setComponentCounter((current) => {
        const nextNumber = current[type] + 1

        let prefix = "X"

        switch (type) {
          case "resistor":
            prefix = "R"
            break

          case "capacitor":
            prefix = "C"
            break

          case "inductor":
            prefix = "L"
            break

          case "voltage-source":
            prefix = "V"
            break

          case "current-source":
            prefix = "I"
            break

          case "diode":
            prefix = "D"
            break

          case "ground":
            prefix = "GND"
            break
        }

        const id =
          type === "ground"
            ? `GND${nextNumber}`
            : `${prefix}${nextNumber}`

        const newNode: Node<SchematicNodeData> = {
          id,
          type: "schematic",
          position: {
            x: 200 + Math.random() * 500,
            y: 150 + Math.random() * 350,
          },
          data: {
            label: id,
            type,
            value:
              type === "resistor"
                ? "1k"
                : type === "capacitor"
                  ? "1u"
                  : type === "inductor"
                    ? "1m"
                    : type === "voltage-source"
                      ? "5V"
                      : type === "current-source"
                        ? "1m"
                        : undefined,
            rotation: 0,
          },
        }

        setNodes((currentNodes) => [
          ...currentNodes,
          newNode,
        ])

        setSelectedNodeId(id)

        return {
          ...current,
          [type]: nextNumber,
        }
      })
    },
    [],
  )

  /*
   * ---------------------------------------------------------
   * ADD JUNCTION
   * ---------------------------------------------------------
   */

  const addJunction = useCallback(() => {
    setComponentCounter((current) => {
      const nextNumber = current.junction + 1

      const id = `J${nextNumber}`

      const newNode: Node = {
        id,
        type: "junction",
        position: {
          x: 400 + Math.random() * 300,
          y: 200 + Math.random() * 250,
        },
        data: {},
      }

      setNodes((currentNodes) => [
        ...currentNodes,
        newNode,
      ])

      setSelectedNodeId(id)

      return {
        ...current,
        junction: nextNumber,
      }
    })
  }, [])

  /*
   * ---------------------------------------------------------
   * DELETE SELECTED
   * ---------------------------------------------------------
   */

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) {
      return
    }

    setNodes((currentNodes) =>
      currentNodes.filter(
        (node) => node.id !== selectedNodeId,
      ),
    )

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          edge.source !== selectedNodeId &&
          edge.target !== selectedNodeId,
      ),
    )

    setSelectedNodeId(null)
  }, [selectedNodeId])

  /*
   * ---------------------------------------------------------
   * ROTATE SELECTED
   * ---------------------------------------------------------
   */

  const rotateSelected = useCallback(() => {
    if (!selectedNodeId) {
      return
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId) {
          return node
        }

        const currentRotation =
          node.data?.rotation ?? 0

        const newRotation =
          (currentRotation + 90) % 360

        return {
          ...node,
          data: {
            ...node.data,
            rotation: newRotation,
          },
        }
      }),
    )
  }, [selectedNodeId])

  /*
   * ---------------------------------------------------------
   * KEYBOARD SHORTCUTS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      /*
       * Do not trigger shortcuts while typing.
       */

      const target = event.target as HTMLElement | null

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return
      }

      /*
       * Delete selected component
       */

      if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        deleteSelected()
      }

      /*
       * Rotate selected component
       */

      if (
        event.key.toLowerCase() === "r"
      ) {
        rotateSelected()
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    )

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      )
    }
  }, [
    deleteSelected,
    rotateSelected,
  ])

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <div className="app">
      {/* =====================================================
          TOP TOOLBAR
          ===================================================== */}

      <header className="toolbar">
        <div className="toolbar-title">
          CriticalPath
        </div>

        <div className="toolbar-menu">
          <button>File</button>
          <button>Edit</button>
          <button>Simulation</button>
          <button>Analysis</button>
          <button>AI</button>
        </div>

        <div className="toolbar-spacer" />

        <button className="run-button">
          Run
        </button>
      </header>

      {/* =====================================================
          MAIN WORKSPACE
          ===================================================== */}

      <div className="workspace">

        {/* ===================================================
            LEFT COMPONENT PALETTE
            =================================================== */}

        <aside className="left-panel">

          <div className="panel-title">
            Components
          </div>

          <div className="component-list">

            <button
              onClick={() =>
                addComponent("resistor")
              }
            >
              <span>R</span>
              Resistor
            </button>

            <button
              onClick={() =>
                addComponent("capacitor")
              }
            >
              <span>C</span>
              Capacitor
            </button>

            <button
              onClick={() =>
                addComponent("inductor")
              }
            >
              <span>L</span>
              Inductor
            </button>

            <button
              onClick={() =>
                addComponent("voltage-source")
              }
            >
              <span>V</span>
              Voltage Source
            </button>

            <button
              onClick={() =>
                addComponent("current-source")
              }
            >
              <span>I</span>
              Current Source
            </button>

            <button
              onClick={() =>
                addComponent("diode")
              }
            >
              <span>D</span>
              Diode
            </button>

            <button
              onClick={() =>
                addComponent("ground")
              }
            >
              <span>G</span>
              Ground
            </button>

            <button
              onClick={addJunction}
            >
              <span>●</span>
              Junction
            </button>

          </div>

          <div className="panel-help">
            <div>
              <strong>Mouse</strong>
            </div>

            <div>
              Drag components
            </div>

            <div>
              Drag from pin to pin
            </div>

            <div>
              Delete = remove
            </div>

            <div>
              R = rotate
            </div>
          </div>

        </aside>

        {/* ===================================================
            SCHEMATIC CANVAS
            =================================================== */}

        <main className="canvas">

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}

            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}

            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}

            /*
             * Allow connections between handles
             * without enforcing source/target direction.
             */

            connectionMode={ConnectionMode.Loose}

            /*
             * Use orthogonal stepped wires.
             */

            connectionLineType={
              ConnectionLineType.Step
            }

            defaultEdgeOptions={{
              type: "step",
              animated: false,
              style: {
                strokeWidth: 2,
              },
            }}

            /*
             * Snap components to a 20x20 grid.
             */

            snapToGrid
            snapGrid={[20, 20]}

            fitView

            deleteKeyCode={null}

            minZoom={0.2}
            maxZoom={2.5}
          >

            <Background
              gap={20}
              size={1}
            />

            <Controls />

            <MiniMap />

          </ReactFlow>

        </main>

        {/* ===================================================
            RIGHT PROPERTIES PANEL
            =================================================== */}

        <aside className="right-panel">

          <div className="panel-title">
            Properties
          </div>

          {selectedNodeId ? (
            <div className="properties">

              <div className="property-row">
                <span>ID</span>
                <strong>
                  {selectedNodeId}
                </strong>
              </div>

              {(() => {
                const selectedNode =
                  nodes.find(
                    (node) =>
                      node.id ===
                      selectedNodeId,
                  )

                if (
                  !selectedNode ||
                  selectedNode.type !==
                    "schematic"
                ) {
                  return null
                }

                return (
                  <>
                    <div className="property-row">
                      <span>Type</span>

                      <strong>
                        {
                          selectedNode.data
                            .type
                        }
                      </strong>
                    </div>

                    <div className="property-row">
                      <span>Value</span>

                      <strong>
                        {
                          selectedNode.data
                            .value ?? "-"
                        }
                      </strong>
                    </div>

                    <div className="property-row">
                      <span>Rotation</span>

                      <strong>
                        {
                          selectedNode.data
                            .rotation ?? 0
                        }
                        °
                      </strong>
                    </div>
                  </>
                )
              })()}

              <button
                className="property-action"
                onClick={rotateSelected}
              >
                Rotate 90°
              </button>

              <button
                className="property-delete"
                onClick={deleteSelected}
              >
                Delete
              </button>

            </div>
          ) : (
            <div className="no-selection">
              Select a component
            </div>
          )}

        </aside>

      </div>

      {/* =====================================================
          STATUS BAR
          ===================================================== */}

      <footer className="status-bar">

        <span>
          Components: {nodes.length}
        </span>

        <span>
          Wires: {edges.length}
        </span>

        <span>
          Grid: 20 × 20
        </span>

        <span>
          {selectedNodeId
            ? `Selected: ${selectedNodeId}`
            : "No selection"}
        </span>

      </footer>

    </div>
  )
}

export default App
