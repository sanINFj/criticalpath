export type ComponentType =
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
  | "transistor"
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
  | "logic-gate"
  | "flipflop-d"
  | "flipflop-jk"
  | "mux-2to1"
  | "counter-4bit"
  // Power & Rail
  | "ground"
  | "vcc"
  | "generic"
  | "net-label"

export interface Pin {
  id: string
  name: string
  x: number
  y: number
}

export interface Component {
  id: string
  type: ComponentType
  name: string
  value?: string
  x: number
  y: number
  rotation?: number
  pins: Pin[]
  properties?: Record<string, string | number | boolean>
}

export interface Connection {
  id: string
  from: {
    componentId: string
    pinId: string
  }
  to: {
    componentId: string
    pinId: string
  }
}

export interface SimulationConfig {
  type: "dc" | "ac" | "tran" | "op"
  start?: number
  stop?: number
  step?: number
  points?: number
}

export interface Circuit {
  version: string
  components: Component[]
  connections: Connection[]
  simulation?: SimulationConfig
  metadata?: {
    name?: string
    description?: string
  }
}
