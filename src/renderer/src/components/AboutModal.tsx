import { useState, useEffect } from "react"
import { Info, X, ExternalLink, Cpu, Code2, ShieldCheck, Sparkles } from "lucide-react"

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "licenses" | "disclaimer">("overview")

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const openUrl = (url: string) => {
    if (window.api && (window as any).electron?.shell?.openExternal) {
      (window as any).electron.shell.openExternal(url)
    } else {
      window.open(url, "_blank")
    }
  }

  const licenses = [
    { name: "ngspice", role: "Native SPICE Simulation Engine", license: "BSD / LGPL", url: "https://ngspice.sourceforge.io/" },
    { name: "Electron", role: "Desktop Application Runtime", license: "MIT", url: "https://www.electronjs.org/" },
    { name: "React 19", role: "UI & Component Framework", license: "MIT", url: "https://react.dev/" },
    { name: "ReactFlow", role: "Schematic Canvas Graph Engine", license: "MIT", url: "https://reactflow.dev/" },
    { name: "Plotly.js", role: "Waveform & HUD Plotting", license: "MIT", url: "https://plotly.com/javascript/" },
    { name: "Vite / electron-vite", role: "Bundler & Build Toolchain", license: "MIT", url: "https://electron-vite.org/" },
    { name: "TypeScript", role: "Static Type System", license: "Apache 2.0", url: "https://www.typescriptlang.org/" },
    { name: "Lucide Icons", role: "CAD & UI Vector Icons", license: "ISC", url: "https://lucide.dev/" },
    { name: "i18next", role: "Multilingual Internationalization", license: "MIT", url: "https://www.i18next.com/" },
    { name: "PrismJS", role: "SPICE Netlist Syntax Highlighting", license: "MIT", url: "https://prismjs.com/" },
    { name: "Google Gemini API", role: "Cloud AI Assistant Provider", license: "Commercial API", url: "https://ai.google.dev/" },
    { name: "Groq Cloud API", role: "Fast LLM Inference Provider", license: "Commercial API", url: "https://groq.com/" },
  ]

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 640,
          maxHeight: "85vh",
          backgroundColor: "#0d131f",
          border: "1px solid #1e293b",
          borderRadius: 8,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#e2e8f0",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, #131b2e 0%, #0d131f 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 0 12px rgba(37, 99, 235, 0.4)",
              }}
            >
              <Cpu size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", color: "#f8fafc" }}>
                  ASAP
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "#38bdf8",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                  }}
                >
                  v1.0.0
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Open-Source EDA & SPICE Circuit Simulator
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: 6,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #1e293b",
            background: "#090d16",
            padding: "0 16px",
          }}
        >
          <button
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "overview" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "overview" ? "#38bdf8" : "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Info size={14} />
            Overview & Credits
          </button>
          <button
            onClick={() => setActiveTab("licenses")}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "licenses" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "licenses" ? "#38bdf8" : "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Code2 size={14} />
            Open Source Licenses
          </button>
          <button
            onClick={() => setActiveTab("disclaimer")}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "disclaimer" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "disclaimer" ? "#38bdf8" : "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            Legal & Warranty
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1, fontSize: 13, lineHeight: 1.6 }}>
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Simulation Engine Box */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 6,
                  backgroundColor: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#38bdf8" }}>
                    <Cpu size={16} />
                    <span>Simulation Engine: ngspice</span>
                  </div>
                  <button
                    onClick={() => openUrl("https://ngspice.sourceforge.io/")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#38bdf8")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                  >
                    <span>ngspice.sourceforge.io</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                  ASAP runs native <strong>ngspice</strong> (Spice64) in console batch mode. ngspice is an open-source, mixed-signal SPICE circuit simulator based on Berkeley SPICE3f5, Cider1b1, and XSPICE.
                </div>
              </div>

              {/* AI Copilot Box */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 6,
                  backgroundColor: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#a855f7", marginBottom: 6 }}>
                  <Sparkles size={16} />
                  <span>AI Circuit Assistant</span>
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                  Powered by <strong>Google Gemini</strong> (Gemini 2.5/1.5 Flash) and <strong>Groq Cloud</strong> (Meta Llama 3.3). Users provide their own API keys via the AI settings modal to enable instant circuit diagnostics and engineering design guidance.
                </div>
              </div>

              {/* Project Info */}
              <div style={{ color: "#94a3b8", fontSize: 12, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
                <div><strong>ASAP</strong> is maintained by the CriticalPath Team.</div>
                <div>Licensed under the <strong>MIT License</strong>. Free and open source for students, engineers, and researchers.</div>
              </div>
            </div>
          )}

          {activeTab === "licenses" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                ASAP utilizes the following open-source projects and libraries:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {licenses.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 4,
                      backgroundColor: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid #1e293b",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 12 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.role}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 3,
                          backgroundColor: "#1e293b",
                          color: "#94a3b8",
                        }}
                      >
                        {item.license}
                      </span>
                      <button
                        onClick={() => openUrl(item.url)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: 4,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#38bdf8")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
                        title={`Visit ${item.name} homepage`}
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "disclaimer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12, color: "#94a3b8" }}>
              <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: 13 }}>
                Disclaimer of Warranty & Limitation of Liability
              </div>
              <div style={{ padding: 12, backgroundColor: "rgba(15, 23, 42, 0.7)", border: "1px solid #1e293b", borderRadius: 4, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "#cbd5e1" }}>
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                SOFTWARE.
              </div>
              <p>
                Circuit simulation results and AI assistant recommendations are computed estimates and should be verified against physical hardware prototypes and component manufacturer datasheets before hardware deployment.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#090d16",
          }}
        >
          <span style={{ fontSize: 11, color: "#64748b" }}>
            © 2026 CriticalPath Team. All rights reserved.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: "#1e293b",
              color: "#f1f5f9",
              border: "1px solid #334155",
              borderRadius: 4,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#334155")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1e293b")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
