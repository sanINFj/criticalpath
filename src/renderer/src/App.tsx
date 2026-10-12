import { useCallback, useEffect, useRef, useState } from "react"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnConnectStartParams,
} from "reactflow"

import "reactflow/dist/style.css"

import SchematicNode, {
  type SchematicComponentType,
  type SchematicNodeData,
} from "./components/schematic/SchematicNode"
import JunctionNode from "./components/schematic/JunctionNode"
import SchematicEdge, {
  getOrthogonalWirePath,
  SchematicConnectionLine,
  type WireBendMode,
  type WireSegmentDef,
} from "./components/schematic/SchematicEdge"
import CadCrosshairLayer, {
  type WireDraft,
} from "./components/schematic/CadCrosshairLayer"

import { buildSpiceNetlist } from "./simulation/netlist"
import "./assets/main.css"

const nodeTypes = {
  schematic: SchematicNode,
  junction: JunctionNode,
}

const edgeTypes = {
  step: SchematicEdge,
  default: SchematicEdge,
  schematic: SchematicEdge,
}

/* ============================================================
   INITIAL CIRCUIT: Empty Canvas at Launch
   ============================================================ */

const initialNodes: Node<SchematicNodeData>[] = []
const initialEdges: Edge[] = []

/* ============================================================
   GRID & GEOMETRY HELPERS (20px Grid Pitch)
   ============================================================ */

function getPinCoord(
  node: Node,
  handleId?: string | null,
): { x: number; y: number } {
  if (node.type === "junction") {
    return { x: node.position.x + 4, y: node.position.y + 4 }
  }

  const rotation = (node.data?.rotation ?? 0) % 360
  const isVertical = rotation === 90 || rotation === 270
  const isGround = node.data?.type === "ground"

  const nx = node.position.x
  const ny = node.position.y

  if (isGround) {
    return { x: nx + 60, y: ny }
  }

  // 120x80 component box: center is at (60, 40)
  if (handleId === "pin1") {
    if (isVertical) return { x: nx + 60, y: ny }
    return { x: nx, y: ny + 40 }
  } else {
    if (isVertical) return { x: nx + 60, y: ny + 80 }
    return { x: nx + 120, y: ny + 40 }
  }
}

function findPinAtCoord(
  nodes: Node<SchematicNodeData>[],
  x: number,
  y: number,
): { nodeId: string; handleId?: string } | null {
  for (const node of nodes) {
    if (node.type === "junction") {
      const coord = getPinCoord(node)
      if (Math.abs(coord.x - x) < 8 && Math.abs(coord.y - y) < 8) {
        return { nodeId: node.id }
      }
    } else {
      const p1 = getPinCoord(node, "pin1")
      if (Math.abs(p1.x - x) < 8 && Math.abs(p1.y - y) < 8) {
        return { nodeId: node.id, handleId: "pin1" }
      }
      if (node.data?.type !== "ground" && node.data?.type !== "vcc") {
        const p2 = getPinCoord(node, "pin2")
        if (Math.abs(p2.x - x) < 8 && Math.abs(p2.y - y) < 8) {
          return { nodeId: node.id, handleId: "pin2" }
        }
      }
    }
  }
  return null
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; nearestX: number; nearestY: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const l2 = dx * dx + dy * dy
  if (l2 === 0) {
    return { dist: Math.hypot(px - x1, py - y1), nearestX: x1, nearestY: y1 }
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const nearestX = x1 + t * dx
  const nearestY = y1 + t * dy
  return { dist: Math.hypot(px - nearestX, py - nearestY), nearestX, nearestY }
}

function getEdgeSegmentsAndPoints(
  edge: Edge,
  nodes: Node<SchematicNodeData>[],
): { segments: WireSegmentDef[]; points: { x: number; y: number }[] } | null {
  const srcNode = nodes.find((n) => n.id === edge.source)
  const tgtNode = nodes.find((n) => n.id === edge.target)
  if (!srcNode || !tgtNode) return null

  const p1 = getPinCoord(srcNode, edge.sourceHandle)
  const p2 = getPinCoord(tgtNode, edge.targetHandle)
  const bendMode: WireBendMode = edge.data?.bendMode ?? "auto"
  const offset = edge.data?.offset
  const waypoints = edge.data?.waypoints

  const [, , , , segments, points] = getOrthogonalWirePath(
    p1.x,
    p1.y,
    p2.x,
    p2.y,
    edge.sourceHandle === "pin1" || edge.sourceHandle === "left" ? Position.Left : Position.Right,
    edge.targetHandle === "pin2" || edge.targetHandle === "right" ? Position.Right : Position.Left,
    bendMode,
    offset,
    waypoints,
  )

  return { segments, points }
}

function findEdgeAtCoord(
  edges: Edge[],
  nodes: Node<SchematicNodeData>[],
  x: number,
  y: number,
): { edge: Edge; nearestPoint: { x: number; y: number } } | null {
  let bestEdge: Edge | null = null
  let bestDistance = 15
  let bestNearestPoint = { x, y }

  for (const edge of edges) {
    const edgeData = getEdgeSegmentsAndPoints(edge, nodes)
    if (!edgeData) continue

    for (const seg of edgeData.segments) {
      const res = distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2)
      if (res.dist < bestDistance) {
        bestDistance = res.dist
        bestEdge = edge
        bestNearestPoint = { x: res.nearestX, y: res.nearestY }
      }
    }
  }

  if (bestEdge) {
    return { edge: bestEdge, nearestPoint: bestNearestPoint }
  }
  return null
}

function splitEdgeAtPoint(
  targetEdge: Edge,
  nodes: Node<SchematicNodeData>[],
  junctionId: string,
  splitPoint: { x: number; y: number },
): { edge1: Edge; edge2: Edge } {
  const result = getEdgeSegmentsAndPoints(targetEdge, nodes)
  let w1: { x: number; y: number }[] | undefined = undefined
  let w2: { x: number; y: number }[] | undefined = undefined

  if (result && result.points.length >= 2) {
    const pts = result.points
    let segIdx = -1
    let minDist = Infinity

    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment(
        splitPoint.x,
        splitPoint.y,
        pts[i].x,
        pts[i].y,
        pts[i + 1].x,
        pts[i + 1].y,
      )
      if (d.dist < minDist) {
        minDist = d.dist
        segIdx = i
      }
    }

    if (segIdx >= 0) {
      const beforePts = pts.slice(1, segIdx + 1)
      const afterPts = pts.slice(segIdx + 1, -1)
      if (beforePts.length > 0) w1 = beforePts
      if (afterPts.length > 0) w2 = afterPts
    }
  }

  const ts = Date.now().toString().slice(-4)
  const edge1: Edge = {
    id: `e-${targetEdge.source}-${junctionId}-${ts}a`,
    source: targetEdge.source,
    sourceHandle: targetEdge.sourceHandle,
    target: junctionId,
    targetHandle: "left",
    type: "step",
    data: {
      bendMode: targetEdge.data?.bendMode ?? "auto",
      waypoints: w1,
    },
  }

  const edge2: Edge = {
    id: `e-${junctionId}-${targetEdge.target}-${ts}b`,
    source: junctionId,
    sourceHandle: "right",
    target: targetEdge.target,
    targetHandle: targetEdge.targetHandle,
    type: "step",
    data: {
      bendMode: targetEdge.data?.bendMode ?? "auto",
      waypoints: w2,
    },
  }

  return { edge1, edge2 }
}

const NEXT_BEND_MODE: Record<WireBendMode, WireBendMode> = {
  "auto": "corner-hv",
  "corner-hv": "corner-vh",
  "corner-vh": "horizontal-step",
  "horizontal-step": "vertical-step",
  "vertical-step": "auto",
}

/* ============================================================
   COMPONENT LIBRARY DEFINITIONS
   ============================================================ */

