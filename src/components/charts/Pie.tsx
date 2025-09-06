import React from 'react'

export interface PieDatum {
  label: string
  value: number
  color?: string
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return [
    'M',
    start.x,
    start.y,
    'A',
    r,
    r,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    'L',
    cx,
    cy,
    'Z',
  ].join(' ')
}

export default function Pie({
  data,
  size = 180,
  innerRatio = 0.55,
}: {
  data: PieDatum[]
  size?: number
  innerRatio?: number
}) {
  const total = Math.max(
    0,
    data.reduce((sum, d) => sum + (d.value || 0), 0)
  )
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  const innerR = r * innerRatio

  // Avoid rendering arcs when total is 0
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="#f5f5f5" />
        <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
      </svg>
    )
  }

  let currentAngle = 0
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, idx) => {
      const angle = (d.value / total) * 360
      const start = currentAngle
      const end = currentAngle + angle
      currentAngle = end
      return <path key={idx} d={describeArc(cx, cy, r, start, end)} fill={d.color || '#ccc'} />
    })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g>{slices}</g>
      {/* inner hole */}
      <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
    </svg>
  )
}
