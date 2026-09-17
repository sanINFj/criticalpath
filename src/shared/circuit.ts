export type ComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "voltage-source"
  | "current-source"
  | "diode"
  | "transistor"
  | "opamp"
  | "logic-gate"
  | "ground"

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
