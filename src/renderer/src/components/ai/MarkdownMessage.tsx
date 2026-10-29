import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import { Copy, Check, Code2, ExternalLink } from 'lucide-react'

// Define SPICE netlist syntax for Prism syntax highlighter
if (!Prism.languages.spice) {
  Prism.languages.spice = {
    comment: {
      pattern: /(^[ \t]*[*;].*|\s+;.*)/m,
      greedy: true,
    },
    directive: {
      pattern: /^[ \t]*\.[a-zA-Z0-9_]+/m,
      alias: 'keyword',
    },
    component: {
      pattern: /^[ \t]*[A-Za-z0-9_]+/m,
      alias: 'function',
    },
    number: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:meg|[kMunpfza]|MEG|[KMUNPFZA])?\b/,
    string: /(["'])(?:(?=(\\?))\2.)*?\1/,
    operator: /[=+\-*/()]/,
  }
  Prism.languages.netlist = Prism.languages.spice
  Prism.languages.cir = Prism.languages.spice
  Prism.languages.sp = Prism.languages.spice
}

function extractBalancedBraced(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (startIndex >= str.length || str[startIndex] !== '{') return null
  let depth = 0
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{') depth++
    else if (str[i] === '}') {
      depth--
      if (depth === 0) {
        return { content: str.slice(startIndex + 1, i), endIndex: i }
      }
    }
  }
  return null
}

function resolveNestedFracs(str: string): string {
  let result = str
  let limit = 0
  while (limit < 20) {
    const idx = result.indexOf('\\frac{')
    if (idx === -1) break
    const num = extractBalancedBraced(result, idx + 5)
    if (!num) break
    const den = extractBalancedBraced(result, num.endIndex + 1)
    if (!den) break

    const cleanNum = num.content.trim()
    const cleanDen = den.content.trim()
    result = result.slice(0, idx) + `(${cleanNum} / ${cleanDen})` + result.slice(den.endIndex + 1)
    limit++
  }
  return result
}

function resolveNestedCommands(str: string, cmd: string, prefix = '', suffix = ''): string {
  let result = str
  const target = cmd + '{'
  let limit = 0
  while (limit < 30) {
    const idx = result.indexOf(target)
    if (idx === -1) break
    const braced = extractBalancedBraced(result, idx + cmd.length)
    if (!braced) break

    result = result.slice(0, idx) + prefix + braced.content.trim() + suffix + result.slice(braced.endIndex + 1)
    limit++
  }
  return result
}

/**
 * Converts raw LaTeX formula markup (e.g. \frac, \boxed, \text, \times, \Omega, \approx, ;;)
 * into clean, readable Unicode math typography.
 */
export function cleanLatexMath(raw: string): string {
  if (!raw) return ''
  // Don't modify content inside actual ``` code blocks
  const parts = raw.split(/(```[\s\S]*?```)/g)
  return parts.map((part, index) => {
    if (index % 2 === 1) return part

    let text = part

    // 1. Unwrap \boxed{...} and /boxed{...}
    text = resolveNestedCommands(text, '\\boxed')
    text = resolveNestedCommands(text, '/boxed')

    // 2. Unwrap text formatting commands: \text{...}, \mathrm{...}, \mathbf{...}
    text = resolveNestedCommands(text, '\\text')
    text = resolveNestedCommands(text, '\\mathrm')
    text = resolveNestedCommands(text, '\\mathbf')

    // 3. Resolve fractions (including nested braces like \frac{V_{ref}}{I_{div}})
    text = resolveNestedFracs(text)

    // 4. Clean subscript braces: I_{div} -> I_div, V_{ref} -> V_ref, A_{v} -> Av
    text = text.replace(/([A-Za-z0-9]+)_\{([A-Za-z0-9]+)\}/g, '$1_$2')

    // 5. Clean LaTeX spacing and double semicolons (;; or \;)
    text = text
      .replace(/;{2,}/g, '  ')
      .replace(/\\;/g, ' ')
      .replace(/\\:/g, ' ')
      .replace(/\\,/g, ' ')
      .replace(/\\quad/g, '  ')
      .replace(/\\qquad/g, '   ')

    // 6. Convert common LaTeX mathematical & electrical symbols to clean Unicode
    text = text
      .replace(/\\Omega\b/g, 'Ω')
      .replace(/\\mu\b/g, 'µ')
      .replace(/\\times\b/g, '×')
      .replace(/\\cdot\b/g, '·')
      .replace(/\\approx\b/g, '≈')
      .replace(/\\Longleftrightarrow\b/g, '⟺')
      .replace(/\\Longrightarrow\b/g, '⟹')
      .replace(/\\Rightarrow\b/g, '⇒')
      .replace(/\\rightarrow\b/g, '→')
      .replace(/\\Leftarrow\b/g, '⇐')
      .replace(/\\leftarrow\b/g, '←')
      .replace(/\\pm\b/g, '±')
      .replace(/\\mp\b/g, '∓')
      .replace(/\\neq\b/g, '≠')
      .replace(/\\leq\b/g, '≤')
      .replace(/\\geq\b/g, '≥')
      .replace(/\\Delta\b/g, 'Δ')
      .replace(/\\pi\b/g, 'π')
      .replace(/\\infty\b/g, '∞')
      .replace(/\\degree\b/g, '°')
      .replace(/\\circ\b/g, '°')
      .replace(/\\parallel\b/g, '||')
      .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')

    // 7. Clean \left and \right
    text = text.replace(/\\left\s*([([{|.])/g, '$1').replace(/\\right\s*([)\]}|.])/g, '$1')

    // 8. Clean inline math delimiters \( ... \)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, '$1')

    // 9. Format standalone equation blocks: \[ ... \], $$ ... $$, or [ ... ]
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => '\n> ' + eq.trim() + '\n')
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => '\n> ' + eq.trim() + '\n')
    text = text.replace(/(^|\n)\[\s*([^\]]*?(?:\/|×|·|≈|Ω|⇒|⟹|kΩ|mA|Idiv|Vref|Av)[^\]]*?)\s*\](?=\n|$)/gm, (_, _prefix, eq) => '\n> ' + eq.trim() + '\n')

    // 10. Clean up any asterisks inside blockquotes: e.g. "> ** equation **" -> "> equation"
    text = text.replace(/(^|\n)>\s*\*\*\s*([\s\S]*?)\s*\*\*(?=\n|$)/g, '$1> $2')
    text = text.replace(/(^|\n)>\s*\*+([^\n*]+?)\*+(?=\n|$)/g, '$1> $2')

    // 11. Strip ** around mathematical equations & formulas (e.g. "** I_div = 1 mA ⇒ R2 = V_ref / I_div **")
    text = text.replace(/\*\*\s*([^\n*]*?(?:=|\/|×|·|≈|Ω|⇒|⟹|kΩ|mA|µF|Idiv|Vref|Av)[^\n*]*?)\s*\*\*/g, '$1')

    // 12. Fix spaced bolding like "** text **" so CommonMark parses it properly into bold instead of showing literal "**"
    text = text.replace(/\*\*\s+([^\n*]+?)\s+\*\*/g, '**$1**')

    // 13. Remove any lone dangling double-asterisks
    text = text.replace(/(^|\s)\*\*(?=\s|$)/g, '$1')

    return text
  }).join('')
}

