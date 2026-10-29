/**
 * CriticalPath EDA - Automatic Measurements Calculation Engine
 * Pure mathematical algorithms evaluating genuine ngspice simulation data.
 */

import type { SimulationRunResult } from "../../../shared/simulation"
import { formatEngineering } from "./engineeringFormat"

export type MeasurementStatus = "valid" | "insufficient_data" | "not_applicable"

export interface MeasurementResult {
  id: string
  name: string
  symbol: string
  category: "transient" | "ac" | "dc" | "op"
  valueFormatted: string
  numericValue: number | null
  unit: string
  definition: string
  status: MeasurementStatus
  note?: string
}

export interface MeasurementsReport {
  signalName: string
  analysisType: string
  pointCount: number
  measurements: MeasurementResult[]
}

/**
 * Binary search & linear interpolation on monotonic array
 */
function interpolateX(xArr: number[], yArr: number[], yTarget: number, startIdx = 0, endIdx = xArr.length - 1): number | null {
  for (let i = startIdx; i < endIdx; i++) {
    const y0 = yArr[i]
    const y1 = yArr[i + 1]
    if ((y0 <= yTarget && yTarget <= y1) || (y1 <= yTarget && yTarget <= y0)) {
      if (Math.abs(y1 - y0) < 1e-18) return xArr[i]
      const frac = (yTarget - y0) / (y1 - y0)
      return xArr[i] + frac * (xArr[i + 1] - xArr[i])
    }
  }
  return null
}

/**
 * Calculates Automatic Measurements for a selected signal from genuine ngspice simulation results
 */
