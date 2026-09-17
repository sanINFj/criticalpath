import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

export type SchematicComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "voltage-source"
  | "current-source"
  | "diode"
  | "ground"

export interface SchematicNodeData {
  label: string
  type: SchematicComponentType
  value?: string
  rotation?: number
}

function ResistorSymbol() {
  return (
    <svg
      width="100"
      height="50"
      viewBox="0 0 100 50"
    >
      <line
        x1="0"
        y1="25"
        x2="20"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <polyline
        points="20,25 27,12 34,38 41,12 48,38 55,12 62,38 69,12 76,38 83,25"
        fill="none"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="83"
        y1="25"
        x2="100"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function CapacitorSymbol() {
  return (
    <svg
      width="100"
      height="50"
      viewBox="0 0 100 50"
    >
      <line
        x1="0"
        y1="25"
        x2="42"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="42"
        y1="10"
        x2="42"
        y2="40"
        stroke="black"
        strokeWidth="3"
      />

      <line
        x1="58"
        y1="10"
        x2="58"
        y2="40"
        stroke="black"
        strokeWidth="3"
      />

      <line
        x1="58"
        y1="25"
        x2="100"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function InductorSymbol() {
  return (
    <svg
      width="100"
      height="50"
      viewBox="0 0 100 50"
    >
      <line
        x1="0"
        y1="25"
        x2="20"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <path
        d="
          M20 25
          C20 5, 35 5, 35 25
          C35 5, 50 5, 50 25
          C50 5, 65 5, 65 25
          C65 5, 80 5, 80 25
        "
        fill="none"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="80"
        y1="25"
        x2="100"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function VoltageSourceSymbol() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
    >
      <line
        x1="0"
        y1="40"
        x2="15"
        y2="40"
        stroke="black"
        strokeWidth="2"
      />

      <circle
        cx="40"
        cy="40"
        r="25"
        fill="white"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="65"
        y1="40"
        x2="80"
        y2="40"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="40"
        y1="25"
        x2="40"
        y2="35"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="35"
        y1="30"
        x2="45"
        y2="30"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="35"
        y1="50"
        x2="45"
        y2="50"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function CurrentSourceSymbol() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
    >
      <line
        x1="0"
        y1="40"
        x2="15"
        y2="40"
        stroke="black"
        strokeWidth="2"
      />

      <circle
        cx="40"
        cy="40"
        r="25"
        fill="white"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="65"
        y1="40"
        x2="80"
        y2="40"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="40"
        y1="55"
        x2="40"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <polyline
        points="35,32 40,25 45,32"
        fill="none"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function DiodeSymbol() {
  return (
    <svg
      width="100"
      height="50"
      viewBox="0 0 100 50"
    >
      <line
        x1="0"
        y1="25"
        x2="30"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <polygon
        points="30,10 30,40 65,25"
        fill="white"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="65"
        y1="10"
        x2="65"
        y2="40"
        stroke="black"
        strokeWidth="3"
      />

      <line
        x1="65"
        y1="25"
        x2="100"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  )
}

function GroundSymbol() {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 60 60"
    >
      <line
        x1="30"
        y1="0"
        x2="30"
        y2="25"
        stroke="black"
        strokeWidth="2"
      />

      <line
        x1="10"
        y1="25"
        x2="50"
        y2="25"
        stroke="black"
        strokeWidth="3"
      />

      <line
        x1="17"
        y1="32"
        x2="43"
        y2="32"
        stroke="black"
        strokeWidth="3"
      />

      <line
        x1="24"
        y1="39"
        x2="36"
        y2="39"
        stroke="black"
        strokeWidth="3"
      />
    </svg>
  )
}

function getSymbol(type: SchematicComponentType) {
  switch (type) {
    case "resistor":
      return <ResistorSymbol />

    case "capacitor":
      return <CapacitorSymbol />

    case "inductor":
      return <InductorSymbol />

    case "voltage-source":
      return <VoltageSourceSymbol />

    case "current-source":
      return <CurrentSourceSymbol />

    case "diode":
      return <DiodeSymbol />

    case "ground":
      return <GroundSymbol />

    default:
      return null
  }
}

function SchematicNode({
  data,
  selected,
}: NodeProps<SchematicNodeData>) {
  const rotation = data.rotation ?? 0

  const twoPin =
    data.type !== "ground"

  const isVertical =
    rotation === 90 || rotation === 270

  const handlePositionA = isVertical
    ? Position.Top
    : Position.Left

  const handlePositionB = isVertical
    ? Position.Bottom
    : Position.Right

  return (
    <div
      style={{
        position: "relative",
        minWidth: 120,
        minHeight: 90,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        userSelect: "none",
      }}
    >
      {twoPin && (
        <>
          <Handle
            type="source"
            position={handlePositionA}
            id="pin1"
            style={{
              width: 10,
              height: 10,
              background: selected
                ? "#1976d2"
                : "#111",
              border:
                "2px solid white",
              zIndex: 10,
            }}
          />

          <Handle
            type="target"
            position={handlePositionB}
            id="pin2"
            style={{
              width: 10,
              height: 10,
              background: selected
                ? "#1976d2"
                : "#111",
              border:
                "2px solid white",
              zIndex: 10,
            }}
          />
        </>
      )}

      {!twoPin && (
        <Handle
          type="target"
          position={Position.Top}
          id="pin1"
          style={{
            width: 10,
            height: 10,
            background: selected
              ? "#1976d2"
              : "#111",
            border:
              "2px solid white",
            zIndex: 10,
          }}
        />
      )}

      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {getSymbol(data.type)}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: -22,
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {data.label}
        </div>

        {data.value && (
          <div
            style={{
              fontSize: 11,
              color: "#555",
            }}
          >
            {data.value}
          </div>
        )}
      </div>
    </div>
  )
}

export default SchematicNode
