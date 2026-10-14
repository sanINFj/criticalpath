/**
 * CriticalPath EDA - Waveform Export Utilities
 * Exports waveform data to CSV and high-resolution PNG image snapshots.
 */

/**
 * Exports current plotted traces to a CSV file and triggers a browser download.
 */
export function exportWaveformCsv(
  xVarName: string,
  xData: number[],
  traceNames: string[],
  dataMap: Record<string, number[]>,
  unitsMap?: Record<string, string>,
  filenamePrefix: string = "criticalpath_waveform",
): void {
  if (!xData || xData.length === 0 || traceNames.length === 0) {
    alert("No waveform data available to export.")
    return
  }

  // Header row
  const xHeader = unitsMap?.[xVarName] ? `${xVarName} (${unitsMap[xVarName]})` : xVarName
  const headers = [xHeader]

  traceNames.forEach((tr) => {
    const unit = unitsMap?.[tr] || (tr.startsWith("i(") ? "A" : "V")
    headers.push(`${tr} (${unit})`)
  })

  const rows: string[] = [headers.join(",")]

  const numRows = xData.length
  for (let i = 0; i < numRows; i++) {
    const rowVals: string[] = [xData[i].toExponential(6)]
    for (const tr of traceNames) {
      const arr = dataMap[tr] || dataMap[tr.toLowerCase()]
      if (arr && i < arr.length && isFinite(arr[i])) {
        rowVals.push(arr[i].toExponential(6))
      } else {
        rowVals.push("")
      }
    }
    rows.push(rowVals.join(","))
  }

  const csvContent = rows.join("\r\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filenamePrefix}_${timestamp}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Captures the waveform canvas and triggers a PNG download.
 */
export function exportWaveformPng(
  canvas: HTMLCanvasElement | null,
  filenamePrefix: string = "criticalpath_plot",
): void {
  if (!canvas) {
    alert("Canvas element not found.")
    return
  }

  try {
    const dataUrl = canvas.toDataURL("image/png")
    const link = document.createElement("a")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    link.setAttribute("href", dataUrl)
    link.setAttribute("download", `${filenamePrefix}_${timestamp}.png`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (err: any) {
    console.error("Failed to export waveform PNG:", err)
    alert("Failed to export image: " + (err.message || String(err)))
  }
}
