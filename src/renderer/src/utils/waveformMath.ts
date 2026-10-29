/**
 * CriticalPath EDA - Waveform Math Engine
 * Evaluates custom mathematical expressions over simulation data vectors.
 * Supports operations like: V(out) - V(in), V(node)*I(R1), d(V(out))/dt, abs(), sqrt(), etc.
 */

export interface MathTraceDefinition {
  id: string
  name: string // e.g. "V(out)-V(in)"
  expression: string
  color: string
  lineWidth?: number
  lineStyle?: "solid" | "dashed" | "dotted"
  paneIndex?: number
  unit?: string
}

/**
 * Computes numerical derivative dy/dx using central differences
 */
export function numericalDerivative(x: number[], y: number[]): number[] {
  const n = x.length
  if (n === 0) return []
  if (n === 1) return [0]
  const out = new Array<number>(n)

  // Forward difference for first point
  const dx0 = x[1] - x[0]
  out[0] = Math.abs(dx0) > 1e-18 ? (y[1] - y[0]) / dx0 : 0

  // Central difference for interior points
  for (let i = 1; i < n - 1; i++) {
    const dxi = x[i + 1] - x[i - 1]
    out[i] = Math.abs(dxi) > 1e-18 ? (y[i + 1] - y[i - 1]) / dxi : 0
  }

  // Backward difference for last point
  const dxN = x[n - 1] - x[n - 2]
  out[n - 1] = Math.abs(dxN) > 1e-18 ? (y[n - 1] - y[n - 2]) / dxN : 0

  return out
}

/**
 * Computes cumulative numerical integral via trapezoidal rule
 */
export function numericalIntegral(x: number[], y: number[]): number[] {
  const n = x.length
  if (n === 0) return []
  const out = new Array<number>(n)
  out[0] = 0
  let sum = 0

  for (let i = 1; i < n; i++) {
    const dx = x[i] - x[i - 1]
    sum += 0.5 * (y[i] + y[i - 1]) * dx
    out[i] = sum
  }

  return out
}

/**
 * Evaluates a mathematical waveform expression over vectors in dataMap
 * @param expr e.g. "v(out) - v(in)" or "d(v(out))/dt" or "abs(v(out))*1000"
 * @param dataMap record mapping variable names (lowercase) to array of numbers
 * @param xVarName independent variable name (e.g. "time")
 */
export function evaluateWaveformExpression(
  expr: string,
  dataMap: Record<string, number[]>,
  xVarName: string = "time",
): { success: boolean; data?: number[]; error?: string; unit?: string } {
  if (!expr || !expr.trim()) {
    return { success: false, error: "Empty expression" }
  }

  const cleanExpr = expr.trim()

  // 1. Check for derivative shorthand: d(var)/dt or diff(var)
  const diffMatch = cleanExpr.match(/^(?:d\((.+)\)\/dt|diff\((.+)\))$/i)
  if (diffMatch) {
    const targetVar = (diffMatch[1] || diffMatch[2]).trim().toLowerCase()
    const yArr = dataMap[targetVar]
    const xArr = dataMap[xVarName.toLowerCase()]
    if (!yArr || !xArr) {
      return { success: false, error: `Signal "${targetVar}" or "${xVarName}" not found.` }
    }
    const result = numericalDerivative(xArr, yArr)
    return { success: true, data: result, unit: "V/s" }
  }

  // 2. Check for integral shorthand: integ(var) or s(var)*dt
  const integMatch = cleanExpr.match(/^integ\((.+)\)$/i)
  if (integMatch) {
    const targetVar = integMatch[1].trim().toLowerCase()
    const yArr = dataMap[targetVar]
    const xArr = dataMap[xVarName.toLowerCase()]
    if (!yArr || !xArr) {
      return { success: false, error: `Signal "${targetVar}" or "${xVarName}" not found.` }
    }
    const result = numericalIntegral(xArr, yArr)
    return { success: true, data: result, unit: "V·s" }
  }

  // 3. Point-by-point vectorized mathematical evaluation
  // Determine length of output from available vectors
  let pointCount = 0
  const availableVars: string[] = []
  for (const k of Object.keys(dataMap)) {
    if (dataMap[k] && dataMap[k].length > pointCount) {
      pointCount = dataMap[k].length
    }
    availableVars.push(k)
  }

  if (pointCount === 0) {
    return { success: false, error: "No simulation data points available." }
  }

  // Prepare a safe evaluator function
  // Replace mathematical functions with Math equivalents
  // Replace tokens like v(out) with safe variable identifiers like __var_0
  const varTokenMap: Record<string, string> = {}
  let tokenCounter = 0
  let jsExpr = cleanExpr

  // Sort variable names longest-first so v(out_1) matches before v(out)
  const sortedVars = [...availableVars].sort((a, b) => b.length - a.length)

  for (const vName of sortedVars) {
    // Regex matching variable name case-insensitively
    // Escape parentheses for regex
    const escaped = vName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(escaped, "gi")
    if (regex.test(jsExpr)) {
      const token = `__v_${tokenCounter++}`
      varTokenMap[token] = vName.toLowerCase()
      jsExpr = jsExpr.replace(regex, token)
    }
  }

  // Replace math functions: abs -> Math.abs, sqrt -> Math.sqrt, etc.
  jsExpr = jsExpr
    .replace(/\babs\(/gi, "Math.abs(")
    .replace(/\bsqrt\(/gi, "Math.sqrt(")
    .replace(/\blog\(/gi, "Math.log(")
    .replace(/\blog10\(/gi, "Math.log10(")
    .replace(/\bexp\(/gi, "Math.exp(")
    .replace(/\bsin\(/gi, "Math.sin(")
    .replace(/\bcos\(/gi, "Math.cos(")
    .replace(/\btan\(/gi, "Math.tan(")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\^/g, "**") // Power operator

  // Pre-compile function
  const tokens = Object.keys(varTokenMap)
  let evalFn: (...args: number[]) => number
  try {
    evalFn = new Function(...tokens, `return (${jsExpr});`) as (...args: number[]) => number
  } catch (err: any) {
    return { success: false, error: `Syntax error in expression: ${err.message || String(err)}` }
  }

  // Execute across all data points
  const result = new Array<number>(pointCount)
  const tokenArrays = tokens.map((t) => dataMap[varTokenMap[t]] || [])

  try {
    for (let i = 0; i < pointCount; i++) {
      const args = tokenArrays.map((arr) => arr[i] ?? 0)
      const val = evalFn(...args)
      result[i] = isFinite(val) ? val : 0
    }
  } catch (err: any) {
    return { success: false, error: `Evaluation error: ${err.message || String(err)}` }
  }

  return { success: true, data: result, unit: cleanExpr.includes("*") ? "W" : "V" }
}
