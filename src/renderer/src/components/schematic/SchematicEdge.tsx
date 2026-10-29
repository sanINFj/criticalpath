import type { CSSProperties } from "react"
import {
  BaseEdge,
  type EdgeProps,
  type Position,
  type ConnectionLineComponentProps,
  useViewport,
} from "reactflow"

export type WireBendMode =
  | "auto"
  | "horizontal-step"
  | "vertical-step"
  | "corner-hv"
  | "corner-vh"

export interface SchematicEdgeData {
  bendMode?: WireBendMode
  offset?: number
  waypoints?: { x: number; y: number }[]
  onOffsetChange?: (
    edgeId: string,
    newOffset: number,
    newBendMode?: WireBendMode,
  ) => void
  onWaypointsChange?: (
    edgeId: string,
    newWaypoints: { x: number; y: number }[],
  ) => void
  isHighlighted?: boolean
  netName?: string
  ercSeverity?: "error" | "warning"
}

export interface WireSegmentDef {
  x1: number
  y1: number
  x2: number
  y2: number
  type: "h" | "v"
  index: number
}

function simplifyOrthogonalPoints(
  points: { x: number; y: number }[],
): { x: number; y: number }[] {
  if (points.length <= 2) return points
  const res: { x: number; y: number }[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const cur = points[i]
    const prev = res[res.length - 1]
    if (cur.x === prev.x && cur.y === prev.y) continue

    if (res.length >= 2) {
      const prevPrev = res[res.length - 2]
      if (
        (prevPrev.x === prev.x && prev.x === cur.x) ||
        (prevPrev.y === prev.y && prev.y === cur.y)
      ) {
        res[res.length - 1] = cur
        continue
      }
    }
    res.push(cur)
  }
  return res
}

