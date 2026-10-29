import { Fragment } from "react"
import {
  Handle,
  Position,
  type NodeProps,
} from "reactflow"

export type SchematicComponentType =
  // Passives
  | "resistor"
  | "capacitor"
  | "inductor"
  | "potentiometer"
  | "transformer"
  | "coupled-inductor"
  | "transmission-line"
  // Sources
  | "voltage-source"
  | "current-source"
  | "ac-source"
  | "pulse-source"
  | "vcvs"
  | "vccs"
  | "cccs"
  | "ccvs"
  | "behavioral-source"
  // Diodes
  | "diode"
  | "zener-diode"
  | "schottky-diode"
  | "led"
  // Transistors
  | "npn-bjt"
  | "pnp-bjt"
  | "nmos"
  | "pmos"
  | "jfet-n"
  | "jfet-p"
  // Analog & Power
  | "opamp"
  | "comparator"
  | "timer-555"
  | "voltage-regulator"
  | "switch"
  // Logic & Digital
  | "gate-and"
  | "gate-or"
  | "gate-not"
  | "gate-nand"
  | "gate-nor"
  | "gate-xor"
  | "gate-xnor"
  | "flipflop-d"
  | "flipflop-jk"
  | "mux-2to1"
  | "counter-4bit"
  // Power & Rail
  | "ground"
  | "vcc"
  | "generic"
  | "net-label"
  | "port-in"
  | "port-out"
  | "port-bi"
  | "spice-directive"
  | "schematic-text"

export interface SchematicNodeData {
  label: string
  type: SchematicComponentType
  value?: string
  rotation?: number
  highlightedPins?: string[]
  ercIssues?: Record<string, { severity: "error" | "warning"; message: string; code: string; suggestion?: string }>
  onErcClick?: (issue: { severity: "error" | "warning"; message: string; code: string; suggestion?: string }) => void
  portType?: "none" | "input" | "output" | "bidirectional"
  directiveType?: "spice" | "comment"
}

export interface PinDef {
  id: string
  name: string
  x: number // base x in 120x80 box
  y: number // base y in 120x80 box
}

export function getRotatedPinPos(
  pin: { x: number; y: number },
  rotation: number = 0,
): { x: number; y: number; handlePos: Position } {
  const normRot = ((rotation % 360) + 360) % 360
  let rx = pin.x
  let ry = pin.y

  if (normRot === 0) {
    rx = pin.x
    ry = pin.y
  } else if (normRot === 90) {
    rx = 100 - pin.y
    ry = pin.x - 20
  } else if (normRot === 180) {
    rx = 120 - pin.x
    ry = 80 - pin.y
  } else if (normRot === 270) {
    rx = pin.y + 20
    ry = 100 - pin.x
  }

  let handlePos = Position.Left
  if (rx <= 10) handlePos = Position.Left
  else if (rx >= 110) handlePos = Position.Right
  else if (ry <= 10) handlePos = Position.Top
  else if (ry >= 70) handlePos = Position.Bottom
  else if (rx < 60) handlePos = Position.Left
  else handlePos = Position.Right

  return { x: rx, y: ry, handlePos }
}

/**
 * Calculates label container position and alignment styles so that labels (designator & value)
 * remain clearly visible and never collide with terminal pins or connecting wires when the component rotates.
 */
export function getLabelLayout(
  type: SchematicComponentType,
  rotation: number = 0,
): { containerStyle: React.CSSProperties } {
  const normRot = ((rotation % 360) + 360) % 360

  // Vertical orientation (90° or 270°)
  if (normRot === 90 || normRot === 270) {
    // If potentiometer at 90°, wiper pin is on the right (x=100, y=40), so place labels on the left
    if (type === "potentiometer" && normRot === 90) {
      return {
        containerStyle: {
          position: "absolute",
          top: "50%",
          right: "calc(50% + 22px)",
          transform: "translateY(-50%)",
          whiteSpace: "nowrap",
          textAlign: "right",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 1,
        },
      }
    }

    // Default vertical: Place to the right of the vertical component body, centered vertically
    return {
      containerStyle: {
        position: "absolute",
        top: "50%",
        left: "calc(50% + 22px)",
        transform: "translateY(-50%)",
        whiteSpace: "nowrap",
        textAlign: "left",
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 1,
      },
    }
  }

  // Upside-down horizontal orientation (180°)
  if (normRot === 180) {
    // If potentiometer at 180°, wiper pin is at bottom (x=60, y=80), so place labels on top
    if (type === "potentiometer") {
      return {
        containerStyle: {
          position: "absolute",
          top: -18,
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          textAlign: "center",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        },
      }
    }
    return {
      containerStyle: {
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
      },
    }
  }

  // Normal horizontal orientation (0°)
  if (type === "vcc") {
    // VCC has terminal pin at bottom (60, 80), so place label above
    return {
      containerStyle: {
        position: "absolute",
        top: -18,
        left: "50%",
        transform: "translateX(-50%)",
        whiteSpace: "nowrap",
        textAlign: "center",
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      },
    }
  }

  return {
    containerStyle: {
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
    },
  }
}

