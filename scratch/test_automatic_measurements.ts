import { calculateAutomaticMeasurements } from "../src/renderer/src/utils/automaticMeasurements"
import type { SimulationRunResult } from "../src/shared/simulation"

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`)
    throw new Error(message)
  }
}

function assertClose(actual: number | null | undefined, expected: number, tolerance: number, name: string) {
  if (actual === null || actual === undefined || isNaN(actual)) {
    throw new Error(`Expected number for ${name}, got ${actual}`)
  }
  const diff = Math.abs(actual - expected)
  if (diff > tolerance) {
    throw new Error(`${name}: expected ${expected} ± ${tolerance}, got ${actual} (diff: ${diff})`)
  }
  console.log(`  ✓ ${name}: ${actual.toPrecision(5)} (expected ${expected} ± ${tolerance})`)
}

console.log("=== RUNNING AUTOMATIC MEASUREMENTS TEST SUITE ===")

// ==========================================
// TEST 1: Transient Analysis (RC Step Response)
// ==========================================
console.log("\n[Test 1] Transient RC Step Response (tau = 1ms, Vstep = 5V)")
{
  const timePts: number[] = []
  const vOutPts: number[] = []
  const tau = 1e-3 // 1ms
  const vStep = 5.0
  const tEnd = 10e-3 // 10ms
  const n = 500

  for (let i = 0; i <= n; i++) {
    const t = (i / n) * tEnd
    timePts.push(t)
    vOutPts.push(vStep * (1 - Math.exp(-t / tau)))
  }

  const simResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "Circuit: RC Step Test",
    stderr: "",
    elapsedMs: 25,
    analysisType: "TRANSIENT",
    pointCount: timePts.length,
    xVariable: "time",
    variables: [
      { index: 0, name: "time", type: "time", unit: "s" },
      { index: 1, name: "v(out)", type: "voltage", unit: "V" }
    ],
    data: {
      time: timePts,
      "v(out)": vOutPts
    }
  }

  const report = calculateAutomaticMeasurements(simResult, "v(out)")
  assert(report.signalName === "v(out)", "Signal name matches")
  assert(report.analysisType === "TRANSIENT", "Analysis type detected as TRANSIENT")

  const m = Object.fromEntries(report.measurements.map((x) => [x.id, x]))

  // Theoretical 10%-90% rise time: tau * ln(0.9 / 0.1) = tau * ln(9) = ~2.1972 ms
  const expectedRiseTime = tau * Math.log(9)
  assertClose(m["tran_rise_time"].numericValue, expectedRiseTime, 5e-5, "Rise Time")

  // Peak voltage should be close to 5V (at 10ms: 5 * (1 - e^-10) = 4.99977V)
  assertClose(m["tran_peak"].numericValue, 5.0, 0.01, "Peak Voltage")

  // Min voltage should be 0V
  assertClose(m["tran_min"].numericValue, 0.0, 0.001, "Min Voltage")

  // Overshoot on critically damped / overdamped RC step is 0%
  assertClose(m["tran_overshoot"].numericValue, 0.0, 0.1, "Overshoot")

  // Fall time should be insufficient_data since step is purely rising
  assert(
    m["tran_fall_time"].status === "insufficient_data" || m["tran_fall_time"].status === "not_applicable",
    `Fall time should report insufficient data for monotonic rising step, got ${m["tran_fall_time"].status}`
  )
  console.log(`  ✓ Fall time correctly reports: ${m["tran_fall_time"].status} (${m["tran_fall_time"].note})`)
}

// ==========================================
// TEST 2: Transient Underdamped Step (Overshoot & Settling Time)
// ==========================================
console.log("\n[Test 2] Transient Underdamped 2nd-Order Step (Peak = 6.2V, Final = 5.0V)")
{
  const timePts: number[] = []
  const vOutPts: number[] = []
  const tEnd = 20e-3
  const n = 1000
  const omegaN = 1000 // rad/s
  const zeta = 0.3    // damping ratio
  const vFinal = 5.0

  for (let i = 0; i <= n; i++) {
    const t = (i / n) * tEnd
    timePts.push(t)
    // 2nd order step: y(t) = 1 - e^(-zeta*wn*t) / sqrt(1-zeta^2) * sin(wn*sqrt(1-zeta^2)*t + phi)
    const wd = omegaN * Math.sqrt(1 - zeta * zeta)
    const phi = Math.atan2(Math.sqrt(1 - zeta * zeta), zeta)
    const val = vFinal * (1 - (Math.exp(-zeta * omegaN * t) / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t + phi))
    vOutPts.push(val)
  }

  const simResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "Circuit: 2nd Order Step",
    stderr: "",
    elapsedMs: 30,
    analysisType: "TRANSIENT",
    pointCount: timePts.length,
    xVariable: "time",
    variables: [
      { index: 0, name: "time", type: "time", unit: "s" },
      { index: 1, name: "v(node_step)", type: "voltage", unit: "V" }
    ],
    data: {
      time: timePts,
      "v(node_step)": vOutPts
    }
  }

  const report = calculateAutomaticMeasurements(simResult, "v(node_step)")
  const m = Object.fromEntries(report.measurements.map((x) => [x.id, x]))

  // Theoretical overshoot for zeta=0.3: exp(-pi * zeta / sqrt(1 - zeta^2)) = exp(-0.3*pi / sqrt(0.91)) = exp(-0.988) = ~37.23%
  const theoreticalOvershoot = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)) * 100
  assertClose(m["tran_overshoot"].numericValue, theoreticalOvershoot, 2.0, "Percentage Overshoot")

  // Settling time within 2% band: ~ 4 / (zeta * wn) = 4 / 300 = ~13.3ms
  assert(m["tran_settling_time"].numericValue !== null, "Settling time calculated")
  console.log(`  ✓ Settling time: ${m["tran_settling_time"].valueFormatted}`)
}

// ==========================================
// TEST 3: AC Frequency Analysis (1st-Order Low-Pass Filter)
// ==========================================
console.log("\n[Test 3] AC Low-Pass Filter (fc = 1000 Hz, -3dB Bandwidth)")
{
  const freqPts: number[] = []
  const gainLinPts: number[] = []
  const gainDbPts: number[] = []
  const phasePts: number[] = []

  const fc = 1000 // 1 kHz cutoff
  // 100 points per decade from 10 Hz to 100 kHz (4 decades = 400 pts)
  for (let i = 0; i <= 400; i++) {
    const logF = 1 + (i / 400) * 4 // log10(10) to log10(100k)
    const f = Math.pow(10, logF)
    freqPts.push(f)

    const hMag = 1 / Math.sqrt(1 + Math.pow(f / fc, 2))
    const hDb = 20 * Math.log10(hMag)
    const phaseDeg = (-Math.atan(f / fc) * 180) / Math.PI

    gainLinPts.push(hMag)
    gainDbPts.push(hDb)
    phasePts.push(phaseDeg)
  }

  const simResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "Circuit: AC Filter Test",
    stderr: "",
    elapsedMs: 18,
    analysisType: "AC",
    pointCount: freqPts.length,
    xVariable: "frequency",
    variables: [
      { index: 0, name: "frequency", type: "frequency", unit: "Hz" },
      { index: 1, name: "v(filter_out)", type: "voltage", unit: "V" },
      { index: 2, name: "v(filter_out)_db", type: "gain", unit: "dB" },
      { index: 3, name: "v(filter_out)_phase", type: "phase", unit: "°" }
    ],
    data: {
      frequency: freqPts,
      "v(filter_out)": gainLinPts,
      "v(filter_out)_db": gainDbPts,
      "v(filter_out)_phase": phasePts
    }
  }

  const report = calculateAutomaticMeasurements(simResult, "v(filter_out)")
  assert(report.analysisType === "AC", "Detected AC analysis")
  const m = Object.fromEntries(report.measurements.map((x) => [x.id, x]))

  // Max gain: ~1.0 linear (0.0 dB)
  assertClose(m["ac_peak_gain"].numericValue, 1.0, 0.01, "AC Max Gain (Linear)")

  // Companion dB trace check
  const reportDb = calculateAutomaticMeasurements(simResult, "v(filter_out)_db")
  const mDb = Object.fromEntries(reportDb.measurements.map((x) => [x.id, x]))
  assertClose(mDb["ac_peak_gain"].numericValue, 0.0, 0.1, "AC Max Gain (dB)")

  // Cutoff frequency fc (-3dB): should be 1000 Hz
  assertClose(m["ac_cutoff_freq"].numericValue, 1000, 25, "Cutoff Frequency fc (-3dB)")

  // Bandwidth: should be 1000 Hz
  assertClose(m["ac_bandwidth"].numericValue, 1000, 25, "Bandwidth (-3dB)")

  // Cutoff phase: should be -45 deg
  assertClose(m["ac_cutoff_phase"].numericValue, -45.0, 2.0, "Phase at Cutoff")
}

// ==========================================
// TEST 4: DC Sweep & DC Operating Point
// ==========================================
console.log("\n[Test 4] DC Transfer Sweep (Divider 1:1, Vin 0..10V)")
{
  const vInPts: number[] = []
  const vOutPts: number[] = []

  for (let v = 0; v <= 10; v += 0.1) {
    vInPts.push(v)
    vOutPts.push(v * 0.5) // 50% voltage divider
  }

  const simResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "Circuit: DC Sweep Test",
    stderr: "",
    elapsedMs: 12,
    analysisType: "DC",
    pointCount: vInPts.length,
    xVariable: "v-sweep",
    variables: [
      { index: 0, name: "v-sweep", type: "voltage", unit: "V" },
      { index: 1, name: "v(div)", type: "voltage", unit: "V" }
    ],
    data: {
      "v-sweep": vInPts,
      "v(div)": vOutPts
    }
  }

  const report = calculateAutomaticMeasurements(simResult, "v(div)")
  assert(report.analysisType === "DC", "Detected DC analysis")
  const m = Object.fromEntries(report.measurements.map((x) => [x.id, x]))

  // Min = 0V, Max = 5V, Span = 5V
  assertClose(m["dc_min"].numericValue, 0.0, 0.001, "DC Min")
  assertClose(m["dc_max"].numericValue, 5.0, 0.001, "DC Max")
  assertClose(m["dc_span"].numericValue, 5.0, 0.001, "DC Span")

  // Transfer slope dY/dX = 0.5
  assertClose(m["dc_slope"].numericValue, 0.5, 0.001, "DC Transfer Slope (Gain)")

  // Quiescent point at X = 0 -> 0V
  assertClose(m["dc_zero_bias"].numericValue, 0.0, 0.001, "DC Quiescent Bias (X=0)")

  // DC Operating Point (.op)
  const opSimResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "Circuit: DC OP Test",
    stderr: "",
    elapsedMs: 5,
    analysisType: "OP",
    pointCount: 1,
    variables: [{ index: 0, name: "v(node_op)", type: "voltage", unit: "V" }],
    data: { "v(node_op)": [3.3] }
  }
  const opReport = calculateAutomaticMeasurements(opSimResult, "v(node_op)")
  assert(opReport.analysisType === "OP", "Detected OP analysis")
  const opM = Object.fromEntries(opReport.measurements.map((x) => [x.id, x]))
  assertClose(opM["op_bias"].numericValue, 3.3, 0.001, "DC Operating Point Bias")
}

// ==========================================
// TEST 5: Insufficient Data / Edge Cases Handling
// ==========================================
console.log("\n[Test 5] Insufficient Data & Empty Result Handling")
{
  const emptyReport = calculateAutomaticMeasurements(null, "v(out)")
  assert(emptyReport.measurements.length === 0, "Null sim result gives 0 measurements")

  const noVarResult: SimulationRunResult = {
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    elapsedMs: 1,
    analysisType: "TRANSIENT",
    pointCount: 0,
    xVariable: "time",
    variables: [],
    data: {}
  }
  const emptyReport2 = calculateAutomaticMeasurements(noVarResult, "v(unknown)")
  assert(emptyReport2.measurements.length === 0, "Missing signal gives 0 measurements")
}

console.log("\n✅ ALL 5 AUTOMATIC MEASUREMENTS TEST SUITES PASSED PERFECTLY!\n")
