import type { Node, Edge } from "reactflow"
import {
  type SchematicNodeData,
} from "../components/schematic/SchematicNode"

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  nodeId: string
}

export interface Point {
  x: number
  y: number
}

/**
 * Returns the 20px-grid aligned bounding box for a schematic component node.
 * Includes component body and margin to prevent wires from passing through or overlapping.
 */
export function getNodeBoundingBox(node: Node<SchematicNodeData>): BoundingBox {
  const rot = (((node.data?.rotation ?? 0) % 360) + 360) % 360
  const isVertical = rot === 90 || rot === 270
  const nx = Math.round(node.position.x / 20) * 20
  const ny = Math.round(node.position.y / 20) * 20

  // 120x80 component box. Pins are at extremities (0,40) and (120,40) horizontally,
  // or (60,0) and (60,80) vertically.
  // The obstacle box protects only the core component body interior, ensuring
  // that terminal pins are outside and never falsely flagged as colliding.
  if (isVertical) {
    return {
      minX: nx + 30,
      maxX: nx + 90,
      minY: ny + 20,
      maxY: ny + 60,
      nodeId: node.id,
    }
  }

  return {
    minX: nx + 25,
    maxX: nx + 95,
    minY: ny + 15,
    maxY: ny + 65,
    nodeId: node.id,
  }
}

/**
 * Get all component obstacle boxes, excluding any specified node IDs (e.g. source/target).
 */
export function getComponentObstacles(
  nodes: Node<SchematicNodeData>[],
  excludeNodeIds: (string | undefined)[] = [],
): BoundingBox[] {
  const excludeSet = new Set(excludeNodeIds.filter(Boolean))
  return nodes
    .filter((n) => n.type === "schematic" && !excludeSet.has(n.id))
    .map(getNodeBoundingBox)
}

/**
 * Checks if an orthogonal line segment strictly crosses through an obstacle bounding box.
 */
export function doesSegmentIntersectBox(p1: Point, p2: Point, box: BoundingBox): boolean {
  const minX = Math.min(p1.x, p2.x)
  const maxX = Math.max(p1.x, p2.x)
  const minY = Math.min(p1.y, p2.y)
  const maxY = Math.max(p1.y, p2.y)

  // Horizontal segment
  if (minY === maxY) {
    const y = minY
    // Segment must overlap in X and Y must be strictly inside the box interior
    return minX < box.maxX && maxX > box.minX && y > box.minY && y < box.maxY
  }

  // Vertical segment
  if (minX === maxX) {
    const x = minX
    // Segment must overlap in Y and X must be strictly inside the box interior
    return minY < box.maxY && maxY > box.minY && x > box.minX && x < box.maxX
  }

  return false
}

/**
 * Checks if a polyline (array of orthogonal points) intersects any of the obstacles.
 */
export function doesPathIntersectObstacles(points: Point[], obstacles: BoundingBox[]): boolean {
  if (points.length < 2 || obstacles.length === 0) return false

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    for (const box of obstacles) {
      if (doesSegmentIntersectBox(p1, p2, box)) {
        return true
      }
    }
  }

  return false
}

/**
 * Check whether a specific point (x, y) is inside or too close to an obstacle.
 */
function isPointInObstacle(x: number, y: number, box: BoundingBox, clearance = 0): boolean {
  return (
    x >= box.minX - clearance &&
    x <= box.maxX + clearance &&
    y >= box.minY - clearance &&
    y <= box.maxY + clearance
  )
}

/**
 * Priority queue item for A* search.
 */
interface PQNode {
  x: number
  y: number
  dir: "h" | "v" | "start"
  g: number
  f: number
  parent: PQNode | null
}

/**
 * Fast Min-Heap for A* router.
 */
class MinHeap {
  private data: PQNode[] = []

  push(val: PQNode) {
    this.data.push(val)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): PQNode | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const bottom = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = bottom
      this.sinkDown(0)
    }
    return top
  }

  get size(): number {
    return this.data.length
  }

  private bubbleUp(idx: number) {
    while (idx > 0) {
      const pIdx = (idx - 1) >> 1
      if (this.data[idx].f < this.data[pIdx].f) {
        const tmp = this.data[idx]
        this.data[idx] = this.data[pIdx]
        this.data[pIdx] = tmp
        idx = pIdx
      } else {
        break
      }
    }
  }

  private sinkDown(idx: number) {
    const len = this.data.length
    while (true) {
      let smallest = idx
      const left = (idx << 1) + 1
      const right = left + 1

      if (left < len && this.data[left].f < this.data[smallest].f) {
        smallest = left
      }
      if (right < len && this.data[right].f < this.data[smallest].f) {
        smallest = right
      }
      if (smallest !== idx) {
        const tmp = this.data[idx]
        this.data[idx] = this.data[smallest]
        this.data[smallest] = tmp
        idx = smallest
      } else {
        break
      }
    }
  }
}

