import React from 'react'
import { useTranslation } from 'react-i18next'
import { useViewport } from 'reactflow'
import {
  renderSymbol,
  getComponentPins,
  getRotatedPinPos,
  type SchematicComponentType
} from './SchematicNode'
import { type BoundingBox, buildOrthogonalDraftPoints } from '../../utils/wireRouter'

export interface WireDraft {
  isDrawing: boolean
  points: { x: number; y: number }[]
  startPin?: { nodeId: string; handleId?: string }
  bendOrientation: 'h' | 'v'
}

export interface PlacingComponent {
  type: SchematicComponentType | 'junction'
  rotation: number
  customValue?: string
}

interface CadCrosshairLayerProps {
  activeTool: 'select' | 'wire' | 'junction' | 'delete' | 'probe'
  cursorGridPos: { x: number; y: number }
  isHoveringCanvas: boolean
  wireDraft: WireDraft
  placingComponent?: PlacingComponent | null
  obstacles?: BoundingBox[]
}

export default function CadCrosshairLayer({
  activeTool,
  cursorGridPos,
  isHoveringCanvas,
  wireDraft,
  placingComponent,
  obstacles = []
}: CadCrosshairLayerProps): React.JSX.Element | null {
  const { t } = useTranslation('common')
  const { x: vpX, y: vpY, zoom } = useViewport()

  const isPlacing = Boolean(placingComponent)
  const isDeleteMode = activeTool === 'delete'
  const isProbeMode = activeTool === 'probe'
  if ((activeTool !== 'wire' && !isPlacing) || !isHoveringCanvas || isProbeMode || isDeleteMode) {
    return null
  }

  // Convert flow (schematic) coordinates to screen viewport coordinates
  const toScreen = (flowX: number, flowY: number): { sx: number; sy: number } => ({
    sx: flowX * zoom + vpX,
    sy: flowY * zoom + vpY
  })

  const { sx: curScreenX, sy: curScreenY } = toScreen(cursorGridPos.x, cursorGridPos.y)

  // Build live preview path for wire drawing (100% strictly straight orthogonal lines)
  let draftSvgPath = ''
  const committedPointsScreen: { sx: number; sy: number }[] = []

  if (wireDraft.isDrawing && wireDraft.points.length > 0) {
    const displayPts = buildOrthogonalDraftPoints(
      wireDraft.points,
      cursorGridPos,
      wireDraft.bendOrientation,
      obstacles
    )

    for (let i = 0; i < displayPts.length; i++) {
      const p = toScreen(displayPts[i].x, displayPts[i].y)
      committedPointsScreen.push(p)
      if (i === 0) {
        draftSvgPath += `M ${p.sx} ${p.sy}`
      } else {
        draftSvgPath += ` L ${p.sx} ${p.sy}`
      }
    }
  }

  return (
    <svg
      className="cad-crosshair-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 25,
        overflow: 'visible'
      }}
    >
      {/* 1. Full Canvas Crosshair Guides (Subtle LTspice Style) */}
      <line
        x1={0}
        y1={curScreenY}
        x2="100%"
        y2={curScreenY}
        stroke="rgba(100, 116, 139, 0.45)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <line
        x1={curScreenX}
        y1={0}
        x2={curScreenX}
        y2="100%"
        stroke="rgba(100, 116, 139, 0.45)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* 2. Grid Snapped Target Marker */}
      <circle
        cx={curScreenX}
        cy={curScreenY}
        r={5}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.5}
        opacity={0.8}
      />
      <circle cx={curScreenX} cy={curScreenY} r={1.8} fill="#2563eb" />

      {/* 3. Ghost Component Preview During Placement */}
      {isPlacing &&
        placingComponent &&
        (placingComponent.type === 'junction' ? (
          <g transform={`translate(${curScreenX}, ${curScreenY})`}>
            <circle
              r={9}
              fill="rgba(37, 99, 235, 0.15)"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <circle r={4} fill="#2563eb" />
            <g transform="translate(0, 24)">
              <rect x={-55} y={-9} width={110} height={18} rx={9} fill="rgba(17, 24, 39, 0.88)" />
              <text
                x={0}
                y={4}
                fill="#ffffff"
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                {t('canvasHints.clickPlaceDot')}
              </text>
            </g>
          </g>
        ) : (
          <g
            transform={`translate(${curScreenX}, ${curScreenY}) scale(${zoom})`}
            pointerEvents="none"
          >
            <g
              transform={(() => {
                const isNetOrPort =
                  placingComponent.type === 'port-in' ||
                  placingComponent.type === 'port-out' ||
                  placingComponent.type === 'port-bi' ||
                  placingComponent.type === 'net-label'
                if (isNetOrPort) {
                  const pins = getComponentPins(placingComponent.type as SchematicComponentType)
                  const targetPin = pins[0] || { x: 0, y: 40 }
                  const rotPin = getRotatedPinPos(targetPin, placingComponent.rotation)
                  return `translate(${-rotPin.x}, ${-rotPin.y}) rotate(${placingComponent.rotation}, 60, 40)`
                }
                return `translate(-60, -40) rotate(${placingComponent.rotation}, 60, 40)`
              })()}
            >
              {/* Component vector graphic */}
              <g opacity={0.9}>
                {renderSymbol(
                  placingComponent.type as SchematicComponentType,
                  placingComponent.customValue
                )}
              </g>
              {/* Connection lead terminals */}
              {placingComponent.type !== 'net-label' &&
                getComponentPins(placingComponent.type as SchematicComponentType).map((pin) => (
                  <circle
                    key={pin.id}
                    cx={pin.x}
                    cy={pin.y}
                    r={4}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                ))}
            </g>
            {/* Instruction badge below */}
            <g transform="translate(0, 56)">
              <rect x={-68} y={-10} width={136} height={20} rx={10} fill="rgba(17, 24, 39, 0.88)" />
              <text
                x={0}
                y={4}
                fill="#ffffff"
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                fontFamily="sans-serif"
              >
                {t('canvasHints.clickPlaceRotate')}
              </text>
            </g>
          </g>
        ))}

      {/* 4. Live Wire Preview Path */}
      {draftSvgPath && (
        <>
          <path
            d={draftSvgPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Committed Waypoint Markers */}
          {committedPointsScreen.map((pt, idx) => (
            <circle
              key={idx}
              cx={pt.sx}
              cy={pt.sy}
              r={3.5}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
          ))}
        </>
      )}
    </svg>
  )
}