interface CompDef {
  type: SchematicComponentType
  name: string
  icon: React.ReactNode
  hotkey: string
  category: "Basic" | "Sources" | "Power" | "Other"
  defaultValue?: string
}

// Clean inline SVG circuit icons for each component type
const CompIcon = {
  resistor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="6" y="3" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="22" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  capacitor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" strokeWidth="2"/>
      <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2"/>
      <line x1="14" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  inductor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4 8 Q6 2 8 8 Q10 2 12 8 Q14 2 16 8 Q18 2 20 8 Q22 2 24 8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <line x1="24" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  diode: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <polygon points="8,3 8,13 18,8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <line x1="18" y1="3" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="18" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  'voltage-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  'current-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2"/>
      <polygon points="15,5.5 18,8 15,10.5" fill="currentColor"/>
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  ground: (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      <line x1="10" y1="0" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  vcc: (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      <line x1="10" y1="16" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.8"/>
      <polygon points="10,0 4,6 16,6" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  generic: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="8" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="0" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="0" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="20" y1="6" x2="28" y2="6" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="20" y1="10" x2="28" y2="10" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  junction: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="4" fill="currentColor"/>
    </svg>
  ),
} as const

/* ============================================================
   ENGINEERING UNITS PER DEVICE TYPE
   ============================================================ */

interface DeviceUnitOption {
  label: string
  unit: string
}

const DEVICE_UNITS: Record<string, DeviceUnitOption[]> = {
  resistor: [
    { label: "Ω (Ohms)", unit: "Ω" },
    { label: "mΩ (Milliohms)", unit: "mΩ" },
    { label: "kΩ (Kilohms)", unit: "kΩ" },
    { label: "MΩ (Megaohms)", unit: "MΩ" },
    { label: "GΩ (Gigaohms)", unit: "GΩ" },
  ],
  capacitor: [
    { label: "pF (Picofarads)", unit: "pF" },
    { label: "nF (Nanofarads)", unit: "nF" },
    { label: "µF (Microfarads)", unit: "µF" },
    { label: "mF (Millifarads)", unit: "mF" },
    { label: "F (Farads)", unit: "F" },
  ],
  inductor: [
    { label: "pH (Picohenries)", unit: "pH" },
    { label: "nH (Nanohenries)", unit: "nH" },
    { label: "µH (Microhenries)", unit: "µH" },
    { label: "mH (Millihenries)", unit: "mH" },
    { label: "H (Henries)", unit: "H" },
  ],
  "voltage-source": [
    { label: "µV (Microvolts)", unit: "µV" },
    { label: "mV (Millivolts)", unit: "mV" },
    { label: "V (Volts)", unit: "V" },
    { label: "kV (Kilovolts)", unit: "kV" },
  ],
  vcc: [
    { label: "mV (Millivolts)", unit: "mV" },
    { label: "V (Volts)", unit: "V" },
    { label: "kV (Kilovolts)", unit: "kV" },
  ],
  "current-source": [
    { label: "nA (Nanoamps)", unit: "nA" },
    { label: "µA (Microamps)", unit: "µA" },
    { label: "mA (Milliamps)", unit: "mA" },
    { label: "A (Amps)", unit: "A" },
  ],
  diode: [
    { label: "1N4148 (Fast Signal)", unit: "1N4148" },
    { label: "1N4007 (1A Rectifier)", unit: "1N4007" },
    { label: "1N5819 (Schottky)", unit: "1N5819" },
    { label: "BAT54 (Small-Signal)", unit: "BAT54" },
    { label: "BZX55C5V1 (5.1V Zener)", unit: "BZX55C5V1" },
    { label: "LED (Standard)", unit: "LED" },
    { label: "Custom Model", unit: "Custom" },
  ],
  generic: [
    { label: "— (None)", unit: "" },
    { label: "k (Kilo)", unit: "k" },
    { label: "M (Mega)", unit: "M" },
    { label: "m (Milli)", unit: "m" },
    { label: "u (Micro)", unit: "u" },
    { label: "n (Nano)", unit: "n" },
    { label: "p (Pico)", unit: "p" },
    { label: "V (Volts)", unit: "V" },
    { label: "A (Amps)", unit: "A" },
    { label: "Hz (Hertz)", unit: "Hz" },
  ],
}

function parseComponentValue(
  type: SchematicComponentType,
  fullValue: string = "",
): { magnitude: string; unit: string } {
  const units = DEVICE_UNITS[type] || DEVICE_UNITS.generic
  const trimmed = (fullValue ?? "").trim()

  if (type === "diode") {
    const known = units.find((u) => u.unit.toLowerCase() === trimmed.toLowerCase())
    if (known) {
      return { magnitude: "", unit: known.unit }
    }
    return { magnitude: trimmed, unit: "Custom" }
  }

  if (!trimmed) {
    const defaultUnit =
      type === "resistor"
        ? "kΩ"
        : type === "capacitor"
          ? "µF"
          : type === "inductor"
            ? "mH"
            : type === "voltage-source" || type === "vcc"
              ? "V"
              : type === "current-source"
                ? "mA"
                : units[0]?.unit ?? ""
    return { magnitude: "", unit: defaultUnit }
  }

  const numMatch = trimmed.match(/^([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*(.*)$/)
  if (!numMatch) {
    return { magnitude: trimmed, unit: units[0]?.unit ?? "" }
  }

  const mag = numMatch[1]
  const suffix = numMatch[2].trim()

  if (!suffix) {
    const defaultUnit =
      type === "resistor"
        ? "kΩ"
        : type === "capacitor"
          ? "µF"
          : type === "inductor"
            ? "mH"
            : type === "voltage-source" || type === "vcc"
              ? "V"
              : type === "current-source"
                ? "mA"
                : units[0]?.unit ?? ""
    return { magnitude: mag, unit: defaultUnit }
  }

  const sLower = suffix.toLowerCase()
  let matched = units.find(
    (u) =>
      u.unit.toLowerCase() === sLower ||
      u.unit.replace(/Ω|H|F|V|A/g, "").toLowerCase() === sLower,
  )

  if (!matched) {
    if (type === "resistor") {
      if (sLower === "k" || sLower === "kohm" || sLower === "kω") matched = units.find((u) => u.unit === "kΩ")
      else if (sLower === "m" || sLower === "mohm" || sLower === "mω") matched = units.find((u) => u.unit === "mΩ")
      else if (sLower === "meg" || sLower === "megohm") matched = units.find((u) => u.unit === "MΩ")
      else if (sLower === "g" || sLower === "gohm" || sLower === "gω") matched = units.find((u) => u.unit === "GΩ")
      else if (sLower === "r" || sLower === "ohm" || sLower === "ohms" || sLower === "ω") matched = units.find((u) => u.unit === "Ω")
    } else if (type === "capacitor") {
      if (sLower === "u" || sLower === "uf" || sLower === "µ" || sLower === "µf") matched = units.find((u) => u.unit === "µF")
      else if (sLower === "p" || sLower === "pf") matched = units.find((u) => u.unit === "pF")
      else if (sLower === "n" || sLower === "nf") matched = units.find((u) => u.unit === "nF")
      else if (sLower === "m" || sLower === "mf") matched = units.find((u) => u.unit === "mF")
      else if (sLower === "f") matched = units.find((u) => u.unit === "F")
    } else if (type === "inductor") {
      if (sLower === "u" || sLower === "uh" || sLower === "µ" || sLower === "µh") matched = units.find((u) => u.unit === "µH")
      else if (sLower === "n" || sLower === "nh") matched = units.find((u) => u.unit === "nH")
      else if (sLower === "m" || sLower === "mh") matched = units.find((u) => u.unit === "mH")
      else if (sLower === "p" || sLower === "ph") matched = units.find((u) => u.unit === "pH")
      else if (sLower === "h") matched = units.find((u) => u.unit === "H")
    } else if (type === "voltage-source" || type === "vcc") {
      if (sLower === "v") matched = units.find((u) => u.unit === "V")
      else if (sLower === "mv") matched = units.find((u) => u.unit === "mV")
      else if (sLower === "kv") matched = units.find((u) => u.unit === "kV")
      else if (sLower === "uv" || sLower === "µv") matched = units.find((u) => u.unit === "µV")
    } else if (type === "current-source") {
      if (sLower === "ma") matched = units.find((u) => u.unit === "mA")
      else if (sLower === "a") matched = units.find((u) => u.unit === "A")
      else if (sLower === "ua" || sLower === "µa") matched = units.find((u) => u.unit === "µA")
      else if (sLower === "na") matched = units.find((u) => u.unit === "nA")
    }
  }

  return {
    magnitude: mag,
    unit: matched ? matched.unit : (units[0]?.unit ?? ""),
  }
}

function formatComponentValue(
  type: SchematicComponentType,
  magnitude: string,
  unit: string,
): string {
  if (type === "diode") {
    if (unit === "Custom") return magnitude
    return unit
  }
  const cleanMag = magnitude.trim()
  if (!cleanMag) return ""
  return `${cleanMag}${unit}`
}

/* ============================================================
   CUSTOM THEMED SELECT DROPDOWN COMPONENT
   ============================================================ */

interface CustomSelectOption {
  label: string
  unit: string
}

interface CustomSelectProps {
  value: string
  options: CustomSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}

function CustomSelect({ value, options, onChange, placeholder }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
    return undefined
  }, [isOpen])

  const selectedOption = options.find((opt) => opt.unit === value)

  return (
    <div className="custom-select-container" ref={containerRef}>
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="custom-select-label">
          {selectedOption ? selectedOption.label : (placeholder || value)}
        </span>
        <svg
          className={`custom-select-arrow ${isOpen ? "open" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="custom-select-dropdown">
          {options.map((opt) => {
            const isSelected = opt.unit === value
            return (
              <button
                key={opt.unit}
                type="button"
                className={`custom-select-item ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onChange(opt.unit)
                  setIsOpen(false)
                }}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6L5 8.5L9.5 3.5"
                      stroke="var(--accent)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const COMPONENT_CATALOG: CompDef[] = [
  // Basic
  { type: "resistor",       name: "Resistor",       icon: CompIcon.resistor,          hotkey: "R", category: "Basic",   defaultValue: "10kΩ" },
  { type: "capacitor",      name: "Capacitor",      icon: CompIcon.capacitor,         hotkey: "C", category: "Basic",   defaultValue: "1µF" },
  { type: "inductor",       name: "Inductor",       icon: CompIcon.inductor,          hotkey: "L", category: "Basic",   defaultValue: "10mH" },
  { type: "diode",          name: "Diode",          icon: CompIcon.diode,             hotkey: "D", category: "Basic",   defaultValue: "1N4148" },
  // Sources
  { type: "voltage-source", name: "Voltage Source", icon: CompIcon['voltage-source'], hotkey: "V", category: "Sources", defaultValue: "5V" },
  { type: "current-source", name: "Current Source", icon: CompIcon['current-source'], hotkey: "I", category: "Sources", defaultValue: "1mA" },
  // Power
  { type: "ground",         name: "Ground",         icon: CompIcon.ground,            hotkey: "G", category: "Power" },
  { type: "vcc",            name: "VCC",            icon: CompIcon.vcc,               hotkey: "P", category: "Power",   defaultValue: "5V" },
  // Other
  { type: "generic",        name: "Generic IC",     icon: CompIcon.generic,           hotkey: "U", category: "Other",   defaultValue: "U1" },
]

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  nodeId?: string
  edgeId?: string
}

