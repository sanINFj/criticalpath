/**
 * Engineering SI metric prefix formatting utility
 */
export function formatEngineering(val: number, unit: string = "", sigFigs: number = 3): string {
  if (!isFinite(val)) return "0 " + unit
  if (unit === "dB") return `${val.toFixed(2)} dB`
  if (unit === "°" || unit === "deg") return `${val.toFixed(1)}°`
  if (Math.abs(val) < 1e-15) return `0 ${unit}`

  const abs = Math.abs(val)
  const prefixes = [
    { factor: 1e12, p: "T" },
    { factor: 1e9, p: "G" },
    { factor: 1e6, p: "M" },
    { factor: 1e3, p: "k" },
    { factor: 1, p: "" },
    { factor: 1e-3, p: "m" },
    { factor: 1e-6, p: "µ" },
    { factor: 1e-9, p: "n" },
    { factor: 1e-12, p: "p" },
    { factor: 1e-15, p: "f" },
  ]

  const match = prefixes.find((p) => abs >= p.factor * 0.999) || prefixes[prefixes.length - 1]
  const scaled = val / match.factor
  const numStr = scaled.toFixed(sigFigs).replace(/\.?0+$/, "")
  return `${numStr} ${match.p}${unit}`.trim()
}