/**
 * Simplify collinear orthogonal points.
 */
export function simplifyPoints(points: Point[]): Point[] {
  if (points.length <= 2) return points
  const res: Point[] = [points[0]]

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

/**
 * A* Orthogonal Maze Router on 20px CAD Grid.
 * Finds a strictly orthogonal path from start to goal that routes around all obstacles.
 */
export function routeOrthogonalAvoidance(
  start: Point,
  goal: Point,
  obstacles: BoundingBox[],
  gridStep = 20,
): Point[] {
  const sx = Math.round(start.x / gridStep) * gridStep
  const sy = Math.round(start.y / gridStep) * gridStep
  const gx = Math.round(goal.x / gridStep) * gridStep
  const gy = Math.round(goal.y / gridStep) * gridStep

  if (sx === gx && sy === gy) {
    return [{ x: sx, y: sy }]
  }

  // Calculate search bounding box
  let minSearchX = Math.min(sx, gx) - 80
  let maxSearchX = Math.max(sx, gx) + 80
  let minSearchY = Math.min(sy, gy) - 80
  let maxSearchY = Math.max(sy, gy) + 80

  for (const obs of obstacles) {
    minSearchX = Math.min(minSearchX, obs.minX - 60)
    maxSearchX = Math.max(maxSearchX, obs.maxX + 60)
    minSearchY = Math.min(minSearchY, obs.minY - 60)
    maxSearchY = Math.max(maxSearchY, obs.maxY + 60)
  }

  const manhattan = (x1: number, y1: number, x2: number, y2: number) =>
    Math.abs(x1 - x2) + Math.abs(y1 - y2)

  const openHeap = new MinHeap()
  const closedSet = new Set<string>()
  const gScores = new Map<string, number>()

  const startNode: PQNode = {
    x: sx,
    y: sy,
    dir: "start",
    g: 0,
    f: manhattan(sx, sy, gx, gy),
    parent: null,
  }

  openHeap.push(startNode)
  gScores.set(`${sx},${sy},start`, 0)

  const turnPenalty = 50 // Penalize 90-degree turns to prefer long straight lines
  const directions = [
    { dx: gridStep, dy: 0, dir: "h" as const },
    { dx: -gridStep, dy: 0, dir: "h" as const },
    { dx: 0, dy: gridStep, dir: "v" as const },
    { dx: 0, dy: -gridStep, dir: "v" as const },
  ]

  let bestNode: PQNode | null = null
  let iterations = 0
  const maxIterations = 2500

  while (openHeap.size > 0 && iterations++ < maxIterations) {
    const current = openHeap.pop()!

    if (current.x === gx && current.y === gy) {
      bestNode = current
      break
    }

    const stateKey = `${current.x},${current.y},${current.dir}`
    if (closedSet.has(stateKey)) continue
    closedSet.add(stateKey)

    for (const d of directions) {
      const nx = current.x + d.dx
      const ny = current.y + d.dy

      // Bounds check
      if (nx < minSearchX || nx > maxSearchX || ny < minSearchY || ny > maxSearchY) {
        continue
      }

      // Obstacle check: goal node is always allowed
      const isGoal = nx === gx && ny === gy
      if (!isGoal) {
        let blocked = false
        for (const obs of obstacles) {
          if (isPointInObstacle(nx, ny, obs)) {
            blocked = true
            break
          }
        }
        if (blocked) continue
      }

      const isTurn = current.dir !== "start" && current.dir !== d.dir
      const tentativeG = current.g + gridStep + (isTurn ? turnPenalty : 0)

      const neighborKey = `${nx},${ny},${d.dir}`
      const prevG = gScores.get(neighborKey) ?? Infinity

      if (tentativeG < prevG) {
        gScores.set(neighborKey, tentativeG)
        const f = tentativeG + manhattan(nx, ny, gx, gy)
        const nextNode: PQNode = {
          x: nx,
          y: ny,
          dir: d.dir,
          g: tentativeG,
          f,
          parent: current,
        }
        openHeap.push(nextNode)
      }
    }
  }

  if (!bestNode) {
    // Fallback: simple orthogonal corner
    return [
      { x: sx, y: sy },
      { x: gx, y: sy },
      { x: gx, y: gy },
    ]
  }

  // Reconstruct path
  const path: Point[] = []
  let curr: PQNode | null = bestNode
  while (curr) {
    path.unshift({ x: curr.x, y: curr.y })
    curr = curr.parent
  }

  return simplifyPoints(path)
}

/**
 * Route a wire connecting start to end while routing around any component obstacles.
 * Returns the intermediate waypoints (excluding start and end) to be stored on edge.data.waypoints.
 */
export function computeAvoidanceWaypoints(
  start: Point,
  end: Point,
  obstacles: BoundingBox[],
): Point[] {
  if (obstacles.length === 0) return []

  const sx = Math.round(start.x / 20) * 20
  const sy = Math.round(start.y / 20) * 20
  const ex = Math.round(end.x / 20) * 20
  const ey = Math.round(end.y / 20) * 20

  // 1. Direct straight line if on the same axis
  if (sx === ex || sy === ey) {
    const directStraight = [{ x: sx, y: sy }, { x: ex, y: ey }]
    if (!doesPathIntersectObstacles(directStraight, obstacles)) {
      return []
    }

    // Collinear endpoints with obstacles in between: test clean orthogonal bypass
    if (sy === ey) {
      for (const offset of [40, -40, 60, -60, 80, -80, 100, -100]) {
        const bypassY = sy + offset
        const bypassPath = [
          { x: sx, y: sy },
          { x: sx, y: bypassY },
          { x: ex, y: bypassY },
          { x: ex, y: ey },
        ]
        if (!doesPathIntersectObstacles(bypassPath, obstacles)) {
          return [{ x: sx, y: bypassY }, { x: ex, y: bypassY }]
        }
      }
    } else {
      for (const offset of [40, -40, 60, -60, 80, -80, 100, -100]) {
        const bypassX = sx + offset
        const bypassPath = [
          { x: sx, y: sy },
          { x: bypassX, y: sy },
          { x: bypassX, y: ey },
          { x: ex, y: ey },
        ]
        if (!doesPathIntersectObstacles(bypassPath, obstacles)) {
          return [{ x: bypassX, y: sy }, { x: bypassX, y: ey }]
        }
      }
    }
  }

  // 2. Test standard midpoint Z-step
  const midX = Math.round(((sx + ex) / 2) / 20) * 20
  const pathStep = [
    { x: sx, y: sy },
    { x: midX, y: sy },
    { x: midX, y: ey },
    { x: ex, y: ey },
  ]
  if (!doesPathIntersectObstacles(pathStep, obstacles)) {
    return []
  }

  // 3. Test clean 1-bend L-paths (Corner-HV and Corner-VH)
  const pathHV = [{ x: sx, y: sy }, { x: ex, y: sy }, { x: ex, y: ey }]
  if (!doesPathIntersectObstacles(pathHV, obstacles)) {
    return [{ x: ex, y: sy }]
  }

  const pathVH = [{ x: sx, y: sy }, { x: sx, y: ey }, { x: ex, y: ey }]
  if (!doesPathIntersectObstacles(pathVH, obstacles)) {
    return [{ x: sx, y: ey }]
  }

  // 4. Path collides with an obstacle -> run A* maze router
  const fullRouted = routeOrthogonalAvoidance({ x: sx, y: sy }, { x: ex, y: ey }, obstacles)
  if (fullRouted.length <= 2) {
    return []
  }

  return fullRouted.slice(1, -1)
}

/**
 * Resolves or auto-routes edge waypoints for an edge given current schematic nodes.
 */
export function getRoutedEdgeWaypoints(
  edge: Edge,
  nodes: Node<SchematicNodeData>[],
  getPinCoordFn: (node: Node, handleId?: string | null) => Point,
): Point[] | undefined {
  const srcNode = nodes.find((n) => n.id === edge.source)
  const tgtNode = nodes.find((n) => n.id === edge.target)
  if (!srcNode || !tgtNode) return undefined

  const p1 = getPinCoordFn(srcNode, edge.sourceHandle)
  const p2 = getPinCoordFn(tgtNode, edge.targetHandle)
  // If edge has existing waypoints, always preserve them to prevent distortion on load or tab switch
  if (edge.data?.waypoints && edge.data.waypoints.length > 0) {
    return edge.data.waypoints
  }

  const obstacles = getComponentObstacles(nodes, [srcNode.id, tgtNode.id])
  const waypoints = computeAvoidanceWaypoints(p1, p2, obstacles)
  return waypoints.length > 0 ? waypoints : undefined
}

/**
 * Constructs clean, 100% strictly orthogonal (90-degree) draft waypoints from
 * committed draft points up to the current target point, adhering to bendOrientation
 * and avoiding component obstacles if necessary.
 */
export function buildOrthogonalDraftPoints(
  draftPoints: Point[],
  targetPoint: Point,
  bendOrientation: "h" | "v" = "h",
  obstacles: BoundingBox[] = [],
): Point[] {
  if (draftPoints.length === 0) return [targetPoint]

  const rawPts = [...draftPoints, targetPoint]
  const cleanPts: Point[] = [rawPts[0]]
  let curOri = bendOrientation

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

  if (obstacles.length > 0 && doesPathIntersectObstacles(cleanPts, obstacles)) {
    const lastCommitted = draftPoints[draftPoints.length - 1]
    const waypoints = computeAvoidanceWaypoints(lastCommitted, targetPoint, obstacles)
    if (waypoints.length > 0) {
      return [...draftPoints.slice(0, -1), lastCommitted, ...waypoints, targetPoint]
    }
  }

  return cleanPts
}