export function getOrthogonalWirePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sourcePos?: Position,
  targetPos?: Position,
  bendMode: WireBendMode = "auto",
  customOffset?: number,
  waypoints?: { x: number; y: number }[],
): [string, number, number, "h" | "v", WireSegmentDef[], { x: number; y: number }[]] {
  // Always snap endpoints to exact 20px grid pitch to guarantee zero half-pitch drift
  const sx = Math.round(x1 / 20) * 20
  const sy = Math.round(y1 / 20) * 20
  const tx = Math.round(x2 / 20) * 20
  const ty = Math.round(y2 / 20) * 20

  // If custom multi-point waypoints are defined
  if (waypoints && waypoints.length > 0) {
    const rawPts = [
      { x: sx, y: sy },
      ...waypoints.map((p) => ({
        x: Math.round(p.x / 20) * 20,
        y: Math.round(p.y / 20) * 20,
      })),
      { x: tx, y: ty },
    ]
    const cleanPts: { x: number; y: number }[] = [rawPts[0]]
    let currentOrientation: "h" | "v" =
      sourcePos === "top" || sourcePos === "bottom" ? "v" : "h"

    for (let i = 1; i < rawPts.length; i++) {
      const prev = cleanPts[cleanPts.length - 1]
      const cur = rawPts[i]

      if (prev.x === cur.x && prev.y === cur.y) continue

      if (prev.x === cur.x || prev.y === cur.y) {
        cleanPts.push(cur)
        currentOrientation = prev.x === cur.x ? "v" : "h"
      } else {
        // Enforce 100% strictly orthogonal 90-degree straight bend (zero slant)
        if (currentOrientation === "h") {
          cleanPts.push({ x: cur.x, y: prev.y })
          cleanPts.push(cur)
          currentOrientation = "v"
        } else {
          cleanPts.push({ x: prev.x, y: cur.y })
          cleanPts.push(cur)
          currentOrientation = "h"
        }
      }
    }

    const simplifiedPts = simplifyOrthogonalPoints(cleanPts)
    let path = `M ${simplifiedPts[0].x} ${simplifiedPts[0].y}`
    const segments: WireSegmentDef[] = []
    for (let i = 1; i < simplifiedPts.length; i++) {
      const pPrev = simplifiedPts[i - 1]
      const pCur = simplifiedPts[i]
      path += ` L ${pCur.x} ${pCur.y}`
      const isVert = pPrev.x === pCur.x
      segments.push({
        x1: pPrev.x,
        y1: pPrev.y,
        x2: pCur.x,
        y2: pCur.y,
        type: isVert ? "v" : "h",
        index: i - 1,
      })
    }

    const midIdx = Math.floor(segments.length / 2)
    const midSeg = segments[midIdx]
    const labelX = midSeg ? (midSeg.x1 + midSeg.x2) / 2 : (sx + tx) / 2
    const labelY = midSeg ? (midSeg.y1 + midSeg.y2) / 2 : (sy + ty) / 2
    const orientation = midSeg?.type === "v" ? "h" : "v"
    return [path, labelX, labelY, orientation, segments, simplifiedPts]
  }

  // 1. Direct straight line if on the exact same axis
  if (sx === tx || sy === ty) {
    const path = `M ${sx} ${sy} L ${tx} ${ty}`
    const segType = sx === tx ? "v" : "h"
    const pts = [{ x: sx, y: sy }, { x: tx, y: ty }]
    return [
      path,
      (sx + tx) / 2,
      (sy + ty) / 2,
      segType,
      [{ x1: sx, y1: sy, x2: tx, y2: ty, type: segType, index: 0 }],
      pts,
    ]
  }

  const isSourceHorizontal =
    sourcePos === "left" || sourcePos === "right"
  const isTargetHorizontal =
    targetPos === "left" || targetPos === "right"

  const isSourceVertical =
    sourcePos === "top" || sourcePos === "bottom"
  const isTargetVertical =
    targetPos === "top" || targetPos === "bottom"

  const rawMidX = (sx + tx) / 2
  const rawMidY = (sy + ty) / 2

  const midX =
    customOffset !== undefined
      ? customOffset
      : Math.round(rawMidX / 20) * 20

  const midY =
    customOffset !== undefined
      ? customOffset
      : Math.round(rawMidY / 20) * 20

  let effectiveMode = bendMode

  // Smart LTspice EDA Pipeline: naturally route according to terminal exit vectors
  if (effectiveMode === "auto") {
    if (isSourceHorizontal && isTargetVertical) {
      effectiveMode = "corner-hv"
    } else if (isSourceVertical && isTargetHorizontal) {
      effectiveMode = "corner-vh"
    } else if (isSourceVertical && isTargetVertical) {
      effectiveMode = "vertical-step"
    } else {
      effectiveMode = "horizontal-step"
    }
  }

  let path = ""
  let labelX = midX
  let labelY = midY
  let orientation: "h" | "v" = "h"
  const segments: WireSegmentDef[] = []
  let fullPoints: { x: number; y: number }[] = []

  switch (effectiveMode) {
    case "corner-hv":
      fullPoints = [{ x: sx, y: sy }, { x: tx, y: sy }, { x: tx, y: ty }]
      path = `M ${sx} ${sy} L ${tx} ${sy} L ${tx} ${ty}`
      labelX = tx
      labelY = (sy + ty) / 2
      orientation = "h"
      segments.push({ x1: sx, y1: sy, x2: tx, y2: sy, type: "h", index: 0 })
      segments.push({ x1: tx, y1: sy, x2: tx, y2: ty, type: "v", index: 1 })
      break

    case "corner-vh":
      fullPoints = [{ x: sx, y: sy }, { x: sx, y: ty }, { x: tx, y: ty }]
      path = `M ${sx} ${sy} L ${sx} ${ty} L ${tx} ${ty}`
      labelX = (sx + tx) / 2
      labelY = ty
      orientation = "v"
      segments.push({ x1: sx, y1: sy, x2: sx, y2: ty, type: "v", index: 0 })
      segments.push({ x1: sx, y1: ty, x2: tx, y2: ty, type: "h", index: 1 })
      break

    case "vertical-step":
      fullPoints = [
        { x: sx, y: sy },
        { x: sx, y: midY },
        { x: tx, y: midY },
        { x: tx, y: ty },
      ]
      path = `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
      labelX = (sx + tx) / 2
      labelY = midY
      orientation = "v"
      segments.push({ x1: sx, y1: sy, x2: sx, y2: midY, type: "v", index: 0 })
      segments.push({ x1: sx, y1: midY, x2: tx, y2: midY, type: "h", index: 1 })
      segments.push({ x1: tx, y1: midY, x2: tx, y2: ty, type: "v", index: 2 })
      break

    case "horizontal-step":
    default:
      fullPoints = [
        { x: sx, y: sy },
        { x: midX, y: sy },
        { x: midX, y: ty },
        { x: tx, y: ty },
      ]
      path = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`
      labelX = midX
      labelY = (sy + ty) / 2
      orientation = "h"
      segments.push({ x1: sx, y1: sy, x2: midX, y2: sy, type: "h", index: 0 })
      segments.push({ x1: midX, y1: sy, x2: midX, y2: ty, type: "v", index: 1 })
      segments.push({ x1: midX, y1: ty, x2: tx, y2: ty, type: "h", index: 2 })
      break
  }

  return [path, labelX, labelY, orientation, segments, fullPoints]
}

