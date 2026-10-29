import type { Node, Edge } from "reactflow"
import {
  getComponentPins,
  getRotatedPinPos,
  type SchematicComponentType,
  type SchematicNodeData,
  type PinDef,
} from "../components/schematic/SchematicNode"
import { getOrthogonalWirePath } from "../components/schematic/SchematicEdge"
import { computeAvoidanceWaypoints, getComponentObstacles } from "./wireRouter"
import type { AnalysisConfig } from "../components/ConfigureAnalysisModal"
import type { SolverSettings } from "../components/SimulationSettingsModal"

/* ============================================================
   VALIDATION & NETLIST DATA STRUCTURES
   ============================================================ */

export type ValidationErrorSeverity = "error" | "warning"

export type ValidationErrorCode =
  | "MISSING_GROUND"
  | "UNSUPPORTED_COMPONENT"
  | "DISCONNECTED_PIN"
  | "SHORT_CIRCUIT"
  | "DANGLING_NET"
  | "INVALID_VALUE"
  | "EMPTY_CIRCUIT"
  | "NO_AC_SOURCE"

export interface NetlistValidationError {
  severity: ValidationErrorSeverity
  code: ValidationErrorCode
  message: string
  componentId?: string
  componentLabel?: string
  netName?: string
  pinName?: string
  suggestion?: string
}

export interface NetlistPinConnection {
  componentId: string
  componentLabel: string
  componentType: SchematicComponentType
  pinId: string
  pinName: string
  netName: string
}

export interface NetlistGenerationResult {
  success: boolean
  netlist: string
  errors: NetlistValidationError[]
  warnings: NetlistValidationError[]
  stats: {
    componentCount: number
    netCount: number
    wireCount: number
    groundConnected: boolean
    hasErrors: boolean
  }
  nets: Record<string, NetlistPinConnection[]> // netName -> list of connected pins
  edgeNetMap: Record<string, string> // edgeId -> netName
  nodePinNetMap: Record<string, Record<string, string>> // nodeId -> { pinId: netName }
  nodeErcIssues: Record<string, Record<string, NetlistValidationError>> // nodeId -> { pinId: issue }
}

/* ============================================================
   DISJOINT SET (UNION-FIND) FOR CONNECTIVITY RESOLUTION
   ============================================================ */

class DisjointSet {
  private parent: Map<string, string> = new Map()
  private rank: Map<string, number> = new Map()

  makeSet(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x)
      this.rank.set(x, 0)
    }
  }

  find(x: string): string {
    this.makeSet(x)
    let root = x
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!
    }
    // Path compression
    let curr = x
    while (curr !== root) {
      const nxt = this.parent.get(curr)!
      this.parent.set(curr, root)
      curr = nxt
    }
    return root
  }

  union(x: string, y: string): void {
    const rootX = this.find(x)
    const rootY = this.find(y)
    if (rootX === rootY) return

    const rankX = this.rank.get(rootX) ?? 0
    const rankY = this.rank.get(rootY) ?? 0

    if (rankX < rankY) {
      this.parent.set(rootX, rootY)
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX)
    } else {
      this.parent.set(rootY, rootX)
      this.rank.set(rootX, rankX + 1)
    }
  }

  has(x: string): boolean {
    return this.parent.has(x)
  }

  getAllKeys(): string[] {
    return Array.from(this.parent.keys())
  }
}

/* ============================================================
   PIN COORDINATE HELPERS
   ============================================================ */

export function getExactPinCoord(
  node: Node<SchematicNodeData>,
  pinId?: string | null,
): { x: number; y: number } {
  if (node.type === "junction") {
    return { x: node.position.x + 4, y: node.position.y + 4 }
  }

  const compType = (node.data?.type ?? "generic") as SchematicComponentType
  const pins = getComponentPins(compType)
  const targetPin = pins.find((p) => p.id === pinId) || pins[0]
  if (!targetPin) {
    return { x: node.position.x + 60, y: node.position.y + 40 }
  }

  const rotPos = getRotatedPinPos(targetPin, node.data?.rotation ?? 0)
  return {
    x: node.position.x + rotPos.x,
    y: node.position.y + rotPos.y,
  }
}

export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}

export function resolveEdgeEndpoint(
  node: Node<SchematicNodeData>,
  handleId?: string | null,
  edgePoint?: { x: number; y: number },
): { key: string; pinId?: string } | null {
  if (node.type === "junction") {
    return { key: `junc:${node.id}` }
  }

  const compType = (node.data?.type ?? "generic") as SchematicComponentType
  const pins = getComponentPins(compType)
  if (pins.length === 0) return null
  if (pins.length === 1) return { key: `${node.id}:${pins[0].id}`, pinId: pins[0].id }

  // 1. Exact match on handle ID or pin name
  if (handleId) {
    const exactPin = pins.find(
      (p) => p.id === handleId || p.name.toLowerCase() === handleId.toLowerCase(),
    )
    if (exactPin) return { key: `${node.id}:${exactPin.id}`, pinId: exactPin.id }

    // Positive / Negative aliases for 2-terminal sources and polarized devices
    if ((handleId === "pos" || handleId === "+" || handleId === "anode") && pins.length >= 2) {
      return { key: `${node.id}:${pins[0].id}`, pinId: pins[0].id }
    }
    if ((handleId === "neg" || handleId === "-" || handleId === "cathode") && pins.length >= 2) {
      return { key: `${node.id}:${pins[1].id}`, pinId: pins[1].id }
    }
  }

  // 2. Geometric proximity to edge endpoint
  if (edgePoint) {
    let bestPin = pins[0]
    let bestDist = Infinity
    for (const p of pins) {
      const coord = getExactPinCoord(node, p.id)
      const d = Math.hypot(coord.x - edgePoint.x, coord.y - edgePoint.y)
      if (d < bestDist) {
        bestDist = d
        bestPin = p
      }
    }
    return { key: `${node.id}:${bestPin.id}`, pinId: bestPin.id }
  }

  // 3. Fallback handle orientation ('left', 'right', 'top', 'bottom')
  if (handleId === "left") {
    const p = pins.reduce((prev, curr) => (curr.x < prev.x ? curr : prev), pins[0])
    return { key: `${node.id}:${p.id}`, pinId: p.id }
  }
  if (handleId === "right") {
    const p = pins.reduce((prev, curr) => (curr.x > prev.x ? curr : prev), pins[0])
    return { key: `${node.id}:${p.id}`, pinId: p.id }
  }
  if (handleId === "top") {
    const p = pins.reduce((prev, curr) => (curr.y < prev.y ? curr : prev), pins[0])
    return { key: `${node.id}:${p.id}`, pinId: p.id }
  }
  if (handleId === "bottom") {
    const p = pins.reduce((prev, curr) => (curr.y > prev.y ? curr : prev), pins[0])
    return { key: `${node.id}:${p.id}`, pinId: p.id }
  }

  return { key: `${node.id}:${pins[0].id}`, pinId: pins[0].id }
}

/* ============================================================
   SPICE VALUE FORMATTING & SANITIZATION
   Cleans engineering suffixes: 10kΩ -> 10k, 1µF -> 1u, etc.
   ============================================================ */

