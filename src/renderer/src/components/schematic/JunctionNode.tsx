import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

function JunctionNode({
  selected,
}: NodeProps) {
  return (
    <div
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: selected
          ? "#1976d2"
          : "#111",

        border: "2px solid white",

        position: "relative",

        boxSizing: "border-box",
      }}
    >
      {/* LEFT */}

      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={{
          opacity: 0,
          width: 10,
          height: 10,
        }}
      />

      {/* RIGHT */}

      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          opacity: 0,
          width: 10,
          height: 10,
        }}
      />

      {/* TOP */}

      <Handle
        type="source"
        position={Position.Top}
        id="top"
        style={{
          opacity: 0,
          width: 10,
          height: 10,
        }}
      />

      {/* BOTTOM */}

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          opacity: 0,
          width: 10,
          height: 10,
        }}
      />
    </div>
  )
}

export default JunctionNode