/* ============================================================
   LTSPICE LIVE CONNECTION LINE PREVIEW (Snapped to 20px Grid)
   ============================================================ */
export function SchematicConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
}: ConnectionLineComponentProps) {
  const snapFromX = Math.round(fromX / 20) * 20
  const snapFromY = Math.round(fromY / 20) * 20
  const snapToX = Math.round(toX / 20) * 20
  const snapToY = Math.round(toY / 20) * 20

  const isHorizontalFirst =
    fromPosition === "left" ||
    fromPosition === "right" ||
    (fromPosition !== "top" &&
      fromPosition !== "bottom" &&
      Math.abs(snapToX - snapFromX) >= Math.abs(snapToY - snapFromY))

  let path = ""
  if (snapToX === snapFromX || snapToY === snapFromY) {
    path = `M ${snapFromX} ${snapFromY} L ${snapToX} ${snapToY}`
  } else if (isHorizontalFirst) {
    path = `M ${snapFromX} ${snapFromY} L ${snapToX} ${snapFromY} L ${snapToX} ${snapToY}`
  } else {
    path = `M ${snapFromX} ${snapFromY} L ${snapFromX} ${snapToY} L ${snapToX} ${snapToY}`
  }

  return (
    <g>
      <path
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={path}
      />
      <circle
        cx={snapToX}
        cy={snapToY}
        r={3}
        fill="#2563eb"
        stroke="#ffffff"
        strokeWidth={1}
      />
    </g>
  )
}

