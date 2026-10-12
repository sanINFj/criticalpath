export interface SchematicNodeInput {
  id: string
  type?: string
  data?: {
    type?: string
    label?: string
    value?: string
    rotation?: number
  }
}

export interface SchematicEdgeInput {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface NetlistResult {
  netlist: string
  errors: string[]
  warnings: string[]
}

type ElectricalNode = SchematicNodeInput & {
  data: NonNullable<SchematicNodeInput["data"]>
}

const SUPPORTED_TYPES = new Set([
  "resistor",
  "capacitor",
  "inductor",
  "voltage-source",
  "current-source",
])

function cleanName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_")
}

function getComponentType(node: SchematicNodeInput): string {
  return node.data?.type ?? node.type ?? ""
}

function terminalKey(node: ElectricalNode, handle?: string | null): string {
  if (node.type === "junction") return `${node.id}:junction`

  const componentType = getComponentType(node)
  if (componentType === "ground" || componentType === "vcc") {
    return `${node.id}:pin1`
  }

  return `${node.id}:${handle}`
}

/**
 * Convert the displayed component value into an SPICE numeric value.
 * Examples: 10kΩ -> 10k, 1µF -> 1u, 10MΩ -> 10Meg.
 */
function toSpiceValue(type: string, rawValue: string | undefined): string | null {
  const value = (rawValue ?? "").trim()
  if (!value) return null

  // Diode model names and arbitrary IC values are not numeric parameters.
  if (type === "diode" || type === "generic") return null

  const match = value.match(
    /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*?)$/i,
  )
  if (!match) return null

  const magnitude = match[1]
  const unit = match[2].replace(/\s/g, "")
  // Preserve case before normalizing: MΩ means mega-ohms, while mΩ
  // means milli-ohms. SPICE uses "Meg" for mega and "m" for milli.
  const isMegaOhm =
    type === "resistor" &&
    ["MΩ", "MOhm", "Meg", "Megohm"].includes(unit)
  const normalized = unit.replace(/Ω/g, "ohm").replace(/µ/g, "u").toLowerCase()

  let suffix = ""

  if (type === "resistor") {
    if (isMegaOhm || normalized === "megohm" || normalized === "meg") suffix = "Meg"
    else if (normalized === "ohm" || normalized === "r" || normalized === "") suffix = ""
    else if (normalized === "kohm" || normalized === "k") suffix = "k"
    else if (normalized === "mohm" || normalized === "m") suffix = "m"
    else if (normalized === "gohm" || normalized === "g") suffix = "G"
    else return null
  } else if (type === "capacitor") {
    if (normalized === "f" || normalized === "") suffix = ""
    else if (normalized === "mf") suffix = "m"
    else if (normalized === "uf" || normalized === "u") suffix = "u"
    else if (normalized === "nf" || normalized === "n") suffix = "n"
    else if (normalized === "pf" || normalized === "p") suffix = "p"
    else return null
  } else if (type === "inductor") {
    if (normalized === "h" || normalized === "") suffix = ""
    else if (normalized === "mh" || normalized === "m") suffix = "m"
    else if (normalized === "uh" || normalized === "u") suffix = "u"
    else if (normalized === "nh" || normalized === "n") suffix = "n"
    else if (normalized === "ph" || normalized === "p") suffix = "p"
    else return null
  } else if (type === "voltage-source") {
    if (normalized === "v" || normalized === "") suffix = ""
    else if (normalized === "mv") suffix = "m"
    else if (normalized === "kv") suffix = "k"
    else if (normalized === "uv") suffix = "u"
    else return null
  } else if (type === "current-source") {
    if (normalized === "a" || normalized === "") suffix = ""
    else if (normalized === "ma") suffix = "m"
    else if (normalized === "ua") suffix = "u"
    else if (normalized === "na") suffix = "n"
    else return null
  } else {
    return null
  }

  const numericValue = Number(magnitude)
  if (!Number.isFinite(numericValue)) return null

  return `${magnitude}${suffix}`
}

