import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Zap, TrendingUp, BarChart2, Maximize2, X, Crosshair } from "lucide-react"
import LanguageSwitcher from "./components/LanguageSwitcher"
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
import {
  buildOrthogonalDraftPoints,
  computeAvoidanceWaypoints,
  getComponentObstacles,
} from "./utils/wireRouter"
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
import OperatingPointModal from "./components/OperatingPointModal"
import AcAnalysisModal from "./components/AcAnalysisModal"
import ComponentPropertiesModal from "./components/ComponentPropertiesModal"
import AboutModal from "./components/AboutModal"
import NetNameModal from "./components/schematic/NetNameModal"
import AutomaticMeasurementsPanel from "./components/AutomaticMeasurementsPanel"
import CircuitTabBar from "./components/schematic/CircuitTabBar"
import { AiCircuitAssistant } from "./components/ai/AiCircuitAssistant"
import { AiCopilotLogo } from "./components/ai/AiCopilotLogo"
import asapLogo from "./assets/asap_logo.png"
import {
  type CircuitTab,
  type RecentFile,
  createDefaultCircuitTab,
  serializeCircuitTab,
  deserializeCircuitTab,
  getRecentFiles,
  addRecentFile,
  clearRecentFiles,
  getLastSavedDir,
  setLastSavedDir,
  getFileNameFromPath,
} from "./utils/circuitProject"
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

