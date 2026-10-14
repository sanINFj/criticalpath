import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
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
  getComponentPins,
  getRotatedPinPos,
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
  type PlacingComponent,
} from "./components/schematic/CadCrosshairLayer"
import ComponentLibraryModal, {
  type ComponentItem,
} from "./components/ComponentLibraryModal"
import ConfigureAnalysisModal, {
  type AnalysisConfig,
  DEFAULT_ANALYSIS_CONFIG,
} from "./components/ConfigureAnalysisModal"
import SimulationSettingsModal, {
  type SolverSettings,
  DEFAULT_SOLVER_SETTINGS,
} from "./components/SimulationSettingsModal"
import SpiceNetlistModal from "./components/SpiceNetlistModal"
import WaveformViewer from "./components/WaveformViewer"
import DiagnosticsPanel from "./components/DiagnosticsPanel"
import ValidationBlockedModal from "./components/ValidationBlockedModal"
import ComponentPropertiesModal from "./components/ComponentPropertiesModal"
import AutomaticMeasurementsPanel from "./components/AutomaticMeasurementsPanel"
import {
  generateSpiceNetlist,
  type NetlistGenerationResult,
  type NetlistValidationError,
} from "./utils/spiceNetlist"
import type {
  SimulationRunResult,
  NgspiceEngineStatus,
} from "../../shared/simulation"

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

  const compType = (node.data?.type ?? "generic") as SchematicComponentType
  const pins = getComponentPins(compType)
  const targetPin = pins.find((p) => p.id === handleId) || pins[0]
  if (!targetPin) {
    return { x: node.position.x + 60, y: node.position.y + 40 }
  }

  const rotPos = getRotatedPinPos(targetPin, node.data?.rotation ?? 0)
  return {
    x: node.position.x + rotPos.x,
    y: node.position.y + rotPos.y,
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
      const compType = (node.data?.type ?? "generic") as SchematicComponentType
      const pins = getComponentPins(compType)
      for (const pin of pins) {
        const pCoord = getPinCoord(node, pin.id)
        if (Math.abs(pCoord.x - x) < 8 && Math.abs(pCoord.y - y) < 8) {
          return { nodeId: node.id, handleId: pin.id }
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

export type LibraryCategory =
  | "Passives"
  | "Sources"
  | "Diodes"
  | "Transistors"
  | "Analog & Power"
  | "Digital Logic"
  | "Power"

interface CompDef {
  type: SchematicComponentType
  name: string
  icon: React.ReactNode
  hotkey: string
  category: LibraryCategory
  defaultValue?: string
}

// Clean inline SVG circuit icons for each component type
const CompIcon = {
  resistor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="3" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="22" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  capacitor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="14" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  inductor: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8 Q6 2 8 8 Q10 2 12 8 Q14 2 16 8 Q18 2 20 8 Q22 2 24 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="24" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  potentiometer: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="9" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="5" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="23" y1="9" x2="28" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <line x1="14" y1="0" x2="14" y2="5" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="11,4 14,8 17,4" fill="currentColor" />
    </svg>
  ),
  transformer: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M4 2 Q7 4 4 6 Q7 8 4 10 Q7 12 4 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="16" y1="2" x2="16" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M24 2 Q21 4 24 6 Q21 8 24 10 Q21 12 24 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  'coupled-inductor': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M2 5 Q5 1 8 5 Q11 1 14 5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M2 13 Q5 9 8 13 Q11 9 14 13" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <circle cx="21" cy="4" r="1.5" fill="currentColor" />
      <circle cx="21" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  'transmission-line': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="4" x2="28" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
    </svg>
  ),
  'voltage-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" strokeWidth="1.2" />
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'current-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="15,5.5 18,8 15,10.5" fill="currentColor" />
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'ac-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8 Q12 4 14 8 Q16 12 18 8" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'pulse-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 10 L12 10 L12 5 L16 5 L16 10 L19 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  vcvs: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="14,1 23,8 14,15 5,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="14" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">E</text>
    </svg>
  ),
  vccs: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="14,1 23,8 14,15 5,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="14" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">G</text>
    </svg>
  ),
  cccs: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="14,1 23,8 14,15 5,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="14" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">F</text>
    </svg>
  ),
  ccvs: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="14,1 23,8 14,15 5,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="14" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">H</text>
    </svg>
  ),
  'behavioral-source': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <circle cx="14" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">B</text>
    </svg>
  ),
  diode: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="8,3 8,13 18,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="18" y1="3" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" />
      <line x1="18" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'zener-diode': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="8,3 8,13 18,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M16 3 L18 3 L18 13 L20 13" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="18" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'schottky-diode': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="8,3 8,13 18,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M16 5 L16 3 L18 3 L18 13 L20 13 L20 11" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <line x1="18" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  led: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="8,3 8,13 18,8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="18" y1="3" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" />
      <line x1="18" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="13" y1="2" x2="17" y2="0" stroke="currentColor" strokeWidth="1.2" />
      <line x1="16" y1="4" x2="20" y2="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  'npn-bjt': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="5" x2="20" y2="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9" y1="11" x2="20" y2="15" stroke="currentColor" strokeWidth="1.3" />
      <polygon points="17,12 21,15 16,16" fill="currentColor" />
    </svg>
  ),
  'pnp-bjt': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="5" x2="20" y2="1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9" y1="11" x2="20" y2="15" stroke="currentColor" strokeWidth="1.3" />
      <polygon points="13,11 10,13 14,14" fill="currentColor" />
    </svg>
  ),
  nmos: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="2" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="2" x2="12" y2="14" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3,1.5" />
      <line x1="12" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="12" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  pmos: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="2" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3,1.5" />
      <line x1="14" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="14" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  'jfet-n': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="7,8 10,10 7,12" fill="currentColor" />
      <line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" strokeWidth="2.5" />
      <line x1="10" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="10" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  'jfet-p': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="5,10 8,8 8,12" fill="currentColor" />
      <line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" strokeWidth="2.5" />
      <line x1="10" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="10" y1="13" x2="22" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  opamp: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="5,1 23,8 5,15" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="8" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10" y1="9.5" x2="10" y2="12.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  comparator: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="5,1 23,8 5,15" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="12" y="10" fontSize="7" fontWeight="bold" fill="currentColor" textAnchor="middle">C</text>
      <line x1="23" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'timer-555': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="5" y="1" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="11" fontSize="7" fontWeight="bold" fill="currentColor" textAnchor="middle">555</text>
    </svg>
  ),
  'voltage-regulator': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="4" y="2" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="10.5" fontSize="6.5" fontWeight="bold" fill="currentColor" textAnchor="middle">7805</text>
    </svg>
  ),
  switch: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="8" r="1.5" fill="currentColor" />
      <line x1="9" y1="8" x2="19" y2="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="8" r="1.5" fill="currentColor" />
      <line x1="21" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'gate-and': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M4 2 L14 2 A7 7 0 0 1 14 14 L4 14 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="21" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'gate-or': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M4 2 Q9 8 4 14 Q15 14 21 8 Q15 2 4 2 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="21" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'gate-not': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="5,2 19,8 5,14" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="21" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="23" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'gate-nand': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M3 2 L12 2 A6 6 0 0 1 12 14 L3 14 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="20" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="22" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  'gate-nor': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M3 2 Q8 8 3 14 Q13 14 19 8 Q13 2 3 2 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="21" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="23" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  'gate-xor': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M2 2 Q7 8 2 14" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M6 2 Q11 8 6 14 Q16 14 22 8 Q16 2 6 2 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <line x1="22" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  'gate-xnor': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <path d="M1 2 Q6 8 1 14" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M5 2 Q10 8 5 14 Q14 14 19 8 Q14 2 5 2 Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="21" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="23" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  'flipflop-d': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="5" y="1" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="11" fontSize="7" fontWeight="bold" fill="currentColor" textAnchor="middle">D-FF</text>
    </svg>
  ),
  'flipflop-jk': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="5" y="1" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="11" fontSize="6.5" fontWeight="bold" fill="currentColor" textAnchor="middle">JK-FF</text>
    </svg>
  ),
  'mux-2to1': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <polygon points="5,2 23,4 23,12 5,14" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="14" y="11" fontSize="6" fontWeight="bold" fill="currentColor" textAnchor="middle">MUX</text>
    </svg>
  ),
  'counter-4bit': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="4" y="1" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <text x="14" y="11" fontSize="6" fontWeight="bold" fill="currentColor" textAnchor="middle">CTR4</text>
    </svg>
  ),
  ground: (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      <line x1="10" y1="0" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  vcc: (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      <line x1="10" y1="16" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.8" />
      <polygon points="10,0 4,6 16,6" fill="currentColor" opacity="0.7" />
    </svg>
  ),
  generic: (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="8" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="0" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" />
      <line x1="20" y1="6" x2="28" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="20" y1="10" x2="28" y2="10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  junction: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    </svg>
  ),
  'net-label': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="6,2 20,2 25,8 20,14 6,14" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="13" y="11" fontSize="6.5" fontWeight="bold" fill="currentColor" textAnchor="middle">NET</text>
    </svg>
  ),
} as const

