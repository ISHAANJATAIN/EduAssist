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
  const id = useId().replace(/:/g, '')
  const tileId = `logo-tile-${id}`
  const goldId = `logo-gold-${id}`
  const wordmarkColor = tone === 'onBrand' ? '#F6F2E9' : '#12161F'

  const mark = (
    <>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill={`url(#${tileId})`} />
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="37.5"
        rx="10.25"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.09"
      />
      <path
        d="M10 1.6h20c5 0 9 4 9 9"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.10"
        strokeWidth="0.8"
      />
      <path
        d="M19.1 15.4C16.2 13.6 12.6 13 9.7 13.7V27.4c2.9-.6 6.5 0 9.4 1.8Z"
        fill="#F6F2E9"
      />
      <path
        d="M20.9 15.4c2.9-1.8 6.5-2.4 9.4-1.7v13.7c-2.9-.6-6.5 0-9.4 1.8Z"
        fill={`url(#${goldId})`}
      />
    </>
  )

  const defs = (
    <defs>
      <linearGradient
        id={tileId}
        x1="0"
        y1="0"
        x2="0"
        y2="40"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#1D2331" />
        <stop offset="1" stopColor="#0B0F16" />
      </linearGradient>
      <linearGradient
        id={goldId}
        x1="20"
        y1="14"
        x2="31"
        y2="29"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#E3BE83" />
        <stop offset="1" stopColor="#A9814A" />
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
        y="27.6"
        fontFamily="Fraunces, 'Iowan Old Style', Georgia, serif"
        fontSize="21"
        fontWeight="600"
        letterSpacing="-0.4"
        fill={wordmarkColor}
      >
        EduAssist
      </text>
    </svg>
  )
}
