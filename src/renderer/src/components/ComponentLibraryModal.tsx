import React, { useState, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { X, Search } from "lucide-react"
import {
  renderSymbol,
  getComponentPins,
  type SchematicComponentType,
} from "./schematic/SchematicNode"

export interface ComponentItem {
  type: SchematicComponentType | "junction"
  name: string
  icon: React.ReactNode
  hotkey?: string
  category: string
  defaultValue?: string
  description?: string
}

interface ComponentLibraryModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectComponent: (type: SchematicComponentType) => void
  onSelectJunction: () => void
  catalog: ComponentItem[]
}

const CATEGORIES = [
  "All",
  "Passives",
  "Sources",
  "Diodes",
  "Transistors",
  "Analog & Power",
  "Digital Logic",
  "Power",
  "Connectors",
] as const

export default function ComponentLibraryModal({
  isOpen,
  onClose,
  onSelectComponent,
  onSelectJunction,
  catalog,
}: ComponentLibraryModalProps) {
  const { t } = useTranslation('common')
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedItemType, setSelectedItemType] = useState<string>("resistor")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 50)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter") {
        e.preventDefault()
        handleConfirmPlacement()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, selectedItemType, catalog])

  // Filter components
  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" || item.category === selectedCategory
      const query = searchQuery.trim().toLowerCase()
      if (!query) return matchesCategory

      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.hotkey && item.hotkey.toLowerCase().includes(query)) ||
        (item.defaultValue && item.defaultValue.toLowerCase().includes(query))

      return matchesCategory && matchesSearch
    })
  }, [catalog, selectedCategory, searchQuery])

  // Keep a valid selected item when filters change
  useEffect(() => {
    if (filteredItems.length > 0) {
      const exists = filteredItems.some((item) => item.type === selectedItemType)
      if (!exists) {
        setSelectedItemType(filteredItems[0].type)
      }
    }
  }, [filteredItems, selectedItemType])

  const currentItem = useMemo(() => {
    return catalog.find((item) => item.type === selectedItemType) || filteredItems[0]
  }, [catalog, selectedItemType, filteredItems])

  const handleConfirmPlacement = () => {
    if (!currentItem) return
    if (currentItem.type === "junction") {
      onSelectJunction()
    } else {
      onSelectComponent(currentItem.type as SchematicComponentType)
    }
    onClose()
  }

  const handleItemDoubleClick = (item: ComponentItem) => {
    if (item.type === "junction") {
      onSelectJunction()
    } else {
      onSelectComponent(item.type as SchematicComponentType)
    }
    onClose()
  }

  if (!isOpen) return null

  // Pins for current preview item
  const previewPins =
    currentItem && currentItem.type !== "junction"
      ? getComponentPins(currentItem.type as SchematicComponentType)
      : []

  return (
    <div
      className="comp-lib-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="comp-lib-modal" role="dialog" aria-modal="true">
        {/* Compact Windows Titlebar */}
        <div className="comp-lib-header">
          <div className="comp-lib-title-area">
            <span className="comp-lib-badge" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="4,2 20,12 4,22" />
                <line x1="20" y1="12" x2="23" y2="12" strokeWidth="2.5" />
              </svg>
            </span>
            <span className="comp-lib-title">{t('componentLib.title')} ({catalog.length} {t('componentLib.available')})</span>
          </div>
          <button
            className="comp-lib-close-btn"
            onClick={onClose}
            title={`${t('actions.close')} (Esc)`}
            aria-label="Close"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="comp-lib-search-bar">
          <div className="comp-lib-search-input-wrap">
            <span className="comp-lib-search-icon">⌕</span>
            <input
              ref={searchInputRef}
              type="text"
              className="comp-lib-search-input"
              placeholder={t('componentLib.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="comp-lib-search-clear"
                onClick={() => setSearchQuery("")}
                title="Clear search"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="comp-lib-results-count">
            {filteredItems.length} {filteredItems.length === 1 ? "symbol" : "symbols"}
          </div>
        </div>

        {/* Categories Bar */}
        <div className="comp-lib-categories-bar">
          {CATEGORIES.map((cat) => {
            const count =
              cat === "All"
                ? catalog.length
                : catalog.filter((c) => c.category === cat).length
            if (count === 0 && cat !== "All") return null
            return (
              <button
                key={cat}
                className={`comp-lib-cat-pill ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {t(`componentLib.categories.${cat}`, cat)} <span className="cat-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Main Content: Split Master-Detail */}
        <div className="comp-lib-body">
          {/* Left: Component List */}
          <div className="comp-lib-list-container">
            {filteredItems.length === 0 ? (
              <div className="comp-lib-empty">
                <span className="comp-lib-empty-icon" style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                  <Search size={36} strokeWidth={1.5} color="#94a3b8" />
                </span>
                <p>{t('componentLib.noMatches')}</p>
                <button
                  className="comp-lib-empty-btn"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory("All")
                  }}
                >
                  {t('componentLib.clearFilter')}
                </button>
              </div>
            ) : (
              <div className="comp-lib-item-grid">
                {filteredItems.map((item) => {
                  const isSelected = item.type === currentItem?.type
                  return (
                    <div
                      key={item.type}
                      className={`comp-lib-row ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedItemType(item.type)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      <div className="comp-lib-row-icon">{item.icon}</div>
                      <div className="comp-lib-row-info">
                        <span className="comp-lib-row-name">{item.name}</span>
                        <span className="comp-lib-row-category">{item.category}</span>
                      </div>
                      {item.hotkey && (
                        <kbd className="comp-lib-row-hotkey">{item.hotkey}</kbd>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Symbol Preview & Info */}
          <div className="comp-lib-preview-container">
            <div className="comp-lib-preview-header">
              <span className="comp-lib-preview-title">Symbol Preview</span>
              {currentItem?.defaultValue && (
                <span className="comp-lib-preview-def-val">
                  Default: {currentItem.defaultValue}
                </span>
              )}
            </div>

            <div className="comp-lib-symbol-canvas">
              {/* Fine Grid Pattern */}
              <div className="comp-lib-preview-grid-bg" />

              {currentItem ? (
                currentItem.type === "junction" ? (
                  <div className="comp-lib-preview-junction">
                    <svg width="60" height="60" viewBox="0 0 60 60">
                      <line x1="0" y1="30" x2="60" y2="30" stroke="#1f2937" strokeWidth="2" />
                      <line x1="30" y1="0" x2="30" y2="60" stroke="#1f2937" strokeWidth="2" />
                      <circle cx="30" cy="30" r="6" fill="#1f2937" />
                    </svg>
                    <span className="comp-lib-preview-name">Solder Junction Dot</span>
                  </div>
                ) : (
                  <div className="comp-lib-preview-graphic-wrap">
                    <div className="comp-lib-preview-graphic">
                      {renderSymbol(currentItem.type as SchematicComponentType)}
                    </div>
                    {/* Pin overlay indicator dots */}
                    <svg
                      className="comp-lib-preview-pin-layer"
                      viewBox="0 0 120 80"
                      width="120"
                      height="80"
                    >
                      {previewPins.map((pin) => (
                        <g key={pin.id}>
                          <circle
                            cx={pin.x}
                            cy={pin.y}
                            r={3.5}
                            fill="#2563eb"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        </g>
                      ))}
                    </svg>
                  </div>
                )
              ) : null}
            </div>

            {/* Component Details Card */}
            {currentItem && (
              <div className="comp-lib-details-card">
                <div className="comp-lib-details-row">
                  <span className="comp-lib-detail-label">Component</span>
                  <span className="comp-lib-detail-value">{currentItem.name}</span>
                </div>
                <div className="comp-lib-details-row">
                  <span className="comp-lib-detail-label">Category</span>
                  <span className="comp-lib-detail-value">{currentItem.category}</span>
                </div>
                <div className="comp-lib-details-row">
                  <span className="comp-lib-detail-label">Type Key</span>
                  <span className="comp-lib-detail-value font-mono">{currentItem.type}</span>
                </div>
                {previewPins.length > 0 && (
                  <div className="comp-lib-details-row">
                    <span className="comp-lib-detail-label">Pins ({previewPins.length})</span>
                    <span className="comp-lib-detail-value font-mono">
                      {previewPins.map((p) => p.name).join(", ")}
                    </span>
                  </div>
                )}
                {currentItem.hotkey && (
                  <div className="comp-lib-details-row">
                    <span className="comp-lib-detail-label">Top Toolbar Hotkey</span>
                    <span className="comp-lib-detail-value font-mono">
                      <kbd className="comp-lib-hotkey-badge">{currentItem.hotkey}</kbd>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="comp-lib-footer">
          <div className="comp-lib-footer-hint">
            {t('componentLib.footerHint')}
          </div>
          <div className="comp-lib-footer-actions">
            <button className="comp-lib-cancel-btn" onClick={onClose}>
              {t('actions.cancel')}
            </button>
            <button
              className="comp-lib-place-btn"
              onClick={handleConfirmPlacement}
              disabled={!currentItem}
            >
              {t('componentLib.placeComponent')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