/* ============================================================
   ENGINEERING UNITS & SPICE MODELS PER DEVICE TYPE
   Imported from ./components/ComponentPropertiesModal
   ============================================================ */

const COMPONENT_CATALOG: CompDef[] = [
  // 1. Passives
  { type: "resistor", name: "Resistor", icon: CompIcon.resistor, hotkey: "R", category: "Passives", defaultValue: "10kΩ" },
  { type: "capacitor", name: "Capacitor", icon: CompIcon.capacitor, hotkey: "C", category: "Passives", defaultValue: "1µF" },
  { type: "inductor", name: "Inductor", icon: CompIcon.inductor, hotkey: "L", category: "Passives", defaultValue: "10mH" },
  { type: "potentiometer", name: "Potentiometer", icon: CompIcon.potentiometer, hotkey: "P", category: "Passives", defaultValue: "10kΩ" },
  { type: "transformer", name: "Transformer", icon: CompIcon.transformer, hotkey: "T", category: "Passives", defaultValue: "1:1" },
  { type: "coupled-inductor", name: "Coupled Inductor (K)", icon: CompIcon['coupled-inductor'], hotkey: "K", category: "Passives", defaultValue: "K1 L1 L2 0.99" },
  { type: "transmission-line", name: "Transmission Line (T)", icon: CompIcon['transmission-line'], hotkey: "X", category: "Passives", defaultValue: "Z0=50 TD=1n" },

  // 2. Sources
  { type: "voltage-source", name: "DC Voltage Source", icon: CompIcon['voltage-source'], hotkey: "V", category: "Sources", defaultValue: "5V" },
  { type: "current-source", name: "DC Current Source", icon: CompIcon['current-source'], hotkey: "I", category: "Sources", defaultValue: "1mA" },
  { type: "ac-source", name: "AC Voltage Source", icon: CompIcon['ac-source'], hotkey: "A", category: "Sources", defaultValue: "SINE(0 1 1k)" },
  { type: "pulse-source", name: "Pulse Voltage Source", icon: CompIcon['pulse-source'], hotkey: "U", category: "Sources", defaultValue: "PULSE(0 5 0 1n 1n 10u 20u)" },
  { type: "vcvs", name: "VCVS (E-Source)", icon: CompIcon.vcvs, hotkey: "E", category: "Sources", defaultValue: "1.0" },
  { type: "vccs", name: "VCCS (G-Source)", icon: CompIcon.vccs, hotkey: "G", category: "Sources", defaultValue: "1m" },
  { type: "cccs", name: "CCCS (F-Source)", icon: CompIcon.cccs, hotkey: "F", category: "Sources", defaultValue: "1.0" },
  { type: "ccvs", name: "CCVS (H-Source)", icon: CompIcon.ccvs, hotkey: "H", category: "Sources", defaultValue: "1k" },
  { type: "behavioral-source", name: "Behavioral Source (B)", icon: CompIcon['behavioral-source'], hotkey: "B", category: "Sources", defaultValue: "V=V(in)*2" },

  // 3. Diodes
  { type: "diode", name: "Diode (1N4148)", icon: CompIcon.diode, hotkey: "D", category: "Diodes", defaultValue: "1N4148" },
  { type: "zener-diode", name: "Zener Diode", icon: CompIcon['zener-diode'], hotkey: "Z", category: "Diodes", defaultValue: "BZX84C5V1" },
  { type: "schottky-diode", name: "Schottky Diode", icon: CompIcon['schottky-diode'], hotkey: "S", category: "Diodes", defaultValue: "1N5819" },
  { type: "led", name: "LED", icon: CompIcon.led, hotkey: "L", category: "Diodes", defaultValue: "RED" },

  // 4. Transistors
  { type: "npn-bjt", name: "NPN BJT (2N2222)", icon: CompIcon['npn-bjt'], hotkey: "Q", category: "Transistors", defaultValue: "2N2222" },
  { type: "pnp-bjt", name: "PNP BJT (2N2907)", icon: CompIcon['pnp-bjt'], hotkey: "W", category: "Transistors", defaultValue: "2N2907" },
  { type: "nmos", name: "NMOS FET (2N7000)", icon: CompIcon.nmos, hotkey: "M", category: "Transistors", defaultValue: "2N7000" },
  { type: "pmos", name: "PMOS FET (IRF9530)", icon: CompIcon.pmos, hotkey: "O", category: "Transistors", defaultValue: "IRF9530" },
  { type: "jfet-n", name: "N-JFET (2N5457)", icon: CompIcon['jfet-n'], hotkey: "J", category: "Transistors", defaultValue: "2N5457" },
  { type: "jfet-p", name: "P-JFET (2N5460)", icon: CompIcon['jfet-p'], hotkey: "Y", category: "Transistors", defaultValue: "2N5460" },

  // 5. Analog & Power
  { type: "opamp", name: "Op-Amp (LM741)", icon: CompIcon.opamp, hotkey: "A", category: "Analog & Power", defaultValue: "LM741" },
  { type: "comparator", name: "Comparator (LM393)", icon: CompIcon.comparator, hotkey: "C", category: "Analog & Power", defaultValue: "LM393" },
  { type: "timer-555", name: "555 Timer (NE555)", icon: CompIcon['timer-555'], hotkey: "5", category: "Analog & Power", defaultValue: "NE555" },
  { type: "voltage-regulator", name: "Voltage Regulator (7805)", icon: CompIcon['voltage-regulator'], hotkey: "R", category: "Analog & Power", defaultValue: "LM7805" },
  { type: "switch", name: "Voltage Switch (SW)", icon: CompIcon.switch, hotkey: "S", category: "Analog & Power", defaultValue: "SW" },

  // 6. Digital Logic
  { type: "gate-and", name: "AND Gate (74HC08)", icon: CompIcon['gate-and'], hotkey: "&", category: "Digital Logic", defaultValue: "74HC08" },
  { type: "gate-or", name: "OR Gate (74HC32)", icon: CompIcon['gate-or'], hotkey: "|", category: "Digital Logic", defaultValue: "74HC32" },
  { type: "gate-not", name: "NOT Gate / Inverter", icon: CompIcon['gate-not'], hotkey: "~", category: "Digital Logic", defaultValue: "74HC04" },
  { type: "gate-nand", name: "NAND Gate (74HC00)", icon: CompIcon['gate-nand'], hotkey: "!", category: "Digital Logic", defaultValue: "74HC00" },
  { type: "gate-nor", name: "NOR Gate (74HC02)", icon: CompIcon['gate-nor'], hotkey: "^", category: "Digital Logic", defaultValue: "74HC02" },
  { type: "gate-xor", name: "XOR Gate (74HC86)", icon: CompIcon['gate-xor'], hotkey: "$", category: "Digital Logic", defaultValue: "74HC86" },
  { type: "gate-xnor", name: "XNOR Gate (74HC266)", icon: CompIcon['gate-xnor'], hotkey: "#", category: "Digital Logic", defaultValue: "74HC266" },
  { type: "flipflop-d", name: "D Flip-Flop (74HC74)", icon: CompIcon['flipflop-d'], hotkey: "D", category: "Digital Logic", defaultValue: "74HC74" },
  { type: "flipflop-jk", name: "JK Flip-Flop (74HC73)", icon: CompIcon['flipflop-jk'], hotkey: "K", category: "Digital Logic", defaultValue: "74HC73" },
  { type: "mux-2to1", name: "2:1 Multiplexer", icon: CompIcon['mux-2to1'], hotkey: "M", category: "Digital Logic", defaultValue: "74HC157" },
  { type: "counter-4bit", name: "4-Bit Counter (74HC161)", icon: CompIcon['counter-4bit'], hotkey: "N", category: "Digital Logic", defaultValue: "74HC161" },

  // 7. Power
  { type: "ground", name: "Ground (0V)", icon: CompIcon.ground, hotkey: "G", category: "Power" },
  { type: "vcc", name: "VCC Power Rail", icon: CompIcon.vcc, hotkey: "P", category: "Power", defaultValue: "+5V" },
  { type: "net-label", name: "Net Label", icon: CompIcon['net-label'], hotkey: "F4", category: "Power", defaultValue: "NET1" },
  { type: "generic", name: "Generic Component", icon: CompIcon.generic, hotkey: "U", category: "Power", defaultValue: "U1" },
]

