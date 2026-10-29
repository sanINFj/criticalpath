import React, { useState, useEffect, useRef } from 'react'
import type { CircuitTab } from '../../utils/circuitProject'

interface CircuitTabBarProps {
  tabs: CircuitTab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  onSaveTab?: (tabId: string, saveAs?: boolean) => void
  onCloseOtherTabs?: (tabId: string) => void
  onCloseAllTabs?: () => void
}

export default function CircuitTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onSaveTab,
  onCloseOtherTabs,
  onCloseAllTabs,
}: CircuitTabBarProps) {
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    tabId: string
  }>({ visible: false, x: 0, y: 0, tabId: '' })

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
      }
    }
    if (contextMenu.visible) {
      window.addEventListener('click', handleOutsideClick)
      window.addEventListener('contextmenu', handleOutsideClick)
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick)
      window.removeEventListener('contextmenu', handleOutsideClick)
    }
  }, [contextMenu.visible])

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    })
  }

  const activeContextMenuTab = tabs.find((t) => t.id === contextMenu.tabId)

  return (
    <div className="circuit-tab-bar" role="tablist" aria-label="Schematic Tabs">
      <div className="circuit-tabs-scroll">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`circuit-tab ${isActive ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
              role="tab"
              aria-selected={isActive}
              title={tab.filePath ? `${tab.title}\n${tab.filePath}` : tab.title}
            >
              {/* Circuit Schematic Icon */}
              <span className="circuit-tab-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1" />
                  <line x1="2" y1="8" x2="5.5" y2="8" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="10.5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </span>

              {/* Title & Dirty indicator */}
              <span className="circuit-tab-title">
                {tab.title}
                {tab.isDirty && <span className="circuit-tab-dirty-bullet" title="Unsaved changes">*</span>}
              </span>

              {/* Close Tab Button */}
              <button
                className="circuit-tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                title="Close Schematic"
                aria-label={`Close ${tab.title}`}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* New Tab Button */}
      <button
        className="circuit-tab-new-btn"
        onClick={onNewTab}
        title="New Schematic (Ctrl+N)"
        aria-label="New Schematic"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Tab Context Menu */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="dropdown-menu circuit-tab-context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="dropdown-item"
            onClick={() => {
              onCloseTab(contextMenu.tabId)
              setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
            }}
          >
            <span>Close</span>
            <span className="shortcut">Ctrl+W</span>
          </button>

          {onCloseOtherTabs && tabs.length > 1 && (
            <button
              className="dropdown-item"
              onClick={() => {
                onCloseOtherTabs(contextMenu.tabId)
                setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
              }}
            >
              <span>Close Others</span>
            </button>
          )}

          {onCloseAllTabs && tabs.length > 1 && (
            <button
              className="dropdown-item"
              onClick={() => {
                onCloseAllTabs()
                setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
              }}
            >
              <span>Close All</span>
            </button>
          )}

          <div className="dropdown-separator" />

          {onSaveTab && (
            <>
              <button
                className="dropdown-item"
                onClick={() => {
                  onSaveTab(contextMenu.tabId, false)
                  setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
                }}
              >
                <span>Save</span>
                <span className="shortcut">Ctrl+S</span>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  onSaveTab(contextMenu.tabId, true)
                  setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
                }}
              >
                <span>Save As...</span>
                <span className="shortcut">Ctrl+Shift+S</span>
              </button>
            </>
          )}

          {activeContextMenuTab?.filePath && (
            <>
              <div className="dropdown-separator" />
              <button
                className="dropdown-item"
                onClick={() => {
                  navigator.clipboard.writeText(activeContextMenuTab.filePath || '')
                  setContextMenu({ visible: false, x: 0, y: 0, tabId: '' })
                }}
              >
                <span>Copy File Path</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