export function calculateAutomaticMeasurements(
  simResult: SimulationRunResult | null,
  signalName: string,
): MeasurementsReport {
  if (!simResult || !simResult.data || !signalName || !simResult.data[signalName]) {
    return {
      signalName: signalName || "None",
      analysisType: simResult?.analysisType || "unknown",
      pointCount: 0,
      measurements: [],
    }
  }

  const yData = simResult.data[signalName]
  const xVarName = simResult.xVariable || (simResult.variables.length > 0 ? simResult.variables[0].name : "")
  const xData = (xVarName && simResult.data[xVarName]) ? simResult.data[xVarName] : []
  const n = yData.length
  const rawAnalysis = simResult.analysisType?.toLowerCase() || ""
  const isAc = rawAnalysis.includes("ac") || xVarName.toLowerCase().includes("freq") || signalName.endsWith("_db") || signalName.endsWith("_phase")
  const isDc = !isAc && (rawAnalysis.includes("dc") || xVarName.toLowerCase().includes("sweep") || (!rawAnalysis.includes("tran") && !xVarName.toLowerCase().includes("time") && !rawAnalysis.includes("op") && (xVarName.toLowerCase().startsWith("v") || xVarName.toLowerCase().startsWith("i"))))
  const isOp = !isAc && !isDc && (rawAnalysis.includes("op") || (n === 1 && !rawAnalysis.includes("tran")))
  const isTran = !isAc && !isDc && !isOp

  const resolvedAnalysisType = isTran ? "TRANSIENT" : isAc ? "AC" : isDc ? "DC" : "OP"

  const results: MeasurementResult[] = []

  // Helper to resolve unit
  const variableMeta = simResult.variables.find((v) => v.name.toLowerCase() === signalName.toLowerCase())
  const rawUnit = variableMeta?.unit || (signalName.toLowerCase().startsWith("i(") ? "A" : "V")

  if (n === 0) {
    return {
      signalName,
      analysisType: resolvedAnalysisType,
      pointCount: 0,
      measurements: [
        {
          id: "no_data",
          name: "Data Check",
          symbol: "Status",
          category: isTran ? "transient" : isAc ? "ac" : isDc ? "dc" : "op",
          valueFormatted: "No Points",
          numericValue: null,
          unit: "",
          definition: "Verification of simulation data vectors.",
          status: "insufficient_data",
          note: "Selected signal contains 0 data points.",
        },
      ],
    }
  }

  // ============================================================
  // 1. TRANSIENT ANALYSIS MEASUREMENTS (.tran)
  // ============================================================
  if (isTran) {
    // Basic Extrema
    let maxVal = -Infinity
    let minVal = Infinity

    for (let i = 0; i < n; i++) {
      const v = yData[i]
      if (v > maxVal) {
        maxVal = v
      }
      if (v < minVal) {
        minVal = v
      }
    }

    const peakToPeak = maxVal - minVal

    // 1. Peak
    results.push({
      id: "tran_peak",
      name: "Peak Amplitude",
      symbol: "Vmax",
      category: "transient",
      valueFormatted: formatEngineering(maxVal, rawUnit, 4),
      numericValue: maxVal,
      unit: rawUnit,
      definition: "Maximum positive value reached by the signal across the simulation duration.",
      status: "valid",
    })

    // 2. Minimum
    results.push({
      id: "tran_min",
      name: "Minimum Amplitude",
      symbol: "Vmin",
      category: "transient",
      valueFormatted: formatEngineering(minVal, rawUnit, 4),
      numericValue: minVal,
      unit: rawUnit,
      definition: "Minimum value reached by the signal across the simulation duration.",
      status: "valid",
    })

    // Peak-to-Peak
    results.push({
      id: "tran_vpp",
      name: "Peak-to-Peak",
      symbol: "Vpp",
      category: "transient",
      valueFormatted: formatEngineering(peakToPeak, rawUnit, 4),
      numericValue: peakToPeak,
      unit: rawUnit,
      definition: "Full signal swing: difference between maximum and minimum values (Vmax - Vmin).",
      status: "valid",
    })

    // 3. Average (DC value via trapezoidal integration)
    let avgVal = yData[0]
    let rmsVal = Math.abs(yData[0])

    if (xData.length >= 2 && n >= 2) {
      const tStart = xData[0]
      const tEnd = xData[n - 1]
      const totalTime = tEnd - tStart

      if (totalTime > 0) {
        let integralSum = 0
        let rmsSum = 0

        for (let i = 0; i < n - 1; i++) {
          const dt = xData[i + 1] - xData[i]
          if (dt > 0) {
            integralSum += 0.5 * (yData[i] + yData[i + 1]) * dt
            rmsSum += 0.5 * (yData[i] * yData[i] + yData[i + 1] * yData[i + 1]) * dt
          }
        }
        avgVal = integralSum / totalTime
        rmsVal = Math.sqrt(Math.max(0, rmsSum / totalTime))
      }
    }

    results.push({
      id: "tran_avg",
      name: "Average (DC)",
      symbol: "Vavg",
      category: "transient",
      valueFormatted: formatEngineering(avgVal, rawUnit, 4),
      numericValue: avgVal,
      unit: rawUnit,
      definition: "Time-weighted arithmetic mean (DC component) computed via numerical integration.",
      status: "valid",
    })

    // 4. RMS
    results.push({
      id: "tran_rms",
      name: "Root Mean Square",
      symbol: "Vrms",
      category: "transient",
      valueFormatted: formatEngineering(rmsVal, rawUnit, 4),
      numericValue: rmsVal,
      unit: rawUnit,
      definition: "Effective RMS amplitude representing equivalent power/heating value.",
      status: "valid",
    })

    // 5. Rise Time (10% to 90%)
    // Identify step levels based on initial and final steady-state portions
    const sampleWindow = Math.max(1, Math.floor(n * 0.05))
    let initAvg = 0
    let finalAvg = 0
    for (let i = 0; i < sampleWindow; i++) initAvg += yData[i]
    for (let i = n - sampleWindow; i < n; i++) finalAvg += yData[i]
    initAvg /= sampleWindow
    finalAvg /= sampleWindow

    // Determine baseline and top level
    // If the transition begins immediately at t=0, window averaging can be biased by the ongoing ramp;
    // thus choose the true quiescent starting point yData[0] if it reflects the full step span.
    const baseline = Math.abs(yData[0] - finalAvg) > Math.abs(initAvg - finalAvg) ? yData[0] : initAvg
    const isStepUp = finalAvg > baseline
    const stepHeight = Math.abs(finalAvg - baseline)

    let riseTime: number | null = null
    let fallTime: number | null = null

    if (xData.length >= 3 && stepHeight > 1e-4) {
      const vLow = Math.min(baseline, finalAvg)
      const vHigh = Math.max(baseline, finalAvg)
      const v10 = vLow + 0.1 * (vHigh - vLow)
      const v90 = vLow + 0.9 * (vHigh - vLow)

      // Search for rising edge (v10 -> v90)
      for (let i = 0; i < n - 1; i++) {
        if (yData[i] <= v10 && yData[i + 1] >= v10) {
          const t10 = interpolateX(xData, yData, v10, i, i + 1)
          if (t10 !== null) {
            // Now find where it crosses v90 later
            for (let j = i; j < n - 1; j++) {
              if (yData[j] <= v90 && yData[j + 1] >= v90) {
                const t90 = interpolateX(xData, yData, v90, j, j + 1)
                if (t90 !== null && t90 >= t10) {
                  riseTime = t90 - t10
                  break
                }
              }
            }
          }
          if (riseTime !== null) break
        }
      }

      // Search for falling edge (v90 -> v10)
      for (let i = 0; i < n - 1; i++) {
        if (yData[i] >= v90 && yData[i + 1] <= v90) {
          const t90 = interpolateX(xData, yData, v90, i, i + 1)
          if (t90 !== null) {
            for (let j = i; j < n - 1; j++) {
              if (yData[j] >= v10 && yData[j + 1] <= v10) {
                const t10 = interpolateX(xData, yData, v10, j, j + 1)
                if (t10 !== null && t10 >= t90) {
                  fallTime = t10 - t90
                  break
                }
              }
            }
          }
          if (fallTime !== null) break
        }
      }
    }

    results.push({
      id: "tran_rise_time",
      name: "Rise Time",
      symbol: "tr (10%-90%)",
      category: "transient",
      valueFormatted: riseTime !== null ? formatEngineering(riseTime, "s", 3) : "N/A",
      numericValue: riseTime,
      unit: "s",
      definition: "Time required for the waveform to transition from 10% to 90% of pulse/step height.",
      status: riseTime !== null ? "valid" : "insufficient_data",
      note: riseTime === null ? "No complete 10% to 90% rising edge detected in window." : undefined,
    })

    // 6. Fall Time (90% to 10%)
    results.push({
      id: "tran_fall_time",
      name: "Fall Time",
      symbol: "tf (90%-10%)",
      category: "transient",
      valueFormatted: fallTime !== null ? formatEngineering(fallTime, "s", 3) : "N/A",
      numericValue: fallTime,
      unit: "s",
      definition: "Time required for the waveform to transition from 90% to 10% of pulse/step height.",
      status: fallTime !== null ? "valid" : "insufficient_data",
      note: fallTime === null ? "No complete 90% to 10% falling edge detected in window." : undefined,
    })

    // 7. Overshoot (%)
    let overshootPct: number | null = null
    if (stepHeight > 1e-4) {
      if (isStepUp) {
        if (maxVal > finalAvg) {
          overshootPct = ((maxVal - finalAvg) / stepHeight) * 100
        } else {
          overshootPct = 0
        }
      } else {
        if (minVal < finalAvg) {
          overshootPct = ((finalAvg - minVal) / stepHeight) * 100
        } else {
          overshootPct = 0
        }
      }
    }

    results.push({
      id: "tran_overshoot",
      name: "Overshoot",
      symbol: "OS %",
      category: "transient",
      valueFormatted: overshootPct !== null ? `${overshootPct.toFixed(2)} %` : "N/A",
      numericValue: overshootPct,
      unit: "%",
      definition: "Peak excursion beyond the final steady-state value relative to step height.",
      status: overshootPct !== null ? "valid" : "insufficient_data",
      note: overshootPct === null ? "Waveform amplitude variation is insufficient to define a step." : undefined,
    })

    // 8. Settling Time (2% band)
    let settlingTime: number | null = null
    if (xData.length >= 3 && stepHeight > 1e-4) {
      const tol = 0.02 * stepHeight
      const upper = finalAvg + tol
      const lower = finalAvg - tol

      // Find the last index where signal violated tolerance
      let lastViolationIdx = -1
      for (let i = n - 1; i >= 0; i--) {
        if (yData[i] > upper || yData[i] < lower) {
          lastViolationIdx = i
          break
        }
      }

      if (lastViolationIdx === -1) {
        // Always inside band
        settlingTime = 0
      } else if (lastViolationIdx < n - 1) {
        // Settled after last violation
        settlingTime = xData[lastViolationIdx + 1] - xData[0]
      } else {
        // Violated at the very end
        settlingTime = null
      }
    }

    results.push({
      id: "tran_settling_time",
      name: "Settling Time",
      symbol: "ts (±2%)",
      category: "transient",
      valueFormatted: settlingTime !== null ? formatEngineering(settlingTime, "s", 3) : "Did not settle",
      numericValue: settlingTime,
      unit: "s",
      definition: "Time elapsed until the signal enters and permanently stays within ±2% of steady-state value.",
      status: settlingTime !== null ? "valid" : "insufficient_data",
      note: settlingTime === null ? "Signal did not settle within ±2% band by the end of simulation." : undefined,
    })
  }

  // ============================================================
  // 2. AC FREQUENCY DOMAIN MEASUREMENTS (.ac)
  // ============================================================
  else if (isAc) {
    const isDbTrace = signalName.endsWith("_db")
    const isPhaseTrace = signalName.endsWith("_phase")

    // Find companion dB and Phase signals if measuring a node voltage
    const baseName = signalName.replace(/(_db|_phase)$/, "")
    const dbKey = `${baseName}_db`
    const phaseKey = `${baseName}_phase`

    const dbData = simResult.data[dbKey] || (isDbTrace ? yData : null)
    const phaseData = simResult.data[phaseKey] || (isPhaseTrace ? yData : null)

    // Extrema on current trace
    let maxVal = -Infinity
    let minVal = Infinity
    let maxIdx = 0

    for (let i = 0; i < n; i++) {
      const v = yData[i]
      if (v > maxVal) {
        maxVal = v
        maxIdx = i
      }
      if (v < minVal) {
        minVal = v
      }
    }

    // 1. Peak Gain / Value
    results.push({
      id: "ac_peak_gain",
      name: isPhaseTrace ? "Peak Phase" : isDbTrace ? "Maximum Gain (dB)" : "Maximum Gain",
      symbol: isPhaseTrace ? "Φmax" : "Gain(max)",
      category: "ac",
      valueFormatted: isPhaseTrace
        ? `${maxVal.toFixed(2)}°`
        : isDbTrace
          ? `${maxVal.toFixed(2)} dB`
          : `${formatEngineering(maxVal, "V/V", 3)} (${(20 * Math.log10(Math.max(1e-15, maxVal))).toFixed(2)} dB)`,
      numericValue: maxVal,
      unit: isPhaseTrace ? "°" : isDbTrace ? "dB" : "V/V",
      definition: "Maximum transmission magnitude across the swept frequency spectrum.",
      status: "valid",
    })

    // 2. Minimum Gain / Value
    results.push({
      id: "ac_min_gain",
      name: isPhaseTrace ? "Minimum Phase" : isDbTrace ? "Minimum Gain (dB)" : "Minimum Gain",
      symbol: isPhaseTrace ? "Φmin" : "Gain(min)",
      category: "ac",
      valueFormatted: isPhaseTrace
        ? `${minVal.toFixed(2)}°`
        : isDbTrace
          ? `${minVal.toFixed(2)} dB`
          : `${formatEngineering(minVal, "V/V", 3)} (${(20 * Math.log10(Math.max(1e-15, minVal))).toFixed(2)} dB)`,
      numericValue: minVal,
      unit: isPhaseTrace ? "°" : isDbTrace ? "dB" : "V/V",
      definition: "Minimum transmission magnitude across the swept frequency spectrum.",
      status: "valid",
    })

    // 3. Low-Frequency / Starting Gain
    const startVal = yData[0]
    results.push({
      id: "ac_low_freq_gain",
      name: "Starting Sweep Gain",
      symbol: "Gain(f0)",
      category: "ac",
      valueFormatted: isPhaseTrace
        ? `${startVal.toFixed(2)}°`
        : isDbTrace
          ? `${startVal.toFixed(2)} dB`
          : formatEngineering(startVal, "V/V", 3),
      numericValue: startVal,
      unit: isPhaseTrace ? "°" : isDbTrace ? "dB" : "V/V",
      definition: `Response at the lowest swept frequency (${formatEngineering(xData[0] || 0, "Hz")}).`,
      status: "valid",
    })

    // 4. -3 dB Cutoff Frequency & Bandwidth Calculation
    // Use dB data if available, else linear magnitude
    let cutoffFreq: number | null = null
    let cutoffPhase: number | null = null
    let bandwidth: number | null = null

    if (!isPhaseTrace && xData.length >= 2) {
      if (dbData && dbData.length === xData.length) {
        // Peak dB in spectrum
        let peakDb = -Infinity
        let peakIdx = 0
        for (let i = 0; i < dbData.length; i++) {
          if (dbData[i] > peakDb) {
            peakDb = dbData[i]
            peakIdx = i
          }
        }
        const targetDb = peakDb - 3.0103 // -3.01 dB down point

        // Check if gain drops below target after the peak
        for (let i = peakIdx; i < dbData.length - 1; i++) {
          if (dbData[i] >= targetDb && dbData[i + 1] <= targetDb) {
            // Interpolate in log frequency space for high precision
            const f0 = xData[i]
            const f1 = xData[i + 1]
            const db0 = dbData[i]
            const db1 = dbData[i + 1]
            if (Math.abs(db1 - db0) > 1e-12) {
              const frac = (targetDb - db0) / (db1 - db0)
              cutoffFreq = Math.pow(10, Math.log10(f0) + frac * (Math.log10(f1) - Math.log10(f0)))
            } else {
              cutoffFreq = f0
            }

            // Interpolate phase at cutoff if phase data available
            if (phaseData && phaseData.length === xData.length) {
              cutoffPhase = phaseData[i] + ((cutoffFreq - f0) / (f1 - f0)) * (phaseData[i + 1] - phaseData[i])
            }
            break
          }
        }
      } else {
        // Fallback to linear magnitude ratio (0.7071 * max)
        const targetLinear = maxVal * 0.707106
        for (let i = maxIdx; i < n - 1; i++) {
          if (yData[i] >= targetLinear && yData[i + 1] <= targetLinear) {
            cutoffFreq = interpolateX(xData, yData, targetLinear, i, i + 1)
            break
          }
        }
      }

      if (cutoffFreq !== null) {
        bandwidth = cutoffFreq
      }
    }

    results.push({
      id: "ac_cutoff_freq",
      name: "Cutoff Frequency (-3 dB)",
      symbol: "fc (-3dB)",
      category: "ac",
      valueFormatted: cutoffFreq !== null ? formatEngineering(cutoffFreq, "Hz", 3) : "N/A",
      numericValue: cutoffFreq,
      unit: "Hz",
      definition: "Frequency where output power drops by half (-3.01 dB) relative to passband maximum.",
      status: cutoffFreq !== null ? "valid" : "insufficient_data",
      note: cutoffFreq === null ? "Gain does not drop by -3 dB within the simulated frequency span." : undefined,
    })

    // 5. Bandwidth
    results.push({
      id: "ac_bandwidth",
      name: "Bandwidth (-3 dB)",
      symbol: "BW",
      category: "ac",
      valueFormatted: bandwidth !== null ? formatEngineering(bandwidth, "Hz", 3) : "N/A",
      numericValue: bandwidth,
      unit: "Hz",
      definition: "Effective usable transmission frequency span within -3 dB passband.",
      status: bandwidth !== null ? "valid" : "insufficient_data",
      note: bandwidth === null ? "Upper cutoff frequency exceeds simulation sweep range." : undefined,
    })

    // 6. Phase at Cutoff / Phase Margin
    results.push({
      id: "ac_cutoff_phase",
      name: "Phase at Cutoff",
      symbol: "Φ(fc)",
      category: "ac",
      valueFormatted: cutoffPhase !== null ? `${cutoffPhase.toFixed(1)}°` : "N/A",
      numericValue: cutoffPhase,
      unit: "°",
      definition: "Signal phase shift angle at the -3 dB cutoff frequency.",
      status: cutoffPhase !== null ? "valid" : "not_applicable",
      note: cutoffPhase === null ? (cutoffFreq === null ? "Requires valid -3 dB cutoff frequency." : "Phase data not available for this trace.") : undefined,
    })
  }

  // ============================================================
  // 3. DC SWEEP MEASUREMENTS (.dc)
  // ============================================================
  else if (isDc) {
    let maxVal = -Infinity
    let minVal = Infinity
    let maxSweepX = xData[0] || 0
    let minSweepX = xData[0] || 0

    for (let i = 0; i < n; i++) {
      const v = yData[i]
      if (v > maxVal) {
        maxVal = v
        maxSweepX = xData[i] ?? 0
      }
      if (v < minVal) {
        minVal = v
        minSweepX = xData[i] ?? 0
      }
    }

    // 1. Max Value
    results.push({
      id: "dc_max",
      name: "Maximum Value",
      symbol: "Ymax",
      category: "dc",
      valueFormatted: `${formatEngineering(maxVal, rawUnit, 4)} (at ${formatEngineering(maxSweepX, "V")})`,
      numericValue: maxVal,
      unit: rawUnit,
      definition: "Maximum output value reached across the swept DC source range.",
      status: "valid",
    })

    // 2. Min Value
    results.push({
      id: "dc_min",
      name: "Minimum Value",
      symbol: "Ymin",
      category: "dc",
      valueFormatted: `${formatEngineering(minVal, rawUnit, 4)} (at ${formatEngineering(minSweepX, "V")})`,
      numericValue: minVal,
      unit: rawUnit,
      definition: "Minimum output value reached across the swept DC source range.",
      status: "valid",
    })

    // 3. Range / Span
    const span = maxVal - minVal
    results.push({
      id: "dc_span",
      name: "Dynamic Range / Span",
      symbol: "ΔY",
      category: "dc",
      valueFormatted: formatEngineering(span, rawUnit, 4),
      numericValue: span,
      unit: rawUnit,
      definition: "Full span of signal variation (Ymax - Ymin) across the sweep.",
      status: "valid",
    })

    // 4. Value at Zero Input (X = 0)
    let zeroVal: number | null = null
    if (xData.length >= 2) {
      zeroVal = interpolateX(yData, xData, 0)
      if (zeroVal === null && xData[0] <= 0 && xData[xData.length - 1] >= 0) {
        zeroVal = interpolateX(yData, xData, 0)
      }
      // Direct search if 0 is an exact point
      const zeroIdx = xData.findIndex((x) => Math.abs(x) < 1e-12)
      if (zeroIdx !== -1) {
        zeroVal = yData[zeroIdx]
      } else {
        // Interpolate Y at X = 0
        for (let i = 0; i < xData.length - 1; i++) {
          if ((xData[i] <= 0 && xData[i + 1] >= 0) || (xData[i] >= 0 && xData[i + 1] <= 0)) {
            const frac = (0 - xData[i]) / (xData[i + 1] - xData[i])
            zeroVal = yData[i] + frac * (yData[i + 1] - yData[i])
            break
          }
        }
      }
    }

    results.push({
      id: "dc_zero_bias",
      name: "Zero-Input Quiescent Bias",
      symbol: "Y(X=0)",
      category: "dc",
      valueFormatted: zeroVal !== null ? formatEngineering(zeroVal, rawUnit, 4) : "N/A",
      numericValue: zeroVal,
      unit: rawUnit,
      definition: "Quiescent bias value evaluated when the swept source is at 0V/0A.",
      status: zeroVal !== null ? "valid" : "not_applicable",
      note: zeroVal === null ? "Swept range does not include 0." : undefined,
    })

    // 5. Transfer Slope / Sensitivity
    let slope: number | null = null
    if (xData.length >= 2 && Math.abs(xData[n - 1] - xData[0]) > 1e-15) {
      slope = (yData[n - 1] - yData[0]) / (xData[n - 1] - xData[0])
    }

    results.push({
      id: "dc_slope",
      name: "Average Transfer Slope",
      symbol: "dY/dX",
      category: "dc",
      valueFormatted: slope !== null ? `${slope.toFixed(4)} ${rawUnit}/V` : "N/A",
      numericValue: slope,
      unit: `${rawUnit}/V`,
      definition: "Overall transfer slope (gain or transconductance) across sweep range.",
      status: slope !== null ? "valid" : "insufficient_data",
    })
  }

  // ============================================================
  // 4. OPERATING POINT (.op)
  // ============================================================
  else {
    const singleVal = yData[0] ?? 0
    results.push({
      id: "op_bias",
      name: "Quiescent Operating Bias",
      symbol: "V_dc / I_dc",
      category: "op",
      valueFormatted: formatEngineering(singleVal, rawUnit, 4),
      numericValue: singleVal,
      unit: rawUnit,
      definition: "Calculated steady-state DC operating point with capacitors open and inductors shorted.",
      status: "valid",
    })
  }

  return {
    signalName,
    analysisType: resolvedAnalysisType,
    pointCount: n,
    measurements: results,
  }
}