function getNodeHandlePosition(node: Node, handleId?: string | null): Position {
  if (node.type === "junction") {
    if (handleId === "top") return Position.Top
    if (handleId === "bottom") return Position.Bottom
    if (handleId === "left") return Position.Left
    if (handleId === "right") return Position.Right
    return Position.Left
  }

  const compType = (node.data?.type ?? "generic") as SchematicComponentType
  const pins = getComponentPins(compType)
  const targetPin = pins.find((p) => p.id === handleId) || pins[0]
  if (!targetPin) return Position.Left

  return getRotatedPinPos(targetPin, node.data?.rotation ?? 0).handlePos
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
  const srcPos = getNodeHandlePosition(srcNode, edge.sourceHandle)
  const tgtPos = getNodeHandlePosition(tgtNode, edge.targetHandle)
  const bendMode: WireBendMode = edge.data?.bendMode ?? "auto"
  const offset = edge.data?.offset
  const waypoints =
    edge.data?.waypoints && edge.data.waypoints.length > 0
      ? edge.data.waypoints
      : undefined

  const [, , , , segments, points] = getOrthogonalWirePath(
    p1.x,
    p1.y,
    p2.x,
    p2.y,
    srcPos,
    tgtPos,
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

function getMagneticSnapCoord(
  flowPos: { x: number; y: number },
  nodes: Node<SchematicNodeData>[],
  edges: Edge[],
): { x: number; y: number } {
  const pinRadius = 14
  const edgeRadius = 10

  // 1. Check pins & junctions
  let bestPinDist = pinRadius
  let bestPinCoord: { x: number; y: number } | null = null

  for (const node of nodes) {
    if (node.type === "junction") {
      const jx = Math.round((node.position.x + 4) / 20) * 20
      const jy = Math.round((node.position.y + 4) / 20) * 20
      const d = Math.hypot(flowPos.x - jx, flowPos.y - jy)
      if (d < bestPinDist) {
        bestPinDist = d
        bestPinCoord = { x: jx, y: jy }
      }
    } else {
      const compType = (node.data?.type ?? "generic") as SchematicComponentType
      const pins = getComponentPins(compType)
      for (const pin of pins) {
        const pCoord = getPinCoord(node, pin.id)
        const d = Math.hypot(flowPos.x - pCoord.x, flowPos.y - pCoord.y)
        if (d < bestPinDist) {
          bestPinDist = d
          bestPinCoord = { x: pCoord.x, y: pCoord.y }
        }
      }
    }
  }

  if (bestPinCoord) {
    return bestPinCoord
  }

  // 2. Check wire edges
  let bestEdgeDist = edgeRadius
  let bestEdgeCoord: { x: number; y: number } | null = null

  for (const edge of edges) {
    const edgeData = getEdgeSegmentsAndPoints(edge, nodes)
    if (!edgeData) continue
    for (const seg of edgeData.segments) {
      const res = distToSegment(flowPos.x, flowPos.y, seg.x1, seg.y1, seg.x2, seg.y2)
      if (res.dist < bestEdgeDist) {
        bestEdgeDist = res.dist
        if (seg.type === "h") {
          const snappedX = Math.round(res.nearestX / 20) * 20
          const minX = Math.min(seg.x1, seg.x2)
          const maxX = Math.max(seg.x1, seg.x2)
          bestEdgeCoord = {
            x: Math.max(minX, Math.min(maxX, snappedX)),
            y: seg.y1,
          }
        } else {
          const snappedY = Math.round(res.nearestY / 20) * 20
          const minY = Math.min(seg.y1, seg.y2)
          const maxY = Math.max(seg.y1, seg.y2)
          bestEdgeCoord = {
            x: seg.x1,
            y: Math.max(minY, Math.min(maxY, snappedY)),
          }
        }
      }
    }
  }

  if (bestEdgeCoord) {
    return bestEdgeCoord
  }

  // 3. 20px CAD grid
  return {
    x: Math.round(flowPos.x / 20) * 20,
    y: Math.round(flowPos.y / 20) * 20,
  }
}

function splitEdgeAtPoint(
  targetEdge: Edge,
  nodes: Node<SchematicNodeData>[],
  junctionId: string,
  splitPoint: { x: number; y: number },
  customHandle?: string,
): { edge1: Edge; edge2: Edge } {
  const result = getEdgeSegmentsAndPoints(targetEdge, nodes)
  let w1: { x: number; y: number }[] | undefined = undefined
  let w2: { x: number; y: number }[] | undefined = undefined
  let targetHandle1 = "left"
  let sourceHandle2 = "right"

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
      const pA = pts[segIdx]
      const pB = pts[segIdx + 1]

      if (pA.x === pB.x) {
        // Vertical segment: arrive and depart along vertical axis without kinks
        if (pA.y <= pB.y) {
          targetHandle1 = "top"
          sourceHandle2 = "bottom"
        } else {
          targetHandle1 = "bottom"
          sourceHandle2 = "top"
        }
      } else {
        // Horizontal segment: arrive and depart along horizontal axis without kinks
        if (pA.x <= pB.x) {
          targetHandle1 = "left"
          sourceHandle2 = "right"
        } else {
          targetHandle1 = "right"
          sourceHandle2 = "left"
        }
      }

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
    targetHandle: customHandle ?? targetHandle1,
    type: "step",
    data: {
      bendMode: targetEdge.data?.bendMode ?? "auto",
      waypoints: w1,
    },
  }

  const edge2: Edge = {
    id: `e-${junctionId}-${targetEdge.target}-${ts}b`,
    source: junctionId,
    sourceHandle: customHandle ?? sourceHandle2,
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
      <polyline
        points="0,8 5,8 6.5,3 9.5,13 12.5,3 15.5,13 18.5,3 21.5,13 23,8 28,8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
      <line x1="1" y1="13.5" x2="21" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="13.5" r="2.2" fill="currentColor" />
      <text x="5" y="9" fontSize="10.5" fontWeight="bold" fill="currentColor" fontFamily="sans-serif">net</text>
    </svg>
  ),
  port: (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
      <polygon points="2,1.5 14,1.5 19,8 14,14.5 2,14.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="19" y1="8" x2="21.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="8.5" y="11" fontSize="7.5" fontWeight="bold" fill="currentColor" textAnchor="middle">IO</text>
    </svg>
  ),
  'port-in': (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
      <polygon points="2,1.5 14,1.5 19,8 14,14.5 2,14.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="19" y1="8" x2="21.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="8.5" y="11" fontSize="7.5" fontWeight="bold" fill="currentColor" textAnchor="middle">IN</text>
    </svg>
  ),
  'port-out': (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
      <line x1="0.5" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <polygon points="3,1.5 15,1.5 20,8 15,14.5 3,14.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="9.5" y="11" fontSize="6.5" fontWeight="bold" fill="currentColor" textAnchor="middle">OUT</text>
    </svg>
  ),
  'port-bi': (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
      <polygon points="1,8 5,1.5 17,1.5 21,8 17,14.5 5,14.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <text x="11" y="11" fontSize="7.5" fontWeight="bold" fill="currentColor" textAnchor="middle">IO</text>
    </svg>
  ),
  'spice-directive': (
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <rect x="2" y="2" width="24" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2,1.5" fill="none" />
      <text x="14" y="11" fontSize="7" fontWeight="bold" fontFamily="monospace" fill="currentColor" textAnchor="middle">.op</text>
    </svg>
  ),
  'schematic-text': (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
      <rect x="1.5" y="1" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <text x="10" y="11.5" fontSize="10.5" fontWeight="bold" fontFamily="serif" fill="currentColor" textAnchor="middle">Aa</text>
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
  { type: "ac-source", name: "AC Voltage Source", icon: CompIcon['ac-source'], hotkey: "A", category: "Sources", defaultValue: "AC 1V 0°" },
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
  { type: "comparator", name: "Comparator (LM741)", icon: CompIcon.comparator, hotkey: "C", category: "Analog & Power", defaultValue: "LM741" },
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
  const { t } = useTranslation('common')
  const { screenToFlowPosition, project, zoomIn, zoomOut, fitView, getZoom, setCenter, getViewport, setViewport } =
    useReactFlow()

  const [initialTab] = useState(() => createDefaultCircuitTab(1))
  const [tabs, setTabs] = useState<CircuitTab[]>([initialTab])
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id)
  const draftCounterRef = useRef<number>(2)
  const activeTabIdRef = useRef<string>(initialTab.id)
  activeTabIdRef.current = activeTabId
  const tabsDataRef = useRef<Map<string, CircuitTab>>(new Map([[initialTab.id, initialTab]]))
  const isSwitchingTabRef = useRef<boolean>(false)

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles())
  const [showRecentMenu, setShowRecentMenu] = useState(false)

  const [nodes, setNodes] = useState<Node<SchematicNodeData>[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<"select" | "wire" | "junction" | "delete" | "probe">("select")
  const [activeProbedSignal, setActiveProbedSignal] = useState<string | null>(null)
  const [placingComponent, setPlacingComponent] = useState<PlacingComponent | null>(null)

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 })

  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [zoomLevel, setZoomLevel] = useState(100)

  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [propertiesModalNode, setPropertiesModalNode] = useState<Node<SchematicNodeData> | null>(null)
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false)
  const [netNameModal, setNetNameModal] = useState<{
    isOpen: boolean
    type: "net-label" | "port-in" | "port-out" | "port-bi"
    name?: string
  }>({
    isOpen: false,
    type: "net-label",
  })
  const [isPortMenuOpen, setIsPortMenuOpen] = useState(false)
  const portDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPortMenuOpen) return undefined
    const handleOutsideClick = (e: MouseEvent) => {
      if (portDropdownRef.current && !portDropdownRef.current.contains(e.target as unknown as globalThis.Node)) {
        setIsPortMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [isPortMenuOpen])

  // Simulation & Analysis State
  const [isConfigAnalysisOpen, setIsConfigAnalysisOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false)
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false)
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(DEFAULT_ANALYSIS_CONFIG)
  const [solverSettings, setSolverSettings] = useState<SolverSettings>(DEFAULT_SOLVER_SETTINGS)
  const [simStatus, setSimStatus] = useState<"idle" | "running" | "paused">("idle")
  const [simMessage, setSimMessage] = useState<string>("Ready")

  // Real ngspice Engine & Numerical Results State
  const [engineStatus, setEngineStatus] = useState<NgspiceEngineStatus | null>(null)
  const [lastSimResult, setLastSimResult] = useState<SimulationRunResult | null>(null)
  const [isWaveformOpen, setIsWaveformOpen] = useState(false)
  const [waveformHeight, setWaveformHeight] = useState(320)
  const [isWaveformMaximized, setIsWaveformMaximized] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [diagnosticsHeight, setDiagnosticsHeight] = useState(240)
  const [isDiagnosticsMaximized, setIsDiagnosticsMaximized] = useState(false)
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
  const [isOperatingPointModalOpen, setIsOperatingPointModalOpen] = useState(false)
  const [isAcModalOpen, setIsAcModalOpen] = useState(false)
  const [netlistResult, setNetlistResult] = useState<NetlistGenerationResult | null>(null)
  const [netlistModalTab, setNetlistModalTab] = useState<"netlist" | "validation">("netlist")

  // Real-time circuit connectivity & ERC validation (reactive to canvas changes)
  const liveConnectivity = useMemo<NetlistGenerationResult>(() => {
    return generateSpiceNetlist(nodes, edges, analysisConfig, solverSettings)
  }, [nodes, edges, analysisConfig, solverSettings])

  // Available circuit nets & wire currents for waveform probing & calculations
  const availableCircuitNets = useMemo(() => {
    const list: Array<{
      netName: string
      signalName: string
      displayName: string
      pinCount: number
      connectedComponents: string[]
      isGround?: boolean
      isCurrent?: boolean
      wireLabel?: string
      alternateSignal?: string
      alternateLabel?: string
    }> = []

    const nets = liveConnectivity.nets || {}

    // 1. Voltage nets
    for (const [netName, connections] of Object.entries(nets)) {
      const isGround = netName === "0"
      const targetPattern = isGround ? "0" : `v(${netName.toLowerCase()})`
      const matchedVar = lastSimResult?.variables.find(
        (v) => v.name.toLowerCase() === targetPattern || v.name.toLowerCase() === netName.toLowerCase(),
      )
      const signalName = matchedVar ? matchedVar.name : targetPattern
      const components = Array.from(
        new Set(connections.map((c) => `${c.componentLabel || c.componentId}.${c.pinName || c.pinId}`)),
      )

      // Find first connected component that has a current signal
      let companionCurrent: string | undefined
      let companionCurrentLabel: string | undefined
      for (const c of connections) {
        const cLabel = (c.componentLabel || c.componentId).toLowerCase()
        const curName = `i(${cLabel})`
        if (lastSimResult?.variables.some((v) => v.name.toLowerCase() === curName)) {
          companionCurrent = curName
          companionCurrentLabel = `I(${c.componentLabel || c.componentId})`
          break
        }
      }

      list.push({
        netName,
        signalName,
        displayName: isGround ? "0 (GND)" : `V(${netName.toUpperCase()})`,
        pinCount: connections.length,
        connectedComponents: components,
        isGround,
        alternateSignal: companionCurrent,
        alternateLabel: companionCurrentLabel,
      })
    }

    // 2. Wire & Device Currents
    const currentVars = (lastSimResult?.variables || []).filter(
      (v) => v.name.toLowerCase().startsWith("i(") && v.unit === "A",
    )
    const processedCurrents = new Set<string>()

    currentVars.forEach((cVar) => {
      const lower = cVar.name.toLowerCase()
      processedCurrents.add(lower)
      const devMatch = lower.match(/^i\(([a-z0-9_:]+)\)$/)
      const devName = devMatch ? devMatch[1] : lower.replace(/^i\(|\)$/g, "")
      const devBase = devName.split(":")[0]

      const node = nodes.find(
        (n) => (n.data?.label || n.id).toLowerCase() === devBase.toLowerCase(),
      )
      const compNets = node ? Object.values(liveConnectivity.nodePinNetMap[node.id] || {}) : []
      const compType = node?.data?.type || "component"
      const compVal = node?.data?.value ? ` (${node.data.value})` : ""

      list.push({
        netName: `I(${devName.toUpperCase()})`,
        signalName: cVar.name,
        displayName: `I(${devName.toUpperCase()})`,
        pinCount: 2,
        connectedComponents: [
          `${devName.toUpperCase()}${compVal} - ${compType}`,
          compNets.length > 0 ? `Nets: ${compNets.join(" ⇄ ")}` : "Wire branch",
        ],
        isCurrent: true,
        wireLabel: `Wire current through ${devName.toUpperCase()}`,
        alternateSignal: compNets.length > 0 && compNets[0] !== "0" ? `v(${compNets[0].toLowerCase()})` : undefined,
        alternateLabel: compNets.length > 0 ? `V(${compNets[0].toUpperCase()})` : undefined,
      })
    })

    // If simulation not yet run, populate schematic wire currents
    if (currentVars.length === 0) {
      nodes.forEach((n) => {
        if (
          n.type !== "junction" &&
          n.data?.type &&
          ["resistor", "capacitor", "inductor", "voltage-source", "current-source", "diode"].includes(
            n.data.type,
          )
        ) {
          const label = n.data.label || n.id
          const sig = `i(${label.toLowerCase()})`
          if (processedCurrents.has(sig)) return
          processedCurrents.add(sig)

          const compNets = Object.values(liveConnectivity.nodePinNetMap[n.id] || {})
          list.push({
            netName: `I(${label.toUpperCase()})`,
            signalName: sig,
            displayName: `I(${label.toUpperCase()})`,
            pinCount: 2,
            connectedComponents: [
              `${label} (${n.data.value || n.data.type})`,
              compNets.length > 0 ? `Nets: ${compNets.join(" ⇄ ")}` : "Wire branch",
            ],
            isCurrent: true,
            wireLabel: `Wire current through ${label}`,
            alternateSignal: compNets.length > 0 && compNets[0] !== "0" ? `v(${compNets[0].toLowerCase()})` : undefined,
            alternateLabel: compNets.length > 0 ? `V(${compNets[0].toUpperCase()})` : undefined,
          })
        }
      })
    }

    list.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return 1
      if (!a.isCurrent && b.isCurrent) return -1
      if (a.isGround) return 1
      if (b.isGround) return -1
      return a.displayName.localeCompare(b.displayName)
    })

    return list
  }, [liveConnectivity, lastSimResult, nodes])

  // Probe a circuit net or wire current: graphs the signal and computes values on the waveform HUD
  const probeNet = useCallback(
    (target: string, preferCurrent?: boolean) => {
      if (!target) return

      // Explicit current signal probe
      if (target.toLowerCase().startsWith("i(")) {
        const matchedVar = lastSimResult?.variables.find(
          (v) => v.name.toLowerCase() === target.toLowerCase(),
        )
        const signalName = matchedVar ? matchedVar.name : target
        setIsWaveformOpen(true)
        setBottomPanelTab("waveforms")
        setActiveProbedSignal(signalName)
        setSimMessage(`Probed wire current: ${signalName.toUpperCase()} - Calculated on graph`)
        return
      }

      const isGround = target === "0"
      const netName = target.replace(/^v\(|\)$/gi, "")

      if (preferCurrent) {
        const connections = liveConnectivity.nets[netName] || []
        for (const conn of connections) {
          const compLabel = (conn.componentLabel || conn.componentId).toLowerCase()
          const curSig = `i(${compLabel})`
          const matchedCur = lastSimResult?.variables.find(
            (v) => v.name.toLowerCase() === curSig,
          )
          if (matchedCur) {
            setIsWaveformOpen(true)
            setBottomPanelTab("waveforms")
            setActiveProbedSignal(matchedCur.name)
            setHighlightedNet(netName)
            setSimMessage(`Probed wire current: ${matchedCur.name.toUpperCase()} (Net: ${netName.toUpperCase()}) - Calculated on graph`)
            return
          }
        }
      }

      const targetPattern = isGround ? "0" : `v(${netName.toLowerCase()})`
      const matchedVar = lastSimResult?.variables.find(
        (v) => v.name.toLowerCase() === targetPattern || v.name.toLowerCase() === netName.toLowerCase(),
      )
      const signalName = matchedVar ? matchedVar.name : targetPattern

      setIsWaveformOpen(true)
      setBottomPanelTab("waveforms")
      setActiveProbedSignal(signalName)
      setHighlightedNet(netName)
      setSimMessage(`Probed net: ${isGround ? "0 (GND)" : `V(${netName.toUpperCase()})`} - Calculated on graph`)
    },
    [lastSimResult, liveConnectivity],
  )

  // Parse engineering suffix values for SPICE derivation
  const parseSpiceNumeric = (val?: string): number => {
    if (!val || typeof val !== "string") return 0
    const clean = val.trim().replace(/[\u2126\u03A9ohmsvfhda]/gi, "").trim()
    const m = clean.match(/^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([a-zA-Z]*)/)
    if (!m) return parseFloat(clean) || 0
    const num = parseFloat(m[1])
    const suffix = (m[2] || "").toLowerCase()
    if (suffix.startsWith("meg")) return num * 1e6
    if (suffix.startsWith("k")) return num * 1e3
    if (suffix.startsWith("m")) return num * 1e-3
    if (suffix.startsWith("u")) return num * 1e-6
    if (suffix.startsWith("n")) return num * 1e-9
    if (suffix.startsWith("p")) return num * 1e-12
    if (suffix.startsWith("f")) return num * 1e-15
    if (suffix.startsWith("g")) return num * 1e9
    if (suffix.startsWith("t")) return num * 1e12
    return num
  }

  // Component current probing: resolves simulated or derived branch current
  const probeComponentCurrent = useCallback(
    (node: Node) => {
      const compLabel = (node.data?.label || node.id || "").trim()
      const compType = (node.data?.type || "") as string
      const lowerLabel = compLabel.toLowerCase()

      const candidates = [
        `i(${lowerLabel})`,
        `@${lowerLabel}[i]`,
        `@${lowerLabel}[id]`,
        `@${lowerLabel}[ic]`,
        `${lowerLabel}#branch`,
        `v${lowerLabel}#branch`,
        `i(v${lowerLabel})`,
        `i(r${lowerLabel})`,
        `i(c${lowerLabel})`,
        `i(l${lowerLabel})`,
        `i(d${lowerLabel})`,
        `@r${lowerLabel}[i]`,
        `@c${lowerLabel}[i]`,
        `@l${lowerLabel}[i]`,
        `@d${lowerLabel}[id]`,
        `@q${lowerLabel}[ic]`,
        `@m${lowerLabel}[id]`,
      ]

      const matchedVar = lastSimResult?.variables.find((v) =>
        candidates.includes(v.name.toLowerCase()),
      )

      if (matchedVar) {
        probeNet(matchedVar.name)
        setSimMessage(`Probed branch current: ${matchedVar.name.toUpperCase()} (${compLabel}) - Calculated on graph`)
        return
      }

      // If it's a resistor and current was not directly in raw output, derive I = (V1 - V2) / R
      if (compType === "resistor" && lastSimResult?.data) {
        const pinMap = liveConnectivity.nodePinNetMap[node.id] || {}
        const net1 = pinMap["pin1"]
        const net2 = pinMap["pin2"]
        const rVal = parseSpiceNumeric(node.data?.value)

        if (net1 && net2 && rVal > 0) {
          const ptCount = lastSimResult.pointCount || 0
          const v1Data =
            net1 === "0"
              ? new Array(ptCount).fill(0)
              : lastSimResult.data[`v(${net1.toLowerCase()})`] || lastSimResult.data[net1.toLowerCase()]
          const v2Data =
            net2 === "0"
              ? new Array(ptCount).fill(0)
              : lastSimResult.data[`v(${net2.toLowerCase()})`] || lastSimResult.data[net2.toLowerCase()]

          if (v1Data && v2Data && v1Data.length > 0) {
            const curSig = `i(${lowerLabel})`
            const curData = new Array(v1Data.length)
            for (let i = 0; i < v1Data.length; i++) {
              curData[i] = (v1Data[i] - v2Data[i]) / rVal
            }
            lastSimResult.data[curSig] = curData
            lastSimResult.data[curSig.toUpperCase()] = curData
            if (!lastSimResult.variables.some((v) => v.name.toLowerCase() === curSig)) {
              lastSimResult.variables.push({
                index: lastSimResult.variables.length,
                name: curSig,
                type: "current",
                unit: "A",
              })
            }
            probeNet(curSig)
            setSimMessage(
              `Calculated branch current: ${curSig.toUpperCase()} (Ohm's Law R=${node.data?.value || rVal}Ω) - Plotted on graph`,
            )
            return
          }
        }
      }

      // If current is unavailable
      setIsWaveformOpen(true)
      setBottomPanelTab("waveforms")
      setSimMessage(`Current vector for '${compLabel}' is unavailable in current simulation result.`)
    },
    [lastSimResult, liveConnectivity, probeNet],
  )

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
    const compNodes = nodes.filter((n) => n.type !== "junction" && n.data?.type !== undefined)
    if (compNodes.length === 0) {
      setSimMessage("Cannot simulate: Canvas is empty. Place components before running simulation.")
      setNetlistResult({
        ...liveConnectivity,
        errors: [{
          severity: "error",
          code: "EMPTY_CIRCUIT",
          message: "The circuit schematic is empty. Place components and wire them before running simulation.",
          suggestion: "Use the top toolbar to place components (Resistor, Voltage Source, Ground, etc.) on the canvas.",
        }],
        stats: { ...liveConnectivity.stats, hasErrors: true },
      })
      setIsValidationBlockedModalOpen(true)
      return
    }

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
          const isOp =
            analysisConfig.type === "op" ||
            /^\s*\.op(\s|$)/im.test(result.netlist) ||
            runRes.plotName?.toLowerCase().includes("operating point")

          const isAc =
            analysisConfig.type === "ac" ||
            runRes.isComplex ||
            /^\s*\.ac(\s|$)/im.test(result.netlist) ||
            runRes.plotName?.toLowerCase().includes("ac analysis")

          if (isOp) {
            setSimMessage(
              `DC Operating Point evaluated: ${runRes.variables.length} parameters in ${runRes.elapsedMs}ms`,
            )
            setIsOperatingPointModalOpen(true)
          } else if (isAc) {
            setSimMessage(
              `AC Analysis completed: ${runRes.pointCount} points across ${runRes.variables.length} variables in ${runRes.elapsedMs}ms (${analysisConfig.command})`,
            )
            setIsAcModalOpen(true)
          } else {
            const ptCount =
              runRes.pointCount > 0
                ? `${runRes.pointCount} points`
                : `${runRes.variables.length} vars`
            setSimMessage(
              `Simulation finished: ${ptCount} in ${runRes.elapsedMs}ms (${analysisConfig.command})`,
            )
            setIsWaveformOpen(true)
            setBottomPanelTab("waveforms")
          }
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

  const markActiveTabDirty = useCallback(() => {
    setTabs((currTabs) =>
      currTabs.map((t) => (t.id === activeTabIdRef.current ? { ...t, isDirty: true } : t)),
    )
  }, [])

  // Sync working state changes into active tab in tabsDataRef
  useEffect(() => {
    if (isSwitchingTabRef.current) return
    const activeTab = tabsDataRef.current.get(activeTabId)
    if (activeTab) {
      activeTab.nodes = nodes
      activeTab.edges = edges
      activeTab.history = history
      activeTab.analysisConfig = analysisConfig
      activeTab.solverSettings = solverSettings
      activeTab.simulationResult = lastSimResult
      if (getViewport) {
        activeTab.viewport = getViewport()
      }
    }
  }, [nodes, edges, history, analysisConfig, solverSettings, lastSimResult, activeTabId, getViewport])

  /* ============================================================
     HISTORY SNAPSHOTS (UNDO / REDO)
     ============================================================ */

  const pushSnapshot = useCallback(
    (newNodes: Node<SchematicNodeData>[], newEdges: Edge[]) => {
      markActiveTabDirty()
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
    [markActiveTabDirty],
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

  // Augmented nodes with net-highlighted pins, ERC badges, and genuine T-junction detection
  const augmentedNodes = useMemo(() => {
    // 1. Detect genuine 3+ branch junctions (or 2+ wire branches at a component pin)
    const visibleJunctionIds = new Set<string>()
    const junctionNodes = nodes.filter((n) => n.type === "junction")

    if (junctionNodes.length > 0) {
      // Precompute polyline points for each edge once
      const edgePointsMap = new Map<string, { x: number; y: number }[]>()
      for (const edge of edges) {
        const edgeData = getEdgeSegmentsAndPoints(edge, nodes)
        if (edgeData && edgeData.points.length >= 2) {
          edgePointsMap.set(edge.id, edgeData.points)
        }
      }

      for (const jNode of junctionNodes) {
        const jx = Math.round((jNode.position.x + 4) / 20) * 20
        const jy = Math.round((jNode.position.y + 4) / 20) * 20

        const directions = new Set<string>()

        for (const edge of edges) {
          const pts = edgePointsMap.get(edge.id)
          if (!pts || pts.length < 2) continue

          const pFirst = pts[0]
          const pLast = pts[pts.length - 1]

          // Edge departs from this junction
          if (Math.abs(pFirst.x - jx) < 8 && Math.abs(pFirst.y - jy) < 8) {
            const pNext = pts[1]
            const dx = pNext.x - jx
            const dy = pNext.y - jy
            if (Math.abs(dx) > Math.abs(dy)) {
              directions.add(dx > 0 ? "right" : "left")
            } else if (Math.abs(dy) > 0) {
              directions.add(dy > 0 ? "down" : "up")
            }
          }

          // Edge arrives at this junction
          if (Math.abs(pLast.x - jx) < 8 && Math.abs(pLast.y - jy) < 8) {
            const pPrev = pts[pts.length - 2]
            const dx = pPrev.x - jx
            const dy = pPrev.y - jy
            if (Math.abs(dx) > Math.abs(dy)) {
              directions.add(dx > 0 ? "right" : "left")
            } else if (Math.abs(dy) > 0) {
              directions.add(dy > 0 ? "down" : "up")
            }
          }

          // Edge passes through this junction without terminating here
          for (let i = 0; i < pts.length - 1; i++) {
            const pA = pts[i]
            const pB = pts[i + 1]

            // Check if strictly interior to segment
            if (pA.y === jy && pB.y === jy) {
              const minX = Math.min(pA.x, pB.x)
              const maxX = Math.max(pA.x, pB.x)
              if (minX + 4 < jx && jx < maxX - 4) {
                directions.add("left")
                directions.add("right")
              }
            } else if (pA.x === jx && pB.x === jx) {
              const minY = Math.min(pA.y, pB.y)
              const maxY = Math.max(pA.y, pB.y)
              if (minY + 4 < jy && jy < maxY - 4) {
                directions.add("up")
                directions.add("down")
              }
            }
          }
        }

        // Show dot only where 3 or more wire directions genuinely connect (T-junctions or crosses)
        // Simple bends, continuations (A->B->C), and component pin connections must not create dots
        if (directions.size >= 3) {
          visibleJunctionIds.add(jNode.id)
        }
      }
    }

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

      const showDot = node.type === "junction" ? visibleJunctionIds.has(node.id) : undefined

      return {
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          ...node.data,
          showDot,
          highlightedPins,
          ercIssues: nodeErcMap,
          onErcClick: handleErcIssueClick,
        },
      }
    })
  }, [nodes, edges, liveConnectivity, highlightedNet, handleErcIssueClick, selectedNodeId])

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
        selected: edge.id === selectedEdgeId,
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
  }, [edges, liveConnectivity, highlightedNet, updateEdgeOffset, updateEdgeWaypoints, selectedEdgeId])

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

      const srcNode = nodes.find((n) => n.id === connection.source)
      const tgtNode = nodes.find((n) => n.id === connection.target)
      let waypoints: { x: number; y: number }[] | undefined
      if (srcNode && tgtNode) {
        const p1 = getPinCoord(srcNode, connection.sourceHandle)
        const p2 = getPinCoord(tgtNode, connection.targetHandle)
        const obstacles = getComponentObstacles(nodes, [srcNode.id, tgtNode.id])
        const computed = computeAvoidanceWaypoints(p1, p2, obstacles)
        if (computed.length > 0) waypoints = computed
      }

      setEdges((curr) =>
        addEdge(
          {
            ...connection,
            type: "step",
            animated: false,
            data: { bendMode: "auto", waypoints },
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
      let waypoints: { x: number; y: number }[] | undefined
      if (startParam.nodeId) {
        const srcNode = nodes.find((n) => n.id === startParam.nodeId)
        if (srcNode) {
          const p1 = getPinCoord(srcNode, startParam.handleId)
          const p2 = { x: snapX, y: snapY }
          const obstacles = getComponentObstacles(nodes, [srcNode.id, junctionId])
          const computed = computeAvoidanceWaypoints(p1, p2, obstacles)
          if (computed.length > 0) waypoints = computed
        }
      }

      const edge3: Edge = {
        id: `e-${startParam.nodeId}-${junctionId}-${Date.now().toString().slice(-4)}c`,
        source: startParam.nodeId!,
        sourceHandle: startParam.handleId,
        target: junctionId,
        targetHandle: "top",
        type: "step",
        data: { bendMode: "auto", waypoints },
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

  const componentObstacles = useMemo(() => {
    return getComponentObstacles(nodes, [wireDraft.startPin?.nodeId])
  }, [nodes, wireDraft.startPin])

  // Reset wire draft or placement if tool changes
  useEffect(() => {
    if (activeTool !== "wire") {
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    } else {
      setPlacingComponent(null)
    }
  }, [activeTool])

  const wireClickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Commit and save the active wire draft up to a specific endpoint (or last committed point if omitted).
   * Exits wire mode to select mode upon completion (LTspice behavior).
   */
  const finishAndSaveWire = useCallback(
    (targetPoint?: { x: number; y: number }) => {
      if (wireClickTimeoutRef.current) {
        clearTimeout(wireClickTimeoutRef.current)
        wireClickTimeoutRef.current = null
      }

      if (!wireDraft.isDrawing || wireDraft.points.length === 0) {
        if (activeTool === "wire") {
          setActiveTool("select")
        }
        return
      }

      let pts = [...wireDraft.points]

      // If an explicit target point was given (e.g. double-click), append it orthogonally if needed
      if (targetPoint) {
        const snapX = Math.round(targetPoint.x / 20) * 20
        const snapY = Math.round(targetPoint.y / 20) * 20
        pts = buildOrthogonalDraftPoints(
          wireDraft.points,
          { x: snapX, y: snapY },
          wireDraft.bendOrientation,
          componentObstacles,
        )
      }

      // If we don't have at least 2 distinct points, cancel draft without saving a degenerate zero-length wire
      if (pts.length < 2) {
        setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
        setActiveTool("select")
        return
      }

      const startPt = pts[0]
      const endPt = pts[pts.length - 1]

      if (startPt.x === endPt.x && startPt.y === endPt.y) {
        setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
        setActiveTool("select")
        return
      }

      pushSnapshot(nodes, edges)

      const updatedNodes = [...nodes]
      let updatedEdges = [...edges]

      // 1. Resolve arrival handle at endpoint
      const lastPrev = pts.length >= 2 ? pts[pts.length - 2] : startPt
      const isLastVert = lastPrev.x === endPt.x
      const arrivalHandle = isLastVert
        ? lastPrev.y < endPt.y ? "top" : "bottom"
        : lastPrev.x < endPt.x ? "left" : "right"

      // Resolve target pin / wire / junction
      const hitPin = findPinAtCoord(updatedNodes, endPt.x, endPt.y)
      const hitEdgeResult = !hitPin ? findEdgeAtCoord(updatedEdges, updatedNodes, endPt.x, endPt.y) : null

      let targetNodeId: string | undefined = hitPin?.nodeId
      let targetHandleId: string | undefined = hitPin?.handleId ?? arrivalHandle

      if (hitEdgeResult) {
        const junctionId = `J${Date.now().toString().slice(-4)}`
        const newJunctionNode: Node = {
          id: junctionId,
          type: "junction",
          position: { x: endPt.x - 4, y: endPt.y - 4 },
          data: {},
        }
        const { edge1, edge2 } = splitEdgeAtPoint(
          hitEdgeResult.edge,
          updatedNodes,
          junctionId,
          { x: endPt.x, y: endPt.y },
        )
        updatedNodes.push(newJunctionNode)
        updatedEdges = [...updatedEdges.filter((e) => e.id !== hitEdgeResult.edge.id), edge1, edge2]
        targetNodeId = junctionId
        targetHandleId = arrivalHandle
      } else if (!hitPin) {
        // Free space: place end junction
        const endJunctionId = `J${Date.now().toString().slice(-4)}e`
        const endJunctionNode: Node = {
          id: endJunctionId,
          type: "junction",
          position: { x: endPt.x - 4, y: endPt.y - 4 },
          data: {},
        }
        updatedNodes.push(endJunctionNode)
        targetNodeId = endJunctionId
        targetHandleId = arrivalHandle
      }

      // 2. Resolve departure handle at startpoint
      const nextPt = pts.length >= 2 ? pts[1] : endPt
      const isFirstVert = nextPt.x === startPt.x
      const departureHandle = isFirstVert
        ? nextPt.y > startPt.y ? "bottom" : "top"
        : nextPt.x > startPt.x ? "right" : "left"

      let currentSourceId = wireDraft.startPin?.nodeId
      let currentSourceHandle = wireDraft.startPin?.handleId ?? departureHandle

      if (!currentSourceId) {
        const startJunctionId = `J${Date.now().toString().slice(-4)}s`
        const startJunctionNode: Node = {
          id: startJunctionId,
          type: "junction",
          position: { x: startPt.x - 4, y: startPt.y - 4 },
          data: {},
        }
        updatedNodes.push(startJunctionNode)
        currentSourceId = startJunctionId
        currentSourceHandle = departureHandle
      }

      if (currentSourceId && targetNodeId && currentSourceId === targetNodeId) {
        setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
        setActiveTool("select")
        return
      }

      // 3. Resolve intermediate waypoints & obstacle avoidance
      let intermediateWaypoints = pts.slice(1, -1)
      if (intermediateWaypoints.length === 0 && currentSourceId && targetNodeId) {
        const obstacles = getComponentObstacles(updatedNodes, [currentSourceId, targetNodeId])
        const avoidance = computeAvoidanceWaypoints(startPt, endPt, obstacles)
        if (avoidance.length > 0) {
          intermediateWaypoints = avoidance
        }
      }

      // 4. Create and save edge (deduplicated)
      if (targetNodeId && currentSourceId) {
        const isDuplicate = updatedEdges.some(
          (e) =>
            ((e.source === currentSourceId && e.target === targetNodeId) ||
              (e.source === targetNodeId && e.target === currentSourceId)) &&
            JSON.stringify(e.data?.waypoints || []) === JSON.stringify(intermediateWaypoints || []),
        )
        if (!isDuplicate) {
          const finalEdge: Edge = {
            id: `e-${currentSourceId}-${targetNodeId}-${Date.now()}`,
            source: currentSourceId,
            sourceHandle: currentSourceHandle,
            target: targetNodeId,
            targetHandle: targetHandleId,
            type: "step",
            data: {
              waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
              bendMode: "auto",
            },
          }
          updatedEdges.push(finalEdge)
        }
      }

      setNodes(updatedNodes)
      setEdges(updatedEdges)
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
      setActiveTool("select")
    },
    [wireDraft, nodes, edges, pushSnapshot, activeTool, componentObstacles],
  )

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
          const updatedNodes = [...nodes]
          let updatedEdges = [...edges]

          const cleanPts = buildOrthogonalDraftPoints(
            pts,
            clickPoint,
            wireDraft.bendOrientation,
            componentObstacles,
          )

          const lastPrev = cleanPts.length >= 2 ? cleanPts[cleanPts.length - 2] : cleanPts[0]
          const isLastVert = lastPrev.x === clickPoint.x
          const arrivalHandle = isLastVert
            ? lastPrev.y < clickPoint.y ? "top" : "bottom"
            : lastPrev.x < clickPoint.x ? "left" : "right"

          let targetNodeId = hitPin?.nodeId
          let targetHandleId = hitPin?.handleId ?? arrivalHandle

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
            targetHandleId = arrivalHandle
          }

          let finalWaypoints = cleanPts.slice(1, -1)

          const nextPt = cleanPts.length >= 2 ? cleanPts[1] : clickPoint
          const isFirstVert = nextPt.x === cleanPts[0].x
          const departureHandle = isFirstVert
            ? nextPt.y > cleanPts[0].y ? "bottom" : "top"
            : nextPt.x > cleanPts[0].x ? "right" : "left"

          let currentSourceId = wireDraft.startPin?.nodeId
          let currentSourceHandle = wireDraft.startPin?.handleId ?? departureHandle

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
            currentSourceHandle = departureHandle
          }

          if (currentSourceId && targetNodeId && currentSourceId === targetNodeId) {
            setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
            return
          }

          if (finalWaypoints.length === 0 && currentSourceId && targetNodeId) {
            const obstacles = getComponentObstacles(updatedNodes, [currentSourceId, targetNodeId])
            const avoidance = computeAvoidanceWaypoints(cleanPts[0], cleanPts[cleanPts.length - 1], obstacles)
            if (avoidance.length > 0) {
              finalWaypoints = avoidance
            }
          }

          // Single continuous edge connecting source to target with waypoints for all bends (deduplicated)
          if (targetNodeId && currentSourceId) {
            const isDuplicate = updatedEdges.some(
              (e) =>
                ((e.source === currentSourceId && e.target === targetNodeId) ||
                  (e.source === targetNodeId && e.target === currentSourceId)) &&
                JSON.stringify(e.data?.waypoints || []) === JSON.stringify(finalWaypoints || []),
            )
            if (!isDuplicate) {
              const finalEdge: Edge = {
                id: `e-${currentSourceId}-${targetNodeId}-${Date.now()}`,
                source: currentSourceId,
                sourceHandle: currentSourceHandle,
                target: targetNodeId,
                targetHandle: targetHandleId,
                type: "step",
                data: {
                  waypoints:
                    finalWaypoints.length > 0 ? finalWaypoints : undefined,
                  bendMode: "auto",
                },
              }
              updatedEdges.push(finalEdge)
            }
          }

          setNodes(updatedNodes)
          setEdges(updatedEdges)
          setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
        } else {
          // Clicked on empty grid -> commit 90-degree bend and continue drawing
          setWireDraft((prev) => {
            const nextPts = buildOrthogonalDraftPoints(
              prev.points,
              clickPoint,
              prev.bendOrientation,
              componentObstacles,
            )
            const last = nextPts[nextPts.length - 1]
            const secondLast = nextPts.length >= 2 ? nextPts[nextPts.length - 2] : null
            const newOri = secondLast
              ? secondLast.x === last.x ? "h" : "v"
              : prev.bendOrientation === "h" ? "v" : "h"

            return {
              ...prev,
              points: nextPts,
              bendOrientation: newOri,
            }
          })
        }
      }
    },
    [wireDraft, nodes, edges, pushSnapshot, componentObstacles],
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
                  : compType === "voltage-source" || compType === "ac-source" || compType === "pulse-source"
                    ? "V"
                    : compType === "current-source"
                      ? "I"
                      : compType === "ground"
                        ? "GND"
                        : compType === "vcc"
                          ? "VCC"
                          : compType === "net-label"
                            ? "NET"
                            : compType === "port-in"
                              ? "IN"
                              : compType === "port-out"
                                ? "OUT"
                                : compType === "port-bi"
                                  ? "IO"
                                  : compType === "spice-directive"
                                    ? "SPICE"
                                    : compType === "schematic-text"
                                      ? "TXT"
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
        const isDirectiveOrText = compType === "spice-directive" || compType === "schematic-text"
        const isNetLabel = compType === "net-label"
        const isPort = compType === "port-in" || compType === "port-out" || compType === "port-bi"
        const isNetOrPort = isNetLabel || isPort
        const assignedName = placingComponent.customValue || (isDirectiveOrText ? "" : id)
        const portType =
          compType === "port-in"
            ? "input"
            : compType === "port-out"
              ? "output"
              : compType === "port-bi"
                ? "bidirectional"
                : undefined
        const directiveType = compType === "spice-directive" ? "spice" : undefined

        let nodePosX = snapX - 60
        let nodePosY = snapY - 40
        if (isNetOrPort) {
          const pins = getComponentPins(compType)
          if (pins.length > 0) {
            const rotPin = getRotatedPinPos(pins[0], placingComponent.rotation)
            nodePosX = snapX - rotPin.x
            nodePosY = snapY - rotPin.y
          }
        } else if (isDirectiveOrText) {
          nodePosX = snapX
          nodePosY = snapY - 40
        }

        const newNode: Node<SchematicNodeData> = {
          id,
          type: "schematic",
          position: {
            x: nodePosX,
            y: nodePosY,
          },
          data: {
            label: isDirectiveOrText ? "" : assignedName,
            type: compType,
            value:
              placingComponent.customValue ??
              def?.defaultValue ??
              (compType === "spice-directive"
                ? ".tran 1u 10m"
                : compType === "schematic-text"
                  ? "Text Annotation"
                  : undefined),
            rotation: placingComponent.rotation,
            portType,
            directiveType,
          },
        }

        const hitEdgeResult = findEdgeAtCoord(edges, nodes, snapX, snapY)
        if (hitEdgeResult && isNetOrPort) {
          const { edge1, edge2 } = splitEdgeAtPoint(
            hitEdgeResult.edge,
            nodes,
            newNode.id,
            { x: snapX, y: snapY },
            "pin1",
          )
          setNodes((curr) => [...curr, newNode])
          setEdges((curr) => [
            ...curr.filter((e) => e.id !== hitEdgeResult.edge.id),
            edge1,
            edge2,
          ])
        } else {
          setNodes((curr) => [...curr, newNode])
        }
        setSelectedNodeId(id)
        setSelectedEdgeId(null)
      }

      setPlacingComponent(null)
    },
    [placingComponent, nodes, edges, pushSnapshot, cursorPos],
  )

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      pushSnapshot(nodes, edges)
      const targetNode = nodes.find((n) => n.id === nodeId)

      if (targetNode) {
        // If deleting a component, preserve all connected wires by leaving junction endpoints where the pins were
        const newJunctionNodes: Node[] = []
        const pinJunctionMap = new Map<string, string>()

        const updatedEdges = edges.map((e) => {
          if (e.source !== nodeId && e.target !== nodeId) {
            return e
          }

          let newSource = e.source
          let newSourceHandle = e.sourceHandle
          let newTarget = e.target
          let newTargetHandle = e.targetHandle

          if (e.source === nodeId) {
            const pCoord = getPinCoord(targetNode, e.sourceHandle)
            const key = `${pCoord.x},${pCoord.y}`
            let jId = pinJunctionMap.get(key)
            if (!jId) {
              const existingJ = nodes.find(
                (n) =>
                  n.type === "junction" &&
                  Math.abs(n.position.x + 4 - pCoord.x) < 2 &&
                  Math.abs(n.position.y + 4 - pCoord.y) < 2,
              )
              if (existingJ) {
                jId = existingJ.id
              } else {
                jId = `J${Date.now().toString().slice(-4)}${Math.random().toString(36).slice(2, 5)}`
                newJunctionNodes.push({
                  id: jId,
                  type: "junction",
                  position: { x: pCoord.x - 4, y: pCoord.y - 4 },
                  data: {},
                })
              }
              pinJunctionMap.set(key, jId)
            }
            newSource = jId
            newSourceHandle = "right"
          }

          if (e.target === nodeId) {
            const pCoord = getPinCoord(targetNode, e.targetHandle)
            const key = `${pCoord.x},${pCoord.y}`
            let jId = pinJunctionMap.get(key)
            if (!jId) {
              const existingJ = nodes.find(
                (n) =>
                  n.type === "junction" &&
                  Math.abs(n.position.x + 4 - pCoord.x) < 2 &&
                  Math.abs(n.position.y + 4 - pCoord.y) < 2,
              )
              if (existingJ) {
                jId = existingJ.id
              } else {
                jId = `J${Date.now().toString().slice(-4)}${Math.random().toString(36).slice(2, 5)}`
                newJunctionNodes.push({
                  id: jId,
                  type: "junction",
                  position: { x: pCoord.x - 4, y: pCoord.y - 4 },
                  data: {},
                })
              }
              pinJunctionMap.set(key, jId)
            }
            newTarget = jId
            newTargetHandle = "left"
          }

          return {
            ...e,
            source: newSource,
            sourceHandle: newSourceHandle,
            target: newTarget,
            targetHandle: newTargetHandle,
          }
        })

        setNodes((curr) => [
          ...curr.filter((n) => n.id !== nodeId),
          ...newJunctionNodes,
        ])
        setEdges(updatedEdges)
      } else {
        setNodes((curr) => curr.filter((n) => n.id !== nodeId))
      }
      setSelectedNodeId((curr) => (curr === nodeId ? null : curr))
    },
    [nodes, edges, pushSnapshot],
  )

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      pushSnapshot(nodes, edges)
      const edgeToDelete = edges.find((e) => e.id === edgeId)
      const remainingEdges = edges.filter((e) => e.id !== edgeId)

      // Clean up any orphan floating junction nodes that had only this deleted edge
      if (edgeToDelete) {
        const remainingEndpoints = new Set<string>()
        for (const e of remainingEdges) {
          remainingEndpoints.add(e.source)
          remainingEndpoints.add(e.target)
        }
        setNodes((curr) =>
          curr.filter((n) => {
            if (n.type !== "junction") return true
            // If it's one of the endpoints of the deleted edge and has no other edges, remove it
            if (
              (n.id === edgeToDelete.source || n.id === edgeToDelete.target) &&
              !remainingEndpoints.has(n.id)
            ) {
              return false
            }
            return true
          }),
        )
      }

      setEdges(remainingEdges)
      setSelectedEdgeId((curr) => (curr === edgeId ? null : curr))
    },
    [nodes, edges, pushSnapshot],
  )

  const onEdgeMouseEnter = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (activeTool === "probe") {
        const edgeNet = liveConnectivity.edgeNetMap[edge.id]
        if (edgeNet) {
          setHighlightedNet(edgeNet)
          const vStr = edgeNet === "0" ? "0V (GND)" : `V(${edgeNet.toUpperCase()})`
          setSimMessage(`🎯 Probe Wire: Net ${edgeNet.toUpperCase()} - Click to plot ${vStr}`)
        }
      }
    },
    [activeTool, liveConnectivity],
  )

  const onEdgeMouseLeave = useCallback(
    (_event: React.MouseEvent, _edge: Edge) => {
      if (activeTool === "probe") {
        setHighlightedNet(null)
      }
    },
    [activeTool],
  )

  const onNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (activeTool === "probe") {
        if (
          node.type === "junction" ||
          node.data?.type === "ground" ||
          node.data?.type === "net-label" ||
          node.data?.type === "vcc" ||
          node.data?.type === "port-in" ||
          node.data?.type === "port-out" ||
          node.data?.type === "port-bi"
        ) {
          const pinMap = liveConnectivity.nodePinNetMap[node.id] || {}
          const netName = Object.values(pinMap)[0] || (node.data?.type === "ground" ? "0" : undefined)
          if (netName) {
            setHighlightedNet(netName)
            const vStr = netName === "0" ? "0V (GND)" : `V(${netName.toUpperCase()})`
            setSimMessage(`🎯 Probe Node: Net ${netName.toUpperCase()} - Click to plot ${vStr}`)
          }
        } else {
          const label = node.data?.label || node.id
          setSimMessage(`🎯 Current Clamp: ${label} - Click to plot branch current I(${label.toUpperCase()})`)
        }
      }
    },
    [activeTool, liveConnectivity],
  )

  const onNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, _node: Node) => {
      if (activeTool === "probe") {
        setHighlightedNet(null)
      }
    },
    [activeTool],
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

      if (activeTool === "delete") {
        event.stopPropagation()
        deleteEdgeById(clickedEdge.id)
        return
      }

      if (activeTool === "probe") {
        event.stopPropagation()
        const edgeNet = liveConnectivity.edgeNetMap[clickedEdge.id]
        if (edgeNet) {
          if (event.shiftKey || event.altKey) {
            probeNet(edgeNet, true)
          } else {
            probeNet(edgeNet, false)
          }
        }
        return
      }

      event.stopPropagation()
      const edgeNet = liveConnectivity.edgeNetMap[clickedEdge.id]
      if (edgeNet) {
        setHighlightedNet((prev) => (prev === edgeNet ? null : edgeNet))
        if (lastSimResult) {
          probeNet(edgeNet)
        }
      }
      setSelectedEdgeId(clickedEdge.id)
      setSelectedNodeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, placingComponent, placeComponentAt, handleWireCanvasClick, screenToFlowPosition, project, liveConnectivity, deleteEdgeById, probeNet, lastSimResult],
  )

  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, clickedEdge: Edge) => {
      if (wireClickTimeoutRef.current) {
        clearTimeout(wireClickTimeoutRef.current)
        wireClickTimeoutRef.current = null
      }

      if (activeTool === "wire") {
        event.stopPropagation()
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord ? getFlowCoord({ x: event.clientX, y: event.clientY }) : cursorPos
        finishAndSaveWire(flowPos)
        return
      }

      flipEdgeBend(clickedEdge.id)
    },
    [activeTool, screenToFlowPosition, project, cursorPos, finishAndSaveWire, flipEdgeBend],
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

      if (activeTool === "delete") {
        event.stopPropagation()
        deleteNodeById(node.id)
        return
      }

      if (activeTool === "probe") {
        event.stopPropagation()
        // If node is a junction, ground, net-label, vcc, or port: probe its voltage!
        if (
          node.type === "junction" ||
          node.data?.type === "ground" ||
          node.data?.type === "net-label" ||
          node.data?.type === "vcc" ||
          node.data?.type === "port-in" ||
          node.data?.type === "port-out" ||
          node.data?.type === "port-bi"
        ) {
          const pinMap = liveConnectivity.nodePinNetMap[node.id] || {}
          const netName = Object.values(pinMap)[0] || (node.data?.type === "ground" ? "0" : undefined)
          if (netName) {
            probeNet(netName)
          }
          return
        }

        // It is a component body (resistor, capacitor, inductor, diode, bjt, mosfet, source): probe its branch current!
        probeComponentCurrent(node)
        return
      }

      if (
        node.type === "junction" ||
        node.data?.type === "ground" ||
        node.data?.type === "net-label" ||
        node.data?.type === "port-in" ||
        node.data?.type === "port-out" ||
        node.data?.type === "port-bi"
      ) {
        const pinMap = liveConnectivity.nodePinNetMap[node.id] || {}
        const netName = Object.values(pinMap)[0]
        if (netName) {
          setHighlightedNet((prev) => (prev === netName ? null : netName))
          if (lastSimResult) {
            probeNet(netName)
          }
        }
      }
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [activeTool, placingComponent, placeComponentAt, handleWireCanvasClick, screenToFlowPosition, project, liveConnectivity, deleteNodeById, probeNet, probeComponentCurrent, lastSimResult],
  )

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (wireClickTimeoutRef.current) {
        clearTimeout(wireClickTimeoutRef.current)
        wireClickTimeoutRef.current = null
      }

      if (activeTool === "wire") {
        event.stopPropagation()
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord ? getFlowCoord({ x: event.clientX, y: event.clientY }) : cursorPos
        finishAndSaveWire(flowPos)
        return
      }

      if (node) {
        event.stopPropagation()
        setPropertiesModalNode(node as Node<SchematicNodeData>)
        setIsPropertiesModalOpen(true)
      }
    },
    [activeTool, screenToFlowPosition, project, cursorPos, finishAndSaveWire],
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
        event.stopPropagation()
        handleWireCanvasClick(flowPos)
        return
      }

      if (activeTool === "delete") {
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
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
    (event: React.MouseEvent) => {
      if (wireClickTimeoutRef.current) {
        clearTimeout(wireClickTimeoutRef.current)
        wireClickTimeoutRef.current = null
      }

      if (activeTool === "wire") {
        event.stopPropagation()
        const getFlowCoord = screenToFlowPosition || project
        const flowPos = getFlowCoord ? getFlowCoord({ x: event.clientX, y: event.clientY }) : cursorPos
        finishAndSaveWire(flowPos)
        return
      }
    },
    [activeTool, screenToFlowPosition, project, cursorPos, finishAndSaveWire],
  )

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const getFlowCoord = screenToFlowPosition || project
      const flowPos = getFlowCoord({ x: event.clientX, y: event.clientY })
      if (activeTool === "wire") {
        setCursorPos(getMagneticSnapCoord(flowPos, nodes, edges))
      } else if (activeTool === "delete") {
        setCursorPos({
          x: Math.round(flowPos.x),
          y: Math.round(flowPos.y),
        })
      } else {
        setCursorPos({
          x: Math.round(flowPos.x / 20) * 20,
          y: Math.round(flowPos.y / 20) * 20,
        })
      }
      if (getZoom) {
        setZoomLevel(Math.round(getZoom() * 100))
      }
    },
    [screenToFlowPosition, project, getZoom, activeTool, nodes, edges],
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
        type?: SchematicComponentType
        directiveType?: "spice" | "comment"
        portType?: "none" | "input" | "output" | "bidirectional"
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
              ...(updates.type !== undefined ? { type: updates.type } : {}),
              ...(updates.directiveType !== undefined ? { directiveType: updates.directiveType } : {}),
              ...(updates.portType !== undefined ? { portType: updates.portType } : {}),
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
            ...(updates.type !== undefined ? { type: updates.type } : {}),
            ...(updates.directiveType !== undefined ? { directiveType: updates.directiveType } : {}),
            ...(updates.portType !== undefined ? { portType: updates.portType } : {}),
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
      if (activeTool === "wire") {
        finishAndSaveWire()
        setContextMenu({ visible: false, x: 0, y: 0 })
        return
      }
      if (activeTool === "delete") {
        setActiveTool("select")
        setContextMenu({ visible: false, x: 0, y: 0 })
        return
      }
      setContextMenu({ visible: false, x: 0, y: 0 })
      setPropertiesModalNode(node as Node<SchematicNodeData>)
      setIsPropertiesModalOpen(true)
    },
    [placingComponent, activeTool, finishAndSaveWire],
  )

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      if (placingComponent) {
        setPlacingComponent(null)
      }
      if (activeTool === "wire") {
        event.stopPropagation()
        finishAndSaveWire()
        setContextMenu({ visible: false, x: 0, y: 0 })
        return
      }
      if (activeTool === "delete") {
        event.stopPropagation()
        setActiveTool("select")
        setContextMenu({ visible: false, x: 0, y: 0 })
        return
      }
      setContextMenu({ visible: false, x: 0, y: 0 })
    },
    [placingComponent, activeTool, finishAndSaveWire],
  )

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      if (placingComponent) {
        setPlacingComponent(null)
        return
      }
      if (activeTool === "wire") {
        event.stopPropagation()
        finishAndSaveWire()
        setContextMenu({ visible: false, x: 0, y: 0 })
        return
      }
      if (activeTool === "delete") {
        event.stopPropagation()
        setActiveTool("select")
        setContextMenu({ visible: false, x: 0, y: 0 })
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
    [placingComponent, activeTool, finishAndSaveWire],
  )

  /* ============================================================
     START COMPONENT / JUNCTION PLACEMENT (CAD Ghost Mode)
     ============================================================ */

  const startPlacingComponent = useCallback(
    (type: SchematicComponentType, customValue?: string) => {
      setPlacingComponent((curr) =>
        curr?.type === type && curr?.customValue === customValue
          ? null
          : { type, rotation: 0, customValue },
      )
      setActiveTool("select")
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    },
    [],
  )

  const openNetLabelDialog = useCallback(() => {
    setNetNameModal({
      isOpen: true,
      type: "net-label",
      name: "",
    })
  }, [])

  const openPortDialog = useCallback((portType: "port-in" | "port-out" | "port-bi" = "port-in") => {
    setNetNameModal({
      isOpen: true,
      type: portType,
      name: portType === "port-in" ? "IN" : portType === "port-out" ? "OUT" : "IO",
    })
  }, [])

  const handleConfirmNetName = useCallback(
    (type: SchematicComponentType, name: string) => {
      startPlacingComponent(type, name)
    },
    [startPlacingComponent],
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
      deleteNodeById(selectedNodeId)
    } else if (selectedEdgeId) {
      deleteEdgeById(selectedEdgeId)
    }
    setContextMenu({ visible: false, x: 0, y: 0 })
  }, [selectedNodeId, selectedEdgeId, deleteNodeById, deleteEdgeById])

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

  /* ============================================================
     MULTI-FILE PROJECT & TAB MANAGEMENT (LTspice Style)
     ============================================================ */

  const switchTab = useCallback(
    (targetTabId: string) => {
      if (targetTabId === activeTabId) return

      isSwitchingTabRef.current = true

      // 1. Save current active tab data to tabsDataRef with deep snapshot
      const currentTab = tabsDataRef.current.get(activeTabId)
      if (currentTab) {
        currentTab.nodes = JSON.parse(JSON.stringify(nodes))
        currentTab.edges = JSON.parse(JSON.stringify(edges))
        currentTab.history = history
        currentTab.analysisConfig = analysisConfig
        currentTab.solverSettings = solverSettings
        currentTab.simulationResult = lastSimResult
        if (getViewport) {
          currentTab.viewport = getViewport()
        }
      }

      // 2. Retrieve target tab data from isolated tabsDataRef
      const targetTab = tabsDataRef.current.get(targetTabId) || tabs.find((t) => t.id === targetTabId)
      if (!targetTab) {
        isSwitchingTabRef.current = false
        return
      }

      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
      setActiveTool("select")
      setPlacingComponent(null)

      const targetNodes = JSON.parse(JSON.stringify(targetTab.nodes || []))
      const targetEdges = JSON.parse(JSON.stringify(targetTab.edges || []))

      // 3. Switch active tab and load isolated data
      setActiveTabId(targetTabId)
      setNodes(targetNodes)
      setEdges(targetEdges)
      setHistory(targetTab.history || { past: [], future: [] })
      setAnalysisConfig(targetTab.analysisConfig || DEFAULT_ANALYSIS_CONFIG)
      setSolverSettings(targetTab.solverSettings || DEFAULT_SOLVER_SETTINGS)
      setLastSimResult(targetTab.simulationResult || null)

      // 4. Restore target tab's viewport instantly without animation once mounted
      requestAnimationFrame(() => {
        if (targetTab.viewport && setViewport) {
          setViewport(targetTab.viewport, { duration: 0 })
        }
        isSwitchingTabRef.current = false
      })
    },
    [activeTabId, tabs, nodes, edges, history, analysisConfig, solverSettings, lastSimResult, getViewport, setViewport],
  )

  const createNewSchematicTab = useCallback(() => {
    isSwitchingTabRef.current = true

    // 1. Save current active tab
    const currentTab = tabsDataRef.current.get(activeTabId)
    if (currentTab) {
      currentTab.nodes = JSON.parse(JSON.stringify(nodes))
      currentTab.edges = JSON.parse(JSON.stringify(edges))
      currentTab.history = history
      currentTab.analysisConfig = analysisConfig
      currentTab.solverSettings = solverSettings
      currentTab.simulationResult = lastSimResult
      if (getViewport) {
        currentTab.viewport = getViewport()
      }
    }

    const newTab = createDefaultCircuitTab(draftCounterRef.current++)
    tabsDataRef.current.set(newTab.id, newTab)
    setTabs((curr) => [...curr, newTab])

    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
    setActiveTool("select")
    setPlacingComponent(null)

    setActiveTabId(newTab.id)
    setNodes([])
    setEdges([])
    setHistory({ past: [], future: [] })
    setAnalysisConfig(newTab.analysisConfig)
    setSolverSettings(newTab.solverSettings)
    setLastSimResult(null)

    requestAnimationFrame(() => {
      if (setViewport) {
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 })
      }
      isSwitchingTabRef.current = false
    })
  }, [activeTabId, nodes, edges, history, analysisConfig, solverSettings, lastSimResult, getViewport, setViewport])

  const saveTabById = useCallback(
    async (tabId: string, saveAs: boolean = false): Promise<boolean> => {
      const targetTab = tabsDataRef.current.get(tabId) || tabs.find((t) => t.id === tabId)
      if (!targetTab) return false

      const currentViewport = getViewport ? getViewport() : undefined
      const tabToSave: CircuitTab =
        tabId === activeTabId
          ? {
            ...targetTab,
            nodes,
            edges,
            analysisConfig,
            solverSettings,
            simulationResult: lastSimResult,
            viewport: currentViewport ?? targetTab.viewport,
          }
          : targetTab

      const content = serializeCircuitTab(tabToSave)
      const lastDir = getLastSavedDir()
      const defaultPath = targetTab.filePath || (lastDir ? `${lastDir}/${targetTab.title}` : targetTab.title)

      try {
        const result = await window.api.saveFile({
          filePath: saveAs ? null : targetTab.filePath,
          content,
          defaultPath,
        })

        if (result.canceled || !result.filePath) {
          return false
        }

        const newFilePath = result.filePath
        const newTitle = getFileNameFromPath(newFilePath)

        tabToSave.filePath = newFilePath
        tabToSave.title = newTitle
        tabToSave.isDirty = false
        if (currentViewport) tabToSave.viewport = currentViewport
        tabsDataRef.current.set(tabId, tabToSave)

        setTabs((currTabs) =>
          currTabs.map((t) =>
            t.id === tabId
              ? {
                ...t,
                filePath: newFilePath,
                title: newTitle,
                isDirty: false,
                viewport: currentViewport ?? t.viewport,
              }
              : t,
          ),
        )

        const updatedRecent = addRecentFile(newFilePath, newTitle)
        setRecentFiles(updatedRecent)
        setLastSavedDir(newFilePath)
        return true
      } catch (err) {
        console.error("Failed to save schematic:", err)
        return false
      }
    },
    [tabs, activeTabId, nodes, edges, analysisConfig, solverSettings, lastSimResult, getViewport],
  )

  const saveActiveTab = useCallback(
    async (saveAs: boolean = false) => {
      return saveTabById(activeTabId, saveAs)
    },
    [activeTabId, saveTabById],
  )

  const openFileByPath = useCallback(
    async (filePath: string) => {
      const existingTab = tabs.find((t) => t.filePath === filePath)
      if (existingTab) {
        switchTab(existingTab.id)
        return
      }

      try {
        const res = await window.api.readFile(filePath)
        if (!res.success || !res.content) {
          console.error("Failed to read file:", res.error)
          return
        }

        const title = getFileNameFromPath(filePath)
        const openedTab = deserializeCircuitTab(res.content, filePath, title)

        // Save current active tab first with deep snapshot
        const currentTab = tabsDataRef.current.get(activeTabId)
        if (currentTab) {
          currentTab.nodes = JSON.parse(JSON.stringify(nodes))
          currentTab.edges = JSON.parse(JSON.stringify(edges))
          currentTab.history = history
          currentTab.analysisConfig = analysisConfig
          currentTab.solverSettings = solverSettings
          currentTab.simulationResult = lastSimResult
          if (getViewport) {
            currentTab.viewport = getViewport()
          }
        }

        const isCurrentPristine =
          currentTab && !currentTab.isDirty && currentTab.nodes.length === 0 && !currentTab.filePath

        const isolatedNodes = JSON.parse(JSON.stringify(openedTab.nodes || []))
        const isolatedEdges = JSON.parse(JSON.stringify(openedTab.edges || []))

        isSwitchingTabRef.current = true

        if (isCurrentPristine) {
          // Replace pristine tab in-place
          openedTab.id = activeTabId
          tabsDataRef.current.set(activeTabId, openedTab)
          setTabs((currTabs) =>
            currTabs.map((t) => (t.id === activeTabId ? openedTab : t)),
          )
          setNodes(isolatedNodes)
          setEdges(isolatedEdges)
          setHistory({ past: [], future: [] })
          setAnalysisConfig(openedTab.analysisConfig)
          setSolverSettings(openedTab.solverSettings)
          setLastSimResult(null)
        } else {
          // Add new isolated tab
          tabsDataRef.current.set(openedTab.id, openedTab)
          setTabs((curr) => [...curr, openedTab])
          setActiveTabId(openedTab.id)
          setNodes(isolatedNodes)
          setEdges(isolatedEdges)
          setHistory({ past: [], future: [] })
          setAnalysisConfig(openedTab.analysisConfig)
          setSolverSettings(openedTab.solverSettings)
          setLastSimResult(null)
        }

        requestAnimationFrame(() => {
          if (openedTab.viewport && setViewport) {
            setViewport(openedTab.viewport, { duration: 0 })
          } else if (openedTab.nodes && openedTab.nodes.length > 0 && fitView) {
            fitView({ padding: 0.2, maxZoom: 1, duration: 0 })
          }
          isSwitchingTabRef.current = false
        })

        const updatedRecent = addRecentFile(filePath, title)
        setRecentFiles(updatedRecent)
        setLastSavedDir(filePath)
      } catch (err) {
        console.error("Failed to open file:", err)
      }
    },
    [tabs, activeTabId, switchTab, nodes, edges, history, analysisConfig, solverSettings, lastSimResult, getViewport, setViewport, fitView],
  )

  const openSchematicFile = useCallback(async () => {
    try {
      const res = await window.api.openFile()
      if (res.canceled || !res.filePath || res.content === undefined) {
        return
      }
      await openFileByPath(res.filePath)
    } catch (err) {
      console.error("Failed to show open dialog:", err)
    }
  }, [openFileByPath])

  const closeTab = useCallback(
    async (tabIdToClose: string) => {
      const tabToClose = tabsDataRef.current.get(tabIdToClose) || tabs.find((t) => t.id === tabIdToClose)
      if (!tabToClose) return

      if (tabToClose.isDirty) {
        try {
          const res = await window.api.confirmClose(tabToClose.title)
          if (res.action === "cancel") {
            return
          }
          if (res.action === "save") {
            const saved = await saveTabById(tabIdToClose, false)
            if (!saved) {
              return
            }
          }
        } catch (_err) { }
      }

      tabsDataRef.current.delete(tabIdToClose)
      const remaining = tabs.filter((t) => t.id !== tabIdToClose)
      if (remaining.length === 0) {
        const fresh = createDefaultCircuitTab(1)
        draftCounterRef.current = 2
        tabsDataRef.current.set(fresh.id, fresh)
        setTabs([fresh])
        setActiveTabId(fresh.id)
        setNodes([])
        setEdges([])
        setHistory({ past: [], future: [] })
        setAnalysisConfig(fresh.analysisConfig)
        setSolverSettings(fresh.solverSettings)
        setLastSimResult(null)
        if (setViewport) {
          setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 })
        }
        return
      }

      if (tabIdToClose === activeTabId) {
        const closedIdx = tabs.findIndex((t) => t.id === tabIdToClose)
        const nextActive = remaining[Math.min(closedIdx, remaining.length - 1)]
        setTabs(remaining)
        switchTab(nextActive.id)
      } else {
        setTabs(remaining)
      }
    },
    [tabs, activeTabId, saveTabById, switchTab, setViewport],
  )

  const closeOtherTabs = useCallback(
    async (keepTabId: string) => {
      const otherTabs = tabs.filter((t) => t.id !== keepTabId)
      for (const t of otherTabs) {
        await closeTab(t.id)
      }
    },
    [tabs, closeTab],
  )

  const closeAllTabs = useCallback(async () => {
    for (const t of [...tabs]) {
      await closeTab(t.id)
    }
  }, [tabs, closeTab])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = tabs.some((t) => t.isDirty)
      if (hasDirty) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [tabs])

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

      // New Schematic: Ctrl+N
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault()
        createNewSchematicTab()
        return
      }

      // Toggle AI Assistant: Ctrl+Space or Ctrl+J
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "j" || event.code === "Space")) {
        event.preventDefault()
        setIsAiAssistantOpen((prev) => !prev)
        return
      }

      // Open Schematic: Ctrl+O
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault()
        openSchematicFile()
        return
      }

      // Save / Save As: Ctrl+S / Ctrl+Shift+S
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        saveActiveTab(event.shiftKey)
        return
      }

      // Close Tab: Ctrl+W
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault()
        closeTab(activeTabId)
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
        if (selectedNodeId || selectedEdgeId) {
          deleteSelected()
        } else {
          setActiveTool((prev) => (prev === "delete" ? "select" : "delete"))
        }
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
          openNetLabelDialog()
          return
        }

        if (event.key === "F5") {
          event.preventDefault()
          if (selectedNodeId || selectedEdgeId) {
            deleteSelected()
          } else {
            setActiveTool((prev) => (prev === "delete" ? "select" : "delete"))
          }
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
          case "a":
            startPlacingComponent("ac-source")
            break
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
          case "s":
            startPlacingComponent("spice-directive")
            break
          case "t":
            startPlacingComponent("schematic-text")
            break
          case "p":
            setActiveTool((prev) => (prev === "probe" ? "select" : "probe"))
            break
          case "escape":
            if (activeTool === "probe") {
              setActiveTool("select")
              return
            }
            if (activeTool === "delete") {
              setActiveTool("select")
              return
            }
            if (activeTool === "wire") {
              if (wireClickTimeoutRef.current) {
                clearTimeout(wireClickTimeoutRef.current)
                wireClickTimeoutRef.current = null
              }
              if (wireDraft.isDrawing) {
                // Cancel ONLY the unfinished wire draft in progress; never delete committed wires
                setWireDraft({ isDrawing: false, points: [], bendOrientation: "h" })
                return
              }
              // If not actively drawing, exit wire mode to select mode
              setActiveTool("select")
              return
            }
            if (highlightedNet) {
              setHighlightedNet(null)
              return
            }
            if (isOperatingPointModalOpen) {
              setIsOperatingPointModalOpen(false)
              return
            }
            if (isAcModalOpen) {
              setIsAcModalOpen(false)
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
    createNewSchematicTab,
    openSchematicFile,
    saveActiveTab,
    closeTab,
    activeTabId,
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
    openNetLabelDialog,
  ])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  document.title = "ASAP"
  useEffect(() => {
    document.title = "ASAP"
  }, [activeTabId, tabs])

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
          <div className="app-logo" style={{ display: "flex", alignItems: "center" }}>
            <img
              src={asapLogo}
              alt="ASAP"
              style={{
                height: "20px",
                width: "auto",
                objectFit: "contain",
              }}
            />
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
                {t('menu.file')}
              </button>
              {openMenu === "file" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { createNewSchematicTab(); setOpenMenu(null) }}>
                    <span>{t('menu.newSchematic')}</span> <span className="shortcut">Ctrl+N</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { openSchematicFile(); setOpenMenu(null) }}>
                    <span>{t('menu.openCircuit')}</span> <span className="shortcut">Ctrl+O</span>
                  </button>

                  {/* Recent Files submenu */}
                  <div
                    className="dropdown-item dropdown-has-submenu"
                    onMouseEnter={() => setShowRecentMenu(true)}
                    onMouseLeave={() => setShowRecentMenu(false)}
                  >
                    <span>{t('menu.openRecent')}</span>
                    <span className="submenu-arrow">▶</span>
                    {showRecentMenu && (
                      <div className="dropdown-submenu">
                        {recentFiles.length === 0 ? (
                          <div className="dropdown-item disabled" style={{ opacity: 0.6, cursor: "default" }}>
                            {t('menu.noRecentFiles')}
                          </div>
                        ) : (
                          <>
                            {recentFiles.map((rf) => (
                              <button
                                key={rf.filePath}
                                className="dropdown-item"
                                onClick={() => {
                                  openFileByPath(rf.filePath)
                                  setOpenMenu(null)
                                  setShowRecentMenu(false)
                                }}
                                title={rf.filePath}
                              >
                                <span className="recent-file-title">{rf.title}</span>
                                <span className="recent-file-path">{rf.filePath}</span>
                              </button>
                            ))}
                            <div className="dropdown-separator" />
                            <button
                              className="dropdown-item"
                              onClick={() => {
                                clearRecentFiles()
                                setRecentFiles([])
                                setOpenMenu(null)
                                setShowRecentMenu(false)
                              }}
                            >
                              <span>{t('menu.clearRecentFiles')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="dropdown-separator" />

                  <button className="dropdown-item" onClick={() => { saveActiveTab(false); setOpenMenu(null) }}>
                    <span>{t('menu.saveSchematic')}</span> <span className="shortcut">Ctrl+S</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { saveActiveTab(true); setOpenMenu(null) }}>
                    <span>{t('menu.saveAs')}</span> <span className="shortcut">Ctrl+Shift+S</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { closeTab(activeTabId); setOpenMenu(null) }}>
                    <span>{t('menu.closeSchematic')}</span> <span className="shortcut">Ctrl+W</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleExportNetlist()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.exportNetlist')}</span>
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
                {t('menu.edit')}
              </button>
              {openMenu === "edit" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { undo(); setOpenMenu(null) }}>
                    <span>{t('menu.undo')}</span> <span className="shortcut">Ctrl+Z</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { redo(); setOpenMenu(null) }}>
                    <span>{t('menu.redo')}</span> <span className="shortcut">Ctrl+Y</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={() => { rotateSelected(); setOpenMenu(null) }}>
                    <span>{t('menu.rotate')}</span> <span className="shortcut">R</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { deleteSelected(); setOpenMenu(null) }}>
                    <span>{t('menu.delete')}</span> <span className="shortcut">Del</span>
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
                {t('menu.view')}
              </button>
              {openMenu === "view" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { zoomIn(); setOpenMenu(null) }}>
                    <span>{t('menu.zoomIn')}</span> <span className="shortcut">+</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { zoomOut(); setOpenMenu(null) }}>
                    <span>{t('menu.zoomOut')}</span> <span className="shortcut">-</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { fitView({ padding: 0.2, maxZoom: 1 }); setOpenMenu(null) }}>
                    <span>{t('menu.fitCanvas')}</span> <span className="shortcut">F</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button className="dropdown-item" onClick={() => { setIsLibraryOpen(true); setOpenMenu(null) }}>
                    <span>{t('menu.componentLibrary')}</span> <span className="shortcut">F2</span>
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
                    <span>{t('menu.componentProperties')}</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsDiagnosticsOpen(!isDiagnosticsOpen); setBottomPanelTab("diagnostics"); setOpenMenu(null) }}>
                    <span>{isDiagnosticsOpen ? t('menu.hideDiagnostics') : t('menu.diagnostics')}</span> <span className="shortcut">F7</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsWaveformOpen(!isWaveformOpen); setBottomPanelTab("waveforms"); setOpenMenu(null) }}>
                    <span>{isWaveformOpen ? t('menu.hideWaveformViewer') : t('menu.waveformViewer')}</span> <span className="shortcut">F10</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { setIsMeasurementsOpen(!isMeasurementsOpen); setBottomPanelTab("measurements"); setOpenMenu(null) }}>
                    <span>{isMeasurementsOpen ? t('menu.hideMeasurements') : t('menu.measurements')}</span> <span className="shortcut">F11</span>
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
                {t('menu.simulate')}
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
                    <span>{simStatus === "running" ? t('menu.pause') : t('menu.runPause')}</span>
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
                    <span>{t('menu.stop')}</span>
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
                    <span>{t('menu.simulationDiagnostics')}</span>
                    <span className="shortcut">F7</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsOperatingPointModalOpen(true)
                      setOpenMenu(null)
                    }}
                    disabled={!lastSimResult}
                  >
                    <span>{t('menu.opResults')}</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsAcModalOpen(true)
                      setOpenMenu(null)
                    }}
                    disabled={!lastSimResult || (!lastSimResult.isComplex && analysisConfig.type !== "ac")}
                  >
                    <span>{t('menu.acResults')}</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsWaveformOpen(true)
                      setBottomPanelTab("waveforms")
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.waveformViewerMenu')}</span>
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
                    <span>{t('menu.measurementsMenu')}</span>
                    <span className="shortcut">F11</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      clearWaveforms()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.clearWaveforms')}</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsSettingsModalOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.settings')}</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsConfigAnalysisOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.configureAnalysis')}</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleExportNetlist()
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.viewNetlist')}</span>
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
                {t('menu.tools')}
              </button>
              {openMenu === "tools" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { addComponent("resistor"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeResistor')}</span> <span className="shortcut">R</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("capacitor"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeCapacitor')}</span> <span className="shortcut">C</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("inductor"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeInductor')}</span> <span className="shortcut">L</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("diode"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeDiode')}</span> <span className="shortcut">D</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("voltage-source"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeVoltageSource')}</span> <span className="shortcut">V</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { openNetLabelDialog(); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeNetLabel')}</span> <span className="shortcut">F4</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { openPortDialog("port-in"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeInputPort')}</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { openPortDialog("port-out"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeOutputPort')}</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { openPortDialog("port-bi"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeBiPort')}</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("spice-directive"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeSpiceDirective')}</span> <span className="shortcut">S</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addComponent("schematic-text"); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeTextAnnotation')}</span> <span className="shortcut">T</span>
                  </button>
                  <button className="dropdown-item" onClick={() => { addJunction(); setOpenMenu(null) }}>
                    <span>{t('toolsMenu.placeSolderDot')}</span> <span className="shortcut">J</span>
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
                    <span>{t('toolsMenu.ercCheck')}</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsLibraryOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>{t('menu.componentLibrary')}</span> <span className="shortcut">F2</span>
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
                {t('menu.help')}
              </button>
              {openMenu === "help" && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>{t('menu.keyboardShortcuts')}</span>
                  </button>
                  <button className="dropdown-item" onClick={() => setOpenMenu(null)}>
                    <span>{t('menu.ltspiceReference')}</span>
                  </button>
                  <div className="dropdown-separator" />
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsAboutModalOpen(true)
                      setOpenMenu(null)
                    }}
                  >
                    <span>About ASAP (Credits & Licenses)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="header-center">
          <div className="project-title-badge">
            <span
              className="project-status-dot"
              style={{ background: activeTab?.isDirty ? "#ef4444" : "#107c41" }}
            />
            <span>{activeTab?.title || "Untitled.qsch"}</span>
            {activeTab?.isDirty && <span style={{ color: "#ef4444", fontWeight: 700 }}>*</span>}
          </div>
        </div>

        <div className="header-right">
          <LanguageSwitcher />
        </div>
      </header>


      {/* =====================================================
          2. LTSPICE TOP SCHEMATIC TOOLBAR
          ===================================================== */}
      <div className="ltspice-toolbar" role="toolbar" aria-label="LTspice Schematic Toolbar">
        {/* Group 0: File Operations */}
        <div className="tb-group">
          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); createNewSchematicTab() }}
            onMouseEnter={(e) => showTooltip(e, "New Schematic", "Ctrl+N")}
            onMouseLeave={hideTooltip}
            aria-label="New Schematic"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M9 1.5H3.5C2.7 1.5 2 2.2 2 3V13C2 13.8 2.7 14.5 3.5 14.5H12.5C13.3 14.5 14 13.8 14 13V6.5L9 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M9 1.5V6.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <line x1="8" y1="9" x2="8" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <line x1="6.5" y1="10.5" x2="9.5" y2="10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); openSchematicFile() }}
            onMouseEnter={(e) => showTooltip(e, "Open Schematic", "Ctrl+O")}
            onMouseLeave={hideTooltip}
            aria-label="Open Schematic"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M1.5 5.5V13C1.5 13.6 1.9 14 2.5 14H13.5C14.1 14 14.5 13.6 14.5 13V7C14.5 6.4 14.1 6 13.5 6H8L6.5 4H2.5C1.9 4 1.5 4.4 1.5 5V5.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          <button
            className="tb-btn tb-icon-btn"
            onClick={() => { hideTooltip(); saveActiveTab(false) }}
            onMouseEnter={(e) => showTooltip(e, "Save Schematic", "Ctrl+S")}
            onMouseLeave={hideTooltip}
            aria-label="Save Schematic"
          >
            <span className="tb-icon-slot">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 2H11.5L14 4.5V13.5C14 13.8 13.8 14 13.5 14H2.5C2.2 14 2 13.8 2 13.5V2.5C2 2.2 2.2 2 2.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5 2V5H11V2" stroke="currentColor" strokeWidth="1.2" />
                <rect x="4.5" y="8" width="7" height="6" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </span>
          </button>
        </div>

        <div className="tb-divider" />

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
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={14} />
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
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={14} />
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
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={14} />
            </span>
          </button>

          {/* AI Circuit Copilot Button */}
          <button
            className={`tb-btn tb-icon-btn ${isAiAssistantOpen ? "active" : ""}`}
            onClick={() => { hideTooltip(); setIsAiAssistantOpen(!isAiAssistantOpen) }}
            onMouseEnter={(e) => showTooltip(e, isAiAssistantOpen ? "Close AI Copilot" : "CriticalPath AI Copilot", "Ctrl+Space")}
            onMouseLeave={hideTooltip}
            aria-label="CriticalPath AI Copilot"
            style={{
              borderColor: isAiAssistantOpen ? "rgba(168, 85, 247, 0.8)" : "rgba(139, 92, 246, 0.4)",
              background: isAiAssistantOpen
                ? "linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(99, 102, 241, 0.16) 100%)"
                : "rgba(139, 92, 246, 0.06)",
              boxShadow: isAiAssistantOpen ? "0 0 8px rgba(168, 85, 247, 0.35)" : undefined,
              transition: "all 0.15s ease",
            }}
          >
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AiCopilotLogo size={16} active={isAiAssistantOpen} glow={isAiAssistantOpen} />
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

          {/* Probe Wire / Node Tool */}
          <button
            className={`tb-btn tb-icon-btn ${activeTool === "probe" ? "active" : ""}`}
            onClick={() => {
              hideTooltip()
              setActiveTool((prev) => (prev === "probe" ? "select" : "probe"))
            }}
            onMouseEnter={(e) =>
              showTooltip(e, activeTool === "probe" ? "Exit Probe Mode" : "Probe Wire/Node (Graph & Calculate)", "P")
            }
            onMouseLeave={hideTooltip}
            aria-label="Probe Wire/Node"
            style={{
              color: activeTool === "probe" ? "#0284c7" : undefined,
              borderColor: activeTool === "probe" ? "rgba(2, 132, 199, 0.6)" : undefined,
              background: activeTool === "probe" ? "#e0f2fe" : undefined,
            }}
          >
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Crosshair size={14} />
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
            onClick={() => { hideTooltip(); openNetLabelDialog() }}
            onMouseEnter={(e) => showTooltip(e, "Net Label", "F4")}
            onMouseLeave={hideTooltip}
            aria-label="Net Label"
          >
            <span className="tb-icon-slot">{CompIcon['net-label']}</span>
          </button>

          {/* Port Tool with dropdown for Input, Output, Bidirectional */}
          <div ref={portDropdownRef} style={{ position: "relative", display: "inline-flex" }}>
            <button
              className={`tb-btn tb-icon-btn ${placingComponent?.type === "port-in" ||
                placingComponent?.type === "port-out" ||
                placingComponent?.type === "port-bi"
                ? "active"
                : ""
                }`}
              onClick={() => {
                hideTooltip()
                setIsPortMenuOpen(false)
                openPortDialog("port-in")
              }}
              onMouseEnter={(e) => showTooltip(e, "Place Port (Input / Output / Bi-Dir)", "")}
              onMouseLeave={hideTooltip}
              aria-label="Port"
              style={{ display: "inline-flex", alignItems: "center", borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              <span className="tb-icon-slot">{CompIcon.port}</span>
            </button>
            <button
              className={`tb-btn tb-icon-btn ${isPortMenuOpen ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation()
                hideTooltip()
                setIsPortMenuOpen((prev) => !prev)
              }}
              style={{ minWidth: 14, width: 14, padding: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "none" }}
              aria-label="Port Options"
            >
              <svg width="6" height="4" viewBox="0 0 6 4" style={{ opacity: 0.7 }}>
                <path d="M0 0 L3 3 L6 0 Z" fill="currentColor" />
              </svg>
            </button>

            {isPortMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 2,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 4,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: 1000,
                  minWidth: 160,
                  padding: "4px 0",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#1e293b",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  onClick={() => {
                    setIsPortMenuOpen(false)
                    openPortDialog("port-in")
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>{CompIcon["port-in"]}</span>
                  <span>Input Port</span>
                </button>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#1e293b",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  onClick={() => {
                    setIsPortMenuOpen(false)
                    openPortDialog("port-out")
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>{CompIcon["port-out"]}</span>
                  <span>Output Port</span>
                </button>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#1e293b",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  onClick={() => {
                    setIsPortMenuOpen(false)
                    openPortDialog("port-bi")
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>{CompIcon["port-bi"]}</span>
                  <span>Bidirectional Port</span>
                </button>
              </div>
            )}
          </div>

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "schematic-text" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("schematic-text") }}
            onMouseEnter={(e) => showTooltip(e, "Text Annotation", "T")}
            onMouseLeave={hideTooltip}
            aria-label="Text Annotation"
          >
            <span className="tb-icon-slot">{CompIcon['schematic-text']}</span>
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

          <button
            className={`tb-btn tb-icon-btn ${placingComponent?.type === "ac-source" ? "active" : ""}`}
            onClick={() => { hideTooltip(); startPlacingComponent("ac-source") }}
            onMouseEnter={(e) => showTooltip(e, "AC Voltage Source", "A")}
            onMouseLeave={hideTooltip}
            aria-label="AC Voltage Source"
          >
            <span className="tb-icon-slot">{CompIcon['ac-source']}</span>
          </button>
        </div>

        <div className="tb-divider" />

        {/* Group 4: Transistors & Semiconductors */}
        <div className="tb-group">

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
            <span className="tb-lib-text">{t('toolbar.component')}</span>
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
            className={`tb-btn tb-icon-btn tb-btn-delete ${activeTool === "delete" ? "active" : ""}`}
            onClick={() => {
              hideTooltip()
              if (selectedNodeId || selectedEdgeId) {
                deleteSelected()
              } else {
                setActiveTool((prev) => (prev === "delete" ? "select" : "delete"))
              }
            }}
            onMouseEnter={(e) => showTooltip(e, activeTool === "delete" ? "Exit Delete Mode" : "Delete Tool", "Del / F5")}
            onMouseLeave={hideTooltip}
            aria-label="Delete Tool"
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
            <span className="tb-icon-slot" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Maximize2 size={13} />
            </span>
          </button>
        </div>
      </div>

      {/* =====================================================
          2.5 CIRCUIT DOCUMENT TABS (MULTI-PROJECT MANAGEMENT)
          ===================================================== */}
      <CircuitTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={switchTab}
        onCloseTab={closeTab}
        onNewTab={createNewSchematicTab}
        onSaveTab={saveTabById}
        onCloseOtherTabs={closeOtherTabs}
        onCloseAllTabs={closeAllTabs}
      />

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
          {/* Main Schematic Canvas */}
          <main
            className={`schematic-viewport ${activeTool === "wire" ? "wire-mode-active" : ""} ${activeTool === "delete" ? "delete-mode-active" : ""} ${activeTool === "probe" ? "probe-mode-active" : ""} ${placingComponent ? "placing-mode-active" : ""}`}
            style={{
              flex: 1,
              width: "100%",
              height: "100%",
              minHeight: 0,
              display:
                (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                  (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                  ? "none"
                  : "block",
            }}
            onMouseMove={onPaneMouseMove}
            onMouseEnter={() => setIsHoveringCanvas(true)}
            onMouseLeave={() => setIsHoveringCanvas(false)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (activeTool === "wire") {
                finishAndSaveWire()
              }
              if (activeTool === "delete" || activeTool === "probe") {
                setActiveTool("select")
              }
            }}
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
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <Maximize2 size={12} />
              </button>
            </div>

            <ReactFlow
              key={activeTabId}
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
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onPaneClick={onPaneClick}
              onDoubleClick={onPaneDoubleClick}
              onPaneContextMenu={onPaneContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              connectionMode={ConnectionMode.Loose}
              connectionLineComponent={SchematicConnectionLine}
              connectionLineType={ConnectionLineType.Step}
              defaultEdgeOptions={{ type: "step", animated: false }}
              nodesConnectable={false}
              elementsSelectable={activeTool === "select" || activeTool === "probe"}
              panOnDrag={placingComponent ? false : true}
              snapToGrid
              snapGrid={[20, 20]}
              defaultViewport={tabsDataRef.current.get(activeTabId)?.viewport || { x: 0, y: 0, zoom: 1 }}
              onMove={(_event, viewport) => setZoomLevel(Math.round(viewport.zoom * 100))}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={2.5}
              zoomOnDoubleClick={false}
            >
              {/* LTspice CAD Crosshair Guides & Live Wire Preview */}
              <CadCrosshairLayer
                activeTool={activeTool}
                cursorGridPos={cursorPos}
                isHoveringCanvas={isHoveringCanvas}
                wireDraft={wireDraft}
                placingComponent={placingComponent}
                obstacles={componentObstacles}
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
              className={`bottom-dock-container ${(isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                ? "maximized"
                : ""
                }`}
              style={{
                display: "flex",
                flexDirection: "column",
                position:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? "absolute"
                    : "relative",
                top:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? 0
                    : undefined,
                left:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? 0
                    : undefined,
                right:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? 0
                    : undefined,
                bottom:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? 0
                    : undefined,
                width:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? "100%"
                    : undefined,
                height:
                  (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                    (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
                    ? "100%"
                    : undefined,
                zIndex: 25,
              }}
            >
              {/* Unified Dock Tabs (hidden when panel is maximized) */}
              {!(
                (isWaveformOpen && isWaveformMaximized && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen))) ||
                (isDiagnosticsOpen && isDiagnosticsMaximized && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)))
              ) && (
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
                          gap: 6,
                        }}
                      >
                        <Zap size={13} style={{ color: "#38bdf8" }} />
                        <span>{t('dockTabs.diagnostics')}</span>
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
                          gap: 6,
                        }}
                      >
                        <TrendingUp size={13} style={{ color: "#38bdf8" }} />
                        <span>{t('dockTabs.waveforms')}</span>
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
                          gap: 6,
                        }}
                      >
                        <BarChart2 size={13} style={{ color: "#10b981" }} />
                        <span>{t('dockTabs.measurements')}</span>
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
                        setIsDiagnosticsMaximized(false)
                        setIsWaveformOpen(false)
                        setIsWaveformMaximized(false)
                        setIsMeasurementsOpen(false)
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: 12,
                        cursor: "pointer",
                        padding: "0 6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Close Bottom Dock"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

              {/* Render Diagnostics Panel */}
              {isDiagnosticsOpen && (bottomPanelTab === "diagnostics" || (!isWaveformOpen && !isMeasurementsOpen)) && (
                <DiagnosticsPanel
                  isOpen={true}
                  onClose={() => {
                    setIsDiagnosticsOpen(false)
                    setIsDiagnosticsMaximized(false)
                  }}
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
                  isMaximized={isDiagnosticsMaximized}
                  onToggleMaximize={() => setIsDiagnosticsMaximized((prev) => !prev)}
                />
              )}

              {/* Render Waveform Viewer */}
              {isWaveformOpen && (bottomPanelTab === "waveforms" || (!isDiagnosticsOpen && !isMeasurementsOpen)) && (
                <WaveformViewer
                  isOpen={true}
                  simulationResult={lastSimResult}
                  onClose={() => {
                    setIsWaveformOpen(false)
                    setIsWaveformMaximized(false)
                  }}
                  onClear={clearWaveforms}
                  height={waveformHeight}
                  onHeightChange={setWaveformHeight}
                  isMaximized={isWaveformMaximized}
                  onToggleMaximize={() => setIsWaveformMaximized((prev) => !prev)}
                  availableNets={availableCircuitNets}
                  activeProbedSignal={activeProbedSignal}
                  onProbeSignal={(sig, net) => {
                    setActiveProbedSignal(sig)
                    if (net) setHighlightedNet(net)
                  }}
                  isProbeToolActive={activeTool === "probe"}
                  onToggleProbeTool={() => setActiveTool((prev) => (prev === "probe" ? "select" : "probe"))}
                  onHighlightNet={setHighlightedNet}
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
          <span>{t('statusBar.grid')} 20mil</span>
        </div>

        <div className="status-segment">
          <span>{t('statusBar.snap')} ON</span>
        </div>

        <div className="status-segment">
          <span>{t('statusBar.zoom')} {zoomLevel}%</span>
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
              {t('statusBar.placing', { type: placingComponent.type })}
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
              {t('statusBar.wireMode')}
            </span>
          </div>
        )}

        {activeTool === "probe" && (
          <div className="status-segment">
            <span
              className="status-tool-badge"
              style={{
                background: "#e0f2fe",
                color: "#0284c7",
                borderColor: "#bae6fd",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span>🎯 Probe Mode: Click any wire or node to graph & calculate</span>
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
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={() => setHighlightedNet(null)}
              title="Click or press Esc to clear net highlight"
            >
              <span>Net: {highlightedNet}</span>
              <X size={11} />
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
              {t('statusBar.ercErrors', { count: liveConnectivity.errors.length })}
            </span>
          ) : liveConnectivity.warnings.length > 0 ? (
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>
              {t('statusBar.ercWarnings', { count: liveConnectivity.warnings.length })}
            </span>
          ) : (
            <span style={{ color: "#10b981", fontWeight: 500 }}>
              {t('statusBar.ercZeroErrors')}
            </span>
          )}
        </div>

        <div className="status-segment">
          <span>{nodes.length} {t('statusBar.comps')} · {edges.length} {t('statusBar.wires')}</span>
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
                <TrendingUp size={12} /> {lastSimResult.pointCount} pts ({lastSimResult.elapsedMs}ms) · {t('statusBar.viewPlot')}
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
                <BarChart2 size={12} /> {t('statusBar.autoMeasurements')}
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

      {/* Net Name & Port Definition Modal */}
      <NetNameModal
        isOpen={netNameModal.isOpen}
        initialType={netNameModal.type}
        initialName={netNameModal.name}
        onClose={() => setNetNameModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmNetName}
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

      {/* About ASAP & Open Source Credits Modal */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
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

      {/* Operating Point Analysis (.op) Results Modal */}
      <OperatingPointModal
        isOpen={isOperatingPointModalOpen}
        onClose={() => setIsOperatingPointModalOpen(false)}
        simulationResult={lastSimResult}
        circuitTitle={activeTab?.title || "Circuit"}
      />

      {/* AC Analysis (.ac) Bode Plot & Frequency Results Modal */}
      <AcAnalysisModal
        isOpen={isAcModalOpen}
        onClose={() => setIsAcModalOpen(false)}
        simulationResult={lastSimResult}
        circuitTitle={activeTab?.title || "Circuit"}
      />

      {/* AI Circuit Assistant Drawer */}
      <AiCircuitAssistant
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        context={(() => {
          const compNodes = nodes.filter((n) => n.type !== 'junction' && n.data?.type !== undefined)
          const isEmpty = compNodes.length === 0
          const compLabels = compNodes.map((n) => n.data?.label || n.data?.type || n.id).filter(Boolean)
          const summary = isEmpty
            ? 'Empty canvas'
            : `${compNodes.length} components (${compLabels.slice(0, 8).join(', ')}${compLabels.length > 8 ? '...' : ''})`
          const realErrors = (netlistResult?.errors || []).filter((e) => e.code !== 'EMPTY_CIRCUIT')
          return {
            circuitName: activeTab?.title || 'Schematic',
            componentSummary: summary,
            netlist: isEmpty ? '' : (netlistResult?.netlist || ''),
            simStatus: isEmpty ? 'idle' : simStatus,
            simError: isEmpty ? undefined : (lastSimResult?.error || (realErrors.length ? realErrors[0].message : undefined)),
            ercErrors: isEmpty ? [] : realErrors.map((e) => e.message),
          }
        })()}
      />

      {/* Modern Floating Tooltip with Name & Keyboard Shortcut */}
      {activeTooltip && (
        <div
          ref={(el) => {
            if (el) {
              const r = el.getBoundingClientRect()
              if (r.left < 8) {
                el.style.left = `${activeTooltip.x + (8 - r.left)}px`
              } else if (r.right > window.innerWidth - 8) {
                el.style.left = `${activeTooltip.x - (r.right - (window.innerWidth - 8))}px`
              }
            }
          }}
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