const FULL_CATALOG_WITH_CONNECTORS: ComponentItem[] = [
  ...COMPONENT_CATALOG,
  {
    type: "junction",
    name: "Solder Dot (Junction)",
    icon: CompIcon.junction,
    hotkey: "J",
    category: "Connectors",
    defaultValue: "Junction",
  },
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
  const { screenToFlowPosition, project, zoomIn, zoomOut, fitView, getZoom, setCenter } =
    useReactFlow()

  const [nodes, setNodes] = useState<Node<SchematicNodeData>[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<"select" | "wire" | "junction">("select")
  const [placingComponent, setPlacingComponent] = useState<PlacingComponent | null>(null)

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 })

  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [zoomLevel, setZoomLevel] = useState(100)

  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [propertiesModalNode, setPropertiesModalNode] = useState<Node<SchematicNodeData> | null>(null)
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false)

  // Simulation & Analysis State
  const [isConfigAnalysisOpen, setIsConfigAnalysisOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(DEFAULT_ANALYSIS_CONFIG)
  const [solverSettings, setSolverSettings] = useState<SolverSettings>(DEFAULT_SOLVER_SETTINGS)
  const [simStatus, setSimStatus] = useState<"idle" | "running" | "paused">("idle")
  const [simMessage, setSimMessage] = useState<string>("Ready")

  // Real ngspice Engine & Numerical Results State
  const [engineStatus, setEngineStatus] = useState<NgspiceEngineStatus | null>(null)
  const [lastSimResult, setLastSimResult] = useState<SimulationRunResult | null>(null)
  const [isWaveformOpen, setIsWaveformOpen] = useState(false)
  const [waveformHeight, setWaveformHeight] = useState(320)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [diagnosticsHeight, setDiagnosticsHeight] = useState(240)
  const [isValidationBlockedModalOpen, setIsValidationBlockedModalOpen] = useState(false)
  const [isMeasurementsOpen, setIsMeasurementsOpen] = useState(false)
  const [measurementsHeight] = useState(300)
  const [bottomPanelTab, setBottomPanelTab] = useState<"diagnostics" | "waveforms" | "measurements">("diagnostics")

  const refreshEngineStatus = useCallback(async () => {
    if (window.api?.checkEngine) {
      try {
        const status = await window.api.checkEngine()
        setEngineStatus(status)
      } catch (err: any) {
        setEngineStatus({
          available: false,
          error: `IPC error checking engine: ${err.message || String(err)}`,
        })
      }
    } else {
      setEngineStatus({
        available: false,
        error: "Simulation IPC interface (window.api) not detected. Please restart Electron.",
      })
    }
  }, [])

  useEffect(() => {
    refreshEngineStatus()
    const interval = setInterval(refreshEngineStatus, 3000)
    return () => clearInterval(interval)
  }, [refreshEngineStatus])

  // Interactive Net Highlighting State
  const [highlightedNet, setHighlightedNet] = useState<string | null>(null)

  // Netlist Inspection & Validation State
  const [isNetlistModalOpen, setIsNetlistModalOpen] = useState(false)
  const [netlistResult, setNetlistResult] = useState<NetlistGenerationResult | null>(null)
  const [netlistModalTab, setNetlistModalTab] = useState<"netlist" | "validation">("netlist")

  // Real-time circuit connectivity & ERC validation (reactive to canvas changes)
  const liveConnectivity = useMemo<NetlistGenerationResult>(() => {
    return generateSpiceNetlist(nodes, edges, analysisConfig, solverSettings)
  }, [nodes, edges, analysisConfig, solverSettings])

  // Clickable ERC error navigation: center and highlight problematic component on canvas
  // Clickable ERC error navigation: center and highlight problematic component on canvas
  const locateComponent = useCallback(
    (componentId?: string, netName?: string) => {
      if (componentId) {
        const targetNode = nodes.find((n) => n.id === componentId)
        if (targetNode) {
          setSelectedNodeId(targetNode.id)
          setSelectedEdgeId(null)
          if (setCenter) {
            setCenter(targetNode.position.x + 60, targetNode.position.y + 40, {
              zoom: 1.25,
              duration: 400,
            })
          }
        }
      }
      if (netName) {
        setHighlightedNet(netName)
      }
    },
    [nodes, setCenter],
  )

  const handleErcIssueClick = useCallback(
    (issue: NetlistValidationError) => {
      locateComponent(issue.componentId, issue.netName)
      setIsDiagnosticsOpen(true)
      setBottomPanelTab("diagnostics")
    },
    [locateComponent],
  )

  const handleExportNetlist = useCallback(() => {
    setNetlistResult(liveConnectivity)
    setNetlistModalTab(liveConnectivity.success ? "netlist" : "validation")
    setIsNetlistModalOpen(true)
  }, [liveConnectivity])

  const runOrPauseSimulation = useCallback(async () => {
    // Prevent duplicate dialogs/triggers for the same failed run if modal is already open
    if (isValidationBlockedModalOpen) {
      return
    }

    if (simStatus === "running") {
      setSimStatus("paused")
      setSimMessage("Simulation paused")
      return
    }
    if (simStatus === "paused") {
      setSimStatus("running")
      setSimMessage(`Resuming ${analysisConfig.command}...`)
      return
    }

    // Validate connectivity & generate valid SPICE netlist
    const result = liveConnectivity
    setNetlistResult(result)

    if (!result.success && result.errors.length > 0) {
      setSimMessage(
        `Simulation blocked: ${result.errors.length} validation ${result.errors.length === 1 ? "error" : "errors"}`,
      )
      setIsValidationBlockedModalOpen(true)
      return
    }

    setSimStatus("running")
    setSimMessage(
      `Running ngspice: ${analysisConfig.command} (${result.stats.componentCount} comps, ${result.stats.netCount} nets)...`,
    )

    try {
      if (window.api?.runSimulation) {
        const runRes = await window.api.runSimulation(result.netlist, analysisConfig.type)
        setLastSimResult(runRes)
        setSimStatus("idle")

        if (runRes.success) {
          const ptCount =
            runRes.pointCount > 0
              ? `${runRes.pointCount} points`
              : `${runRes.variables.length} vars`
          setSimMessage(
            `Simulation finished: ${ptCount} in ${runRes.elapsedMs}ms (${analysisConfig.command})`,
          )
          setIsWaveformOpen(true)
          setBottomPanelTab("waveforms")
        } else {
          setSimMessage(`Simulation Error: ${runRes.error || "Simulation failed"}`)
          setIsDiagnosticsOpen(true)
          setBottomPanelTab("diagnostics")
        }
      } else {
        setTimeout(() => {
          setSimStatus("idle")
          setSimMessage(`Netlist validated (${analysisConfig.command})`)
        }, 800)
      }
    } catch (err: any) {
      setSimStatus("idle")
      setSimMessage(`Execution Failed: ${err.message || String(err)}`)
      setIsDiagnosticsOpen(true)
      setBottomPanelTab("diagnostics")
    }
  }, [simStatus, liveConnectivity, analysisConfig, isValidationBlockedModalOpen])

  const stopSimulation = useCallback(async () => {
    if (window.api?.stopSimulation) {
      try {
        await window.api.stopSimulation()
      } catch { }
    }
    setSimStatus("idle")
    setSimMessage("Simulation stopped")
  }, [])

  const clearWaveforms = useCallback(() => {
    setLastSimResult(null)
    setSimMessage("Waveforms and diagnostics cleared")
  }, [])

  const [activeTooltip, setActiveTooltip] = useState<{
    text: string
    shortcut?: string
    x: number
    y: number
  } | null>(null)

  const showTooltip = useCallback((e: React.MouseEvent, text: string, shortcut?: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setActiveTooltip({
      text,
      shortcut,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
    })
  }, [])

  const hideTooltip = useCallback(() => {
    setActiveTooltip(null)
  }, [])

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

  // Augmented nodes with net-highlighted pins and ERC visual marker badges
  const augmentedNodes = useMemo(() => {
    return nodes.map((node) => {
      const nodePinsMap = liveConnectivity.nodePinNetMap[node.id] || {}
      const nodeErcMap = liveConnectivity.nodeErcIssues[node.id]

      let highlightedPins: string[] | undefined = undefined
      if (highlightedNet) {
        const matchingPins = Object.entries(nodePinsMap)
          .filter(([_, netName]) => netName === highlightedNet)
          .map(([pinId]) => pinId)

        if (node.type === "junction" || node.data?.type === "ground") {
          const compNet = Object.values(nodePinsMap)[0]
          if (compNet === highlightedNet) {
            matchingPins.push("left", "right", "top", "bottom", "pin1")
          }
        }
        if (matchingPins.length > 0) {
          highlightedPins = matchingPins
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          highlightedPins,
          ercIssues: nodeErcMap,
          onErcClick: handleErcIssueClick,
        },
      }
    })
  }, [nodes, liveConnectivity, highlightedNet, handleErcIssueClick])

  // Augmented edges with net highlighting aura and ERC severity
  const augmentedEdges = useMemo(() => {
    const errorNets = new Set(
      liveConnectivity.errors.filter((e) => e.netName).map((e) => e.netName!),
    )
    const warningNets = new Set(
      liveConnectivity.warnings.filter((w) => w.netName).map((w) => w.netName!),
    )

    return edges.map((edge) => {
      const netName = liveConnectivity.edgeNetMap[edge.id]
      const isHighlighted = Boolean(highlightedNet && netName === highlightedNet)
      const ercSeverity: "error" | "warning" | undefined = netName
        ? errorNets.has(netName)
          ? "error"
          : warningNets.has(netName)
            ? "warning"
            : undefined
        : undefined

      return {
        ...edge,
        data: {
          ...edge.data,
          onOffsetChange: updateEdgeOffset,
          onWaypointsChange: updateEdgeWaypoints,
          isHighlighted,
          netName,
          ercSeverity,
        },
      }
    })
  }, [edges, liveConnectivity, highlightedNet, updateEdgeOffset, updateEdgeWaypoints])

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

  // Reset wire draft or placement if tool changes
  useEffect(() => {
    if (activeTool !== "wire") {
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    } else {
      setPlacingComponent(null)
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

  const placeComponentAt = useCallback(
    (flowPos: { x: number; y: number }) => {
      if (!placingComponent) return
      const targetX = Number.isFinite(flowPos?.x) ? flowPos.x : cursorPos.x
      const targetY = Number.isFinite(flowPos?.y) ? flowPos.y : cursorPos.y
      const snapX = Math.round(targetX / 20) * 20
      const snapY = Math.round(targetY / 20) * 20

      if (placingComponent.type === "junction") {
        pushSnapshot(nodes, edges)
        const junctionId = `J${Date.now().toString().slice(-4)}`
        const hitEdgeResult = findEdgeAtCoord(edges, nodes, snapX, snapY)
        if (hitEdgeResult) {
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
          setEdges((curr) => [
            ...curr.filter((e) => e.id !== hitEdgeResult.edge.id),
            edge1,
            edge2,
          ])
        } else {
          const newJunctionNode: Node = {
            id: junctionId,
            type: "junction",
            position: { x: snapX - 4, y: snapY - 4 },
            data: {},
          }
          setNodes((curr) => [...curr, newJunctionNode])
        }
        setSelectedNodeId(junctionId)
        setSelectedEdgeId(null)
      } else {
        pushSnapshot(nodes, edges)
        const compType = placingComponent.type as SchematicComponentType
        const def = COMPONENT_CATALOG.find((c) => c.type === compType)
        const prefix =
          compType === "resistor"
            ? "R"
            : compType === "capacitor"
              ? "C"
              : compType === "inductor"
                ? "L"
                : compType === "diode"
                  ? "D"
                  : compType === "voltage-source"
                    ? "V"
                    : compType === "current-source"
                      ? "I"
                      : compType === "ground"
                        ? "GND"
                        : compType === "vcc"
                          ? "VCC"
                          : compType === "net-label"
                            ? "NET"
                            : compType === "nmos" || compType === "pmos"
                              ? "M"
                              : compType === "npn-bjt" || compType === "pnp-bjt"
                                ? "Q"
                                : "U"

        let num = 1
        while (nodes.some((n) => n.id === `${prefix}${num}`)) {
          num++
        }
        const id = `${prefix}${num}`
        const newNode: Node<SchematicNodeData> = {
          id,
          type: "schematic",
          position: {
            x: snapX - 60,
            y: snapY - 40,
          },
          data: {
            label: id,
            type: compType,
            value: def?.defaultValue,
            rotation: placingComponent.rotation,
          },
        }

        setNodes((curr) => [...curr, newNode])
        setSelectedNodeId(id)
        setSelectedEdgeId(null)
      }

      setPlacingComponent(null)
    },
    [placingComponent, nodes, edges, pushSnapshot, cursorPos],
  )

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, clickedEdge: Edge) => {
      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })

      if (placingComponent) {
        event.stopPropagation()
        placeComponentAt(flowPos)
        return
      }

      if (activeTool === "wire") {
        event.stopPropagation()
        handleWireCanvasClick(flowPos)
        return
      }
      event.stopPropagation()
      const edgeNet = liveConnectivity.edgeNetMap[clickedEdge.id]
      if (edgeNet) {
        setHighlightedNet((prev) => (prev === edgeNet ? null : edgeNet))
      }
      setSelectedEdgeId(clickedEdge.id)
      setSelectedNodeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, placingComponent, placeComponentAt, handleWireCanvasClick, screenToFlowPosition, project, liveConnectivity],
  )

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, clickedEdge: Edge) => {
      flipEdgeBend(clickedEdge.id)
    },
    [flipEdgeBend],
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })

      if (placingComponent) {
        event.stopPropagation()
        placeComponentAt(flowPos)
        return
      }

      if (activeTool === "wire") {
        event.stopPropagation()
        handleWireCanvasClick(flowPos)
        return
      }
      if (node.type === "junction" || node.data?.type === "ground" || node.data?.type === "net-label") {
        const netName = Object.values(liveConnectivity.nodePinNetMap[node.id] || {})[0]
        if (netName) {
          setHighlightedNet((prev) => (prev === netName ? null : netName))
        }
      }
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, placingComponent, placeComponentAt, handleWireCanvasClick, screenToFlowPosition, project, liveConnectivity],
  )

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord ? getFlowCoord({ x: event.clientX, y: event.clientY }) : cursorPos

      if (placingComponent) {
        event.stopPropagation()
        placeComponentAt(flowPos)
        return
      }

      if (activeTool === "wire") {
        handleWireCanvasClick(flowPos)
        return
      }
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
      setOpenMenu(null)
      setHighlightedNet(null)
    },
    [activeTool, placingComponent, placeComponentAt, handleWireCanvasClick, screenToFlowPosition, project, cursorPos],
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

  const handleApplyComponentProperties = useCallback(
    (
      nodeId: string,
      updates: {
        label?: string
        value?: string
        rotation?: number
      },
    ) => {
      setNodes((curr) => {
        const nextNodes = curr.map((n) => {
          if (n.id !== nodeId) return n
          return {
            ...n,
            data: {
              ...n.data,
              ...(updates.label !== undefined ? { label: updates.label } : {}),
              ...(updates.value !== undefined ? { value: updates.value } : {}),
              ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
            },
          }
        })
        pushSnapshot(nextNodes, edges)
        return nextNodes
      })

      setPropertiesModalNode((curr) => {
        if (!curr || curr.id !== nodeId) return curr
        return {
          ...curr,
          data: {
            ...curr.data,
            ...(updates.label !== undefined ? { label: updates.label } : {}),
            ...(updates.value !== undefined ? { value: updates.value } : {}),
            ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
          },
        }
      })
    },
    [edges, pushSnapshot],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      event.stopPropagation()
      if (placingComponent) {
        setPlacingComponent(null)
        return
      }
      setContextMenu({ visible: false, x: 0, y: 0 })
      setPropertiesModalNode(node as Node<SchematicNodeData>)
      setIsPropertiesModalOpen(true)
    },
    [placingComponent],
  )

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      if (placingComponent) {
        setPlacingComponent(null)
      }
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [placingComponent],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      if (placingComponent) {
        setPlacingComponent(null)
        return
      }
      setSelectedEdgeId(edge.id)
      setSelectedNodeId(null)
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      })
    },
    [placingComponent],
  )

  /* ============================================================
     START COMPONENT / JUNCTION PLACEMENT (CAD Ghost Mode)
     ============================================================ */

  const startPlacingComponent = useCallback(
    (type: SchematicComponentType) => {
      setPlacingComponent((curr) =>
        curr?.type === type ? null : { type, rotation: 0 },
      )
      setActiveTool("select")
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    },
    [],
  )

  const startPlacingJunction = useCallback(() => {
    setPlacingComponent((curr) =>
      curr?.type === "junction" ? null : { type: "junction", rotation: 0 },
    )
    setActiveTool("select")
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
  }, [])

  const addComponent = startPlacingComponent
  const addJunction = startPlacingJunction

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

  const clearCanvas = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return
    pushSnapshot(nodes, edges)
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
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
        if (placingComponent) {
          event.preventDefault()
          setPlacingComponent((prev) =>
            prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null,
          )
          return
        }
        if (selectedNodeId) {
          rotateSelected()
          return
        }
        if (!selectedEdgeId) {
          startPlacingComponent("resistor")
          return
        }
      }

      // Hotkey tool switches & component additions
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "F7") {
          event.preventDefault()
          setIsDiagnosticsOpen((prev) => !prev)
          setBottomPanelTab("diagnostics")
          return
        }

        if (event.key === "F8") {
          event.preventDefault()
          handleExportNetlist()
          return
        }

        if (event.key === "F9") {
          event.preventDefault()
          runOrPauseSimulation()
          return
        }

        if (event.key === "F10") {
          event.preventDefault()
          setIsWaveformOpen((prev) => !prev)
          setBottomPanelTab("waveforms")
          return
        }

        if (event.key === "F11") {
          event.preventDefault()
          setIsMeasurementsOpen((prev) => !prev)
          setBottomPanelTab("measurements")
          return
        }

        if (event.key === "F2") {
          event.preventDefault()
          setIsLibraryOpen((prev) => !prev)
          return
        }

        if (event.key === "F4") {
          event.preventDefault()
          startPlacingComponent("net-label")
          return
        }

        if (event.key === "F5") {
          event.preventDefault()
          deleteSelected()
          return
        }

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
            startPlacingComponent("capacitor")
            break
          case "l":
            startPlacingComponent("inductor")
            break
          case "i":
            startPlacingComponent("current-source")
            break
          case "d":
            startPlacingComponent("diode")
            break
          case "g":
            startPlacingComponent("ground")
            break
          case "m":
            startPlacingComponent("nmos")
            break
          case "o":
            startPlacingComponent("pmos")
            break
          case "q":
            startPlacingComponent("npn-bjt")
            break
          case "j":
            startPlacingJunction()
            break
          case "escape":
            if (highlightedNet) {
              setHighlightedNet(null)
              return
            }
            if (isNetlistModalOpen) {
              setIsNetlistModalOpen(false)
              return
            }
            if (isConfigAnalysisOpen) {
              setIsConfigAnalysisOpen(false)
              return
            }
            if (isSettingsModalOpen) {
              setIsSettingsModalOpen(false)
              return
            }
            if (isLibraryOpen) {
              setIsLibraryOpen(false)
              return
            }
            if (placingComponent) {
              setPlacingComponent(null)
              return
            }
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
    undo,
    redo,
    deleteSelected,
    rotateSelected,
    startPlacingComponent,
    startPlacingJunction,
    placingComponent,
    selectedNodeId,
    selectedEdgeId,
    flipEdgeBend,
    activeTool,
    wireDraft,
    isLibraryOpen,
    isConfigAnalysisOpen,
    isSettingsModalOpen,
    runOrPauseSimulation,
  ])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div
      className="app-shell"
      onClick={() => {
        setContextMenu({ visible: false, x: 0, y: 0 })
      }}
    >
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
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>Open Circuit...</span> <span className="shortcut">Ctrl+O</span>
                  </button>
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>Save Schematic</span> <span className="shortcut">Ctrl+S</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleExportNetlist()
                      setOpenMenu(null)
                    }}
                  >
                    <span>Export Netlist...</span>
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
                  <button className="dropdown-item" onClick={() => { fitView({ padding: 0.2, maxZoom: 1 }); setOpenMenu(null) }}>
                    <span>Fit to Canvas</span> <span className="shortcut">F</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={() => { setIsLibraryOpen(true); setOpenMenu(null) }}>
                    <span>Component Library...</span> <span className="shortcut">F2</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      const targetNode = selectedNode || (nodes.length > 0 ? nodes[0] : null)
                      if (targetNode) {
                        setPropertiesModalNode(targetNode)
                        setIsPropertiesModalOpen(true)
                      }
                      setOpenMenu(null)
                    }}
                  >
                    <span>Component Properties...</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsDiagnosticsOpen(!isDiagnosticsOpen); setBottomPanelTab("diagnostics"); setOpenMenu(null) }}>
                    <span>{isDiagnosticsOpen ? "Hide Diagnostics" : "Simulation Diagnostics"}</span> <span className="shortcut">F7</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsWaveformOpen(!isWaveformOpen); setBottomPanelTab("waveforms"); setOpenMenu(null) }}>
                    <span>{isWaveformOpen ? "Hide Waveform Viewer" : "Waveform Viewer"}</span> <span className="shortcut">F10</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsMeasurementsOpen(!isMeasurementsOpen); setBottomPanelTab("measurements"); setOpenMenu(null) }}>
                    <span>{isMeasurementsOpen ? "Hide Measurements" : "Automatic Measurements"}</span> <span className="shortcut">F11</span>
                  </button>
                </div>
              )}
            </div>

            {/* Simulate Menu */}
            <div className="menu-item-container">
              <button
                className={`menu-trigger ${openMenu === "simulate" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === "simulate" ? null : "simulate")
                }}
              >
                Simulate
              </button>
              {openMenu === "simulate" && (
                <div className="dropdown-menu">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      runOrPauseSimulation()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{simStatus === "running" ? "Pause" : "Run / Pause"}</span>
                    <span className="shortcut">F9</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      stopSimulation()
                      setOpenMenu(null)
                    }}
                    disabled={simStatus === "idle"}
                  >
                    <span>Stop</span>
                    <span className="shortcut">Esc</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsDiagnosticsOpen(true)
                      setBottomPanelTab("diagnostics")
                      setOpenMenu(null)
                    }}
                  >
                    <span>Simulation Diagnostics...</span>
                    <span className="shortcut">F7</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsWaveformOpen(true)
                      setBottomPanelTab("waveforms")
                      setOpenMenu(null)
                    }}
                  >
                    <span>Waveform Viewer...</span>
                    <span className="shortcut">F10</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsMeasurementsOpen(true)
                      setBottomPanelTab("measurements")
                      setOpenMenu(null)
                    }}
                  >
                    <span>Automatic Measurements...</span>
                    <span className="shortcut">F11</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      clearWaveforms()
                      setOpenMenu(null)
                    }}
                  >
                    <span>Clear Waveforms & Diagnostics</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsSettingsModalOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>Settings</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsConfigAnalysisOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>Configure Analysis...</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleExportNetlist()
                      setOpenMenu(null)
                    }}
                  >
                    <span>View SPICE Netlist...</span>
                    <span className="shortcut">F8</span>
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
                  <button className="dropdown-item" onClick={() => { addComponent("inductor"); setOpenMenu(null) }}>
                    <span>Place Inductor</span> <span className="shortcut">L</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("diode"); setOpenMenu(null) }}>
                    <span>Place Diode</span> <span className="shortcut">D</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("voltage-source"); setOpenMenu(null) }}>
                    <span>Place Voltage Source</span> <span className="shortcut">V</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("net-label"); setOpenMenu(null) }}>
                    <span>Place Net Label</span> <span className="shortcut">F4</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addJunction(); setOpenMenu(null) }}>
                    <span>Place Solder Dot</span> <span className="shortcut">J</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setNetlistResult(liveConnectivity)
                      setNetlistModalTab("validation")
                      setIsNetlistModalOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>Electrical Rule Check (ERC)...</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsLibraryOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>Component Library...</span> <span className="shortcut">F2</span>
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

      </header>

      {/* =====================================================
          2. LTSPICE TOP SCHEMATIC TOOLBAR
          ===================================================== */}
      <div className="ltspice-toolbar" role="toolbar" aria-label="LTspice Schematic Toolbar">
        {/* Group 1: Simulation Controls & History */}
        <div className="tb-group tb-group-sim">
          <button
            className={`tb-btn tb-run-btn ${simStatus === "running" ? "active" : ""}`}
            onClick={() => { hideTooltip(); runOrPauseSimulation() }}
            onMouseEnter={(e) =>
              showTooltip(e, simStatus === "running" ? "Pause Simulation" : `Run SPICE (${analysisConfig.command})`, "F9")
            }
            onMouseLeave={hideTooltip}
            aria-label="Run SPICE Simulation"
          >
            <span className="tb-run-icon">{simStatus === "running" ? "⏸" : "▶"}</span>
            <span className="tb-run-text">{simStatus === "running" ? "Pause SPICE" : "Run SPICE"}</span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); undo() }}
            disabled={history.past.length === 0}
            onMouseEnter={(e) => showTooltip(e, "Undo", "Ctrl+Z")}
            onMouseLeave={hideTooltip}
            aria-label="Undo"
          >
            <span className="tb-icon-slot">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); redo() }}
            disabled={history.future.length === 0}
            onMouseEnter={(e) => showTooltip(e, "Redo", "Ctrl+Y")}
            onMouseLeave={hideTooltip}
            aria-label="Redo"
          >
            <span className="tb-icon-slot">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
            </span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${isDiagnosticsOpen ? "active" : ""}`}
            onClick={() => { hideTooltip(); setIsDiagnosticsOpen(!isDiagnosticsOpen); setBottomPanelTab("diagnostics") }}
            onMouseEnter={(e) => showTooltip(e, isDiagnosticsOpen ? "Hide Diagnostics" : "Simulation Diagnostics", "F7")}
            onMouseLeave={hideTooltip}
            aria-label="Simulation Diagnostics"
            style={{
              color: isDiagnosticsOpen ? "#38bdf8" : undefined,
              borderColor: isDiagnosticsOpen ? "rgba(56, 189, 248, 0.4)" : undefined,
            }}
          >
            <span className="tb-icon-slot" style={{ fontSize: 13, lineHeight: 1 }}>
              ⚡
            </span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${isWaveformOpen ? "active" : ""}`}
            onClick={() => { hideTooltip(); setIsWaveformOpen(!isWaveformOpen); setBottomPanelTab("waveforms") }}
            onMouseEnter={(e) => showTooltip(e, isWaveformOpen ? "Hide Waveforms" : "Waveform Viewer", "F10")}
            onMouseLeave={hideTooltip}
            aria-label="Waveform Viewer"
            style={{
              color: isWaveformOpen ? "#38bdf8" : undefined,
              borderColor: isWaveformOpen ? "rgba(56, 189, 248, 0.4)" : undefined,
            }}
          >
            <span className="tb-icon-slot" style={{ fontSize: 13, lineHeight: 1 }}>
              📈
            </span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${isMeasurementsOpen ? "active" : ""}`}
            onClick={() => { hideTooltip(); setIsMeasurementsOpen(!isMeasurementsOpen); setBottomPanelTab("measurements") }}
            onMouseEnter={(e) => showTooltip(e, isMeasurementsOpen ? "Hide Measurements" : "Automatic Measurements", "F11")}
            onMouseLeave={hideTooltip}
            aria-label="Automatic Measurements"
            style={{
              color: isMeasurementsOpen ? "#10b981" : undefined,
              borderColor: isMeasurementsOpen ? "rgba(16, 185, 129, 0.4)" : undefined,
            }}
          >
            <span className="tb-icon-slot" style={{ fontSize: 13, lineHeight: 1 }}>
              📊
            </span>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 2: Wiring & Interconnect */}
        <div className="tb-group">
          <button
            className={`tb-btn tb-icon-btn ${activeTool === "wire" ? "active" : ""}`}
            onClick={() => {
              hideTooltip()
              if (activeTool === "wire") {
                setActiveTool("select")
              } else {
                setActiveTool("wire")
                setPlacingComponent(null)
              }
            }}
            onMouseEnter={(e) => showTooltip(e, "Wire Tool", "W / F3")}
            onMouseLeave={hideTooltip}
            aria-label="Wire Tool"
          >
            <span className="tb-icon-slot">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M3 17H11V3H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="3" cy="17" r="2.2" fill="currentColor" />
                <circle cx="17" cy="3" r="2.2" fill="currentColor" />
              </svg>
            </span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "ground" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("ground") }}
            onMouseEnter={(e) => showTooltip(e, "Ground", "G")}
            onMouseLeave={hideTooltip}
            aria-label="Ground"
          >
            <span className="tb-icon-slot">{CompIcon.ground}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "net-label" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("net-label") }}
            onMouseEnter={(e) => showTooltip(e, "Net Label", "F4")}
            onMouseLeave={hideTooltip}
            aria-label="Net Label"
          >
            <span className="tb-icon-slot">{CompIcon['net-label']}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "junction" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingJunction() }}
            onMouseEnter={(e) => showTooltip(e, "Solder Dot", "J")}
            onMouseLeave={hideTooltip}
            aria-label="Solder Dot"
          >
            <span className="tb-icon-slot">{CompIcon.junction}</span>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 3: Passives & Sources */}
        <div className="tb-group">
          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "resistor" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("resistor") }}
            onMouseEnter={(e) => showTooltip(e, "Resistor", "R")}
            onMouseLeave={hideTooltip}
            aria-label="Resistor"
          >
            <span className="tb-icon-slot">{CompIcon.resistor}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "capacitor" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("capacitor") }}
            onMouseEnter={(e) => showTooltip(e, "Capacitor", "C")}
            onMouseLeave={hideTooltip}
            aria-label="Capacitor"
          >
            <span className="tb-icon-slot">{CompIcon.capacitor}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "inductor" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("inductor") }}
            onMouseEnter={(e) => showTooltip(e, "Inductor", "L")}
            onMouseLeave={hideTooltip}
            aria-label="Inductor"
          >
            <span className="tb-icon-slot">{CompIcon.inductor}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "diode" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("diode") }}
            onMouseEnter={(e) => showTooltip(e, "Diode", "D")}
            onMouseLeave={hideTooltip}
            aria-label="Diode"
          >
            <span className="tb-icon-slot">{CompIcon.diode}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "voltage-source" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("voltage-source") }}
            onMouseEnter={(e) => showTooltip(e, "Voltage Source", "V")}
            onMouseLeave={hideTooltip}
            aria-label="Voltage Source"
          >
            <span className="tb-icon-slot">{CompIcon['voltage-source']}</span>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 4: Transistors & Semiconductors */}
        <div className="tb-group">
          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "nmos" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("nmos") }}
            onMouseEnter={(e) => showTooltip(e, "NMOS Transistor", "M")}
            onMouseLeave={hideTooltip}
            aria-label="NMOS Transistor"
          >
            <span className="tb-icon-slot">{CompIcon.nmos}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "pmos" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("pmos") }}
            onMouseEnter={(e) => showTooltip(e, "PMOS Transistor", "O")}
            onMouseLeave={hideTooltip}
            aria-label="PMOS Transistor"
          >
            <span className="tb-icon-slot">{CompIcon.pmos}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "npn-bjt" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("npn-bjt") }}
            onMouseEnter={(e) => showTooltip(e, "NPN Transistor", "Q")}
            onMouseLeave={hideTooltip}
            aria-label="NPN Transistor"
          >
            <span className="tb-icon-slot">{CompIcon['npn-bjt']}</span>
          </button>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "pnp-bjt" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("pnp-bjt") }}
            onMouseEnter={(e) => showTooltip(e, "PNP Transistor", "W")}
            onMouseLeave={hideTooltip}
            aria-label="PNP Transistor"
          >
            <span className="tb-icon-slot">{CompIcon['pnp-bjt']}</span>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 5: Prominent, Always-Visible Component Library Button */}
        <div className="tb-group tb-group-library">
          <button
            className={`tb-btn tb-btn-library ${isLibraryOpen ? "active" : ""}`}
            onClick={() => { hideTooltip(); setIsLibraryOpen(true) }}
            onMouseEnter={(e) => showTooltip(e, "Component Library (Browse All Symbols)", "F2")}
            onMouseLeave={hideTooltip}
            aria-label="Component Library"
          >
            <span className="tb-lib-icon">
              <svg width="18" height="15" viewBox="0 0 24 18" fill="none">
                <path d="M3 2 L13 2 A7 7 0 0 1 13 16 L3 16 Z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.12" />
                <line x1="20" y1="9" x2="23" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="0" y1="5" x2="3" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="0" y1="13" x2="3" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="tb-lib-text">Component</span>
            <kbd className="tb-lib-kbd">F2</kbd>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 6: Edit & Canvas Actions */}
        <div className="tb-group">
          <button
            className={`tb-btn tb-icon-btn ${activeTool === "select" && !placingComponent ? "active" : ""}`}
            onClick={() => {
              hideTooltip()
              setActiveTool("select")
              setPlacingComponent(null)
            }}
            onMouseEnter={(e) => showTooltip(e, "Select Tool", "Esc / V")}
            onMouseLeave={hideTooltip}
            aria-label="Select Tool"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1.5L13.5 8L8.8 9.2L6.3 14.5L3 1.5Z" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => {
              hideTooltip()
              if (placingComponent) {
                setPlacingComponent((prev) =>
                  prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null,
                )
              } else if (selectedNodeId) {
                rotateSelected()
              }
            }}
            onMouseEnter={(e) => showTooltip(e, "Rotate 90°", "R")}
            onMouseLeave={hideTooltip}
            aria-label="Rotate 90°"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn tb-btn-delete"
            onClick={() => { hideTooltip(); deleteSelected() }}
            disabled={!selectedNodeId && !selectedEdgeId}
            onMouseEnter={(e) => showTooltip(e, "Delete Selected", "Del / F5")}
            onMouseLeave={hideTooltip}
            aria-label="Delete Selected"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 4H13M5.5 4V2.5C5.5 2.2 5.7 2 6 2H10C10.3 2 10.5 2.2 10.5 2.5V4M12 4V13.5C12 13.8 11.8 14 11.5 14H4.5C4.2 14 4 13.8 4 13.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 7V11M9.5 7V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); fitView({ padding: 0.2, maxZoom: 1 }) }}
            onMouseEnter={(e) => showTooltip(e, "Fit to Screen", "F")}
            onMouseLeave={hideTooltip}
            aria-label="Fit to Screen"
          >
            <span className="tb-icon-slot" style={{ fontSize: 13 }}>⛶</span>
          </button>
        </div>
      </div>

      {/* =====================================================
          3. MAIN WORKSPACE (Canvas + Properties)
          ===================================================== */}

      <div className="workspace-body">

        {/* ===================================================
            MAIN SCHEMATIC CANVAS & INTERACTIVE WAVEFORM VIEWER
            =================================================== */}
        <div
          className="schematic-and-waveform-container"
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <main
            className={`schematic-viewport ${activeTool === "wire" ? "wire-mode-active" : ""} ${placingComponent ? "placing-mode-active" : ""}`}
            style={{ flex: 1, width: "100%", height: "100%", minHeight: 0 }}
            onMouseMove={onPaneMouseMove}
            onMouseEnter={() => setIsHoveringCanvas(true)}
            onMouseLeave={() => setIsHoveringCanvas(false)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              if (placingComponent) {
                const getFlowCoord = screenToFlowPosition || project
                const flowPos = getFlowCoord ? getFlowCoord({ x: e.clientX, y: e.clientY }) : cursorPos
                placeComponentAt(flowPos)
              }
            }}
          >
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
                onClick={() => fitView({ padding: 0.2, maxZoom: 1 })}
                title="Fit to Screen"
              >
                ⛶
              </button>
            </div>

            <ReactFlow
              nodes={augmentedNodes}
              edges={augmentedEdges}
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
              onPaneContextMenu={onPaneContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              connectionMode={ConnectionMode.Loose}
              connectionLineComponent={SchematicConnectionLine}
              connectionLineType={ConnectionLineType.Step}
              defaultEdgeOptions={{ type: "step", animated: false }}
              nodesConnectable={activeTool === "wire"}
              elementsSelectable={activeTool === "select"}
              panOnDrag={placingComponent ? false : true}
              snapToGrid
              snapGrid={[20, 20]}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              onMove={(_event, viewport) => setZoomLevel(Math.round(viewport.zoom * 100))}
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
                placingComponent={placingComponent}
              />

              {/* Fine Dotted CAD Grid */}
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.2}
                color="#9ca3af"
              />
            </ReactFlow>
          </main>

          {/* Bottom Dock: Simulation Diagnostics Panel, Waveform Viewer & Automatic Measurements */}
          {(isDiagnosticsOpen || isWaveformOpen || isMeasurementsOpen) && (
            <div
              className="bottom-dock-container"
              style={{
                display: "flex",
                flexDirection: "column",
                position: "relative",
                zIndex: 25,
              }}
            >
              {/* Unified Dock Tabs */}
              <div
                style={{
                  height: 28,
                  background: "#0d121f",
                  borderTop: "1px solid rgba(255, 255, 255, 0.12)",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => {
                      setIsDiagnosticsOpen(true)
                      setBottomPanelTab("diagnostics")
                    }}
                    style={{
                      height: 22,
                      padding: "0 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: bottomPanelTab === "diagnostics" && isDiagnosticsOpen ? "rgba(255, 255, 255, 0.12)" : "transparent",
                      color: bottomPanelTab === "diagnostics" && isDiagnosticsOpen ? "#ffffff" : "#94a3b8",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span>⚡ Diagnostics</span>
                    {liveConnectivity.errors.length > 0 ? (
                      <span style={{ color: "#ef4444", fontSize: 10 }}>({liveConnectivity.errors.length})</span>
                    ) : liveConnectivity.warnings.length > 0 ? (
                      <span style={{ color: "#f59e0b", fontSize: 10 }}>({liveConnectivity.warnings.length})</span>
                    ) : null}
                  </button>

                  <button
                    onClick={() => {
                      setIsWaveformOpen(true)
                      setBottomPanelTab("waveforms")
                    }}
                    style={{
                      height: 22,
                      padding: "0 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: bottomPanelTab === "waveforms" && isWaveformOpen ? "rgba(255, 255, 255, 0.12)" : "transparent",
                      color: bottomPanelTab === "waveforms" && isWaveformOpen ? "#ffffff" : "#94a3b8",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span>📈 Waveforms</span>
                    {lastSimResult?.pointCount ? (
                      <span style={{ color: "#38bdf8", fontSize: 10 }}>({lastSimResult.pointCount} pts)</span>
                    ) : null}
                  </button>

                  <button
                    onClick={() => {
                      setIsMeasurementsOpen(true)
                      setBottomPanelTab("measurements")
                    }}
                    style={{
                      height: 22,
                      padding: "0 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: bottomPanelTab === "measurements" && isMeasurementsOpen ? "rgba(255, 255, 255, 0.12)" : "transparent",
                      color: bottomPanelTab === "measurements" && isMeasurementsOpen ? "#ffffff" : "#94a3b8",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span>📊 Measurements</span>
                    {lastSimResult?.variables?.length ? (
                      <span style={{ color: "#10b981", fontSize: 10 }}>
                        ({lastSimResult.variables.filter((v) => !["time", "frequency"].includes(v.name.toLowerCase())).length})
                      </span>
                    ) : null}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsDiagnosticsOpen(false)
                    setIsWaveformOpen(false)
                    setIsMeasurementsOpen(false)
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "0 6px",
                  }}
                  title="Close Bottom Dock"
                >
                  ✕
                </button>
              </div>

              {/* Render Diagnostics Panel */}
              {isDiagnosticsOpen && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)) && (
                <DiagnosticsPanel
                  isOpen={true}
                  onClose={() => setIsDiagnosticsOpen(false)}
                  onClear={clearWaveforms}
                  simResult={lastSimResult}
                  simStatus={simStatus}
                  analysisCommand={analysisConfig.command}
                  validationErrors={liveConnectivity.errors}
                  validationWarnings={liveConnectivity.warnings}
                  stats={liveConnectivity.stats}
                  engineStatus={engineStatus}
                  onLocateError={locateComponent}
                  onOpenWaveforms={() => {
                    setIsWaveformOpen(true)
                    setBottomPanelTab("waveforms")
                  }}
                  height={diagnosticsHeight}
                  onHeightChange={setDiagnosticsHeight}
                />
              )}

              {/* Render Waveform Viewer */}
              {isWaveformOpen && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen)) && (
                <WaveformViewer
                  isOpen={true}
                  simulationResult={lastSimResult}
                  onClose={() => setIsWaveformOpen(false)}
                  onClear={clearWaveforms}
                  height={waveformHeight}
                  onHeightChange={setWaveformHeight}
                />
              )}

              {/* Render Automatic Measurements Panel */}
              {isMeasurementsOpen && (bottomPanelTab === "measurements" || (!isDiagnosticsOpen && !isWaveformOpen)) && (
                <div style={{ height: measurementsHeight, display: "flex", flexDirection: "column" }}>
                  <AutomaticMeasurementsPanel
                    simulationResult={lastSimResult}
                    isOpen={true}
                    onClose={() => setIsMeasurementsOpen(false)}
                    embedded={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          3. STATUS BAR (Technical, Minimal, Ultra-Crisp)
          ===================================================== */}

      <footer className="app-statusbar">
        <div className="status-segment">
          <div
            className={
              simStatus === "running"
                ? "status-dot-running"
                : simStatus === "paused"
                  ? "status-dot-paused"
                  : "status-dot-active"
            }
          />
          <span>{simMessage}</span>
        </div>

        <div
          className="status-segment status-clickable"
          onClick={() => setIsConfigAnalysisOpen(true)}
          title="Click to Configure Simulation Analysis"
        >
          <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--accent)" }}>
            {analysisConfig.command}
          </span>
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

        {placingComponent && (
          <div className="status-segment">
            <span
              className="status-tool-badge"
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                borderColor: "var(--accent-border)",
              }}
            >
              Placing: {placingComponent.type} · Click canvas to place · R: Rotate · Esc: Cancel
            </span>
          </div>
        )}

        {activeTool === "wire" && (
          <div className="status-segment">
            <span className="status-tool-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
                <path d="M2.5 13.5H8.5V2.5H13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="2.5" cy="13.5" r="1.5" fill="currentColor" />
                <circle cx="13.5" cy="2.5" r="1.5" fill="currentColor" />
              </svg>
              Wire Mode
            </span>
          </div>
        )}

        {/* Interactive net highlight badge */}
        {highlightedNet && (
          <div className="status-segment">
            <span
              className="status-tool-badge"
              style={{
                background: "rgba(2, 132, 199, 0.15)",
                color: "#0284c7",
                borderColor: "#0284c7",
                cursor: "pointer",
              }}
              onClick={() => setHighlightedNet(null)}
              title="Click or press Esc to clear net highlight"
            >
              Net: {highlightedNet} ✕
            </span>
          </div>
        )}

        {/* Live Electrical Rule Check (ERC) status badge */}
        <div
          className="status-segment status-clickable"
          onClick={() => {
            setIsDiagnosticsOpen(true)
            setBottomPanelTab("diagnostics")
          }}
          title="Click to open Simulation Diagnostics panel"
        >
          {liveConnectivity.errors.length > 0 ? (
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              ● ERC: {liveConnectivity.errors.length} {liveConnectivity.errors.length === 1 ? "Error" : "Errors"}
            </span>
          ) : liveConnectivity.warnings.length > 0 ? (
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>
              ▲ ERC: {liveConnectivity.warnings.length} {liveConnectivity.warnings.length === 1 ? "Warning" : "Warnings"}
            </span>
          ) : (
            <span style={{ color: "#10b981", fontWeight: 500 }}>
              ✓ ERC: 0 Errors
            </span>
          )}
        </div>

        <div className="status-segment">
          <span>{nodes.length} comps · {edges.length} wires</span>
        </div>

        {/* Captured simulation numerical points indicator & Waveform Viewer toggle */}
        {lastSimResult?.success && lastSimResult.pointCount > 0 && (
          <>
            <div
              className="status-segment status-clickable"
              onClick={() => {
                setIsWaveformOpen(true)
                setBottomPanelTab("waveforms")
              }}
              title={`Analysis: ${lastSimResult.analysisType} | Variables: ${lastSimResult.variables.map((v) => v.name).join(", ")}\nClick to view Waveform Viewer`}
            >
              <span style={{ color: "#38bdf8", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                📈 {lastSimResult.pointCount} pts ({lastSimResult.elapsedMs}ms) · View Plot
              </span>
            </div>
            <div
              className="status-segment status-clickable"
              onClick={() => {
                setIsMeasurementsOpen(true)
                setBottomPanelTab("measurements")
              }}
              title="Click to view Automatic Measurements panel"
            >
              <span style={{ color: "#10b981", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                📊 Auto Measurements
              </span>
            </div>
          </>
        )}

        {/* Real ngspice Engine status indicator */}
        <div
          className="status-segment status-clickable"
          onClick={refreshEngineStatus}
          title={
            engineStatus?.available
              ? `${engineStatus.version}\nPath: ${engineStatus.executablePath}\n(Click to re-check)`
              : `${engineStatus?.error || "Checking ngspice engine..."}\n(Click to re-check)`
          }
        >
          <span
            style={{
              fontSize: "11px",
              color: engineStatus?.available ? "var(--text-muted)" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 5,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: engineStatus?.available ? "#10b981" : "#ef4444",
              }}
            />
            {engineStatus?.available ? "ngspice-44.2" : "ngspice offline"}
          </span>
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

      {/* Searchable Component Library Window */}
      <ComponentLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectComponent={startPlacingComponent}
        onSelectJunction={startPlacingJunction}
        catalog={FULL_CATALOG_WITH_CONNECTORS}
      />

      {/* Classic Windows Component Properties Dialog */}
      <ComponentPropertiesModal
        isOpen={isPropertiesModalOpen}
        node={propertiesModalNode}
        onClose={() => setIsPropertiesModalOpen(false)}
        onApply={handleApplyComponentProperties}
        pinNetMap={
          propertiesModalNode
            ? liveConnectivity.nodePinNetMap[propertiesModalNode.id] || {}
            : {}
        }
      />

      {/* Simulation Analysis Configuration Modal (.tran, .ac, .dc, .op) */}
      <ConfigureAnalysisModal
        isOpen={isConfigAnalysisOpen}
        onClose={() => setIsConfigAnalysisOpen(false)}
        currentConfig={analysisConfig}
        onApplyConfig={(newConfig) => {
          setAnalysisConfig(newConfig)
          setIsConfigAnalysisOpen(false)
          setSimMessage(`Analysis set: ${newConfig.command}`)
        }}
      />

      {/* Simulation Engine & Solver Settings Modal */}
      <SimulationSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentSettings={solverSettings}
        onApplySettings={(newSettings) => {
          setSolverSettings(newSettings)
          setIsSettingsModalOpen(false)
          setSimMessage("Simulation solver settings updated")
        }}
      />

      {/* Simulation Blocked Alert Popup */}
      <ValidationBlockedModal
        isOpen={isValidationBlockedModalOpen}
        onClose={() => setIsValidationBlockedModalOpen(false)}
        errors={liveConnectivity.errors}
        onLocateError={(compId, net) => {
          locateComponent(compId, net)
          setIsValidationBlockedModalOpen(false)
        }}
        onViewDiagnostics={() => {
          setIsDiagnosticsOpen(true)
          setBottomPanelTab("diagnostics")
          setIsValidationBlockedModalOpen(false)
        }}
      />

      {/* SPICE Netlist & Connectivity Inspector Modal */}
      <SpiceNetlistModal
        isOpen={isNetlistModalOpen}
        onClose={() => setIsNetlistModalOpen(false)}
        result={netlistResult}
        initialTab={netlistModalTab}
        onRunSimulation={runOrPauseSimulation}
        onHighlightNet={(net) => setHighlightedNet(net)}
        onLocateComponent={locateComponent}
      />

      {/* Modern Floating Tooltip with Name & Keyboard Shortcut */}
      {activeTooltip && (
        <div
          className="tb-floating-tooltip"
          style={{ left: activeTooltip.x, top: activeTooltip.y }}
        >
          <span className="tb-tooltip-text">{activeTooltip.text}</span>
          {activeTooltip.shortcut && (
            <kbd className="tb-tooltip-kbd">{activeTooltip.shortcut}</kbd>
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
