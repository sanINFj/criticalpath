import {
  evaluateWaveformExpression,
  numericalDerivative,
  numericalIntegral,
} from "../src/renderer/src/utils/waveformMath"
import {
  computeWaveformFft,
  resampleUniform,
  radix2Fft,
} from "../src/renderer/src/utils/waveformFft"
import {
  DEFAULT_PLOT_SETTINGS,
  THEME_PALETTES,
} from "../src/renderer/src/utils/waveformSettings"

console.log("==================================================")
console.log("CriticalPath EDA - Waveform Viewer Upgrade Verification")
console.log("==================================================\n")

let passedTests = 0
let totalTests = 0

function assert(condition: boolean, desc: string) {
  totalTests++
  if (condition) {
    console.log(`[PASS] ${desc}`)
    passedTests++
  } else {
    console.error(`[FAIL] ${desc}`)
    process.exitCode = 1
  }
}

// -----------------------------------------------------------------
// 1. WAVEFORM MATH TESTS
// -----------------------------------------------------------------
console.log("--- Test Suite 1: Waveform Math Engine ---")

const sampleTime = [0, 0.001, 0.002, 0.003, 0.004, 0.005]
const vOut = [0, 2.0, 3.5, 4.2, 4.8, 5.0]
const vIn = [5.0, 5.0, 5.0, 5.0, 5.0, 5.0]
const iR1 = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006]

const mockDataMap: Record<string, number[]> = {
  time: sampleTime,
  "v(out)": vOut,
  "v(in)": vIn,
  "i(r1)": iR1,
}

// 1.1 Subtraction: V(out) - V(in)
const diffRes = evaluateWaveformExpression("v(out) - v(in)", mockDataMap, "time")
assert(diffRes.success === true, "V(out) - V(in) evaluated successfully")
assert(
  diffRes.data !== undefined && Math.abs(diffRes.data[0] - (-5.0)) < 1e-6,
  "V(out) - V(in) at t=0 equals -5.0V",
)
assert(
  diffRes.data !== undefined && Math.abs(diffRes.data[5] - 0.0) < 1e-6,
  "V(out) - V(in) at t=5ms equals 0.0V",
)

// 1.2 Power / Product: V(out) * I(R1)
const pwrRes = evaluateWaveformExpression("v(out) * i(r1)", mockDataMap, "time")
assert(pwrRes.success === true, "V(out) * I(R1) evaluated successfully")
assert(
  pwrRes.data !== undefined && Math.abs(pwrRes.data[5] - 0.03) < 1e-6,
  "Power at t=5ms equals 5.0V * 6mA = 30mW (0.03W)",
)

// 1.3 Derivative: d(V(out))/dt
const derivRes = evaluateWaveformExpression("d(v(out))/dt", mockDataMap, "time")
assert(derivRes.success === true, "d(V(out))/dt evaluated successfully")
assert(derivRes.data !== undefined && derivRes.data.length === 6, "Derivative length matches input length")
assert(derivRes.data !== undefined && derivRes.data[0] > 1000, "Initial derivative is positive (dV/dt ~ 2000 V/s)")

// 1.4 Integral: integ(V(out))
const integRes = evaluateWaveformExpression("integ(v(out))", mockDataMap, "time")
assert(integRes.success === true, "integ(V(out)) evaluated successfully")
assert(integRes.data !== undefined && integRes.data[0] === 0, "Integral at t=0 is 0")
assert(integRes.data !== undefined && integRes.data[5] > 0, "Cumulative integral is positive")

// 1.5 Math functions: abs(v(out) - 5)
const funcRes = evaluateWaveformExpression("abs(v(out) - 5)", mockDataMap, "time")
assert(funcRes.success === true, "abs(V(out) - 5) evaluated successfully")
assert(funcRes.data !== undefined && Math.abs(funcRes.data[0] - 5.0) < 1e-6, "abs(0 - 5) = 5.0")
assert(funcRes.data !== undefined && Math.abs(funcRes.data[5] - 0.0) < 1e-6, "abs(5 - 5) = 0.0")