/* ============================================================
   MAIN SCHEMATIC EDITOR COMPONENT
   ============================================================ */

function SchematicEditor() {
  const { screenToFlowPosition, project, zoomIn, zoomOut, fitView, getZoom } =
    useReactFlow()

  const [nodes, setNodes] = useState<Node<SchematicNodeData>[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<"select" | "wire" | "junction">("select")
  const [searchQuery, setSearchQuery] = useState("")

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 })

  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [zoomLevel, setZoomLevel] = useState(100)

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)

  // Undo / Redo history
  const [history, setHistory] = useState<{
    past: { nodes: Node<SchematicNodeData>[]; edges: Edge[] }[]
    future: { nodes: Node<SchematicNodeData>[]; edges: Edge[] }[]
  }>({ past: [], future: [] })

  const connectingStartRef = useRef<OnConnectStartParams | null>(null)

  /* ============================================================
     HISTORY SNAPSHOTS (UNDO / REDO)
     ============================================================ */

  const pushSnapshot = useCallback(
    (newNodes: Node<SchematicNodeData>[], newEdges: Edge[]) => {
      setHistory((prev) => ({
        past: [
          ...prev.past.slice(-40),
          {
            nodes: JSON.parse(JSON.stringify(newNodes)),
            edges: JSON.parse(JSON.stringify(newEdges)),
          },
        ],
        future: [],
      }))
    },
    [],
  )

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev
      const previous = prev.past[prev.past.length - 1]
      const newPast = prev.past.slice(0, prev.past.length - 1)

      const current = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      }

      setNodes(previous.nodes)
      setEdges(previous.edges)

      return {
        past: newPast,
        future: [current, ...prev.future],
      }
    })
  }, [nodes, edges])

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev
      const next = prev.future[0]
      const newFuture = prev.future.slice(1)

      const current = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      }

      setNodes(next.nodes)
      setEdges(next.edges)

      return {
        past: [...prev.past, current],
        future: newFuture,
      }
    })
  }, [nodes, edges])

  /* ============================================================
     NODE & EDGE EVENT HANDLERS
     ============================================================ */

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((curr) => applyNodeChanges(changes, curr))
    },
    [],
  )

  const onNodeDragStart = useCallback(() => {
    pushSnapshot(nodes, edges)
  }, [nodes, edges, pushSnapshot])

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((curr) => applyEdgeChanges(changes, curr))
    },
    [],
  )

  const updateEdgeOffset = useCallback(
    (edgeId: string, newOffset: number, newBendMode?: WireBendMode) => {
      setEdges((curr) =>
        curr.map((edge) => {
          if (edge.id !== edgeId) return edge
          return {
            ...edge,
            data: {
              ...edge.data,
              offset: newOffset,
              ...(newBendMode ? { bendMode: newBendMode } : {}),
            },
          }
        }),
      )
    },
    [],
  )

  const updateEdgeWaypoints = useCallback(
    (edgeId: string, newWaypoints: { x: number; y: number }[]) => {
      setEdges((curr) =>
        curr.map((edge) => {
          if (edge.id !== edgeId) return edge
          return {
            ...edge,
            data: {
              ...edge.data,
              waypoints: newWaypoints,
            },
          }
        }),
      )
    },
    [],
  )

  const flipEdgeBend = useCallback(
    (edgeId: string, specificMode?: WireBendMode) => {
      pushSnapshot(nodes, edges)

      setEdges((curr) =>
        curr.map((edge) => {
          if (edge.id !== edgeId) return edge
          const currentMode: WireBendMode = edge.data?.bendMode ?? "auto"
          const nextMode: WireBendMode = specificMode ?? NEXT_BEND_MODE[currentMode]
          return {
            ...edge,
            data: { ...edge.data, bendMode: nextMode },
          }
        }),
      )
    },
    [nodes, edges, pushSnapshot],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (activeTool !== "wire") return
      connectingStartRef.current = null
      pushSnapshot(nodes, edges)

      setEdges((curr) =>
        addEdge(
          {
            ...connection,
            type: "step",
            animated: false,
            data: { bendMode: "auto" },
          },
          curr,
        ),
      )
    },
    [activeTool, nodes, edges, pushSnapshot],
  )

  const onConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      if (activeTool !== "wire") return
      connectingStartRef.current = params
    },
    [activeTool],
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (activeTool !== "wire") return
      const startParam = connectingStartRef.current
      connectingStartRef.current = null

      if (!startParam || !startParam.nodeId) return

      const clientX = "clientX" in event ? event.clientX : event.changedTouches?.[0]?.clientX
      const clientY = "clientY" in event ? event.clientY : event.changedTouches?.[0]?.clientY
      if (clientX === undefined || clientY === undefined) return

      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord({ x: clientX, y: clientY })
      const hitEdge = findEdgeAtCoord(edges, nodes, flowPos.x, flowPos.y)
      if (!hitEdge) return
      if (
        (hitEdge.edge.source === startParam.nodeId && hitEdge.edge.sourceHandle === startParam.handleId) ||
        (hitEdge.edge.target === startParam.nodeId && hitEdge.edge.targetHandle === startParam.handleId)
      ) {
        return
      }

      pushSnapshot(nodes, edges)
      const snapX = Math.round(hitEdge.nearestPoint.x / 20) * 20
      const snapY = Math.round(hitEdge.nearestPoint.y / 20) * 20
      const junctionId = `J${Date.now().toString().slice(-4)}`

      const newJunctionNode: Node = {
        id: junctionId,
        type: "junction",
        position: { x: snapX - 4, y: snapY - 4 },
        data: {},
      }

      const { edge1, edge2 } = splitEdgeAtPoint(hitEdge.edge, nodes, junctionId, { x: snapX, y: snapY })
      const edge3: Edge = {
        id: `e-${startParam.nodeId}-${junctionId}-${Date.now().toString().slice(-4)}c`,
        source: startParam.nodeId!,
        sourceHandle: startParam.handleId,
        target: junctionId,
        targetHandle: "top",
        type: "step",
        data: { bendMode: "auto" },
      }

      setNodes((curr) => [...curr, newJunctionNode])
      setEdges((curr) => [
        ...curr.filter((e) => e.id !== hitEdge.edge.id),
        edge1,
        edge2,
        edge3,
      ])
    },
    [edges, nodes, screenToFlowPosition, project, pushSnapshot],
  )

  const [wireDraft, setWireDraft] = useState<WireDraft>({
    isDrawing: false,
    points: [],
    bendOrientation: "h",
  })
  const [isHoveringCanvas, setIsHoveringCanvas] = useState(false)

  // Reset wire draft if tool changes
  useEffect(() => {
    if (activeTool !== "wire") {
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    }
  }, [activeTool])

  const handleWireCanvasClick = useCallback(
    (flowPos: { x: number; y: number }) => {
      const snapX = Math.round(flowPos.x / 20) * 20
      const snapY = Math.round(flowPos.y / 20) * 20
      const clickPoint = { x: snapX, y: snapY }

      if (!wireDraft.isDrawing) {
        // 1. FIRST CLICK: Set wire start point
        const hitPin = findPinAtCoord(nodes, snapX, snapY)
        const hitEdgeResult = !hitPin ? findEdgeAtCoord(edges, nodes, snapX, snapY) : null

        if (hitEdgeResult) {
          // Clicked on an existing wire: insert junction dot & split
          pushSnapshot(nodes, edges)
          const junctionId = `J${Date.now().toString().slice(-4)}`
          const newJunctionNode: Node = {
            id: junctionId,
            type: "junction",
            position: { x: snapX - 4, y: snapY - 4 },
            data: {},
          }
          const { edge1, edge2 } = splitEdgeAtPoint(
            hitEdgeResult.edge,
            nodes,
            junctionId,
            { x: snapX, y: snapY },
          )
          setNodes((curr) => [...curr, newJunctionNode])
          setEdges((curr) => [...curr.filter((e) => e.id !== hitEdgeResult.edge.id), edge1, edge2])

          setWireDraft({
            isDrawing: true,
            points: [clickPoint],
            startPin: { nodeId: junctionId, handleId: "top" },
            bendOrientation: "h",
          })
        } else {
          setWireDraft({
            isDrawing: true,
            points: [clickPoint],
            startPin: hitPin ?? undefined,
            bendOrientation: "h",
          })
        }
      } else {
        // 2. SUBSEQUENT CLICK: Commit bend waypoint or connect to target
        const pts = wireDraft.points
        const lastPt = pts[pts.length - 1]
        if (lastPt.x === snapX && lastPt.y === snapY) return

        const hitPin = findPinAtCoord(nodes, snapX, snapY)
        const hitEdgeResult = !hitPin ? findEdgeAtCoord(edges, nodes, snapX, snapY) : null

        if (hitPin || hitEdgeResult) {
          // TERMINATION: Connects to a pin or wire!
          pushSnapshot(nodes, edges)
          let targetNodeId = hitPin?.nodeId
          let targetHandleId = hitPin?.handleId
          const updatedNodes = [...nodes]
          let updatedEdges = [...edges]

          if (hitEdgeResult) {
            const junctionId = `J${Date.now().toString().slice(-4)}`
            const newJunctionNode: Node = {
              id: junctionId,
              type: "junction",
              position: { x: snapX - 4, y: snapY - 4 },
              data: {},
            }
            const { edge1, edge2 } = splitEdgeAtPoint(
              hitEdgeResult.edge,
              updatedNodes,
              junctionId,
              { x: snapX, y: snapY },
            )
            updatedNodes.push(newJunctionNode)
            updatedEdges = [...updatedEdges.filter((e) => e.id !== hitEdgeResult.edge.id), edge1, edge2]
            targetNodeId = junctionId
            targetHandleId = "top"
          }

          // Build clean orthogonal waypoints (zero diagonals)
          const rawPts = [...pts, clickPoint]
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

          const intermediateWaypoints = cleanPts.slice(1, -1)
          let currentSourceId = wireDraft.startPin?.nodeId
          let currentSourceHandle = wireDraft.startPin?.handleId

          // If start point was on free grid without a node, create a single junction node at start
          if (!currentSourceId) {
            const startJunctionId = `J${Date.now().toString().slice(-4)}a`
            const startJunctionNode: Node = {
              id: startJunctionId,
              type: "junction",
              position: { x: cleanPts[0].x - 4, y: cleanPts[0].y - 4 },
              data: {},
            }
            updatedNodes.push(startJunctionNode)
            currentSourceId = startJunctionId
            currentSourceHandle = "right"
          }

          // Single continuous edge connecting source to target with waypoints for all bends
          if (targetNodeId && currentSourceId) {
            const finalEdge: Edge = {
              id: `e-${currentSourceId}-${targetNodeId}-${Date.now()}`,
              source: currentSourceId,
              sourceHandle: currentSourceHandle,
              target: targetNodeId,
              targetHandle: targetHandleId,
              type: "step",
              data: {
                waypoints:
                  intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
                bendMode: "auto",
              },
            }
            updatedEdges.push(finalEdge)
          }

          setNodes(updatedNodes)
          setEdges(updatedEdges)
          setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
        } else {
          // Clicked on empty grid -> commit 90-degree bend and continue drawing
          setWireDraft((prev) => {
            const last = prev.points[prev.points.length - 1]
            if (last.x === snapX || last.y === snapY) {
              return {
                ...prev,
                points: [...prev.points, clickPoint],
                bendOrientation: prev.bendOrientation === "h" ? "v" : "h",
              }
            } else {
              const corner =
                prev.bendOrientation === "h"
                  ? { x: snapX, y: last.y }
                  : { x: last.x, y: snapY }
              return {
                ...prev,
                points: [...prev.points, corner, clickPoint],
                bendOrientation: prev.bendOrientation === "h" ? "v" : "h",
              }
            }
          })
        }
      }
    },
    [wireDraft, nodes, edges, pushSnapshot],
  )

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, clickedEdge: Edge) => {
      if (activeTool === "wire") {
        event.stopPropagation()
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })
        handleWireCanvasClick(flowPos)
        return
      }
      event.stopPropagation()
      setSelectedEdgeId(clickedEdge.id)
      setSelectedNodeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, handleWireCanvasClick, screenToFlowPosition, project],
  )

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, clickedEdge: Edge) => {
      flipEdgeBend(clickedEdge.id)
    },
    [flipEdgeBend],
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (activeTool === "wire") {
        event.stopPropagation()
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })
        handleWireCanvasClick(flowPos)
        return
      }
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, handleWireCanvasClick, screenToFlowPosition, project],
  )

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (activeTool === "wire") {
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })
        handleWireCanvasClick(flowPos)
        return
      }
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
      setOpenMenu(null)
    },
    [activeTool, handleWireCanvasClick, screenToFlowPosition, project],
  )

  const onPaneDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      if (activeTool === "wire" && wireDraft.isDrawing && wireDraft.points.length > 0) {
        // Double-click to commit wire chain in free space
        pushSnapshot(nodes, edges)
        const pts = wireDraft.points
        const lastPt = pts[pts.length - 1]
        const intermediateWaypoints = pts.slice(1, -1)
        const updatedNodes = [...nodes]
        const updatedEdges = [...edges]

        let currentSourceId = wireDraft.startPin?.nodeId
        let currentSourceHandle = wireDraft.startPin?.handleId

        if (!currentSourceId) {
          const startJunctionId = `J${Date.now().toString().slice(-4)}s`
          const startNode: Node = {
            id: startJunctionId,
            type: "junction",
            position: { x: pts[0].x - 4, y: pts[0].y - 4 },
            data: {},
          }
          updatedNodes.push(startNode)
          currentSourceId = startJunctionId
          currentSourceHandle = "right"
        }

        const endJunctionId = `J${Date.now().toString().slice(-4)}e`
        const endNode: Node = {
          id: endJunctionId,
          type: "junction",
          position: { x: lastPt.x - 4, y: lastPt.y - 4 },
          data: {},
        }
        updatedNodes.push(endNode)

        const finalEdge: Edge = {
          id: `e-${currentSourceId}-${endJunctionId}-${Date.now()}`,
          source: currentSourceId,
          sourceHandle: currentSourceHandle,
          target: endJunctionId,
          targetHandle: "left",
          type: "step",
          data: {
            waypoints:
              intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
            bendMode: "auto",
          },
        }
        updatedEdges.push(finalEdge)

        setNodes(updatedNodes)
        setEdges(updatedEdges)
        setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
      }
    },
    [activeTool, wireDraft, nodes, edges, pushSnapshot],
  )

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })
      setCursorPos({
        x: Math.round(flowPos.x / 20) * 20,
        y: Math.round(flowPos.y / 20) * 20,
      })
      if (getZoom) {
        setZoomLevel(Math.round(getZoom() * 100))
      }
    },
    [screenToFlowPosition, project, getZoom],
  )

  /* ============================================================
     CONTEXT MENU HANDLERS
     ============================================================ */

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      })
    },
    [],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      setSelectedEdgeId(edge.id)
      setSelectedNodeId(null)
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      })
    },
    [],
  )

  /* ============================================================
     ADD COMPONENT / JUNCTION (ALIGNED TO 20px GRID)
     ============================================================ */

  const addComponent = useCallback(
    (type: SchematicComponentType) => {
      pushSnapshot(nodes, edges)

      const def = COMPONENT_CATALOG.find((c) => c.type === type)
      const existingCount = nodes.filter((n) => n.data?.type === type).length + 1
      const prefix =
        type === "resistor"
          ? "R"
          : type === "capacitor"
            ? "C"
            : type === "inductor"
              ? "L"
              : type === "diode"
                ? "D"
                : type === "voltage-source"
                  ? "V"
                  : type === "current-source"
                    ? "I"
                    : type === "ground"
                      ? "GND"
                      : type === "vcc"
                        ? "VCC"
                        : "U"

      const id = `${prefix}${existingCount}`

      const newNode: Node<SchematicNodeData> = {
        id,
        type: "schematic",
        position: {
          x: 260 + Math.round((Math.random() * 200) / 20) * 20,
          y: 160 + Math.round((Math.random() * 160) / 20) * 20,
        },
        data: {
          label: id,
          type,
          value: def?.defaultValue,
          rotation: 0,
        },
      }

      setNodes((curr) => [...curr, newNode])
      setSelectedNodeId(id)
      setSelectedEdgeId(null)
    },
    [nodes, edges, pushSnapshot],
  )

  const addJunction = useCallback(() => {
    pushSnapshot(nodes, edges)
    const junctionId = `J${Date.now().toString().slice(-4)}`

    const newNode: Node = {
      id: junctionId,
      type: "junction",
      position: {
        x: 360 + Math.round((Math.random() * 160) / 20) * 20 - 4,
        y: 200 + Math.round((Math.random() * 160) / 20) * 20 - 4,
      },
      data: {},
    }

    setNodes((curr) => [...curr, newNode])
    setSelectedNodeId(junctionId)
    setSelectedEdgeId(null)
  }, [nodes, edges, pushSnapshot])

  /* ============================================================
     ACTIONS: DELETE, ROTATE, VALUE UPDATE, CLEAR
     ============================================================ */

  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      pushSnapshot(nodes, edges)
      setNodes((curr) => curr.filter((n) => n.id !== selectedNodeId))
      setEdges((curr) => curr.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
      setSelectedNodeId(null)
    } else if (selectedEdgeId) {
      pushSnapshot(nodes, edges)
      setEdges((curr) => curr.filter((e) => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
    }
    setContextMenu({ visible: false, x: 0, y: 0 })
  }, [selectedNodeId, selectedEdgeId, nodes, edges, pushSnapshot])

  const rotateSelected = useCallback(() => {
    if (!selectedNodeId) return
    pushSnapshot(nodes, edges)

    setNodes((curr) =>
      curr.map((node) => {
        if (node.id !== selectedNodeId) return node
        const currentRot = node.data?.rotation ?? 0
        return {
          ...node,
          data: { ...node.data, rotation: (currentRot + 90) % 360 },
        }
      }),
    )
    setContextMenu({ visible: false, x: 0, y: 0 })
  }, [selectedNodeId, nodes, edges, pushSnapshot])

  const updateSelectedValue = useCallback(
    (val: string) => {
      if (!selectedNodeId) return
      setNodes((curr) =>
        curr.map((n) => {
          if (n.id !== selectedNodeId) return n
          return { ...n, data: { ...n.data, value: val } }
        }),
      )
    },
    [selectedNodeId],
  )


  /* ============================================================
     FILE WORKFLOW: SAVE / OPEN
     ============================================================ */



  const simulateCircuit = useCallback(async () => {
    setOpenMenu(null)

    const result = buildSpiceNetlist(nodes, edges)
    if (result.errors.length > 0) {
      window.alert(
        "Cannot simulate this circuit yet:\n\n" +
          result.errors.map((error) => `• ${error}`).join("\n"),
      )
      return
    }

    if (typeof window.api?.runNgspice !== "function") {
      window.alert(
        "The ngspice runner is available in the Electron desktop app, not the browser-only build.",
      )
      return
    }

    try {
      const simulation = await window.api.runNgspice(result.netlist)
      const details = [
        simulation.ok ? "Simulation completed." : "Simulation failed.",
        simulation.error ? `\n${simulation.error}` : "",
        simulation.stdout ? `\n--- ngspice output ---\n${simulation.stdout}` : "",
        simulation.stderr ? `\n--- diagnostics ---\n${simulation.stderr}` : "",
      ].join("")

      window.alert(details)
    } catch (error) {
      window.alert(
        "Could not run ngspice:\n" +
          (error instanceof Error ? error.message : String(error)),
      )
    }
  }, [nodes, edges])

  const exportNetlist = useCallback(() => {
    console.log("[CriticalPath] Export nodes:", JSON.stringify(
      nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      null,
      2,
    ))

    console.log("[CriticalPath] Export edges:", JSON.stringify(
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
      })),
      null,
      2,
    ))

    const result = buildSpiceNetlist(nodes, edges)

    if (result.errors.length > 0) {
      window.alert(
        "Cannot export this circuit yet:\n\n" +
          result.errors.map((error) => `• ${error}`).join("\n"),
      )
      return
    }

    if (result.warnings.length > 0) {
      window.alert(result.warnings.join("\n"))
    }

    const blob = new Blob([result.netlist], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement("a")
    link.href = url
    link.download = "circuit.cir"
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setOpenMenu(null)
  }, [nodes, edges])

  const saveSchematic = useCallback(() => {
    const document = {
      format: "criticalpath",
      version: 1,
      savedAt: new Date().toISOString(),
      nodes,
      edges,
    }

    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement("a")
    link.href = url
    link.download = "circuit.criticalpath.json"
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setOpenMenu(null)
  }, [nodes, edges])

  const openSchematic = useCallback(() => {
    const input = window.document.createElement("input")
    input.type = "file"
    input.accept = ".json,.criticalpath.json,application/json"

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      try {
        const parsed: unknown = JSON.parse(await file.text())

        if (!parsed || typeof parsed !== "object") {
          throw new Error("The file does not contain a circuit document.")
        }

        const doc = parsed as {
          format?: unknown
          version?: unknown
          nodes?: unknown
          edges?: unknown
        }

        if (
          doc.format !== "criticalpath" ||
          doc.version !== 1 ||
          !Array.isArray(doc.nodes) ||
          !Array.isArray(doc.edges)
        ) {
          throw new Error(
            "Unsupported file format. Choose a CriticalPath circuit JSON file saved by this version."
          )
        }

        const validNodes = doc.nodes.every((node: any) =>
          node &&
          typeof node.id === "string" &&
          typeof node.type === "string" &&
          node.position &&
          Number.isFinite(node.position.x) &&
          Number.isFinite(node.position.y) &&
          node.data &&
          typeof node.data === "object"
        )

        const nodeIds = new Set(doc.nodes.map((node: any) => node.id))
        const validEdges = doc.edges.every((edge: any) =>
          edge &&
          typeof edge.id === "string" &&
          typeof edge.source === "string" &&
          typeof edge.target === "string" &&
          nodeIds.has(edge.source) &&
          nodeIds.has(edge.target) &&
          (edge.sourceHandle == null || typeof edge.sourceHandle === "string") &&
          (edge.targetHandle == null || typeof edge.targetHandle === "string")
        )

        if (!validNodes || !validEdges) {
          throw new Error(
            "The circuit file contains invalid components or wire connections."
          )
        }

        // Snapshot the current circuit so the user can undo the load.
        pushSnapshot(nodes, edges)

        setNodes(doc.nodes as Node<SchematicNodeData>[])
        setEdges(doc.edges as Edge[])
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setWireDraft({
          isDrawing: false,
          points: [],
          bendOrientation: "h",
        })
        setActiveTool("select")
        setContextMenu({ visible: false, x: 0, y: 0 })
        setOpenMenu(null)
      } catch (error) {
        window.alert(
          error instanceof Error
            ? `Could not open circuit: ${error.message}`
            : "Could not open circuit file."
        )
      }
    }

    input.click()
    setOpenMenu(null)
  }, [nodes, edges, pushSnapshot])

  const clearCanvas = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return
    pushSnapshot(nodes, edges)
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    setActiveTool("select")
    setContextMenu({ visible: false, x: 0, y: 0 })
    setOpenMenu(null)
  }, [nodes, edges, pushSnapshot])

  /* ============================================================
     KEYBOARD SHORTCUTS
     ============================================================ */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      // Save / Open circuit documents
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
        const key = event.key.toLowerCase()
        if (key === "s") {
          event.preventDefault()
          saveSchematic()
          return
        }
        if (key === "o") {
          event.preventDefault()
          openSchematic()
          return
        }
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault()
        undo()
        return
      }

      // Redo: Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
      ) {
        event.preventDefault()
        redo()
        return
      }

      // Space / F: Flip wire bend
      if (event.key === " " || event.key.toLowerCase() === "f") {
        if (activeTool === "wire" && wireDraft.isDrawing) {
          event.preventDefault()
          setWireDraft((prev) => ({
            ...prev,
            bendOrientation: prev.bendOrientation === "h" ? "v" : "h",
          }))
          return
        }
        if (selectedEdgeId) {
          event.preventDefault()
          flipEdgeBend(selectedEdgeId)
          return
        }
      }

      // Delete: Del or Backspace
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected()
        return
      }

      // Rotate: R
      if (event.key.toLowerCase() === "r") {
        rotateSelected()
        return
      }

      // Hotkey tool switches & component additions
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === "w" || event.key === "F3") {
          event.preventDefault()
          setActiveTool("wire")
          return
        }

        if (event.key.toLowerCase() === "v") {
          event.preventDefault()
          setActiveTool("select")
          return
        }

        switch (event.key.toLowerCase()) {
          case "c":
            addComponent("capacitor")
            break
          case "l":
            addComponent("inductor")
            break
          case "i":
            addComponent("current-source")
            break
          case "d":
            addComponent("diode")
            break
          case "g":
            addComponent("ground")
            break
          case "j":
            addJunction()
            break
          case "escape":
            if (activeTool === "wire" && wireDraft.isDrawing) {
              setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
              return
            }
            setActiveTool("select")
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
            setContextMenu({ visible: false, x: 0, y: 0 })
            setOpenMenu(null)
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    saveSchematic,
    openSchematic,
    undo,
    redo,
    deleteSelected,
    rotateSelected,
    addComponent,
    addJunction,
    selectedEdgeId,
    flipEdgeBend,
    activeTool,
    wireDraft,
  ])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId)

  // Filtered Component Catalog
  const filteredCatalog = COMPONENT_CATALOG.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.hotkey.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const categories = ["Basic", "Sources", "Power", "Other"] as const

  return (
    <div className="app-shell" onClick={() => setContextMenu({ visible: false, x: 0, y: 0 })}>
      {/* =====================================================
          1. TOP APPLICATION BAR (Slim Desktop Style)
          ===================================================== */}

      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            <div className="app-logo-badge">CP</div>
            <span>CriticalPath</span>
          </div>

          <div className="menu-bar">
            {/* File Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "file" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "file" ? null : "file")
                }}
              >
                File
              </button>
              {openMenu === "file" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { clearCanvas(); setOpenMenu(null) }}>
                    <span>New Schematic</span> <span className="shortcut">Ctrl+N</span>
                  </button>
                  <button className="dropdown-item" onClick={openSchematic}>
                    <span>Open Circuit...</span> <span className="shortcut">Ctrl+O</span>
                  </button>
                  <button className="dropdown-item" onClick={saveSchematic}>
                    <span>Save Schematic</span> <span className="shortcut">Ctrl+S</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={exportNetlist}>
                    <span>Export Netlist</span>
                  </button>
                  <button className="dropdown-item" onClick={simulateCircuit}>
                    <span>Simulate with ngspice</span>
                  </button>
                </div>
              )}
            </div>

            {/* Edit Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "edit" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "edit" ? null : "edit")
                }}
              >
                Edit
              </button>
              {openMenu === "edit" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { undo(); setOpenMenu(null) }}>
                    <span>Undo</span> <span className="shortcut">Ctrl+Z</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { redo(); setOpenMenu(null) }}>
                    <span>Redo</span> <span className="shortcut">Ctrl+Y</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={() => { rotateSelected(); setOpenMenu(null) }}>
                    <span>Rotate 90°</span> <span className="shortcut">R</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { deleteSelected(); setOpenMenu(null) }}>
                    <span>Delete</span> <span className="shortcut">Del</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "view" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "view" ? null : "view")
                }}
              >
                View
              </button>
              {openMenu === "view" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { zoomIn(); setOpenMenu(null) }}>
                    <span>Zoom In</span> <span className="shortcut">+</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { zoomOut(); setOpenMenu(null) }}>
                    <span>Zoom Out</span> <span className="shortcut">-</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { fitView({ padding: 0.2 }); setOpenMenu(null) }}>
                    <span>Fit to Canvas</span> <span className="shortcut">F</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={() => { setIsLeftCollapsed(!isLeftCollapsed); setOpenMenu(null) }}>
                    <span>Toggle Components</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsRightCollapsed(!isRightCollapsed); setOpenMenu(null) }}>
                    <span>Toggle Inspector</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tools Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "tools" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "tools" ? null : "tools")
                }}
              >
                Tools
              </button>
              {openMenu === "tools" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { addComponent("resistor"); setOpenMenu(null) }}>
                    <span>Place Resistor</span> <span className="shortcut">R</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("capacitor"); setOpenMenu(null) }}>
                    <span>Place Capacitor</span> <span className="shortcut">C</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("voltage-source"); setOpenMenu(null) }}>
                    <span>Place Voltage Source</span> <span className="shortcut">V</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addJunction(); setOpenMenu(null) }}>
                    <span>Place Solder Dot</span> <span className="shortcut">J</span>
                  </button>
                </div>
              )}
            </div>

            {/* Help Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "help" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "help" ? null : "help")
                }}
              >
                Help
              </button>
              {openMenu === "help" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>Keyboard Shortcuts</span>
                  </button>
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>LTspice Reference</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="header-right">
          <button
            className="top-action-btn icon-btn"
            onClick={undo}
            disabled={history.past.length === 0}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            className="top-action-btn icon-btn"
            onClick={redo}
            disabled={history.future.length === 0}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
          <button
            className="top-action-btn icon-btn"
            onClick={() => fitView({ padding: 0.2 })}
            title="Fit to Canvas (F)"
          >
            ⛶
          </button>
          <div className="header-divider" />
          <button
            className="top-action-btn primary"
            onClick={() => alert("Ready to simulate circuit in SPICE.")}
          >
            ▶ Run SPICE
          </button>
        </div>
      </header>

      {/* =====================================================
          2. MAIN WORKSPACE (3-Panel Grid)
          ===================================================== */}

      <div
        className={`workspace-body ${
          isLeftCollapsed && isRightCollapsed
            ? "both-collapsed"
            : isLeftCollapsed
              ? "left-collapsed"
              : isRightCollapsed
                ? "right-collapsed"
                : ""
        }`}
      >
        {/* ===================================================
            LEFT COMPONENT LIBRARY SIDEBAR
            =================================================== */}

        {!isLeftCollapsed && (
          <aside className="component-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">Components</span>
            </div>

            <div className="search-box-container">
              <div className="search-input-wrapper">
                <span className="search-icon">⌕</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search components..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="component-tree-list">
              {categories.map((cat) => {
                const items = filteredCatalog.filter((c) => c.category === cat)
                if (items.length === 0) return null
                return (
                  <div key={cat} className="category-group">
                    <span className="category-heading">{cat}</span>
                    {items.map((item) => (
                      <button
                        key={item.type}
                        className="comp-item-btn"
                        onClick={() => addComponent(item.type)}
                        title={`${item.name} (${item.hotkey})`}
                      >
                        <div className="comp-item-left">
                          <span className="comp-icon">{item.icon}</span>
                          <span className="comp-name">{item.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}

              <div className="category-group">
                <span className="category-heading">Connectors</span>
                <button className="comp-item-btn" onClick={addJunction} title="Solder Dot (J)">
                  <div className="comp-item-left">
                    <span className="comp-icon comp-icon--dot">{CompIcon.junction}</span>
                    <span className="comp-name">Solder Dot</span>
                  </div>
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* ===================================================
            MAIN SCHEMATIC CANVAS
            =================================================== */}

        <main
          className={`schematic-viewport ${activeTool === "wire" ? "wire-mode-active" : ""}`}
          onMouseMove={onPaneMouseMove}
          onMouseEnter={() => setIsHoveringCanvas(true)}
          onMouseLeave={() => setIsHoveringCanvas(false)}
        >
          {/* Floating Canvas Toolbar */}
          <div className="floating-canvas-toolbar">
            <button
              className={`canvas-tool-btn ${activeTool === "select" ? "active" : ""}`}
              onClick={() => setActiveTool("select")}
              title="Select Tool (V)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1.5L13.5 8L8.8 9.2L6.3 14.5L3 1.5Z" />
              </svg>
            </button>
            <button
              className={`canvas-tool-btn ${activeTool === "wire" ? "active" : ""}`}
              onClick={() => setActiveTool("wire")}
              title="Wire Tool (W / F3)"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 13.5H8.5V2.5H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="2.5" cy="13.5" r="1.5" fill="currentColor"/>
                <circle cx="13.5" cy="2.5" r="1.5" fill="currentColor"/>
              </svg>
            </button>
            <div className="canvas-tool-separator" />
            <button
              className="canvas-tool-btn"
              onClick={clearCanvas}
              disabled={nodes.length === 0 && edges.length === 0}
              title="Clear Entire Canvas"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 4H13M5.5 4V2.5C5.5 2.2 5.7 2 6 2H10C10.3 2 10.5 2.2 10.5 2.5V4M12 4V13.5C12 13.8 11.8 14 11.5 14H4.5C4.2 14 4 13.8 4 13.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6.5 7V11M9.5 7V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Floating Zoom Widget (Bottom-Right) */}
          <div className="floating-zoom-widget">
            <button className="zoom-btn" onClick={() => zoomOut()} title="Zoom Out">
              −
            </button>
            <span className="zoom-label">{zoomLevel}%</span>
            <button className="zoom-btn" onClick={() => zoomIn()} title="Zoom In">
              +
            </button>
            <button
              className="zoom-btn"
              onClick={() => fitView({ padding: 0.2 })}
              title="Fit to Screen"
            >
              ⛶
            </button>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges.map((edge) => ({
              ...edge,
              data: {
                ...edge.data,
                onOffsetChange: updateEdgeOffset,
                onWaypointsChange: updateEdgeWaypoints,
              },
            }))}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onEdgeClick={onEdgeClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDoubleClick={onPaneDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={SchematicConnectionLine}
            connectionLineType={ConnectionLineType.Step}
            defaultEdgeOptions={{ type: "step", animated: false }}
            nodesConnectable={activeTool === "wire"}
            elementsSelectable={activeTool === "select"}
            snapToGrid
            snapGrid={[20, 20]}
            fitView
            deleteKeyCode={null}
            minZoom={0.2}
            maxZoom={2.5}
          >
            {/* LTspice CAD Crosshair Guides & Live Wire Preview */}
            <CadCrosshairLayer
              activeTool={activeTool}
              cursorGridPos={cursorPos}
              isHoveringCanvas={isHoveringCanvas}
              wireDraft={wireDraft}
            />

            {/* Fine Dotted CAD Grid */}
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="#9ca3af"
            />
            <MiniMap />
          </ReactFlow>
        </main>

        {/* ===================================================
            RIGHT PROPERTIES / INSPECTOR PANEL
            =================================================== */}

        {!isRightCollapsed && (
          <aside className="inspector-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">Properties</span>
            </div>

            {selectedNode ? (
              <div className="inspector-body">
                <div className="inspector-section">
                  <span className="inspector-section-heading">Component</span>
                  <div className="prop-row">
                    <span className="prop-label">Reference</span>
                    <span className="prop-val">{selectedNode.id}</span>
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Type</span>
                    <span className="prop-val">
                      {selectedNode.type === "junction"
                        ? "Junction Dot"
                        : selectedNode.data.type}
                    </span>
                  </div>

                  {selectedNode.type === "schematic" &&
                    selectedNode.data.type !== "ground" &&
                    (selectedNode.data.type === "diode" ? (
                      <>
                        <div className="prop-row">
                          <span className="prop-label">Model</span>
                          <CustomSelect
                            value={
                              DEVICE_UNITS.diode.find(
                                (u) =>
                                  u.unit.toLowerCase() ===
                                  (selectedNode.data.value ?? "").toLowerCase(),
                              )?.unit ?? "Custom"
                            }
                            options={DEVICE_UNITS.diode}
                            onChange={(newUnit) => {
                              if (newUnit === "Custom") {
                                updateSelectedValue("1N4148")
                              } else {
                                updateSelectedValue(newUnit)
                              }
                              pushSnapshot(nodes, edges)
                            }}
                          />
                        </div>
                        {!DEVICE_UNITS.diode.some(
                          (u) =>
                            u.unit !== "Custom" &&
                            u.unit.toLowerCase() ===
                              (selectedNode.data.value ?? "").toLowerCase(),
                        ) && (
                          <div className="prop-row">
                            <span className="prop-label">Custom Part</span>
                            <input
                              type="text"
                              className="prop-input-control"
                              value={selectedNode.data.value ?? ""}
                              onChange={(e) => updateSelectedValue(e.target.value)}
                              onBlur={() => pushSnapshot(nodes, edges)}
                              placeholder="e.g. 1N4148"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      (() => {
                        const compType = selectedNode.data.type as SchematicComponentType
                        const units = DEVICE_UNITS[compType] || DEVICE_UNITS.generic
                        const { magnitude, unit } = parseComponentValue(
                          compType,
                          selectedNode.data.value,
                        )

                        return (
                          <>
                            <div className="prop-row">
                              <span className="prop-label">Value</span>
                              <input
                                type="text"
                                className="prop-input-control"
                                value={magnitude}
                                onChange={(e) => {
                                  const newMag = e.target.value
                                  const parsed = parseComponentValue(compType, newMag)
                                  if (parsed.magnitude !== newMag && parsed.unit !== unit) {
                                    updateSelectedValue(
                                      formatComponentValue(compType, parsed.magnitude, parsed.unit),
                                    )
                                  } else {
                                    updateSelectedValue(
                                      formatComponentValue(compType, newMag, unit),
                                    )
                                  }
                                }}
                                onBlur={() => pushSnapshot(nodes, edges)}
                                placeholder="e.g. 10"
                              />
                            </div>

                            <div className="prop-row">
                              <span className="prop-label">Unit</span>
                              <CustomSelect
                                value={unit}
                                options={units}
                                onChange={(newUnit) => {
                                  updateSelectedValue(
                                    formatComponentValue(compType, magnitude, newUnit),
                                  )
                                  pushSnapshot(nodes, edges)
                                }}
                              />
                            </div>
                          </>
                        )
                      })()
                    ))}
                </div>

                <div className="inspector-section">
                  <span className="inspector-section-heading">Geometry</span>
                  <div className="prop-row">
                    <span className="prop-label">Position X</span>
                    <span className="prop-val">
                      {Math.round(selectedNode.position.x)}
                    </span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Position Y</span>
                    <span className="prop-val">
                      {Math.round(selectedNode.position.y)}
                    </span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Rotation</span>
                    <span className="prop-val">
                      {selectedNode.data?.rotation ?? 0}°
                    </span>
                  </div>
                </div>

                <div className="inspector-btn-group">
                  <button className="inspector-btn" onClick={rotateSelected}>
                    ↻ Rotate 90° (R)
                  </button>
                  <button className="inspector-btn danger" onClick={deleteSelected}>
                    Delete Object
                  </button>
                </div>
              </div>
            ) : selectedEdge ? (
              <div className="inspector-body">
                <div className="inspector-section">
                  <span className="inspector-section-heading">Wire Path</span>
                  <div className="prop-row">
                    <span className="prop-label">Wire ID</span>
                    <span className="prop-val">{selectedEdge.id.slice(0, 14)}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Connection</span>
                    <span className="prop-val">
                      {selectedEdge.source} ➔ {selectedEdge.target}
                    </span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-label">Bend Mode</span>
                    <span className="prop-val accent" style={{ textTransform: "capitalize" }}>
                      {selectedEdge.data?.bendMode ?? "horizontal-step"}
                    </span>
                  </div>
                </div>

                <div className="inspector-btn-group">
                  <button className="inspector-btn" onClick={() => flipEdgeBend(selectedEdge.id)}>
                    ⤭ Flip Bend (Space)
                  </button>
                  <button className="inspector-btn danger" onClick={deleteSelected}>
                    Delete Wire
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-inspector">
                <div className="empty-inspector-icon">◈</div>
                <div>Nothing selected</div>
                <div className="empty-inspector-hint">
                  Click a component or wire to inspect its properties.
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* =====================================================
          3. STATUS BAR (Technical, Minimal, Ultra-Crisp)
          ===================================================== */}

      <footer className="app-statusbar">
        <div className="status-segment">
          <div className="status-dot-active" />
          <span>Ready</span>
        </div>

        <div className="status-segment">
          <span>Grid 20mil</span>
        </div>

        <div className="status-segment">
          <span>Snap ON</span>
        </div>

        <div className="status-segment">
          <span>Zoom {zoomLevel}%</span>
        </div>

        <div className="status-segment">
          <span>X {cursorPos.x}</span>
          <span style={{ marginLeft: 6 }}>Y {cursorPos.y}</span>
        </div>

        <div className="status-spacer" />

        {activeTool === "wire" && (
          <div className="status-segment">
            <span className="status-tool-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
                <path d="M2.5 13.5H8.5V2.5H13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="2.5" cy="13.5" r="1.5" fill="currentColor"/>
                <circle cx="13.5" cy="2.5" r="1.5" fill="currentColor"/>
              </svg>
              Wire Mode
            </span>
          </div>
        )}

        <div className="status-segment">
          <span>{nodes.length} comps · {edges.length} wires</span>
        </div>
      </footer>

      {/* =====================================================
          4. NATIVE CONTEXT MENU
          ===================================================== */}

      {contextMenu.visible && (
        <div
          className="context-menu-wrapper"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeId && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  rotateSelected()
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Rotate 90°</span> <span className="shortcut">R</span>
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => {
                  deleteSelected()
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Delete</span> <span className="shortcut">Del</span>
              </button>
            </>
          )}

          {contextMenu.edgeId && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  flipEdgeBend(contextMenu.edgeId!)
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Flip Bend</span> <span className="shortcut">Space</span>
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => {
                  deleteSelected()
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Delete Wire</span> <span className="shortcut">Del</span>
              </button>
            </>
          )}

          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  addComponent("resistor")
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Place Resistor</span> <span className="shortcut">R</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  addComponent("capacitor")
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Place Capacitor</span> <span className="shortcut">C</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  addComponent("ground")
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Place Ground</span> <span className="shortcut">G</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => {
                  addJunction()
                  setContextMenu({ visible: false, x: 0, y: 0 })
                }}
              >
                <span>Place Solder Dot</span> <span className="shortcut">J</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <SchematicEditor />
    </ReactFlowProvider>
  )
}
