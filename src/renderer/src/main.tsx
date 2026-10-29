import './assets/main.css'
import './i18n'

import { StrictMode, Component, ReactNode, ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled React Render Error in ASAP:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'Segoe UI, Tahoma, sans-serif', background: '#fff', color: '#111', height: '100vh', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#d32f2f', margin: '0 0 12px 0' }}>An error occurred in ASAP EDA</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#444' }}>
            The application encountered a render problem. You can reload the window or inspect the error details below.
          </p>
          <pre style={{ background: '#f5f5f5', padding: 12, border: '1px solid #ddd', borderRadius: 4, overflow: 'auto', maxHeight: 280, fontSize: 12 }}>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '6px 16px', background: '#0078d7', color: '#fff', border: '1px solid #005499', borderRadius: 2, cursor: 'pointer', fontSize: 13 }}
          >
            Reload Application
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
)