export default function SchematicEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style,
}: EdgeProps<SchematicEdgeData>) {
  const { zoom } = useViewport()
  const bendMode = data?.bendMode ?? "auto"
  const offset = data?.offset
  const waypoints = data?.waypoints
  const onWaypointsChange = data?.onWaypointsChange
  const onOffsetChange = data?.onOffsetChange

  const [edgePath, labelX, labelY, orientation, segments, fullPoints] =
    getOrthogonalWirePath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      bendMode,
      offset,
      waypoints,
    )

  const isHighlighted = Boolean(data?.isHighlighted)
  const isErcError = data?.ercSeverity === "error"
  const isErcWarning = data?.ercSeverity === "warning"

  const strokeColor = isHighlighted
    ? "#0284c7"
    : isErcError
    ? "#ef4444"
    : isErcWarning
    ? "#f59e0b"
    : selected
    ? "#2563eb"
    : (style?.stroke as string) || "#1f2937"

  const strokeWidth = isHighlighted ? 3 : isErcError ? 2.5 : selected ? 2.5 : 1.8

  const edgeStyle: CSSProperties = {
    ...style,
    stroke: strokeColor,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }

  const startSegmentDrag = (
    e: React.MouseEvent,
    segIndex: number,
    segType: "h" | "v",
  ) => {
    if (!onWaypointsChange && !onOffsetChange) return
    e.stopPropagation()
    e.preventDefault()

    const startClientX = e.clientX
    const startClientY = e.clientY
    const basePoints = fullPoints.map((p) => ({ ...p }))
    const curSeg = segments.find((s) => s.index === segIndex)
    const initialCoord = segType === "v" ? (curSeg?.x1 ?? 0) : (curSeg?.y1 ?? 0)

    const handleMouseMove = (moveEv: MouseEvent) => {
      const deltaX = (moveEv.clientX - startClientX) / zoom
      const deltaY = (moveEv.clientY - startClientY) / zoom
      const delta = segType === "v" ? deltaX : deltaY
      const newPos = Math.round((initialCoord + delta) / 20) * 20

      if (onWaypointsChange) {
        const pts = basePoints.map((p) => ({ ...p }))
        const numPts = pts.length
        if (numPts < 2) return

        if (segType === "v") {
          // Vertical segment moves horizontally (left / right)
          if (segIndex === 0) {
            // First segment: keep source fixed, insert horizontal bend
            const updated = [
              pts[0],
              { x: pts[0].x, y: pts[0].y },
              { x: newPos, y: pts[0].y },
              { x: newPos, y: pts[1].y },
              ...pts.slice(2),
            ]
            const simplified = simplifyOrthogonalPoints(updated)
            onWaypointsChange(id, simplified.slice(1, -1))
          } else if (segIndex === segments.length - 1) {
            // Last segment: keep target fixed
            const last = pts[numPts - 1]
            const updated = [
              ...pts.slice(0, -2),
              { x: newPos, y: pts[numPts - 2].y },
              { x: newPos, y: last.y },
              last,
            ]
            const simplified = simplifyOrthogonalPoints(updated)
            onWaypointsChange(id, simplified.slice(1, -1))
          } else {
            // Intermediate segment: shift both endpoints
            pts[segIndex].x = newPos
            pts[segIndex + 1].x = newPos
            const simplified = simplifyOrthogonalPoints(pts)
            onWaypointsChange(id, simplified.slice(1, -1))
          }
        } else {
          // Horizontal segment moves vertically (up / down)
          if (segIndex === 0) {
            // First segment: keep source fixed, insert vertical bend
            const updated = [
              pts[0],
              { x: pts[0].x, y: newPos },
              { x: pts[1].x, y: newPos },
              ...pts.slice(2),
            ]
            const simplified = simplifyOrthogonalPoints(updated)
            onWaypointsChange(id, simplified.slice(1, -1))
          } else if (segIndex === segments.length - 1) {
            // Last segment: keep target fixed
            const last = pts[numPts - 1]
            const updated = [
              ...pts.slice(0, -2),
              { x: pts[numPts - 2].x, y: newPos },
              { x: last.x, y: newPos },
              last,
            ]
            const simplified = simplifyOrthogonalPoints(updated)
            onWaypointsChange(id, simplified.slice(1, -1))
          } else {
            // Intermediate segment: shift both endpoints
            pts[segIndex].y = newPos
            pts[segIndex + 1].y = newPos
            const simplified = simplifyOrthogonalPoints(pts)
            onWaypointsChange(id, simplified.slice(1, -1))
          }
        }
      } else if (onOffsetChange) {
        onOffsetChange(
          id,
          newPos,
          segType === "v" ? "horizontal-step" : "vertical-step",
        )
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  return (
    <>
      {/* Glowing aura when net is highlighted */}
      {isHighlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(2, 132, 199, 0.4)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Warning aura for ERC error */}
      {isErcError && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(239, 68, 68, 0.35)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      <BaseEdge id={id} path={edgePath} style={edgeStyle} />

      {/* Invisible wide hit-areas on segments for easy grabbing & dragging */}
      {segments.map((seg, idx) => {
        const isVert = seg.type === "v"
        return (
          <line
            key={`hit-${idx}`}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke="transparent"
            strokeWidth={14}
            style={{
              cursor: isVert ? "ew-resize" : "ns-resize",
            }}
            onMouseDown={(e) => startSegmentDrag(e, seg.index, seg.type)}
          />
        )
      })}

      {/* Selected state: Riser Pill Grabber Handle on middle segment */}
      {selected && (
        <g
          transform={`translate(${labelX}, ${labelY})`}
          style={{ cursor: orientation === "h" ? "ew-resize" : "ns-resize" }}
          onMouseDown={(e) => {
            const midSegIdx = Math.floor(segments.length / 2)
            const seg = segments[midSegIdx]
            if (seg) startSegmentDrag(e, seg.index, seg.type)
          }}
        >
          <rect
            x={orientation === "h" ? -4 : -9}
            y={orientation === "h" ? -9 : -4}
            width={orientation === "h" ? 8 : 18}
            height={orientation === "h" ? 18 : 8}
            rx={4}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        </g>
      )}
    </>
  )
}