export function getComponentPins(type: SchematicComponentType): PinDef[] {
  switch (type) {
    case "ground":
      return [{ id: "pin1", name: "GND", x: 60, y: 0 }]
    case "vcc":
      return [{ id: "pin1", name: "VCC", x: 60, y: 80 }]
    case "net-label":
      return [{ id: "pin1", name: "NET", x: 0, y: 40 }]
    case "port-in":
      return [{ id: "pin1", name: "IN", x: 120, y: 40 }]
    case "port-out":
      return [{ id: "pin1", name: "OUT", x: 0, y: 40 }]
    case "port-bi":
      return [{ id: "pin1", name: "IO", x: 0, y: 40 }]
    case "spice-directive":
    case "schematic-text":
      return []

    case "potentiometer":
      return [
        { id: "pin1", name: "1", x: 0, y: 40 },
        { id: "pin2", name: "2", x: 120, y: 40 },
        { id: "wiper", name: "W", x: 60, y: 0 },
      ]

    case "npn-bjt":
    case "pnp-bjt":
      return [
        { id: "base", name: "B", x: 0, y: 40 },
        { id: "collector", name: "C", x: 120, y: 20 },
        { id: "emitter", name: "E", x: 120, y: 60 },
      ]

    case "nmos":
    case "pmos":
    case "jfet-n":
    case "jfet-p":
      return [
        { id: "gate", name: "G", x: 0, y: 40 },
        { id: "drain", name: "D", x: 120, y: 20 },
        { id: "source", name: "S", x: 120, y: 60 },
      ]

    case "voltage-regulator":
      return [
        { id: "in", name: "IN", x: 0, y: 40 },
        { id: "out", name: "OUT", x: 120, y: 40 },
        { id: "gnd", name: "GND", x: 60, y: 80 },
      ]

    case "opamp":
    case "comparator":
      return [
        { id: "in_inv", name: "IN-", x: 0, y: 20 },
        { id: "in_non", name: "IN+", x: 0, y: 60 },
        { id: "out", name: "OUT", x: 120, y: 40 },
      ]

    case "gate-not":
      return [
        { id: "in", name: "IN", x: 0, y: 40 },
        { id: "out", name: "OUT", x: 120, y: 40 },
      ]

    case "gate-and":
    case "gate-or":
    case "gate-nand":
    case "gate-nor":
    case "gate-xor":
    case "gate-xnor":
      return [
        { id: "in1", name: "A", x: 0, y: 20 },
        { id: "in2", name: "B", x: 0, y: 60 },
        { id: "out", name: "Y", x: 120, y: 40 },
      ]

    case "transformer":
    case "coupled-inductor":
      return [
        { id: "p1", name: "P1", x: 0, y: 20 },
        { id: "p2", name: "P2", x: 0, y: 60 },
        { id: "s1", name: "S1", x: 120, y: 20 },
        { id: "s2", name: "S2", x: 120, y: 60 },
      ]

    case "transmission-line":
      return [
        { id: "in_pos", name: "IN+", x: 0, y: 20 },
        { id: "in_neg", name: "IN-", x: 0, y: 60 },
        { id: "out_pos", name: "OUT+", x: 120, y: 20 },
        { id: "out_neg", name: "OUT-", x: 120, y: 60 },
      ]

    case "vcvs":
    case "vccs":
    case "cccs":
    case "ccvs":
      return [
        { id: "ctrl_pos", name: "IN+", x: 0, y: 20 },
        { id: "ctrl_neg", name: "IN-", x: 0, y: 60 },
        { id: "out_pos", name: "OUT+", x: 120, y: 20 },
        { id: "out_neg", name: "OUT-", x: 120, y: 60 },
      ]

    case "flipflop-d":
      return [
        { id: "d", name: "D", x: 0, y: 20 },
        { id: "clk", name: "CLK", x: 0, y: 60 },
        { id: "q", name: "Q", x: 120, y: 20 },
        { id: "q_bar", name: "QN", x: 120, y: 60 },
      ]

    case "flipflop-jk":
      return [
        { id: "j", name: "J", x: 0, y: 20 },
        { id: "clk", name: "CLK", x: 0, y: 40 },
        { id: "k", name: "K", x: 0, y: 60 },
        { id: "q", name: "Q", x: 120, y: 20 },
        { id: "q_bar", name: "QN", x: 120, y: 60 },
      ]

    case "mux-2to1":
      return [
        { id: "in0", name: "I0", x: 0, y: 20 },
        { id: "in1", name: "I1", x: 0, y: 60 },
        { id: "sel", name: "S", x: 60, y: 80 },
        { id: "out", name: "Y", x: 120, y: 40 },
      ]

    case "counter-4bit":
      return [
        { id: "clk", name: "CLK", x: 0, y: 20 },
        { id: "rst", name: "RST", x: 0, y: 60 },
        { id: "q0", name: "Q0", x: 120, y: 10 },
        { id: "q1", name: "Q1", x: 120, y: 30 },
        { id: "q2", name: "Q2", x: 120, y: 50 },
        { id: "q3", name: "Q3", x: 120, y: 70 },
      ]

    case "timer-555":
      return [
        { id: "trig", name: "TRG", x: 0, y: 20 },
        { id: "rst", name: "RST", x: 0, y: 40 },
        { id: "ctrl", name: "CTL", x: 0, y: 60 },
        { id: "out", name: "OUT", x: 120, y: 20 },
        { id: "disch", name: "DIS", x: 120, y: 60 },
        { id: "vcc", name: "VCC", x: 60, y: 0 },
        { id: "gnd", name: "GND", x: 60, y: 80 },
      ]

    default:
      return [
        { id: "pin1", name: "1", x: 0, y: 40 },
        { id: "pin2", name: "2", x: 120, y: 40 },
      ]
  }
}

