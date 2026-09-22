import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

export default function JunctionNode({ selected, isConnectable }: NodeProps) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: selected ? "#2563eb" : "#1f2937",
        boxShadow: selected
          ? "0 0 0 2px #93c5fd"
          : "none",
        position: "relative",
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      {/* 4 Handles centered on the solder dot */}
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        isConnectable={isConnectable}
        style={{
          opacity: 0,
          width: 8,
          height: 8,
          top: 4,
          left: 4,
          transform: "translate(-50%, -50%)",
          pointerEvents: isConnectable ? "all" : "none",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={isConnectable}
        style={{
          opacity: 0,
          width: 8,
          height: 8,
          top: 4,
          left: 4,
          transform: "translate(-50%, -50%)",
          pointerEvents: isConnectable ? "all" : "none",
        }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        isConnectable={isConnectable}
        style={{
          opacity: 0,
          width: 8,
          height: 8,
          top: 4,
          left: 4,
          transform: "translate(-50%, -50%)",
          pointerEvents: isConnectable ? "all" : "none",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={isConnectable}
        style={{
          opacity: 0,
          width: 8,
          height: 8,
          top: 4,
          left: 4,
          transform: "translate(-50%, -50%)",
          pointerEvents: isConnectable ? "all" : "none",
        }}
      />
    </div>
  )
}