export function buildSpiceNetlist(
  inputNodes: SchematicNodeInput[],
  edges: SchematicEdgeInput[],
  title = "CriticalPath circuit",
): NetlistResult {
  const errors: string[] = []
  const warnings: string[] = []
  const nodes = inputNodes as ElectricalNode[]
  const nodeById = new Map<string, ElectricalNode>()

  for (const node of nodes) {
    if (!node.id || nodeById.has(node.id)) {
      errors.push(`Missing or duplicate node ID: "${node.id || "(empty)"}".`)
      continue
    }
    nodeById.set(node.id, node)
  }

  const parent = new Map<string, string>()

  function find(key: string): string {
    const current = parent.get(key)
    if (current === undefined) {
      parent.set(key, key)
      return key
    }
    if (current === key) return key
    const root = find(current)
    parent.set(key, root)
    return root
  }

  function union(a: string, b: string): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  // Register terminals for all electrical components.
  for (const node of nodes) {
    const type = getComponentType(node)
    if (node.type === "junction") {
      find(terminalKey(node))
    } else if (type === "ground" || type === "vcc") {
      find(`${node.id}:pin1`)
    } else {
      find(`${node.id}:pin1`)
      find(`${node.id}:pin2`)
    }
  }

  // Every edge joins its endpoint terminals. Its drawing path is irrelevant.
  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)

    if (!source || !target) {
      errors.push(`Wire "${edge.id}" references a missing component or junction.`)
      continue
    }

    const sourceType = getComponentType(source)
    const targetType = getComponentType(target)

    if (
      source.type !== "junction" &&
      sourceType !== "ground" &&
      sourceType !== "vcc" &&
      edge.sourceHandle !== "pin1" &&
      edge.sourceHandle !== "pin2"
    ) {
      errors.push(`Wire "${edge.id}" has an invalid source terminal.`)
      continue
    }

    if (
      target.type !== "junction" &&
      targetType !== "ground" &&
      targetType !== "vcc" &&
      edge.targetHandle !== "pin1" &&
      edge.targetHandle !== "pin2"
    ) {
      errors.push(`Wire "${edge.id}" has an invalid target terminal.`)
      continue
    }

    if (
      (sourceType === "ground" || sourceType === "vcc") &&
      edge.sourceHandle != null &&
      edge.sourceHandle !== "pin1"
    ) {
      errors.push(`Wire "${edge.id}" connects to an invalid single-pin source terminal.`)
      continue
    }

    if (
      (targetType === "ground" || targetType === "vcc") &&
      edge.targetHandle != null &&
      edge.targetHandle !== "pin1"
    ) {
      errors.push(`Wire "${edge.id}" connects to an invalid single-pin target terminal.`)
      continue
    }

    union(
      terminalKey(source, edge.sourceHandle),
      terminalKey(target, edge.targetHandle),
    )
  }

  // All VCC markers are global labels for the same named supply net.
  const vccNodes = nodes.filter((node) => getComponentType(node) === "vcc")
  for (let i = 1; i < vccNodes.length; i++) {
    union(`${vccNodes[0].id}:pin1`, `${vccNodes[i].id}:pin1`)
  }

  const groundNodes = nodes.filter((node) => getComponentType(node) === "ground")
  if (groundNodes.length === 0) {
    errors.push("Add a Ground symbol before generating a SPICE netlist.")
  }

  // Map connected terminal groups to stable SPICE node names.
  const rootNames = new Map<string, string>()
  const rootGrounds = new Set<string>()
  const rootVccs = new Set<string>()

  for (const node of groundNodes) rootGrounds.add(find(`${node.id}:pin1`))
  for (const node of vccNodes) rootVccs.add(find(`${node.id}:pin1`))

  for (const root of rootGrounds) {
    if (rootVccs.has(root)) {
      errors.push("The VCC net is connected directly to Ground.")
    }
    rootNames.set(root, "0")
  }
  for (const root of rootVccs) {
    if (!rootNames.has(root)) rootNames.set(root, "vcc")
  }

  let nextNet = 1
  function netName(node: ElectricalNode, pin: "pin1" | "pin2"): string {
    const root = find(`${node.id}:${pin}`)
    const existing = rootNames.get(root)
    if (existing) return existing
    const name = `N${String(nextNet++).padStart(3, "0")}`
    rootNames.set(root, name)
    return name
  }

  const lines: string[] = [
    `* ${title.replace(/[\r\n]/g, " ")}`,
  ]

  const seenNames = new Set<string>()

  for (const node of nodes) {
    const type = getComponentType(node)
    if (node.type === "junction" || type === "ground" || type === "vcc") continue

    if (!SUPPORTED_TYPES.has(type)) {
      errors.push(
        `${node.data?.label ?? node.id}: "${type || "unknown"}" is not supported by the first SPICE exporter.`,
      )
      continue
    }

    const designator = cleanName(node.data?.label || node.id)
    const uniqueKey = designator.toLowerCase()

    if (seenNames.has(uniqueKey)) {
      errors.push(`Duplicate component designator "${designator}".`)
      continue
    }
    seenNames.add(uniqueKey)

    const value = toSpiceValue(type, node.data?.value)
    if (!value) {
      errors.push(
        `${designator}: invalid or missing value "${node.data?.value ?? ""}".`,
      )
      continue
    }

    const pin1 = netName(node, "pin1")
    const pin2 = netName(node, "pin2")

    if (type === "resistor") lines.push(`${designator} ${pin1} ${pin2} ${value}`)
    else if (type === "capacitor") lines.push(`${designator} ${pin1} ${pin2} ${value}`)
    else if (type === "inductor") lines.push(`${designator} ${pin1} ${pin2} ${value}`)
    else if (type === "voltage-source") lines.push(`${designator} ${pin1} ${pin2} DC ${value}`)
    else if (type === "current-source") lines.push(`${designator} ${pin1} ${pin2} DC ${value}`)
  }

  if (lines.length === 1) {
    warnings.push("No supported electrical components were found.")
  }

  lines.push(".op", ".end")

  return {
    netlist: lines.join("\n") + "\n",
    errors,
    warnings,
  }
}