/* ============================================================
   PRECISE ENGINEERING SCHEMATIC SYMBOLS (LTspice Style)
   All symbols: width 120, height 80, 20px grid pitch aligned.
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

function PotentiometerSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="30" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polyline
        points="30,40 35,28 45,52 55,28 65,52 75,28 85,52 90,40"
        fill="none"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="90" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      {/* Wiper arrow from top lead */}
      <line x1="60" y1="0" x2="60" y2="28" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="60,34 56,26 64,26" fill="#1f2937" />
    </svg>
  )
}

function TransformerSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      {/* Primary Coil */}
      <line x1="0" y1="20" x2="42" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="42" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path
        d="M42,20 C50,20 50,33 42,33 C50,33 50,47 42,47 C50,47 50,60 42,60"
        fill="none"
        stroke="#1f2937"
        strokeWidth="2"
      />
      {/* Core Lines */}
      <line x1="57" y1="14" x2="57" y2="66" stroke="#1f2937" strokeWidth="1.8" strokeDasharray="3 2" />
      <line x1="63" y1="14" x2="63" y2="66" stroke="#1f2937" strokeWidth="1.8" strokeDasharray="3 2" />
      {/* Secondary Coil */}
      <path
        d="M78,20 C70,20 70,33 78,33 C70,33 70,47 78,47 C70,47 70,60 78,60"
        fill="none"
        stroke="#1f2937"
        strokeWidth="2"
      />
      <line x1="78" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="78" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function CoupledInductorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="42" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="42" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path
        d="M42,20 C50,20 50,33 42,33 C50,33 50,47 42,47 C50,47 50,60 42,60"
        fill="none"
        stroke="#1f2937"
        strokeWidth="2"
      />
      <circle cx="36" cy="14" r="3" fill="#1f2937" />
      <line x1="78" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="78" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path
        d="M78,20 C70,20 70,33 78,33 C70,33 70,47 78,47 C70,47 70,60 78,60"
        fill="none"
        stroke="#1f2937"
        strokeWidth="2"
      />
      <circle cx="84" cy="14" r="3" fill="#1f2937" />
      <text x="60" y="44" fontSize="10" fontWeight="700" textAnchor="middle" fill="#1f2937">k</text>
    </svg>
  )
}

function TransmissionLineSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <rect x="36" y="14" width="48" height="52" rx="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="38" fontSize="10" fontWeight="700" textAnchor="middle" fill="#1f2937">T-LINE</text>
      <text x="60" y="52" fontSize="9" fontWeight="600" textAnchor="middle" fill="#2563eb">Z₀</text>
      <line x1="84" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="84" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function VoltageSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
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
      <line x1="50" y1="40" x2="70" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polyline points="65,35 70,40 65,45" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ACSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M47,40 Q53,30 60,40 T73,40" fill="none" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function PulseSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M48,46 L53,46 L53,34 L67,34 L67,46 L72,46" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VCVSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="28" y="16" fontSize="10" fontWeight="700" fill="#1f2937">+</text>
      <text x="28" y="72" fontSize="12" fontWeight="700" fill="#1f2937">−</text>
      {/* Diamond */}
      <polygon points="60,18 82,40 60,62 38,40" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="56" y1="40" x2="64" y2="40" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="60" y1="36" x2="60" y2="44" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="82" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="74" fontSize="9" fontWeight="700" textAnchor="middle" fill="#2563eb">E (VCVS)</text>
    </svg>
  )
}

function VCCSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="60,18 82,40 60,62 38,40" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="52" y1="40" x2="68" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polyline points="64,36 68,40 64,44" fill="none" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="74" fontSize="9" fontWeight="700" textAnchor="middle" fill="#2563eb">G (VCCS)</text>
    </svg>
  )
}

function CCCSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="60,18 82,40 60,62 38,40" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="52" y1="40" x2="68" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polyline points="64,36 68,40 64,44" fill="none" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="74" fontSize="9" fontWeight="700" textAnchor="middle" fill="#2563eb">F (CCCS)</text>
    </svg>
  )
}

function CCVSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="60,18 82,40 60,62 38,40" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="56" y1="40" x2="64" y2="40" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="60" y1="36" x2="60" y2="44" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="82" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="74" fontSize="9" fontWeight="700" textAnchor="middle" fill="#2563eb">H (CCVS)</text>
    </svg>
  )
}

function BehavioralSourceSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="60" cy="40" r="22" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="82" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="44" fontSize="12" fontWeight="700" textAnchor="middle" fill="#1f2937" fontFamily="monospace">B</text>
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

function ZenerDiodeSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="50" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="50,26 50,54 70,40" fill="#1f2937" stroke="#1f2937" strokeWidth="1" />
      {/* Zener bent cathode */}
      <polyline points="66,24 70,26 70,54 74,56" fill="none" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="70" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SchottkyDiodeSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="50" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="50,26 50,54 70,40" fill="#1f2937" stroke="#1f2937" strokeWidth="1" />
      {/* Schottky S-hook cathode */}
      <polyline points="66,28 66,24 70,24 70,56 74,56 74,52" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="70" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LEDSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="50" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="50,26 50,54 70,40" fill="#1f2937" stroke="#1f2937" strokeWidth="1" />
      <line x1="70" y1="26" x2="70" y2="54" stroke="#1f2937" strokeWidth="2" />
      <line x1="70" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      {/* Light Emission Arrows */}
      <line x1="64" y1="24" x2="76" y2="12" stroke="#dc2626" strokeWidth="1.5" />
      <polygon points="77,11 70,14 74,18" fill="#dc2626" />
      <line x1="72" y1="30" x2="84" y2="18" stroke="#dc2626" strokeWidth="1.5" />
      <polygon points="85,17 78,20 82,24" fill="#dc2626" />
    </svg>
  )
}

function NPNTransistorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <circle cx="60" cy="40" r="24" fill="none" stroke="#1f2937" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      {/* Base */}
      <line x1="0" y1="40" x2="48" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="48" y1="24" x2="48" y2="56" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round" />
      {/* Collector */}
      <line x1="48" y1="32" x2="76" y2="18" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="76" y1="18" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      {/* Emitter with outward arrow */}
      <line x1="48" y1="48" x2="76" y2="62" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="76,62 66,54 69,63" fill="#1f2937" />
      <line x1="76" y1="62" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function PNPTransistorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <circle cx="60" cy="40" r="24" fill="none" stroke="#1f2937" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      {/* Base */}
      <line x1="0" y1="40" x2="48" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="48" y1="24" x2="48" y2="56" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round" />
      {/* Emitter with inward arrow */}
      <line x1="48" y1="32" x2="76" y2="18" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="76" y1="18" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      {/* Collector with arrow pointing IN toward base */}
      <line x1="48" y1="48" x2="76" y2="62" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="52,50 61,56 58,47" fill="#1f2937" />
      <line x1="76" y1="62" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function NMOSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      {/* Gate */}
      <line x1="0" y1="40" x2="44" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="44" y1="24" x2="44" y2="56" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
      {/* Channel bars */}
      <line x1="52" y1="24" x2="52" y2="34" stroke="#1f2937" strokeWidth="2.4" />
      <line x1="52" y1="36" x2="52" y2="44" stroke="#1f2937" strokeWidth="2.4" />
      <line x1="52" y1="46" x2="52" y2="56" stroke="#1f2937" strokeWidth="2.4" />
      {/* Drain */}
      <line x1="52" y1="28" x2="76" y2="28" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="76" y1="28" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      {/* Source */}
      <line x1="52" y1="52" x2="76" y2="52" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="76" y1="52" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      {/* Substrate lead with inward arrow */}
      <line x1="52" y1="40" x2="76" y2="40" stroke="#1f2937" strokeWidth="1.6" />
      <line x1="76" y1="40" x2="76" y2="52" stroke="#1f2937" strokeWidth="1.6" />
      <polygon points="56,40 64,36 64,44" fill="#1f2937" />
    </svg>
  )
}

function PMOSSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      {/* Gate with inversion bubble */}
      <line x1="0" y1="40" x2="38" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="41" cy="40" r="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.5" />
      <line x1="44" y1="24" x2="44" y2="56" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
      {/* Channel */}
      <line x1="52" y1="24" x2="52" y2="56" stroke="#1f2937" strokeWidth="2.4" />
      <line x1="52" y1="28" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="52" y1="52" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function JFETNSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <circle cx="60" cy="40" r="24" fill="none" stroke="#1f2937" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      {/* Channel */}
      <line x1="56" y1="24" x2="56" y2="56" stroke="#1f2937" strokeWidth="2.4" />
      {/* Drain */}
      <line x1="56" y1="28" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      {/* Source */}
      <line x1="56" y1="52" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      {/* Gate with inward arrow */}
      <line x1="0" y1="40" x2="56" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="52,40 44,36 44,44" fill="#1f2937" />
    </svg>
  )
}

function JFETPSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <circle cx="60" cy="40" r="24" fill="none" stroke="#1f2937" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <line x1="56" y1="24" x2="56" y2="56" stroke="#1f2937" strokeWidth="2.4" />
      <line x1="56" y1="28" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="56" y1="52" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      {/* Gate with outward arrow */}
      <line x1="0" y1="40" x2="56" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="44,40 52,36 52,44" fill="#1f2937" />
    </svg>
  )
}

function OpAmpSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      {/* In- and In+ */}
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      {/* Triangle */}
      <polygon points="36,10 36,70 94,40" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      {/* Inverting minus and non-inverting plus */}
      <line x1="42" y1="24" x2="48" y2="24" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="42" y1="56" x2="48" y2="56" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="45" y1="53" x2="45" y2="59" stroke="#1f2937" strokeWidth="1.8" />
      {/* Out */}
      <line x1="94" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function ComparatorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="36,10 36,70 94,40" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <line x1="42" y1="24" x2="48" y2="24" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="42" y1="56" x2="48" y2="56" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="45" y1="53" x2="45" y2="59" stroke="#1f2937" strokeWidth="1.8" />
      {/* Hysteresis symbol */}
      <polyline points="62,36 68,36 68,44 62,44" fill="none" stroke="#2563eb" strokeWidth="1.5" />
      <line x1="94" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function Timer555Symbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="24" y="10" width="72" height="60" rx="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="38" fontSize="13" fontWeight="800" textAnchor="middle" fill="#1f2937" fontFamily="sans-serif">555</text>
      <text x="60" y="52" fontSize="9" fontWeight="600" textAnchor="middle" fill="#6b7280">TIMER</text>
      {/* Leads */}
      <line x1="0" y1="20" x2="24" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="40" x2="24" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="24" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="96" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="96" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="60" y1="0" x2="60" y2="10" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="60" y1="70" x2="60" y2="80" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function VoltageRegulatorSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="30" y="18" width="60" height="44" rx="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="38" fontSize="11" fontWeight="700" textAnchor="middle" fill="#1f2937" fontFamily="monospace">REG</text>
      <text x="60" y="50" fontSize="9" fontWeight="600" textAnchor="middle" fill="#2563eb">7805</text>
      <line x1="0" y1="40" x2="30" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="90" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="60" y1="62" x2="60" y2="80" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function SwitchSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="40" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <circle cx="42" cy="40" r="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="44" y1="38" x2="76" y2="22" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="78" cy="40" r="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="80" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateANDSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M36,12 L56,12 C72,12 84,24 84,40 C84,56 72,68 56,68 L36,68 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <line x1="84" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateORSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M32,12 Q48,40 32,68 Q64,68 86,40 Q64,12 32,12 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <line x1="86" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateNOTSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="40" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <polygon points="40,16 40,64 78,40" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="83" cy="40" r="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="87" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateNANDSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M36,12 L56,12 C72,12 82,24 82,40 C82,56 72,68 56,68 L36,68 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="87" cy="40" r="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="91" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateNORSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="36" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="36" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M32,12 Q48,40 32,68 Q64,68 84,40 Q64,12 32,12 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="89" cy="40" r="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="93" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateXORSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="32" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="32" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M26,12 Q42,40 26,68" fill="none" stroke="#1f2937" strokeWidth="2" />
      <path d="M34,12 Q50,40 34,68 Q66,68 86,40 Q66,12 34,12 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <line x1="86" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function GateXNORSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="20" x2="32" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="32" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <path d="M26,12 Q42,40 26,68" fill="none" stroke="#1f2937" strokeWidth="2" />
      <path d="M34,12 Q50,40 34,68 Q66,68 84,40 Q66,12 34,12 Z" fill="#ffffff" stroke="#1f2937" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="89" cy="40" r="4" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="93" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
    </svg>
  )
}

function FlipFlopDSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="28" y="10" width="64" height="60" rx="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="20" x2="28" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="28" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polyline points="28,54 36,60 28,66" fill="none" stroke="#1f2937" strokeWidth="1.5" />
      <text x="36" y="24" fontSize="10" fontWeight="700" fill="#1f2937">D</text>
      <text x="44" y="64" fontSize="9" fontWeight="700" fill="#6b7280">CLK</text>
      <line x1="92" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="92" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="80" y="24" fontSize="10" fontWeight="700" fill="#1f2937">Q</text>
      <text x="76" y="64" fontSize="10" fontWeight="700" fill="#1f2937">Q̄</text>
    </svg>
  )
}

function FlipFlopJKSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="28" y="8" width="64" height="64" rx="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="20" x2="28" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="40" x2="28" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="28" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polyline points="28,34 36,40 28,46" fill="none" stroke="#1f2937" strokeWidth="1.5" />
      <text x="36" y="24" fontSize="10" fontWeight="700" fill="#1f2937">J</text>
      <text x="36" y="64" fontSize="10" fontWeight="700" fill="#1f2937">K</text>
      <line x1="92" y1="20" x2="120" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="92" y1="60" x2="120" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="80" y="24" fontSize="10" fontWeight="700" fill="#1f2937">Q</text>
      <text x="76" y="64" fontSize="10" fontWeight="700" fill="#1f2937">Q̄</text>
    </svg>
  )
}

function MUX2to1Symbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <polygon points="34,8 86,20 86,60 34,72" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="0" y1="20" x2="34" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="34" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <text x="42" y="24" fontSize="9" fontWeight="700" fill="#1f2937">0</text>
      <text x="42" y="64" fontSize="9" fontWeight="700" fill="#1f2937">1</text>
      <line x1="60" y1="66" x2="60" y2="80" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="58" fontSize="8" fontWeight="700" textAnchor="middle" fill="#2563eb">S</text>
      <line x1="86" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="38" fontSize="10" fontWeight="800" textAnchor="middle" fill="#1f2937">MUX</text>
    </svg>
  )
}

function Counter4BitSymbol() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <rect x="28" y="6" width="64" height="68" rx="3" fill="#ffffff" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="20" x2="28" y2="20" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="0" y1="60" x2="28" y2="60" stroke="#1f2937" strokeWidth="1.8" />
      <polyline points="28,14 36,20 28,26" fill="none" stroke="#1f2937" strokeWidth="1.5" />
      <text x="40" y="23" fontSize="8" fontWeight="700" fill="#1f2937">CLK</text>
      <text x="36" y="63" fontSize="8" fontWeight="700" fill="#dc2626">RST</text>
      <line x1="92" y1="10" x2="120" y2="10" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="92" y1="30" x2="120" y2="30" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="92" y1="50" x2="120" y2="50" stroke="#1f2937" strokeWidth="1.8" />
      <line x1="92" y1="70" x2="120" y2="70" stroke="#1f2937" strokeWidth="1.8" />
      <text x="60" y="44" fontSize="10" fontWeight="800" textAnchor="middle" fill="#1f2937">4-BIT</text>
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

function NetLabelSymbol({ name }: { name?: string }) {
  const text = name || "NET"
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block", overflow: "visible" }}>
      {/* Anchor connection point touching the wire at (0, 40) */}
      <line x1="0" y1="40" x2="6" y2="40" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
      <circle cx="0" cy="40" r="2.5" fill="#0284c7" />
      {/* Plain text net name rendered directly above wire (LTspice style) */}
      <text
        x="6"
        y="35"
        fontSize="13"
        fontWeight="700"
        textAnchor="start"
        fill="#0369a1"
        fontFamily="sans-serif"
      >
        {text}
      </text>
    </svg>
  )
}

function PortInSymbol({ name }: { name?: string }) {
  const text = (name || "IN").slice(0, 10)
  const fontSize = text.length > 7 ? "9.5" : text.length > 5 ? "10.5" : "11.5"
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <polygon
        points="18,24 76,24 94,40 76,56 18,56"
        fill="#ffffff"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="94" y1="40" x2="120" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <text
        x="50"
        y="44"
        fontSize={fontSize}
        fontWeight="700"
        textAnchor="middle"
        fill="#1f2937"
        fontFamily='"JetBrains Mono", Consolas, monospace'
        letterSpacing="0.02em"
      >
        {text}
      </text>
    </svg>
  )
}

