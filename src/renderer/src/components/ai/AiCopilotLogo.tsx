import React from 'react'

interface AiCopilotLogoProps {
  size?: number
  active?: boolean
  className?: string
  glow?: boolean
}

export const AiCopilotLogo: React.FC<AiCopilotLogoProps> = ({
  size = 15,
  active = false,
  className,
  glow = false,
}) => {
  const gradId = `ai-logo-grad-${size}-${active ? 'act' : 'inact'}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: active || glow ? 'drop-shadow(0 0 3px rgba(168, 85, 247, 0.6))' : 'drop-shadow(0 0 1px rgba(139, 92, 246, 0.3))',
        transition: 'filter 0.2s ease',
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="45%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      {/* Primary 4-pointed radiant intelligence astroid star */}
      <path
        d="M8 1C8 4.866 11.134 8 15 8C11.134 8 8 11.134 8 15C8 11.134 4.866 8 1 8C4.866 8 8 4.866 8 1Z"
        fill={`url(#${gradId})`}
      />

      {/* Companion intelligence glint (top right) */}
      <path
        d="M13 1.5C13 2.33 13.67 3 14.5 3C13.67 3 13 3.67 13 4.5C13 3.67 12.33 3 11.5 3C12.33 3 13 2.33 13 1.5Z"
        fill="#c084fc"
      />

      {/* Micro electric circuit node glint (bottom left) */}
      <circle cx="3" cy="13" r="1.1" fill="#38bdf8" />
    </svg>
  )
}
