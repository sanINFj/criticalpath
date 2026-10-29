import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

export default function JunctionNode({ data, selected, isConnectable }: NodeProps<{ showDot?: boolean }>) {
  const showDot = Boolean(data?.showDot)

  return (
    <div
      className="schematic-node-junction"
      data-comp-type="junction"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: showDot ? (selected ? "#2563eb" : "#1f2937") : "transparent",
        boxShadow: selected
          ? "0 0 0 2px #93c5fd"
          : "none",
        position: "relative",
        boxSizing: "border-box",
        pointerEvents: showDot || selected ? "all" : "none",
      }}
    >
      {/* 4 Target Handles centered on the solder dot */}
      <Handle
        type="target"
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
        type="target"
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
        type="target"
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
        type="target"
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

      {/* 4 Source Handles centered on the solder dot */}
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