function PortOutSymbol({ name }: { name?: string }) {
  const text = (name || "OUT").slice(0, 10)
  const fontSize = text.length > 7 ? "9.5" : text.length > 5 ? "10.5" : "11.5"
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="26" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon
        points="26,24 84,24 102,40 84,56 26,56"
        fill="#ffffff"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text
        x="58"
        y="44"
        fontSize={fontSize}
        fontWeight="700"
        textAnchor="middle"
        fill="#1f2937"
        fontFamily='"JetBrains Mono", Consolas, monospace'
        letterSpacing="0.02em"
      >
        {text}
      </text>
    </svg>
  )
}

function PortBiSymbol({ name }: { name?: string }) {
  const text = (name || "IO").slice(0, 10)
  const fontSize = text.length > 7 ? "9.5" : text.length > 5 ? "10.5" : "11.5"
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
      <line x1="0" y1="40" x2="20" y2="40" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" />
      <polygon
        points="20,40 34,24 84,24 98,40 84,56 34,56"
        fill="#ffffff"
        stroke="#1f2937"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text
        x="59"
        y="44"
        fontSize={fontSize}
        fontWeight="700"
        textAnchor="middle"
        fill="#1f2937"
        fontFamily='"JetBrains Mono", Consolas, monospace'
        letterSpacing="0.02em"
      >
        {text}
      </text>
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

export function renderSymbol(type: SchematicComponentType, labelName?: string) {
  switch (type) {
    case "net-label":
      return <NetLabelSymbol name={labelName} />
    case "port-in":
      return <PortInSymbol name={labelName} />
    case "port-out":
      return <PortOutSymbol name={labelName} />
    case "port-bi":
      return <PortBiSymbol name={labelName} />
    case "resistor":
      return <ResistorSymbol />
    case "capacitor":
      return <CapacitorSymbol />
    case "inductor":
      return <InductorSymbol />
    case "potentiometer":
      return <PotentiometerSymbol />
    case "transformer":
      return <TransformerSymbol />
    case "coupled-inductor":
      return <CoupledInductorSymbol />
    case "transmission-line":
      return <TransmissionLineSymbol />

    case "voltage-source":
      return <VoltageSourceSymbol />
    case "current-source":
      return <CurrentSourceSymbol />
    case "ac-source":
      return <ACSourceSymbol />
    case "pulse-source":
      return <PulseSourceSymbol />
    case "vcvs":
      return <VCVSSymbol />
    case "vccs":
      return <VCCSSymbol />
    case "cccs":
      return <CCCSSymbol />
    case "ccvs":
      return <CCVSSymbol />
    case "behavioral-source":
      return <BehavioralSourceSymbol />

    case "diode":
      return <DiodeSymbol />
    case "zener-diode":
      return <ZenerDiodeSymbol />
    case "schottky-diode":
      return <SchottkyDiodeSymbol />
    case "led":
      return <LEDSymbol />

    case "npn-bjt":
      return <NPNTransistorSymbol />
    case "pnp-bjt":
      return <PNPTransistorSymbol />
    case "nmos":
      return <NMOSSymbol />
    case "pmos":
      return <PMOSSymbol />
    case "jfet-n":
      return <JFETNSymbol />
    case "jfet-p":
      return <JFETPSymbol />

    case "opamp":
      return <OpAmpSymbol />
    case "comparator":
      return <ComparatorSymbol />
    case "timer-555":
      return <Timer555Symbol />
    case "voltage-regulator":
      return <VoltageRegulatorSymbol />
    case "switch":
      return <SwitchSymbol />

    case "gate-and":
      return <GateANDSymbol />
    case "gate-or":
      return <GateORSymbol />
    case "gate-not":
      return <GateNOTSymbol />
    case "gate-nand":
      return <GateNANDSymbol />
    case "gate-nor":
      return <GateNORSymbol />
    case "gate-xor":
      return <GateXORSymbol />
    case "gate-xnor":
      return <GateXNORSymbol />
    case "flipflop-d":
      return <FlipFlopDSymbol />
    case "flipflop-jk":
      return <FlipFlopJKSymbol />
    case "mux-2to1":
      return <MUX2to1Symbol />
    case "counter-4bit":
      return <Counter4BitSymbol />

    case "ground":
      return <GroundSymbol />
    case "vcc":
      return <VCCSymbol />
    case "spice-directive":
      return (
        <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
          <rect x="8" y="14" width="104" height="52" rx="4" fill="#f8fafc" stroke="#0284c7" strokeWidth="1.8" strokeDasharray="4 2" />
          <text x="60" y="44" fontSize="12" fontWeight="700" textAnchor="middle" fill="#0369a1" fontFamily="monospace">.tran / .op</text>
        </svg>
      )
    case "schematic-text":
      return (
        <svg width="120" height="80" viewBox="0 0 120 80" style={{ display: "block" }}>
          <rect x="8" y="14" width="104" height="52" rx="4" fill="#fafafa" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x="60" y="44" fontSize="12" fontWeight="600" textAnchor="middle" fill="#374151" fontFamily="sans-serif">Text Note</text>
        </svg>
      )
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
  if (data.type === "spice-directive") {
    const rawVal = data.value || data.label || ".op"
    const isComment =
      data.directiveType === "comment" || rawVal.startsWith("*") || rawVal.startsWith(";")
    return (
      <div
        style={{
          position: "relative",
          minWidth: 120,
          maxWidth: 340,
          padding: "5px 9px",
          background: isComment ? "#f0fdf4" : "#eff6ff",
          border: selected ? "1.5px dashed #2563eb" : isComment ? "1px solid #86efac" : "1px solid #93c5fd",
          borderRadius: 3,
          fontFamily: 'Consolas, "JetBrains Mono", monospace',
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: "1px 4px",
              borderRadius: 2,
              background: isComment ? "#bbf7d0" : "#bfdbfe",
              color: isComment ? "#166534" : "#1d4ed8",
              letterSpacing: "0.03em",
            }}
          >
            {isComment ? "; COMMENT" : ".SPICE"}
          </span>
          <span style={{ fontSize: 10, color: "#64748b" }}>
            {data.label}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: isComment ? "#15803d" : "#1e40af",
            whiteSpace: "pre-wrap",
            lineHeight: 1.3,
          }}
        >
          {rawVal}
        </div>
      </div>
    )
  }

  if (data.type === "schematic-text") {
    return (
      <div
        style={{
          position: "relative",
          minWidth: 70,
          maxWidth: 320,
          padding: "3px 6px",
          background: "transparent",
          border: selected ? "1.5px dashed #2563eb" : "1px dashed transparent",
          borderRadius: 2,
          fontFamily: '"Segoe UI", -apple-system, sans-serif',
          fontSize: 12.5,
          color: "#0f172a",
          whiteSpace: "pre-wrap",
          lineHeight: 1.35,
          userSelect: "none",
        }}
      >
        {data.value || data.label || "Annotation text"}
      </div>
    )
  }

  const rotation = data.rotation ?? 0
  const pins = getComponentPins(data.type)
  const isNetOrPort =
    data.type === "net-label" ||
    data.type === "port-in" ||
    data.type === "port-out" ||
    data.type === "port-bi"

  return (
    <div
      className={`schematic-node-component comp-type-${data.type}`}
      data-comp-type={data.type}
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
      {/* Handles dynamically mapped from component pin definitions */}
      {pins.map((pin) => {
        const rotPos = getRotatedPinPos(pin, rotation)
        const isPinHighlighted = data.highlightedPins?.includes(pin.id)

        return (
          <Fragment key={pin.id}>
            <Handle
              type="source"
              position={rotPos.handlePos}
              id={pin.id}
              isConnectable={isConnectable}
              style={{
                width: isPinHighlighted ? 10 : 8,
                height: isPinHighlighted ? 10 : 8,
                top: rotPos.y,
                left: rotPos.x,
                transform: "translate(-50%, -50%)",
                background: isPinHighlighted
                  ? "#0284c7"
                  : selected
                    ? "#2563eb"
                    : "#1f2937",
                border: isPinHighlighted
                  ? "2px solid #38bdf8"
                  : "1.5px solid #ffffff",
                boxShadow: isPinHighlighted
                  ? "0 0 10px #38bdf8, 0 0 4px #0284c7"
                  : "0 0 0 1px rgba(31, 41, 55, 0.25)",
                zIndex: isPinHighlighted ? 15 : 10,
                pointerEvents: isConnectable ? "all" : "none",
                transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              }}
            />
          </Fragment>
        )
      })}

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
        {renderSymbol(data.type, data.value || data.label)}
      </div>

      {/* Engineering Designator & Parameter Labels */}
      {!isNetOrPort && (
        <div
          style={{
            ...getLabelLayout(data.type, rotation).containerStyle,
            zIndex: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#1f2937",
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: 1.2,
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              padding: "0 2px",
              borderRadius: 2,
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
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                padding: "0 2px",
                borderRadius: 2,
              }}
            >
              {data.value}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
