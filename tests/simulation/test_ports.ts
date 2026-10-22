import { generateSpiceNetlist } from '../../src/renderer/src/utils/spiceNetlist'
import { getRotatedPinPos } from '../../src/renderer/src/components/schematic/SchematicNode'
import type { Node, Edge } from 'reactflow'
import type { SchematicNodeData } from '../../src/renderer/src/components/schematic/SchematicNode'
import { spawnSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const ngspiceExe = path.resolve(__dirname, '../../simulation/ngspice/Spice64/bin/ngspice_con.exe')

function runSpice(netlist: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test_sim_'))
  const cirFile = path.join(tmpDir, 'test.cir')
  const rawFile = path.join(tmpDir, 'test.raw')
  fs.writeFileSync(cirFile, netlist, 'utf-8')
  const res = spawnSync(ngspiceExe, ['-b', '-r', rawFile, cirFile], { cwd: tmpDir, encoding: 'utf-8' })
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
  return { stdout: res.stdout, stderr: res.stderr, status: res.status }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('=== TEST 1: Direct Voltage Divider with Wires ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'R1', type: 'schematic', position: { x: 300, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
    { id: 'R2', type: 'schematic', position: { x: 300, y: 300 }, data: { label: 'R2', type: 'resistor', value: '1k' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e2', source: 'R1', sourceHandle: 'pin2', target: 'R2', targetHandle: 'pin1' },
    { id: 'e3', source: 'R2', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e4', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 1 netlist generation succeeded')
  assert(result.errors.length === 0, 'Test 1 has no errors')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 1 ngspice exit code is 0')
}

console.log('\n=== TEST 2: Input & Output Ports Connecting Separate Schematic Sections ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'PORT_OUT', type: 'schematic', position: { x: 200, y: 100 }, data: { label: 'IN', type: 'port-out', value: 'IN' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },

    { id: 'PORT_IN', type: 'schematic', position: { x: 400, y: 100 }, data: { label: 'IN', type: 'port-in', value: 'IN' } },
    { id: 'R1', type: 'schematic', position: { x: 600, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
    { id: 'R2', type: 'schematic', position: { x: 600, y: 300 }, data: { label: 'R2', type: 'resistor', value: '1k' } },
    { id: 'GND2', type: 'schematic', position: { x: 600, y: 500 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'PORT_OUT', targetHandle: 'pin1' },
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e3', source: 'PORT_IN', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e4', source: 'R1', sourceHandle: 'pin2', target: 'R2', targetHandle: 'pin1' },
    { id: 'e5', source: 'R2', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 2 netlist generation succeeded')
  assert(result.errors.length === 0, 'Test 2 has no errors')
  assert(result.nodePinNetMap['V1']['pin1'] === 'IN', 'V1 pin1 tied to net IN')
  assert(result.nodePinNetMap['R1']['pin1'] === 'IN', 'R1 pin1 tied to net IN via port')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 2 ngspice exit code is 0')
}

console.log('\n=== TEST 3: Bidirectional Ports Connecting Circuit Blocks ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '5' } },
    { id: 'PORT_BI1', type: 'schematic', position: { x: 200, y: 100 }, data: { label: 'BUS', type: 'port-bi', value: 'BUS' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },

    { id: 'PORT_BI2', type: 'schematic', position: { x: 400, y: 100 }, data: { label: 'BUS', type: 'port-bi', value: 'BUS' } },
    { id: 'R1', type: 'schematic', position: { x: 600, y: 100 }, data: { label: 'R1', type: 'resistor', value: '2.2k' } },
    { id: 'GND2', type: 'schematic', position: { x: 600, y: 300 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'PORT_BI1', targetHandle: 'pin1' },
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e3', source: 'PORT_BI2', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e4', source: 'R1', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 3 bidirectional port succeeded')
  assert(result.nodePinNetMap['V1']['pin1'] === 'BUS', 'V1 pin1 tied to BUS')
  assert(result.nodePinNetMap['R1']['pin1'] === 'BUS', 'R1 pin1 tied to BUS')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 3 ngspice exit code is 0')
}

console.log('\n=== TEST 4: Repeated Same-Name Ports Across Multiple (3+) Sections ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    // Source
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '12' } },
    { id: 'P_SRC', type: 'schematic', position: { x: 250, y: 100 }, data: { label: 'PWR_12V', type: 'port-out', value: 'PWR_12V' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 250 }, data: { label: 'GND', type: 'ground' } },

    // Load 1
    { id: 'P_LD1', type: 'schematic', position: { x: 400, y: 100 }, data: { label: 'PWR_12V', type: 'port-in', value: 'PWR_12V' } },
    { id: 'R1', type: 'schematic', position: { x: 550, y: 100 }, data: { label: 'R1', type: 'resistor', value: '100' } },
    { id: 'GND2', type: 'schematic', position: { x: 550, y: 250 }, data: { label: 'GND', type: 'ground' } },

    // Load 2
    { id: 'P_LD2', type: 'schematic', position: { x: 700, y: 100 }, data: { label: 'PWR_12V', type: 'port-in', value: 'PWR_12V' } },
    { id: 'R2', type: 'schematic', position: { x: 850, y: 100 }, data: { label: 'R2', type: 'resistor', value: '200' } },
    { id: 'GND3', type: 'schematic', position: { x: 850, y: 250 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'P_SRC', targetHandle: 'pin1' },
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e3', source: 'P_LD1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e4', source: 'R1', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
    { id: 'e5', source: 'P_LD2', sourceHandle: 'pin1', target: 'R2', targetHandle: 'pin1' },
    { id: 'e6', source: 'R2', sourceHandle: 'pin2', target: 'GND3', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 4 multiple sections succeeded')
  assert(result.nodePinNetMap['V1']['pin1'] === 'PWR_12V', 'V1 on PWR_12V')
  assert(result.nodePinNetMap['R1']['pin1'] === 'PWR_12V', 'Load 1 on PWR_12V')
  assert(result.nodePinNetMap['R2']['pin1'] === 'PWR_12V', 'Load 2 on PWR_12V')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 4 ngspice exit code is 0')
}

console.log('\n=== TEST 5: Direct Pin-to-Port Colocation (Zero-Length Wire) ===')
{
  // Port placed right on top of R1 pin1 (R1 pin1 at 300, 140; port pin1 at 300, 140)
  // Port-in base pin1 is at (120, 40), so node position (180, 100) puts pin1 at (300, 140)
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'P_SRC', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'SIG', type: 'port-out', value: 'SIG' } }, // placed on V1
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },

    { id: 'P_LOAD', type: 'schematic', position: { x: 400, y: 100 }, data: { label: 'SIG', type: 'port-in', value: 'SIG' } },
    { id: 'R1', type: 'schematic', position: { x: 520, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } }, // R1 pin1 at (520, 140), P_LOAD pin1 at (400+120, 100+40) = (520, 140)
    { id: 'GND2', type: 'schematic', position: { x: 520, y: 300 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'P_SRC', targetHandle: 'pin1' },
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    // Notice: NO edge between P_LOAD and R1! They are colocated at (520, 140)
    { id: 'e3', source: 'R1', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 5 colocation succeeded')
  assert(result.nodePinNetMap['R1']['pin1'] === 'SIG', 'R1 pin1 colocated with port inherits net SIG')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 5 ngspice exit code is 0')
}

console.log('\n=== TEST 6: Wire T-Junction With Junction Dot ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '5' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },
    // Junction dot on wire e1 between V1 and R1
    { id: 'junc1', type: 'junction', position: { x: 250, y: 136 }, data: { label: '', type: 'generic' } },
    { id: 'P_TAP', type: 'schematic', position: { x: 250, y: 20 }, data: { label: 'TAP', type: 'port-out', value: 'TAP' } },

    { id: 'R1', type: 'schematic', position: { x: 400, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
    { id: 'GND2', type: 'schematic', position: { x: 400, y: 300 }, data: { label: 'GND', type: 'ground' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' }, // passes through (250, 140)
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e3', source: 'P_TAP', sourceHandle: 'pin1', target: 'junc1', targetHandle: 'pin1' },
    { id: 'e4', source: 'R1', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 6 junction dot tap succeeded')
  assert(result.nodePinNetMap['V1']['pin1'] === 'TAP', 'Wire net labeled TAP via junction dot tap')
  assert(result.nodePinNetMap['R1']['pin1'] === 'TAP', 'R1 pin1 on TAP net')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 6 ngspice exit code is 0')
}

console.log('\n=== TEST 7: Disconnected Port (Does Not Emit Floating SPICE Node) ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'R1', type: 'schematic', position: { x: 300, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
    { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },
    // Completely unattached port sitting in the schematic
    { id: 'P_DISC', type: 'schematic', position: { x: 500, y: 500 }, data: { label: 'FLOATING_PORT', type: 'port-in', value: 'FLOATING_PORT' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e2', source: 'R1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
    { id: 'e3', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 7 netlist succeeded despite disconnected port')
  // Verify netlist text does NOT contain FLOATING_PORT as a device node
  assert(!result.netlist.includes('FLOATING_PORT'), 'SPICE netlist does not emit floating port device lines')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 7 ngspice exit code is 0')
}

console.log('\n=== TEST 8: Rotated Ports (0°, 90°, 180°, 270°) ===')
{
  // Test rotations of ports to ensure getRotatedPinPos handles match exact wire coordinates
  for (const rot of [0, 90, 180, 270]) {
    const rotPin = getRotatedPinPos({ x: 120, y: 40 }, rot)
    // Create port at position such that rotPin lands at (200, 140)
    const portPos = { x: 200 - rotPin.x, y: 140 - rotPin.y }
    const nodes: Node<SchematicNodeData>[] = [
      { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '5' } },
      { id: 'P_ROT', type: 'schematic', position: portPos, data: { label: `ROT_${rot}`, type: 'port-out', value: `ROT_${rot}`, rotation: rot } },
      { id: 'GND1', type: 'schematic', position: { x: 100, y: 300 }, data: { label: 'GND', type: 'ground' } },
      { id: 'P_IN', type: 'schematic', position: { x: 300, y: 100 }, data: { label: `ROT_${rot}`, type: 'port-in', value: `ROT_${rot}` } },
      { id: 'R1', type: 'schematic', position: { x: 500, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
      { id: 'GND2', type: 'schematic', position: { x: 500, y: 300 }, data: { label: 'GND', type: 'ground' } },
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'P_ROT', targetHandle: 'pin1' },
      { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'GND1', targetHandle: 'pin1' },
      { id: 'e3', source: 'P_IN', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
      { id: 'e4', source: 'R1', sourceHandle: 'pin2', target: 'GND2', targetHandle: 'pin1' },
    ]
    const result = generateSpiceNetlist(nodes, edges)
    assert(result.success, `Test 8 (rot=${rot}°) netlist generation succeeded`)
    assert(result.nodePinNetMap['V1']['pin1'] === `ROT_${rot}`, `V1 pin1 on ROT_${rot}`)
    assert(result.nodePinNetMap['R1']['pin1'] === `ROT_${rot}`, `R1 pin1 on ROT_${rot}`)
    const spice = runSpice(result.netlist)
    assert(spice.status === 0, `Test 8 (rot=${rot}°) ngspice exit code is 0`)
  }
}

console.log('\n=== TEST 9: Port Named GND/0 Serving as Circuit Ground ===')
{
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'R1', type: 'schematic', position: { x: 300, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
    // Instead of ground symbol, user placed a port-in labeled "GND"
    { id: 'P_GND', type: 'schematic', position: { x: 200, y: 300 }, data: { label: 'GND', type: 'port-in', value: 'GND' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e2', source: 'R1', sourceHandle: 'pin2', target: 'P_GND', targetHandle: 'pin1' },
    { id: 'e3', source: 'V1', sourceHandle: 'pin2', target: 'P_GND', targetHandle: 'pin1' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(result.success, 'Test 9 port-based GND succeeded')
  assert(result.stats.groundConnected, 'Ground recognized via port named GND')
  assert(result.nodePinNetMap['V1']['pin2'] === '0', 'V1 pin2 mapped to node 0')
  const spice = runSpice(result.netlist)
  assert(spice.status === 0, 'Test 9 ngspice exit code is 0')
}

console.log('\n=== TEST 10: Genuine Error Detection (Not Suppressed) ===')
{
  // A circuit with NO ground reference at all -> must be detected as MISSING_GROUND error
  const nodes: Node<SchematicNodeData>[] = [
    { id: 'V1', type: 'schematic', position: { x: 100, y: 100 }, data: { label: 'V1', type: 'voltage-source', value: '10' } },
    { id: 'R1', type: 'schematic', position: { x: 300, y: 100 }, data: { label: 'R1', type: 'resistor', value: '1k' } },
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'V1', sourceHandle: 'pin1', target: 'R1', targetHandle: 'pin1' },
    { id: 'e2', source: 'V1', sourceHandle: 'pin2', target: 'R1', targetHandle: 'pin2' },
  ]
  const result = generateSpiceNetlist(nodes, edges)
  assert(!result.success, 'Test 10 fails validation when no ground is present')
  assert(result.errors.some(e => e.code === 'MISSING_GROUND'), 'Genuine MISSING_GROUND error correctly reported')
}

console.log('\n=============================================')
console.log('ALL 10 TEST SUITES PASSED FLAWLESSLY!')
console.log('=============================================')