export function formatSpiceValue(val?: string, compType?: SchematicComponentType): string {
  if (!val || typeof val !== "string") return ""
  let clean = val.trim()

  // If already a function like SINE(...) or PULSE(...), preserve it
  if (/^(sine|pulse|pwl|exp|sffm)\s*\(/i.test(clean)) {
    return clean
  }

  // Remove common unit words and unicode symbols
  // Ω, Ohm, ohms, OHM
  clean = clean.replace(/[\u2126\u03A9]/g, "") // Ohm symbols
  clean = clean.replace(/ohms?/gi, "")
  // µ -> u
  clean = clean.replace(/[\u00B5\u03BC]/g, "u")
  // Replace trailing unit designations like F (Farads), H (Henrys), V (Volts), A (Amperes)
  if (compType === "resistor") {
    // 10k -> 10k, 1M -> 1Meg (in SPICE, 1M is 1milli! If Mega was intended e.g. 1M or 1Meg)
    if (/^\d+(\.\d+)?m$/i.test(clean)) {
      clean = clean.replace(/m$/i, "Meg")
    }
  } else if (compType === "capacitor") {
    clean = clean.replace(/f$/i, "") // 10uF -> 10u
  } else if (compType === "inductor") {
    clean = clean.replace(/h$/i, "") // 10mH -> 10m
  } else if (compType === "voltage-source") {
    clean = clean.replace(/v(\s+ac\b)/i, "$1").replace(/v$/i, "") // 5V -> 5, 5V AC 1 -> 5 AC 1
  } else if (compType === "current-source") {
    clean = clean.replace(/a(\s+ac\b)/i, "$1").replace(/a$/i, "") // 1A -> 1, 1A AC 1 -> 1 AC 1
  } else if (compType === "ac-source") {
    return clean
  }

  // Handle Meg vs M
  clean = clean.replace(/megohms?/gi, "Meg")
  clean = clean.replace(/kilo-?ohms?/gi, "k")

  return clean.trim()
}

export interface AcSourceParams {
  amplitude: string
  unit: string
  phase: string
  freq?: string
}

/**
 * Robustly parses AC voltage source configuration strings from schematic values,
 * supporting formats like:
 * - "AC 1V 0°", "AC 1 0", "1V 45°", "5mV -90"
 * - "SINE(0 1 1k)", "SINE(0 5 10k 0 0 45)"
 * Defaults to 1 V amplitude and 0° phase.
 */
export function parseAcSourceValue(rawVal?: string): AcSourceParams {
  const defaultRes: AcSourceParams = { amplitude: "1", unit: "V", phase: "0", freq: "1k" }
  if (!rawVal || typeof rawVal !== "string") return defaultRes

  const str = rawVal.trim()
  if (!str) return defaultRes

  // 1. Check for SINE(Voff Vamp [Freq [Td [Theta [Phase]]]]):
  const sineMatch = str.match(
    /sine\s*\(\s*([^\s,\)]+)\s+([^\s,\)]+)(?:\s+([^\s,\)]+))?(?:\s+[^\s,\)]+)?(?:\s+[^\s,\)]+)?(?:\s+([^\s,\)]+))?/i,
  )
  if (sineMatch) {
    const rawAmp = sineMatch[2] || "1"
    const freq = sineMatch[3] || "1k"
    const rawPhase = sineMatch[4] || "0"

    const unitMatch = rawAmp.match(/^([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*([a-zA-ZµΩ]*)$/)
    const amp = unitMatch && unitMatch[1] ? unitMatch[1] : rawAmp
    let u = unitMatch && unitMatch[2] ? unitMatch[2] : "V"
    if (u.toLowerCase() === "m") u = "mV"
    else if (u.toLowerCase() === "u" || u === "µ") u = "µV"
    else if (u.toLowerCase() === "k") u = "kV"
    else if (u === "") u = "V"
    else if (!u.toLowerCase().endsWith("v")) u = `${u}V`

    const cleanPhase = rawPhase.replace(/[°deg]/gi, "").trim() || "0"
    return {
      amplitude: amp,
      unit: ["V", "mV", "kV", "µV"].includes(u) ? u : "V",
      phase: cleanPhase,
      freq,
    }
  }

  // 2. Check for AC format: e.g. "AC 1V 0°", "AC 1 0", "1V 45°", "AC 5mV 90", "5V", "1"
  const cleanStr = str.replace(/\bAC\b/gi, "").trim()
  const tokens = cleanStr.split(/\s+/).filter(Boolean)
  if (tokens.length >= 1) {
    const ampToken = tokens[0]
    const ampMatch = ampToken.match(/^([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*([a-zA-ZµΩ]*)$/)
    if (ampMatch) {
      const amp = ampMatch[1]
      let u = ampMatch[2] || "V"
      if (u.toLowerCase() === "m") u = "mV"
      else if (u.toLowerCase() === "u" || u === "µ") u = "µV"
      else if (u.toLowerCase() === "k") u = "kV"
      else if (u === "") u = "V"
      else if (!u.toLowerCase().endsWith("v")) u = `${u}V`

      const validUnit = ["V", "mV", "kV", "µV"].includes(u) ? u : "V"

      let phase = "0"
      if (tokens.length >= 2) {
        phase = tokens[1].replace(/[°deg]/gi, "").trim() || "0"
      }
      return { amplitude: amp, unit: validUnit, phase, freq: "1k" }
    }
  }

  return defaultRes
}

/* ============================================================
   STANDARD DEVICE MODELS
   Built-in accurate SPICE models for standard diodes, BJTs, FETs
   ============================================================ */

export const STANDARD_SPICE_MODELS: Record<string, { type: string; card: string }> = {
  // Diodes
  "1N4148": {
    type: "D",
    card: ".model 1N4148 D(Is=2.52n Rs=0.568 N=1.752 Cjo=4p M=0.4 tt=20n Bv=100 Ibv=100u)",
  },
  "1N5819": {
    type: "D",
    card: ".model 1N5819 D(Is=31.7u Rs=0.051 N=1.05 Cjo=110p M=0.5 Eg=0.69 Bv=40 Ibv=1m)",
  },
  "BZX84C5V1": {
    type: "D",
    card: ".model BZX84C5V1 D(Is=1e-15 Rs=10 Bv=5.1 Ibv=5m)",
  },
  "RED": {
    type: "D",
    card: ".model RED D(Is=1e-19 Rs=2 N=1.8 Eg=2.1 Cjo=15p)",
  },
  "LED": {
    type: "D",
    card: ".model LED D(Is=1e-19 Rs=2 N=1.8 Eg=2.1 Cjo=15p)",
  },
  "D_GENERIC": {
    type: "D",
    card: ".model D_GENERIC D(Is=1e-14 Rs=0.1 N=1 Cjo=2p)",
  },

  // Transistors - BJTs
  "2N2222": {
    type: "NPN",
    card: ".model 2N2222 NPN(Is=14.34f Xti=3 Eg=1.11 Vaf=74.03 Bf=255.9 Ne=1.307 Ise=14.34f Ikf=0.2847 Xtb=1.5 Br=6.092 Nc=2 Isc=0 Ikr=0 Rc=1 Cjc=7.306p Mjc=0.3416 Vjc=0.75 Fc=0.5 Cje=22.01p Mje=0.377 Vje=0.75 Tr=46.91n Tf=411.1p Itf=0.6 Vtf=1.7 Xtf=3 Rb=10)",
  },
  "2N2907": {
    type: "PNP",
    card: ".model 2N2907 PNP(Is=650.6f Xti=3 Eg=1.11 Vaf=115.7 Bf=231.7 Ne=1.829 Ise=5.492p Ikf=1.079 Xtb=1.5 Br=2.608 Nc=1.5 Isc=0 Ikr=0 Rc=0.715 Cjc=14.76p Mjc=0.5383 Vjc=0.75 Fc=0.5 Cje=19.82p Mje=0.3357 Vje=0.75 Tr=239.8n Tf=500p Itf=0.5 Vtf=2 Xtf=6 Rb=10)",
  },

  // Transistors - MOSFETs
  "2N7000": {
    type: "NMOS",
    card: ".model 2N7000 NMOS(Vto=2.1 Kp=0.12 Lambda=0.01 Rd=1.2 Rs=1.2 Cgso=60p Cgdo=15p)",
  },
  "IRF9530": {
    type: "PMOS",
    card: ".model IRF9530 PMOS(Vto=-3.0 Kp=0.2 Lambda=0.01 Rd=0.3 Rs=0.3 Cgso=500p Cgdo=150p)",
  },

  // Transistors - JFETs
  "2N5457": {
    type: "NJF",
    card: ".model 2N5457 NJF(Beta=1.125m Vto=-1.5 Lambda=2.3m Cgs=4.5p Cgd=4.5p)",
  },
  "2N5460": {
    type: "PJF",
    card: ".model 2N5460 PJF(Beta=1.125m Vto=1.5 Lambda=2.3m Cgs=4.5p Cgd=4.5p)",
  },

  // Switch Model
  "SW_MOD": {
    type: "SW",
    card: ".model SW_MOD SW(Ron=0.01 Roff=1Meg Vt=1.0 Vh=0.1)",
  },
}

/* ============================================================
   SUBCIRCUIT MACROMODELS (Op-Amps, etc.)
   ============================================================ */

export const SUBCIRCUIT_MODELS: Record<string, string> = {
  LM741: `* LM741 Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt LM741 1 2 3
Rin 1 2 2Meg
E1 4 0 1 2 200k
Rout 4 3 75
Ccomp 4 0 30p
.ends LM741`,

  LM393: `* LM393 Dual Comparator Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt LM393 1 2 3
Rin 1 2 10Meg
E1 4 0 1 2 250k
Rout 4 3 50
.ends LM393`,

  LM311: `* LM311 High Speed Comparator Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt LM311 1 2 3
Rin 1 2 5Meg
E1 4 0 1 2 200k
Rout 4 3 40
.ends LM311`,

  LM339: `* LM339 Quad Comparator Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt LM339 1 2 3
Rin 1 2 10Meg
E1 4 0 1 2 250k
Rout 4 3 50
.ends LM339`,

  TL072: `* TL072 JFET Op-Amp Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt TL072 1 2 3
Rin 1 2 1e12
E1 4 0 1 2 200k
Rout 4 3 100
Ccomp 4 0 15p
.ends TL072`,

  OP07: `* OP07 Precision Op-Amp Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt OP07 1 2 3
Rin 1 2 50Meg
E1 4 0 1 2 500k
Rout 4 3 60
Ccomp 4 0 30p
.ends OP07`,

  NE5532: `* NE5532 Audio Op-Amp Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt NE5532 1 2 3
Rin 1 2 300k
E1 4 0 1 2 100k
Rout 4 3 38
Ccomp 4 0 30p
.ends NE5532`,

  LM358: `* LM358 Dual Op-Amp Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt LM358 1 2 3
Rin 1 2 2Meg
E1 4 0 1 2 100k
Rout 4 3 100
.ends LM358`,

  AD823: `* AD823 Rail-to-Rail FET Macromodel (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt AD823 1 2 3
Rin 1 2 1e13
E1 4 0 1 2 100k
Rout 4 3 50
.ends AD823`,

  OPAMP_IDEAL: `* Ideal Op-Amp Model (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)
.subckt OPAMP_IDEAL 1 2 3
Rin 1 2 10Meg
E1 4 0 1 2 100k
Rout 4 3 20
.ends OPAMP_IDEAL`,
}

/* ============================================================
   UNSUPPORTED COMPONENTS CLASSIFICATION
   Digital ICs that require digital engine or unprovided subcircuits
   ============================================================ */

const UNSUPPORTED_COMPONENT_TYPES = new Set<SchematicComponentType>([
  "gate-and",
  "gate-or",
  "gate-not",
  "gate-nand",
  "gate-nor",
  "gate-xor",
  "gate-xnor",
  "flipflop-d",
  "flipflop-jk",
  "mux-2to1",
  "counter-4bit",
  "timer-555",
  "voltage-regulator",
])

/* ============================================================
   MAIN SPICE NETLIST GENERATOR & VALIDATOR
   ============================================================ */

export function generateSpiceNetlist(
  nodes: Node<SchematicNodeData>[],
  edges: Edge[],
  analysisConfig?: AnalysisConfig,
  solverSettings?: SolverSettings,
  circuitTitle: string = "CriticalPath EDA Circuit",
): NetlistGenerationResult {
  const errors: NetlistValidationError[] = []
  const warnings: NetlistValidationError[] = []

  // Filter components vs junctions
  const compNodes = nodes.filter(
    (n) => n.type !== "junction" && n.data?.type !== undefined,
  )
  const junctionNodes = nodes.filter((n) => n.type === "junction")

  // Check 1: Empty Circuit - a blank canvas has 0 components and 0 ERC errors
  if (compNodes.length === 0) {
    return {
      success: false,
      netlist: "* Empty Circuit\n.end\n",
      errors: [],
      warnings: [],
      stats: {
        componentCount: 0,
        netCount: 0,
        wireCount: edges.length,
        groundConnected: false,
        hasErrors: false,
      },
      nets: {},
      edgeNetMap: {},
      nodePinNetMap: {},
      nodeErcIssues: {},
    }
  }

  // ------------------------------------------------------------
  // STEP 1: RESOLVE CONNECTIVITY WITH DISJOINT-SET (UNION-FIND)
  // ------------------------------------------------------------
  const ds = new DisjointSet()

  // 1. Register all component pins and build coordinate points index
  const pinKeyMap = new Map<string, { node: Node<SchematicNodeData>; pin: PinDef }>()
  interface PointEntry {
    key: string
    x: number
    y: number
    node: Node<SchematicNodeData>
    pin?: PinDef
    isJunction?: boolean
  }
  const allPoints: PointEntry[] = []

  compNodes.forEach((node) => {
    const type = node.data.type as SchematicComponentType
    const pins = getComponentPins(type)
    pins.forEach((pin) => {
      const pKey = `${node.id}:${pin.id}`
      ds.makeSet(pKey)
      pinKeyMap.set(pKey, { node, pin })
      const coord = getExactPinCoord(node, pin.id)
      allPoints.push({ key: pKey, x: coord.x, y: coord.y, node, pin })
    })

    // Internally tie both terminals of a port together so wiring to either side connects to the same net
    if (
      type === "port-in" ||
      type === "port-out" ||
      type === "port-bi"
    ) {
      if (pins.some((p) => p.id === "pin1") && pins.some((p) => p.id === "pin2")) {
        ds.union(`${node.id}:pin1`, `${node.id}:pin2`)
      }
    }
  })

  // Register all junction nodes
  junctionNodes.forEach((jNode) => {
    const jKey = `junc:${jNode.id}`
    ds.makeSet(jKey)
    const coord = getExactPinCoord(jNode)
    allPoints.push({ key: jKey, x: coord.x, y: coord.y, node: jNode, isJunction: true })
  })

  // 2. Spatial geometric clustering: Union any terminals/junctions within <= 8px of each other
  // (Prevents bucket boundary issues of string-based grid bucketing)
  for (let i = 0; i < allPoints.length; i++) {
    for (let j = i + 1; j < allPoints.length; j++) {
      const p1 = allPoints[i]
      const p2 = allPoints[j]
      if (Math.hypot(p1.x - p2.x, p1.y - p2.y) <= 8) {
        ds.union(p1.key, p2.key)
      }
    }
  }

  // 3. Connect endpoints via ReactFlow Edges (Wires) & intersect wire segments with junctions/pins
  const connectedPinKeys = new Set<string>()

  edges.forEach((edge) => {
    const srcNode = nodes.find((n) => n.id === edge.source)
    const tgtNode = nodes.find((n) => n.id === edge.target)
    if (!srcNode || !tgtNode) return

    const srcCoord = getExactPinCoord(srcNode, edge.sourceHandle)
    const tgtCoord = getExactPinCoord(tgtNode, edge.targetHandle)

    const resolvedSrc = resolveEdgeEndpoint(srcNode, edge.sourceHandle, srcCoord)
    const resolvedTgt = resolveEdgeEndpoint(tgtNode, edge.targetHandle, tgtCoord)

    if (resolvedSrc?.pinId) connectedPinKeys.add(resolvedSrc.key)
    if (resolvedTgt?.pinId) connectedPinKeys.add(resolvedTgt.key)

    if (resolvedSrc && resolvedTgt) {
      ds.union(resolvedSrc.key, resolvedTgt.key)
    }

    const effectiveWaypoints =
      edge.data?.waypoints && edge.data.waypoints.length > 0
        ? edge.data.waypoints
        : computeAvoidanceWaypoints(
          srcCoord,
          tgtCoord,
          getComponentObstacles(compNodes, [edge.source, edge.target]),
        )

    // Compute exact orthogonal segments of the wire
    const [, , , , segments] = getOrthogonalWirePath(
      srcCoord.x,
      srcCoord.y,
      tgtCoord.x,
      tgtCoord.y,
      undefined,
      undefined,
      edge.data?.bendMode ?? "auto",
      edge.data?.offset,
      effectiveWaypoints.length > 0 ? effectiveWaypoints : undefined,
    )

    // Check if any junction dots or unattached port/net-label pins lie along this wire's segments (within 6px)
    allPoints.forEach((pt) => {
      if (pt.key.startsWith("junc:")) {
        for (const seg of segments) {
          const d = distToSegment(pt.x, pt.y, seg.x1, seg.y1, seg.x2, seg.y2)
          if (d <= 6) {
            if (resolvedSrc) {
              ds.union(resolvedSrc.key, pt.key)
            } else if (resolvedTgt) {
              ds.union(resolvedTgt.key, pt.key)
            }
            break
          }
        }
      } else if (
        (pt.node?.data?.type === "net-label" ||
          pt.node?.data?.type === "port-in" ||
          pt.node?.data?.type === "port-out" ||
          pt.node?.data?.type === "port-bi") &&
        !connectedPinKeys.has(pt.key)
      ) {
        for (const seg of segments) {
          const d = distToSegment(pt.x, pt.y, seg.x1, seg.y1, seg.x2, seg.y2)
          if (d <= 6) {
            if (resolvedSrc) {
              ds.union(resolvedSrc.key, pt.key)
              connectedPinKeys.add(pt.key)
            } else if (resolvedTgt) {
              ds.union(resolvedTgt.key, pt.key)
              connectedPinKeys.add(pt.key)
            }
            break
          }
        }
      }
    })
  })

  // 4. Connect net-labels and ports sharing the identical label string (case-insensitive)
  const netLabelsByText = new Map<string, string[]>()
  compNodes
    .filter(
      (n) =>
        n.data.type === "net-label" ||
        n.data.type === "port-in" ||
        n.data.type === "port-out" ||
        n.data.type === "port-bi",
    )
    .forEach((n) => {
      const rawText = (n.data.value || n.data.label || "").trim()
      const normalized = rawText.toUpperCase()
      if (normalized) {
        const list = netLabelsByText.get(normalized) || []
        list.push(`${n.id}:pin1`)
        netLabelsByText.set(normalized, list)
      }
    })

  netLabelsByText.forEach((pKeys) => {
    if (pKeys.length > 1) {
      for (let i = 1; i < pKeys.length; i++) {
        ds.union(pKeys[0], pKeys[i])
      }
    }
  })

  // ------------------------------------------------------------
  // STEP 2: ASSIGN SPICE NET NAMES (0 for Ground, Named Nets, N001, etc.)
  // ------------------------------------------------------------
  const rootNetNameMap = new Map<string, string>()

  // 1. Identify Ground Nets (Node 0)
  const isGroundTypeOrLabel = (n: Node<SchematicNodeData>): boolean => {
    if (n.data.type === "ground") return true
    if (
      n.data.type === "net-label" ||
      n.data.type === "port-in" ||
      n.data.type === "port-out" ||
      n.data.type === "port-bi"
    ) {
      const clean = (n.data.value || n.data.label || "").trim().toUpperCase()
      return clean === "0" || clean === "GND" || clean === "GROUND"
    }
    return false
  }

  const groundNodes = compNodes.filter(isGroundTypeOrLabel)
  const groundRoots = new Set<string>()

  groundNodes.forEach((gNode) => {
    const root = ds.find(`${gNode.id}:pin1`)
    groundRoots.add(root)
    rootNetNameMap.set(root, "0")
  })

  // If multiple ground roots exist, union them all to 0
  if (groundRoots.size > 1) {
    const groundRootsArray = Array.from(groundRoots)
    for (let i = 1; i < groundRootsArray.length; i++) {
      ds.union(groundRootsArray[0], groundRootsArray[i])
    }
    const unifiedGroundRoot = ds.find(groundRootsArray[0])
    rootNetNameMap.set(unifiedGroundRoot, "0")
  }

  // 2. Identify VCC Nets
  const vccNodes = compNodes.filter((n) => n.data.type === "vcc")
  vccNodes.forEach((vNode) => {
    const root = ds.find(`${vNode.id}:pin1`)
    if (!rootNetNameMap.has(root)) {
      rootNetNameMap.set(root, "VCC")
    }
  })

  // 3. Identify Net Labels & Ports
  compNodes
    .filter(
      (n) =>
        n.data.type === "net-label" ||
        n.data.type === "port-in" ||
        n.data.type === "port-out" ||
        n.data.type === "port-bi",
    )
    .forEach((n) => {
      const root = ds.find(`${n.id}:pin1`)
      if (!rootNetNameMap.has(root)) {
        const cleanName = (n.data.value || n.data.label || "NET")
          .trim()
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toUpperCase()
        rootNetNameMap.set(root, cleanName || "NET")
      }
    })

  // 4. Assign sequential SPICE net names (N001, N002, ...) for remaining roots
  let netCounter = 1
  const allRoots = new Set<string>()
  pinKeyMap.forEach((_, pKey) => {
    allRoots.add(ds.find(pKey))
  })

  allRoots.forEach((root) => {
    if (!rootNetNameMap.has(root)) {
      const padNum = String(netCounter++).padStart(3, "0")
      rootNetNameMap.set(root, `N${padNum}`)
    }
  })

  // Helper to query Net name for any pin
  const getPinNet = (nodeId: string, pinId: string): string => {
    const root = ds.find(`${nodeId}:${pinId}`)
    return rootNetNameMap.get(root) || "0"
  }

  // Build full net connectivity list
  const netMap: Record<string, NetlistPinConnection[]> = {}
  pinKeyMap.forEach(({ node, pin }) => {
    if (
      node.data.type === "ground" ||
      node.data.type === "vcc" ||
      node.data.type === "spice-directive" ||
      node.data.type === "schematic-text"
    ) {
      return
    }

    const netName = getPinNet(node.id, pin.id)
    if (!netMap[netName]) {
      netMap[netName] = []
    }
    netMap[netName].push({
      componentId: node.id,
      componentLabel: node.data.label || node.id,
      componentType: node.data.type as SchematicComponentType,
      pinId: pin.id,
      pinName: pin.name,
      netName,
    })
  })

  // Build edge-to-net mapping
  const edgeNetMap: Record<string, string> = {}
  edges.forEach((edge) => {
    const srcNode = nodes.find((n) => n.id === edge.source)
    if (srcNode) {
      const srcCoord = getExactPinCoord(srcNode, edge.sourceHandle)
      const res = resolveEdgeEndpoint(srcNode, edge.sourceHandle, srcCoord)
      if (res) {
        const root = ds.find(res.key)
        edgeNetMap[edge.id] = rootNetNameMap.get(root) || "0"
        return
      }
    }
    const tgtNode = nodes.find((n) => n.id === edge.target)
    if (tgtNode) {
      const tgtCoord = getExactPinCoord(tgtNode, edge.targetHandle)
      const res = resolveEdgeEndpoint(tgtNode, edge.targetHandle, tgtCoord)
      if (res) {
        const root = ds.find(res.key)
        edgeNetMap[edge.id] = rootNetNameMap.get(root) || "0"
        return
      }
    }
    edgeNetMap[edge.id] = "0"
  })

  // Build node-pin-to-net mapping
  const nodePinNetMap: Record<string, Record<string, string>> = {}
  compNodes.forEach((node) => {
    nodePinNetMap[node.id] = {}
    const pins = getComponentPins(node.data.type as SchematicComponentType)
    pins.forEach((p) => {
      nodePinNetMap[node.id][p.id] = getPinNet(node.id, p.id)
    })
  })

  // Register junction nodes in nodePinNetMap
  junctionNodes.forEach((jNode) => {
    const root = ds.find(`junc:${jNode.id}`)
    const netName = rootNetNameMap.get(root) || "0"
    nodePinNetMap[jNode.id] = { pin1: netName }
  })

  // ------------------------------------------------------------
  // STEP 3: CONNECTIVITY VALIDATION RULES (ERRORS VS WARNINGS)
  // ------------------------------------------------------------

  // Check 2: Missing Ground Reference (FATAL ERROR)
  const isGroundConnected =
    groundNodes.length > 0 &&
    Array.from(pinKeyMap.entries()).some(([pKey, { node }]) => {
      if (isGroundTypeOrLabel(node)) return false
      return ds.find(pKey) === ds.find(`${groundNodes[0].id}:pin1`)
    })

  if (groundNodes.length === 0) {
    errors.push({
      severity: "error",
      code: "MISSING_GROUND",
      message: "Missing Ground reference (Node 0): A SPICE circuit requires at least one Ground (0V) reference.",
      suggestion: "Place a Ground component (shortcut: G) and connect it to the circuit reference plane.",
    })
  } else if (!isGroundConnected) {
    errors.push({
      severity: "error",
      code: "MISSING_GROUND",
      message: "Ground is placed on schematic but not connected to any circuit components.",
      suggestion: "Draw a wire from the Ground symbol to your circuit.",
    })
  }

  // Check 3: Unsupported Components (FATAL ERROR)
  compNodes.forEach((node) => {
    const type = node.data.type as SchematicComponentType
    if (UNSUPPORTED_COMPONENT_TYPES.has(type)) {
      errors.push({
        severity: "error",
        code: "UNSUPPORTED_COMPONENT",
        componentId: node.id,
        componentLabel: node.data.label || node.id,
        message: `Unsupported Component: '${node.data.label || node.id}' (${type}) is a digital/unmodeled component.`,
        suggestion: "Remove this component or replace it with a supported analog equivalent or macromodel.",
      })
    }
  })

  // Check 4: Disconnected / Floating Pins
  const isolatedNodeIds = new Set<string>()
  compNodes.forEach((node) => {
    const type = node.data.type as SchematicComponentType
    if (
      type === "ground" ||
      type === "vcc" ||
      type === "net-label" ||
      type === "port-in" ||
      type === "port-out" ||
      type === "port-bi" ||
      type === "spice-directive" ||
      type === "schematic-text"
    ) {
      return
    }

    const pins = getComponentPins(type)
    const disconnectedPins: PinDef[] = []

    pins.forEach((pin) => {
      const pKey = `${node.id}:${pin.id}`
      const pCoord = getExactPinCoord(node, pin.id)
      const isCoLocated = allPoints.some(
        (other) => other.key !== pKey && Math.hypot(other.x - pCoord.x, other.y - pCoord.y) <= 8,
      )

      if (!connectedPinKeys.has(pKey) && !isCoLocated) {
        disconnectedPins.push(pin)
      }
    })

    const isActive =
      type === "voltage-source" ||
      type === "ac-source" ||
      type === "current-source" ||
      type === "npn-bjt" ||
      type === "pnp-bjt" ||
      type === "nmos" ||
      type === "pmos" ||
      type === "opamp"

    if (disconnectedPins.length > 0) {
      if (disconnectedPins.length === pins.length && !isActive) {
        isolatedNodeIds.add(node.id)
        // Completely disconnected passive component -> WARNING (not fatal)
        warnings.push({
          severity: "warning",
          code: "DISCONNECTED_PIN",
          componentId: node.id,
          componentLabel: node.data.label || node.id,
          message: `Isolated Component: '${node.data.label || node.id}' is completely disconnected.`,
          suggestion: "Wire component terminals to the circuit or delete it if not needed.",
        })
      } else {
        // Active component or partial disconnect -> ERROR
        disconnectedPins.forEach((pin) => {
          errors.push({
            severity: "error",
            code: "DISCONNECTED_PIN",
            componentId: node.id,
            componentLabel: node.data.label || node.id,
            pinName: pin.name,
            message: `Unconnected Pin: Pin '${pin.name}' on '${node.data.label || node.id}' is floating/unconnected.`,
            suggestion: `Connect a wire to pin ${pin.name} or remove the unused component.`,
          })
        })
      }
    }
  })

  // Check 5: Short Circuits
  compNodes.forEach((node) => {
    const type = node.data.type as SchematicComponentType
    if (
      type === "resistor" ||
      type === "capacitor" ||
      type === "inductor" ||
      type === "diode" ||
      type === "voltage-source" ||
      type === "ac-source" ||
      type === "current-source"
    ) {
      const net1 = getPinNet(node.id, "pin1")
      const net2 = getPinNet(node.id, "pin2")

      if (net1 && net2 && net1 === net2) {
        if (type === "voltage-source" || type === "ac-source") {
          // Shorted voltage source -> FATAL ERROR
          errors.push({
            severity: "error",
            code: "SHORT_CIRCUIT",
            componentId: node.id,
            componentLabel: node.data.label || node.id,
            netName: net1,
            message: `Short Circuit: Voltage source '${node.data.label || node.id}' has both terminals tied to net '${net1}'.`,
            suggestion: "In SPICE, closed zero-resistance voltage loops cause singular matrix errors. Connect terminals to different nodes.",
          })
        } else {
          // Shorted passive component -> WARNING (valid SPICE topology, carries 0 current)
          warnings.push({
            severity: "warning",
            code: "SHORT_CIRCUIT",
            componentId: node.id,
            componentLabel: node.data.label || node.id,
            netName: net1,
            message: `Component '${node.data.label || node.id}' is shorted across net '${net1}' and will carry 0 current.`,
            suggestion: "Check your wiring to ensure component terminals are connected across different nodes.",
          })
        }
      }
    }
  })

  // Check 6: Dangling Nets (WARNING only)
  // Identify nets that have external ports or net labels attached
  const netsWithPortOrLabel = new Set<string>()
  compNodes
    .filter(
      (n) =>
        n.data.type === "net-label" ||
        n.data.type === "port-in" ||
        n.data.type === "port-out" ||
        n.data.type === "port-bi",
    )
    .forEach((n) => {
      const netName = getPinNet(n.id, "pin1")
      if (netName) netsWithPortOrLabel.add(netName)
    })

  Object.entries(netMap).forEach(([netName, pins]) => {
    // If net has an external port or net label attached, it is an intentional port/named terminal, not dangling!
    if (netsWithPortOrLabel.has(netName)) return

    const nonPortPins = pins.filter(
      (p) =>
        p.componentType !== "port-in" &&
        p.componentType !== "port-out" &&
        p.componentType !== "port-bi" &&
        p.componentType !== "net-label",
    )

    if (nonPortPins.length === 1 && netName !== "0" && netName !== "VCC") {
      warnings.push({
        severity: "warning",
        code: "DANGLING_NET",
        netName,
        message: `Dangling Net: Net '${netName}' is connected to only 1 component pin (${nonPortPins[0].componentLabel}:${nonPortPins[0].pinName}).`,
        suggestion: "Complete the circuit branch or remove the dangling wire.",
      })
    }
  })

  // Check 7: Missing or Invalid Component Values (FATAL ERROR)
  compNodes.forEach((node) => {
    const type = node.data.type as SchematicComponentType
    if (
      type === "resistor" ||
      type === "capacitor" ||
      type === "inductor" ||
      type === "voltage-source" ||
      type === "ac-source" ||
      type === "current-source"
    ) {
      const rawVal = node.data.value?.trim()
      if (!rawVal) {
        errors.push({
          severity: "error",
          code: "INVALID_VALUE",
          componentId: node.id,
          componentLabel: node.data.label || node.id,
          message: `Missing Value: Component '${node.data.label || node.id}' requires a valid SPICE value.`,
          suggestion: "Click the component and enter a value (e.g., 10k, 1u, 5V) in the properties panel.",
        })
      }
    }
  })

  // Check 8: Missing AC Excitation in AC Analysis
  const hasSchematicAcDirective = compNodes.some((n) => {
    if (n.data.type !== "spice-directive") return false
    const text = (n.data.value || n.data.label || "").trim()
    return /^\s*\.ac\b/im.test(text)
  })
  const isAc =
    analysisConfig?.type === "ac" ||
    (analysisConfig?.command !== undefined && /^\s*\.ac\b/i.test(analysisConfig.command)) ||
    hasSchematicAcDirective

  const sourceNodes = compNodes.filter(
    (n) =>
      n.data.type === "voltage-source" ||
      n.data.type === "current-source" ||
      n.data.type === "ac-source" ||
      n.data.type === "pulse-source" ||
      n.data.type === "behavioral-source",
  )

  if (isAc && sourceNodes.length === 0) {
    errors.push({
      severity: "error",
      code: "NO_AC_SOURCE",
      message: "Missing AC Excitation: AC Frequency Analysis (.ac) requires a source (AC Voltage Source or Voltage Source) to excite the circuit.",
      suggestion: "Add an AC Voltage Source (shortcut: A) or a Voltage Source connected to your circuit input.",
    })
  }

  // Build node-to-ERC-issues index for visual markers on canvas
  const nodeErcIssues: Record<string, Record<string, NetlistValidationError>> = {}
  const addErcToMap = (issue: NetlistValidationError) => {
    if (!issue.componentId) return
    if (!nodeErcIssues[issue.componentId]) {
      nodeErcIssues[issue.componentId] = {}
    }
    const key = issue.pinName || "general"
    if (!nodeErcIssues[issue.componentId][key] || issue.severity === "error") {
      nodeErcIssues[issue.componentId][key] = issue
    }
  }

  errors.forEach(addErcToMap)
  warnings.forEach(addErcToMap)

  // ------------------------------------------------------------
  // STEP 4: GENERATE SPICE NETLIST TEXT
  // ------------------------------------------------------------
  const netlistLines: string[] = []
  const requiredModels = new Set<string>()
  const requiredSubcircuits = new Set<string>()

  const nowStr = new Date().toLocaleString()
  netlistLines.push(`* ============================================================`)
  netlistLines.push(`* SPICE Netlist: ${circuitTitle}`)
  netlistLines.push(`* Generated by CriticalPath EDA (LTspice Compatible)`)
  netlistLines.push(`* Date: ${nowStr}`)
  netlistLines.push(`* ============================================================`)
  netlistLines.push(``)

  // Section 1: Power & Sources
  if (sourceNodes.length > 0) {
    netlistLines.push(`* --- Power Sources ---`)

    const hasExplicitAc = sourceNodes.some((n) => {
      const v = (n.data.value || "").trim()
      return /\bac\b/i.test(v) || n.data.type === "ac-source"
    })

    sourceNodes.forEach((node, idx) => {
      const type = node.data.type as SchematicComponentType
      const label = node.data.label || node.id
      const nPos = getPinNet(node.id, "pin1")
      const nNeg = getPinNet(node.id, "pin2")
      let val = formatSpiceValue(node.data.value, type) || "5"

      // Handle AC excitation for AC analysis or ac-source component
      if (type === "ac-source") {
        const acParams = parseAcSourceValue(node.data.value)
        const unitSuffix =
          acParams.unit === "mV"
            ? "m"
            : acParams.unit === "kV"
              ? "k"
              : acParams.unit === "µV"
                ? "u"
                : ""
        const spiceAmp = `${acParams.amplitude}${unitSuffix}`
        const spicePhase = acParams.phase || "0"
        const freq = acParams.freq || "1k"
        val = `SINE(0 ${spiceAmp} ${freq} 0 0 ${spicePhase}) AC ${spiceAmp} ${spicePhase}`
      } else if (isAc && !hasExplicitAc && idx === 0 && (type === "voltage-source" || type === "current-source")) {
        // If AC analysis is active and user provided standard voltage/current source without explicit AC stimulus,
        // automatically inject AC 1 so the small-signal frequency response can be computed across all circuit nodes
        if (!/\bac\b/i.test(val)) {
          val = `${val} AC 1`
        }
      }

      if (type === "voltage-source") {
        const prefix = label.startsWith("V") ? label : `V${label}`
        netlistLines.push(`${prefix} ${nPos} ${nNeg} ${val}`)
      } else if (type === "current-source") {
        const prefix = label.startsWith("I") ? label : `I${label}`
        netlistLines.push(`${prefix} ${nPos} ${nNeg} ${val}`)
      } else if (type === "ac-source") {
        const prefix = label.startsWith("V") ? label : `V${label}`
        netlistLines.push(`${prefix} ${nPos} ${nNeg} ${val}`)
      } else if (type === "pulse-source") {
        const prefix = label.startsWith("V") ? label : `V${label}`
        netlistLines.push(`${prefix} ${nPos} ${nNeg} ${val}`)
      } else if (type === "behavioral-source") {
        const prefix = label.startsWith("B") ? label : `B${label}`
        netlistLines.push(`${prefix} ${nPos} ${nNeg} ${val}`)
      }
    })
    netlistLines.push(``)
  }

  // Section 2: Passive Components (R, C, L, Potentiometer, Transformer)
  const passiveNodes = compNodes.filter(
    (n) =>
      n.data.type === "resistor" ||
      n.data.type === "capacitor" ||
      n.data.type === "inductor" ||
      n.data.type === "potentiometer" ||
      n.data.type === "transformer" ||
      n.data.type === "transmission-line",
  )

  if (passiveNodes.length > 0) {
    netlistLines.push(`* --- Passive Components ---`)
    passiveNodes.forEach((node) => {
      const type = node.data.type as SchematicComponentType
      const label = node.data.label || node.id
      const val = formatSpiceValue(node.data.value, type)

      if (isolatedNodeIds.has(node.id)) {
        netlistLines.push(`* [ISOLATED] ${label} (omitted from simulation: terminals disconnected)`)
        return
      }

      if (type === "resistor") {
        const prefix = label.startsWith("R") ? label : `R${label}`
        const n1 = getPinNet(node.id, "pin1")
        const n2 = getPinNet(node.id, "pin2")
        netlistLines.push(`${prefix} ${n1} ${n2} ${val || "1k"}`)
      } else if (type === "capacitor") {
        const prefix = label.startsWith("C") ? label : `C${label}`
        const n1 = getPinNet(node.id, "pin1")
        const n2 = getPinNet(node.id, "pin2")
        netlistLines.push(`${prefix} ${n1} ${n2} ${val || "1u"}`)
      } else if (type === "inductor") {
        const prefix = label.startsWith("L") ? label : `L${label}`
        const n1 = getPinNet(node.id, "pin1")
        const n2 = getPinNet(node.id, "pin2")
        netlistLines.push(`${prefix} ${n1} ${n2} ${val || "10m"}`)
      } else if (type === "potentiometer") {
        // Modeled as two resistors meeting at wiper
        const n1 = getPinNet(node.id, "pin1")
        const n2 = getPinNet(node.id, "pin2")
        const nW = getPinNet(node.id, "wiper")
        netlistLines.push(`* Potentiometer ${label} (50% position)`)
        netlistLines.push(`R_${label}_A ${n1} ${nW} 5k`)
        netlistLines.push(`R_${label}_B ${nW} ${n2} 5k`)
      } else if (type === "transformer") {
        const p1 = getPinNet(node.id, "p1")
        const p2 = getPinNet(node.id, "p2")
        const s1 = getPinNet(node.id, "s1")
        const s2 = getPinNet(node.id, "s2")
        netlistLines.push(`* Transformer ${label}`)
        netlistLines.push(`LP_${label} ${p1} ${p2} 10m`)
        netlistLines.push(`LS_${label} ${s1} ${s2} 10m`)
        netlistLines.push(`K_${label} LP_${label} LS_${label} 0.999`)
      } else if (type === "transmission-line") {
        const ip = getPinNet(node.id, "in_pos")
        const in_ = getPinNet(node.id, "in_neg")
        const op = getPinNet(node.id, "out_pos")
        const on_ = getPinNet(node.id, "out_neg")
        netlistLines.push(`T${label} ${ip} ${in_} ${op} ${on_} ${val || "Z0=50 TD=1n"}`)
      }
    })
    netlistLines.push(``)
  }

  // Section 3: Semiconductors (Diodes, Transistors, FETs)
  const semiNodes = compNodes.filter(
    (n) =>
      n.data.type === "diode" ||
      n.data.type === "zener-diode" ||
      n.data.type === "schottky-diode" ||
      n.data.type === "led" ||
      n.data.type === "npn-bjt" ||
      n.data.type === "pnp-bjt" ||
      n.data.type === "nmos" ||
      n.data.type === "pmos" ||
      n.data.type === "jfet-n" ||
      n.data.type === "jfet-p",
  )

  if (semiNodes.length > 0) {
    netlistLines.push(`* --- Semiconductors ---`)
    semiNodes.forEach((node) => {
      const type = node.data.type as SchematicComponentType
      const label = node.data.label || node.id
      const model = (node.data.value || "").trim()

      if (
        type === "diode" ||
        type === "zener-diode" ||
        type === "schottky-diode" ||
        type === "led"
      ) {
        const prefix = label.startsWith("D") ? label : `D${label}`
        const nA = getPinNet(node.id, "pin1")
        const nK = getPinNet(node.id, "pin2")
        const modelName =
          model ||
          (type === "zener-diode"
            ? "BZX84C5V1"
            : type === "schottky-diode"
              ? "1N5819"
              : type === "led"
                ? "LED"
                : "1N4148")
        requiredModels.add(modelName)
        netlistLines.push(`${prefix} ${nA} ${nK} ${modelName}`)
      } else if (type === "npn-bjt" || type === "pnp-bjt") {
        const prefix = label.startsWith("Q") ? label : `Q${label}`
        const nC = getPinNet(node.id, "collector")
        const nB = getPinNet(node.id, "base")
        const nE = getPinNet(node.id, "emitter")
        const modelName = model || (type === "npn-bjt" ? "2N2222" : "2N2907")
        requiredModels.add(modelName)
        netlistLines.push(`${prefix} ${nC} ${nB} ${nE} ${modelName}`)
      } else if (type === "nmos" || type === "pmos") {
        const prefix = label.startsWith("M") ? label : `M${label}`
        const nD = getPinNet(node.id, "drain")
        const nG = getPinNet(node.id, "gate")
        const nS = getPinNet(node.id, "source")
        const modelName = model || (type === "nmos" ? "2N7000" : "IRF9530")
        requiredModels.add(modelName)
        // 4 terminals: D G S B (Bulk tied to Source)
        netlistLines.push(`${prefix} ${nD} ${nG} ${nS} ${nS} ${modelName}`)
      } else if (type === "jfet-n" || type === "jfet-p") {
        const prefix = label.startsWith("J") ? label : `J${label}`
        const nD = getPinNet(node.id, "drain")
        const nG = getPinNet(node.id, "gate")
        const nS = getPinNet(node.id, "source")
        const modelName = model || (type === "jfet-n" ? "2N5457" : "2N5460")
        requiredModels.add(modelName)
        netlistLines.push(`${prefix} ${nD} ${nG} ${nS} ${modelName}`)
      }
    })
    netlistLines.push(``)
  }

  // Section 4: Analog ICs (Op-Amps) & Controlled Sources
  const analogNodes = compNodes.filter(
    (n) =>
      n.data.type === "opamp" ||
      n.data.type === "comparator" ||
      n.data.type === "vcvs" ||
      n.data.type === "vccs" ||
      n.data.type === "cccs" ||
      n.data.type === "ccvs" ||
      n.data.type === "switch",
  )

  if (analogNodes.length > 0) {
    netlistLines.push(`* --- Analog Circuits & Controlled Sources ---`)
    analogNodes.forEach((node) => {
      const type = node.data.type as SchematicComponentType
      const label = node.data.label || node.id

      if (type === "opamp" || type === "comparator") {
        const prefix = label.startsWith("X") ? label : `X${label}`
        const nNon = getPinNet(node.id, "in_non")
        const nInv = getPinNet(node.id, "in_inv")
        const nOut = getPinNet(node.id, "out")
        const subcktName = (node.data.value || "LM741").trim()
        requiredSubcircuits.add(subcktName)
        netlistLines.push(`${prefix} ${nNon} ${nInv} ${nOut} ${subcktName}`)
      } else if (type === "vcvs") {
        const prefix = label.startsWith("E") ? label : `E${label}`
        const op = getPinNet(node.id, "out_pos")
        const on_ = getPinNet(node.id, "out_neg")
        const cp = getPinNet(node.id, "ctrl_pos")
        const cn = getPinNet(node.id, "ctrl_neg")
        netlistLines.push(`${prefix} ${op} ${on_} ${cp} ${cn} ${node.data.value || "1.0"}`)
      } else if (type === "vccs") {
        const prefix = label.startsWith("G") ? label : `G${label}`
        const op = getPinNet(node.id, "out_pos")
        const on_ = getPinNet(node.id, "out_neg")
        const cp = getPinNet(node.id, "ctrl_pos")
        const cn = getPinNet(node.id, "ctrl_neg")
        netlistLines.push(`${prefix} ${op} ${on_} ${cp} ${cn} ${node.data.value || "1m"}`)
      } else if (type === "switch") {
        const prefix = label.startsWith("S") ? label : `S${label}`
        const n1 = getPinNet(node.id, "pin1")
        const n2 = getPinNet(node.id, "pin2")
        requiredModels.add("SW_MOD")
        netlistLines.push(`${prefix} ${n1} ${n2} ${n1} ${n2} SW_MOD`)
      }
    })
    netlistLines.push(``)
  }

  // Section 5: Standard SPICE Device Models & Subcircuits
  if (requiredModels.size > 0 || requiredSubcircuits.size > 0) {
    netlistLines.push(`* --- Device Models & Subcircuits ---`)
    requiredModels.forEach((modName) => {
      const modelDef = STANDARD_SPICE_MODELS[modName]
      if (modelDef) {
        netlistLines.push(modelDef.card)
      } else {
        // Fallback generic diode / transistor model
        netlistLines.push(`.model ${modName} D(Is=1e-14 Rs=0.1)`)
      }
    })

    requiredSubcircuits.forEach((subName) => {
      const subDef =
        SUBCIRCUIT_MODELS[subName] ||
        `* Macromodel for ${subName} (Pin 1: IN+, Pin 2: IN-, Pin 3: OUT)\n.subckt ${subName} 1 2 3\nRin 1 2 2Meg\nE1 4 0 1 2 200k\nRout 4 3 75\nCcomp 4 0 30p\n.ends ${subName}`
      netlistLines.push(subDef)
    })
    netlistLines.push(``)
  }

  // Section 6: SPICE Solver Options (rshunt and gmin prevent singular matrix on floating ports/capacitive nodes)
  const method = solverSettings?.integrationMethod || "trap"
  const reltol = solverSettings?.reltol || "0.001"
  const vntol = solverSettings?.vntol || "1e-6"
  const abstol = solverSettings?.abstol || "1e-12"
  const temp = solverSettings?.temp || "27"
  const itl4 = solverSettings?.maxIterations || (solverSettings as any)?.itl4 || "100"
  netlistLines.push(`* --- Solver Options ---`)
  netlistLines.push(
    `.options method=${method} reltol=${reltol} vntol=${vntol} abstol=${abstol} temp=${temp} itl4=${itl4} rshunt=1e12 gmin=1e-12`,
  )
  netlistLines.push(``)

  // Section 6.5: Schematic SPICE Directives (.tran, .ac, .dc, .op, .param, .include, etc.)
  const schematicDirectives = compNodes.filter((n) => n.data.type === "spice-directive")
  let schematicAnalysisOverride: string | null = null

  if (schematicDirectives.length > 0) {
    netlistLines.push(`* --- Schematic SPICE Directives ---`)
    schematicDirectives.forEach((dNode) => {
      const text = (dNode.data.value || dNode.data.label || "").trim()
      if (!text) return
      const lines = text.split("\n")
      lines.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        if (trimmed.startsWith("*") || trimmed.startsWith(";")) {
          netlistLines.push(`* ${trimmed.replace(/^[;*]\s*/, "")}`)
          return
        }
        const lower = trimmed.toLowerCase()
        if (
          lower.startsWith(".tran ") ||
          lower.startsWith(".ac ") ||
          lower.startsWith(".dc ") ||
          lower === ".op" ||
          lower.startsWith(".op ")
        ) {
          schematicAnalysisOverride = trimmed
        } else {
          netlistLines.push(trimmed)
        }
      })
    })
    netlistLines.push(``)
  }

  // Section 6.8: Output Vector Directives (Save currents for LTspice-like probing)
  netlistLines.push(`* --- Output Vector Directives ---`)
  netlistLines.push(`.options savecurrents`)
  const saveVectors: string[] = ["all"]
  if (!isAc) {
    compNodes.forEach((node) => {
      const type = node.data.type as SchematicComponentType
      const label = node.data.label || node.id
      if (isolatedNodeIds.has(node.id)) return
      if (type === "resistor") {
        const p = (label.startsWith("R") || label.startsWith("r") ? label : `R${label}`).toLowerCase()
        saveVectors.push(`@${p}[i]`, `@${p}[p]`)
      } else if (type === "capacitor") {
        const p = (label.startsWith("C") || label.startsWith("c") ? label : `C${label}`).toLowerCase()
        saveVectors.push(`@${p}[i]`)
      } else if (type === "inductor") {
        const p = (label.startsWith("L") || label.startsWith("l") ? label : `L${label}`).toLowerCase()
        saveVectors.push(`@${p}[i]`)
      } else if (type === "diode" || type === "zener-diode" || type === "schottky-diode" || type === "led") {
        const p = (label.startsWith("D") || label.startsWith("d") ? label : `D${label}`).toLowerCase()
        saveVectors.push(`@${p}[id]`, `@${p}[vd]`)
      } else if (type === "npn-bjt" || type === "pnp-bjt") {
        const p = (label.startsWith("Q") || label.startsWith("q") ? label : `Q${label}`).toLowerCase()
        saveVectors.push(`@${p}[ib]`, `@${p}[ic]`, `@${p}[ie]`, `@${p}[vbe]`, `@${p}[vce]`, `@${p}[gm]`)
      } else if (type === "nmos" || type === "pmos") {
        const p = (label.startsWith("M") || label.startsWith("m") ? label : `M${label}`).toLowerCase()
        saveVectors.push(`@${p}[id]`, `@${p}[vgs]`, `@${p}[vds]`, `@${p}[gm]`, `@${p}[gds]`)
      }
    })
  }
  netlistLines.push(`.save ${saveVectors.join(" ")}`)
  netlistLines.push(``)

  // Section 7: Simulation Directive (.tran, .ac, .dc, .op)
  netlistLines.push(`* --- Simulation Analysis Command ---`)
  const normalizeAnalysisCmd = (rawCmd: string): string => {
    const trimmed = rawCmd.trim()
    const tranMatch = trimmed.match(/^\.tran\s+([^\s]+)$/i)
    if (tranMatch) {
      return `.tran 10u ${tranMatch[1]}`
    }
    return trimmed
  }

  if (schematicAnalysisOverride) {
    netlistLines.push(normalizeAnalysisCmd(schematicAnalysisOverride))
  } else if (analysisConfig?.command) {
    netlistLines.push(normalizeAnalysisCmd(analysisConfig.command))
  } else {
    netlistLines.push(`.tran 10u 10m`)
  }
  netlistLines.push(``)

  // Section 8: SPICE End
  netlistLines.push(`.end`)

  const netlistText = netlistLines.join("\n")

  return {
    success: errors.length === 0,
    netlist: netlistText,
    errors,
    warnings,
    stats: {
      componentCount: compNodes.filter(
        (n) =>
          n.data.type !== "ground" &&
          n.data.type !== "vcc" &&
          n.data.type !== "net-label" &&
          n.data.type !== "port-in" &&
          n.data.type !== "port-out" &&
          n.data.type !== "port-bi" &&
          n.data.type !== "spice-directive" &&
          n.data.type !== "schematic-text",
      ).length,
      netCount: Object.keys(netMap).length,
      wireCount: edges.length,
      groundConnected: isGroundConnected,
      hasErrors: errors.length > 0,
    },
    nets: netMap,
    edgeNetMap,
    nodePinNetMap,
    nodeErcIssues,
  }
}