// -----------------------------------------------------------------
// 2. FAST FOURIER TRANSFORM (FFT) TESTS
// -----------------------------------------------------------------
console.log("\n--- Test Suite 2: Waveform FFT Spectrum Engine ---")

// Generate a 1 kHz sine wave sampled at 64 kHz for 10ms (10 cycles)
const f0 = 1000 // 1 kHz
const sampleRate = 64000
const numPoints = 640
const sineTime: number[] = []
const sineWave: number[] = []

for (let i = 0; i < numPoints; i++) {
  const t = i / sampleRate
  sineTime.push(t)
  // 2.0V peak sine wave at 1 kHz with a small DC offset
  sineWave.push(1.0 + 2.0 * Math.sin(2 * Math.PI * f0 * t))
}

// 2.1 Resample Uniform
const { tUniform, yUniform, dt } = resampleUniform(sineTime, sineWave, 1024)
assert(tUniform.length === 1024, "Resampled uniform time array length is 1024")
assert(dt > 0 && Math.abs(dt - sineTime[sineTime.length - 1] / 1023) < 1e-9, "dt correctly calculated")

// 2.2 Radix-2 FFT computation
const real = new Float64Array(1024)
const imag = new Float64Array(1024)
for (let i = 0; i < 1024; i++) {
  real[i] = yUniform[i]
}
radix2Fft(real, imag)
assert(!isNaN(real[0]) && !isNaN(imag[0]), "Radix-2 FFT executes without NaN")

// 2.3 Compute full Waveform FFT spectrum
const fft = computeWaveformFft(sineTime, sineWave, 1024, "hanning")
assert(fft !== null, "Waveform FFT computed successfully")
if (fft) {
  assert(fft.frequencies.length === 512, "Single-sided spectrum length is N/2 = 512 bins")
  assert(
    Math.abs(fft.peakFrequency - 1000) <= fft.samplingRate / 1024,
    `Detected peak fundamental frequency: ${fft.peakFrequency.toFixed(1)} Hz (expected ~1000 Hz)`,
  )
  assert(
    fft.peakMagnitudeDb > 0,
    `Detected peak magnitude: ${fft.peakMagnitudeDb.toFixed(2)} dBV (expected ~ +6 dBV for 2V peak)`,
  )
}

// -----------------------------------------------------------------
// 3. SETTINGS, PALETTES & MULTI-PANE ARCHITECTURE
// -----------------------------------------------------------------
console.log("\n--- Test Suite 3: Waveform Settings & Palettes ---")

assert(DEFAULT_PLOT_SETTINGS.version === 1, "Default plot settings initialized with version 1")
assert(DEFAULT_PLOT_SETTINGS.theme === "ltspice-black", "Default theme is ltspice-black")
assert(Object.keys(THEME_PALETTES).length === 4, "Four complete theme palettes defined")

const ltspicePalette = THEME_PALETTES["ltspice-black"]
assert(ltspicePalette.appBg === "#000000", "LTspice Black app background is pitch black")
assert(ltspicePalette.plotBg === "#000000", "LTspice Black plot background is pitch black")

const navyPalette = THEME_PALETTES["dark-navy"]
assert(navyPalette.plotBg === "#0c111d", "Dark Navy palette plot background verified")

const whitePalette = THEME_PALETTES["classic-white"]
assert(whitePalette.plotBg === "#ffffff", "Classic White palette plot background verified")

// -----------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------
console.log("\n==================================================")
console.log(`Results: ${passedTests}/${totalTests} tests PASSED.`)
console.log("==================================================")
if (passedTests === totalTests) {
  console.log("✓ ALL WAVEFORM UPGRADE SUITES VERIFIED CLEANLY!")
} else {
  process.exit(1)
}
