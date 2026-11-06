import { useId } from 'react'

interface LogoProps {
  size?: number
  showWordmark?: boolean
  tone?: 'default' | 'onBrand'
  className?: string
}

export function Logo({
  size = 32,
  showWordmark = true,
  tone = 'default',
  className = '',
}: LogoProps) {
  const gradientId = `logo-accent-${useId().replace(/:/g, '')}`
  const wordmarkColor = tone === 'onBrand' ? '#FFFFFF' : '#0F172A'
  const mark = (
    <>
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="39"
        rx="11"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeOpacity="0.10"
      />
      <path
        d="M13.5 12.5h13M13.5 27.5h13M13.5 12.5v15"
        fill="none"
        stroke="#0F172A"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13.5 20h9.5"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </>
  )
  const defs = (
    <defs>
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1="13.5"
        y1="20"
        x2="23"
        y2="20"
      >
        <stop offset="0" stopColor="#4F46E5" />
        <stop offset="1" stopColor="#7C3AED" />
      </linearGradient>
    </defs>
  )

  if (!showWordmark) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        role="img"
        aria-label="EduAssist"
        className={className}
      >
        {defs}
        {mark}
      </svg>
    )
  }

  return (
    <svg
      width={size * 4.4}
      height={size}
      viewBox="0 0 176 40"
      role="img"
      aria-label="EduAssist"
      className={className}
    >
      {defs}
      {mark}
      <text
        x="54"
        y="27"
        fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
        fontSize="20"
        fontWeight="600"
        letterSpacing="-0.5"
        fill={wordmarkColor}
      >
        EduAssist
      </text>
    </svg>
  )
}