/**
 * Ensures that streaming/partial Markdown balances unclosed tokens
 * so that raw symbols like unclosed ```, **, or ` do not flash on screen.
 */
export function preprocessStreamingMarkdown(raw: string): string {
  if (!raw) return ''
  let text = cleanLatexMath(raw)

  // 1. Balance triple backtick code blocks
  const codeBlockMatches = text.match(/```/g)
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    text += '\n```\n'
    return text // If inside a code block, inner asterisks are literal code
  }

  // 2. Remove completed code blocks temporarily to inspect inline markdown
  const outsideCode = text.replace(/```[\s\S]*?```/g, '')

  // 3. Balance inline code (single ` outside code blocks)
  const inlineCodeMatches = outsideCode.match(/(?<!`)`(?!`)/g)
  if (inlineCodeMatches && inlineCodeMatches.length % 2 !== 0) {
    text += '`'
  }

  // 4. Balance bold (** or __)
  const boldAsteriskMatches = (outsideCode.match(/\*\*/g) || []).length
  if (boldAsteriskMatches % 2 !== 0) {
    text += '**'
  }

  const boldUnderscoreMatches = (outsideCode.match(/__/g) || []).length
  if (boldUnderscoreMatches % 2 !== 0) {
    text += '__'
  }

  // 5. Handle trailing dangling header symbols e.g. "## " with nothing after
  text = text.replace(/(^|\n)(#{1,6})\s*$/, '$1')

  return text
}

const CodeBlock: React.FC<{ language?: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false)
  const lang = (language || 'text').toLowerCase()

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  let highlighted = code
  const grammar = Prism.languages[lang] || Prism.languages.clike || Prism.languages.javascript
  if (grammar) {
    try {
      highlighted = Prism.highlight(code, grammar, lang)
    } catch {}
  }

  return (
    <div
      style={{
        margin: '10px 0',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#0f172a',
        border: '1px solid #334155',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: 12,
      }}
    >
      {/* Code Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          color: '#94a3b8',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Code2 size={13} color="#818cf8" />
          {lang === 'spice' || lang === 'netlist' ? 'SPICE Netlist' : lang}
        </span>
        <button
          onClick={handleCopy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: copied ? '#059669' : '#334155',
            color: '#ffffff',
            border: 'none',
            borderRadius: 4,
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={11} /> Copied!
            </>
          ) : (
            <>
              <Copy size={11} /> Copy
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <pre
        style={{
          margin: 0,
          padding: '12px 14px',
          overflowX: 'auto',
          lineHeight: 1.55,
          color: '#e2e8f0',
        }}
      >
        <code
          dangerouslySetInnerHTML={{ __html: highlighted }}
          style={{ fontFamily: 'inherit', background: 'transparent' }}
        />
      </pre>
    </div>
  )
}

interface MarkdownMessageProps {
  content: string
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  const processed = preprocessStreamingMarkdown(content)

  return (
    <div className="criticalpath-markdown-body" style={{ color: 'inherit', lineHeight: 1.55 }}>
      {/* Scoped Prism syntax highlighting tokens */}
      <style>{`
        .criticalpath-markdown-body .token.comment { color: #64748b; font-style: italic; }
        .criticalpath-markdown-body .token.keyword { color: #c084fc; font-weight: 600; }
        .criticalpath-markdown-body .token.function { color: #38bdf8; }
        .criticalpath-markdown-body .token.number { color: #fb923c; }
        .criticalpath-markdown-body .token.string { color: #34d399; }
        .criticalpath-markdown-body .token.operator { color: #f472b6; }
        .criticalpath-markdown-body .token.punctuation { color: #94a3b8; }
        .criticalpath-markdown-body .token.boolean { color: #f87171; }
        .criticalpath-markdown-body .token.property { color: #38bdf8; }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: '6px 0', lineHeight: 1.55 }}>{children}</p>,
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: '14px 0 6px',
                color: '#0f172a',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: 4,
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '12px 0 5px', color: '#0f172a' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 13.5, fontWeight: 650, margin: '10px 0 4px', color: '#1e293b' }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ fontSize: 12.5, fontWeight: 650, margin: '8px 0 3px', color: '#334155' }}>
              {children}
            </h4>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: '#0f172a' }}>{children}</strong>
          ),
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          ul: ({ children }) => (
            <ul style={{ margin: '6px 0', paddingLeft: 20, listStyleType: 'disc' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '6px 0', paddingLeft: 20, listStyleType: 'decimal' }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '3px 0', lineHeight: 1.5 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '8px 0',
                padding: '6px 12px',
                borderLeft: '3px solid #6366f1',
                background: '#f8fafc',
                borderRadius: '0 6px 6px 0',
                color: '#475569',
                fontStyle: 'italic',
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />
          ),
          table: ({ children }) => (
            <div
              style={{
                overflowX: 'auto',
                margin: '10px 0',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>{children}</tr>
          ),
          th: ({ children }) => (
            <th
              style={{
                padding: '6px 10px',
                textAlign: 'left',
                fontWeight: 650,
                color: '#334155',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ padding: '6px 10px', color: '#1e293b' }}>{children}</td>
          ),
          a: ({ href, children }) => {
            let isSafe = false
            try {
              if (href) {
                const u = new URL(href, 'https://example.com')
                isSafe = ['http:', 'https:', 'mailto:'].includes(u.protocol)
              }
            } catch {}

            if (!isSafe || !href) {
              return <span>{children}</span>
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  window.open(href, '_blank', 'noopener,noreferrer')
                }}
                style={{
                  color: '#4f46e5',
                  textDecoration: 'underline',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                }}
                title={`Open ${href}`}
              >
                {children}
                <ExternalLink size={10} style={{ opacity: 0.7 }} />
              </a>
            )
          },
          code: ({ inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '')
            const textContent = String(children).replace(/\n$/, '')
            const isInline = inline || (!match && !textContent.includes('\n'))
            if (!isInline) {
              return (
                <CodeBlock
                  language={match ? match[1] : undefined}
                  code={textContent}
                />
              )
            }
            return (
              <code
                style={{
                  background: '#ede9fe',
                  color: '#5b21b6',
                  padding: '2px 5px',
                  borderRadius: 4,
                  fontSize: '0.9em',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontWeight: 500,
                }}
                {...props}
              >
                {children}
              </code>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
