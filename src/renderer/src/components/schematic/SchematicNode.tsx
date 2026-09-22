import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

export type SchematicComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "voltage-source"
  | "current-source"
  | "ground"
  | "vcc"
  | "generic"

export interface SchematicNodeData {
  label: string
  type: SchematicComponentType
  value?: string
  rotation?: number
}

/* ============================================================
   PRECISE ENGINEERING SCHEMATIC SYMBOLS (LTspice Style)
   All symbols: width 120, height 80, horizontal lead at y=40,
   vertical lead at x=60. Connects seamlessly with 20px grid.
   ============================================================ */

function ResistorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="30" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polyline
        points="30,40 35,26 45,54 55,26 65,54 75,26 85,54 90,40"
        fill="none"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="90" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CapacitorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="54" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="54" y1="24" x2="54" y2="56" stroke="#1f2937" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="66" y1="24" x2="66" y2="56" stroke="#1f2937" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="66" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function InductorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="30" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M30,40 C30,22 45,22 45,40 C45,22 60,22 60,40 C60,22 75,22 75,40 C75,22 90,22 90,40"
        fill="none"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line x1="90" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function DiodeSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="50" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="50,26 50,54 70,40" fill="#1f2937" stroke="#1f2937" strokeWidth="1" />
      <line x1="70" y1="26" x2="70" y2="54" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
      <line x1="70" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function VoltageSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      {/* Plus / Minus */}
      <line x1="51" y1="40" x2="59" y2="40" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="55" y1="36" x2="55" y2="44" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="64" y1="40" x2="70" y2="40" stroke="#1f2937" strokeWidth="1.5" />
    </svg>
  )
}

function CurrentSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      {/* Arrow */}
      <line x1="50" y1="40" x2="70" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polyline points="65,35 70,40 65,45" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GroundSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="60" y1="0" x2="60" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="42" y1="40" x2="78" y2="40" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="48" y1="48" x2="72" y2="48" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="54" y1="56" x2="66" y2="56" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function VCCSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="60" y1="40" x2="60" y2="80" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="60,18 46,40 74,40" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function GenericSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="30" y="16" width="60" height="48" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="40" x2="30" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="90" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="44" fontSize="11" fontWeight="700" textAnchor="middle" fill="#1f2937" fontFamily="monospace">IC</text>
    </svg>
  )
}

function renderSymbol(type: SchematicComponentType) {
  switch (type) {
    case "resistor":
      return <ResistorSymbol />
    case "capacitor":
      return <CapacitorSymbol />
    case "inductor":
      return <InductorSymbol />
    case "diode":
      return <DiodeSymbol />
    case "voltage-source":
      return <VoltageSourceSymbol />
    case "current-source":
      return <CurrentSourceSymbol />
    case "ground":
      return <GroundSymbol />
    case "vcc":
      return <VCCSymbol />
    case "generic":
    default:
      return <GenericSymbol />
  }
}

export default function SchematicNode({
  data,
  selected,
  isConnectable,
}: NodeProps<SchematicNodeData>) {
  const rotation = data.rotation ?? 0
  const isVertical = rotation === 90 || rotation === 270
  const isSinglePin = data.type === "ground" || data.type === "vcc"

  const handlePosA = isVertical ? Position.Top : Position.Left
  const handlePosB = isVertical ? Position.Bottom : Position.Right

  return (
    <div
      style={{
        position: "relative",
        width: 120,
        height: 80,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        userSelect: "none",
        outline: selected ? "1px dashed #2563eb" : "none",
        borderRadius: 4,
      }}
    >
      {/* Bidirectional Handles locked precisely to (0, 40), (120, 40), (60, 0), (60, 80) */}
      {!isSinglePin ? (
        <>
          <Handle
            type="source"
            position={handlePosA}
            id="pin1"
            isConnectable={isConnectable}
            style={{
              width: 8,
              height: 8,
              top: isVertical ? 0 : 40,
              left: isVertical ? 60 : 0,
              transform: "translate(-50%, -50%)",
              background: selected ? "#2563eb" : "#1f2937",
              border: "1.5px solid #ffffff",
              boxShadow: "0 0 0 1px rgba(31, 41, 55, 0.25)",
              zIndex: 10,
              pointerEvents: isConnectable ? "all" : "none",
            }}
          />
          <Handle
            type="source"
            position={handlePosB}
            id="pin2"
            isConnectable={isConnectable}
            style={{
              width: 8,
              height: 8,
              top: isVertical ? 80 : 40,
              left: isVertical ? 60 : 120,
              transform: "translate(-50%, -50%)",
              background: selected ? "#2563eb" : "#1f2937",
              border: "1.5px solid #ffffff",
              boxShadow: "0 0 0 1px rgba(31, 41, 55, 0.25)",
              zIndex: 10,
              pointerEvents: isConnectable ? "all" : "none",
            }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={data.type === "ground" ? Position.Top : Position.Bottom}
          id="pin1"
          isConnectable={isConnectable}
          style={{
            width: 8,
            height: 8,
            top: data.type === "ground" ? 0 : 80,
            left: 60,
            transform: "translate(-50%, -50%)",
            background: selected ? "#2563eb" : "#1f2937",
            border: "1.5px solid #ffffff",
            boxShadow: "0 0 0 1px rgba(31, 41, 55, 0.25)",
            zIndex: 10,
            pointerEvents: isConnectable ? "all" : "none",
          }}
        />
      )}

      {/* Rotating SVG Vector Graphic */}
      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {renderSymbol(data.type)}
      </div>

      {/* Engineering Designator & Parameter Labels */}
      <div
        style={{
          position: "absolute",
          bottom: -18,
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          textAlign: "center",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#1f2937",
            fontFamily: '"JetBrains Mono", monospace',
            lineHeight: 1.2,
          }}
        >
          {data.label}
        </span>
        {data.value && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#2563eb",
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: 1.2,
            }}
          >
            {data.value}
          </span>
        )}
      </div>
    </div>
  )
}
