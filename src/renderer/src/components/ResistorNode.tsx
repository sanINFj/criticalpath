import { Handle, Position, type NodeProps } from "reactflow"

type ResistorNodeData = {
  label: string
  type: string
  value?: string
}

function ResistorNode({ data, selected }: NodeProps<ResistorNodeData>) {
  return (
    <div
      style={{
        width: 120,
        height: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        border: selected ? "2px solid #1976d2" : "2px solid #444",
        borderRadius: 6,
        background: "#fff",
        boxShadow: selected
          ? "0 0 0 2px rgba(25, 118, 210, 0.2)"
          : "none",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="pin1"
        style={{
          width: 10,
          height: 10,
        }}
      />

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {data.label}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginTop: 4,
          }}
        >
          {data.value ?? "1k"}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="pin2"
        style={{
          width: 10,
          height: 10,
        }}
      />
    </div>
  )
}

export default ResistorNode
