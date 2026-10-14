import { useViewport } from "reactflow"
import {
  renderSymbol,
  getComponentPins,
  type SchematicComponentType,
} from "./SchematicNode"

export interface WireDraft {
  isDrawing: boolean
  points: { x: number; y: number }[]
  startPin?: { nodeId: string; handleId?: string }
  bendOrientation: "h" | "v"
}

export interface PlacingComponent {
  type: SchematicComponentType | "junction"
  rotation: number
}

interface CadCrosshairLayerProps {
  activeTool: "select" | "wire" | "junction"
  cursorGridPos: { x: number; y: number }
  isHoveringCanvas: boolean
  wireDraft: WireDraft
  placingComponent?: PlacingComponent | null
}

export default function CadCrosshairLayer({
  activeTool,
  cursorGridPos,
  isHoveringCanvas,
  wireDraft,
  placingComponent,
}: CadCrosshairLayerProps) {
  const { x: vpX, y: vpY, zoom } = useViewport()

  const isPlacing = Boolean(placingComponent)
  if ((activeTool !== "wire" && !isPlacing) || !isHoveringCanvas) {
    return null
  }

  // Convert flow (schematic) coordinates to screen viewport coordinates
  const toScreen = (flowX: number, flowY: number) => ({
    sx: flowX * zoom + vpX,
    sy: flowY * zoom + vpY,
  })

  const { sx: curScreenX, sy: curScreenY } = toScreen(
    cursorGridPos.x,
    cursorGridPos.y,
  )

  // Build live preview path for wire drawing (100% strictly straight orthogonal lines)
  let draftSvgPath = ""
  const committedPointsScreen: { sx: number; sy: number }[] = []

  if (wireDraft.isDrawing && wireDraft.points.length > 0) {
    const rawPts = [...wireDraft.points, cursorGridPos]
    const cleanPts: { x: number; y: number }[] = [rawPts[0]]
    let curOri = wireDraft.bendOrientation

    for (let i = 1; i < rawPts.length; i++) {
      const prev = cleanPts[cleanPts.length - 1]
      const cur = rawPts[i]

      if (prev.x === cur.x && prev.y === cur.y) continue

      if (prev.x === cur.x || prev.y === cur.y) {
        cleanPts.push(cur)
        curOri = prev.x === cur.x ? "v" : "h"
      } else {
        if (curOri === "h") {
          cleanPts.push({ x: cur.x, y: prev.y })
          cleanPts.push(cur)
          curOri = "v"
        } else {
          cleanPts.push({ x: prev.x, y: cur.y })
          cleanPts.push(cur)
          curOri = "h"
        }
      }
    }

    for (let i = 0; i < cleanPts.length; i++) {
      const p = toScreen(cleanPts[i].x, cleanPts[i].y)
      committedPointsScreen.push(p)
      if (i === 0) {
        draftSvgPath += `M ${p.sx} ${p.sy}`
      } else {
        draftSvgPath += ` L ${p.sx} ${p.sy}`
      }
    }
  }

  return (
    <svg
      className="cad-crosshair-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 25,
        overflow: "visible",
      }}
    >
      {/* 1. Full Canvas Crosshair Guides (Subtle LTspice Style) */}
      <line
        x1={0}
        y1={curScreenY}
        x2="100%"
        y2={curScreenY}
        stroke="rgba(100, 116, 139, 0.45)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={curScreenX}
        y1={0}
        x2={curScreenX}
        y2="100%"
        stroke="rgba(100, 116, 139, 0.45)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* 2. Grid Snapped Target Marker */}
      <circle
        cx={curScreenX}
        cy={curScreenY}
        r={5}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.5}
        opacity={0.8}
      />
      <circle
        cx={curScreenX}
        cy={curScreenY}
        r={1.8}
        fill="#2563eb"
      />

      {/* 3. Ghost Component Preview During Placement */}
      {isPlacing && placingComponent && (
        placingComponent.type === "junction" ? (
          <g transform={`translate(${curScreenX}, ${curScreenY})`}>
            <circle
              r={9}
              fill="rgba(37, 99, 235, 0.15)"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <circle r={4} fill="#2563eb" />
            <g transform="translate(0, 24)">
              <rect
                x={-55}
                y={-9}
                width={110}
                height={18}
                rx={9}
                fill="rgba(17, 24, 39, 0.88)"
              />
              <text
                x={0}
                y={4}
                fill="#ffffff"
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                Click to place dot
              </text>
            </g>
          </g>
        ) : (
          <g
            transform={`translate(${curScreenX}, ${curScreenY}) scale(${zoom})`}
            pointerEvents="none"
          >
            <g transform={`rotate(${placingComponent.rotation})`}>
              <g transform="translate(-60, -40)">
                {/* Blueprint highlight box */}
                <rect
                  x={0}
                  y={0}
                  width={120}
                  height={80}
                  rx={4}
                  fill="rgba(37, 99, 235, 0.1)"
                  stroke="#2563eb"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                />
                {/* Component vector graphic */}
                <g opacity={0.85}>
                  {renderSymbol(placingComponent.type as SchematicComponentType)}
                </g>
                {/* Connection lead terminals */}
                {getComponentPins(placingComponent.type as SchematicComponentType).map((pin) => (
                  <circle
                    key={pin.id}
                    cx={pin.x}
                    cy={pin.y}
                    r={4}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            </g>
            {/* Instruction badge below */}
            <g transform="translate(0, 56)">
              <rect
                x={-68}
                y={-10}
                width={136}
                height={20}
                rx={10}
                fill="rgba(17, 24, 39, 0.88)"
              />
              <text
                x={0}
                y={4}
                fill="#ffffff"
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                Click: Place · R: Rotate
              </text>
            </g>
          </g>
        )
      )}

      {/* 4. Live Wire Preview Path */}
      {draftSvgPath && (
        <>
          <path
            d={draftSvgPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Committed Waypoint Markers */}
          {committedPointsScreen.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.sx}
              cy={pt.sy}
              r={3.5}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
          ))}
        </>
      )}
    </svg>
  )
}
