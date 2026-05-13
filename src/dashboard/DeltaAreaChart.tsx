type Point = { x: number; y: number }

type Props = {
  /** Strokes vs par per completed round, chronological (oldest → newest). */
  deltas: number[]
  /** Accessible label for the SVG. */
  'aria-label': string
}

/** Lightweight SVG area chart (no external chart library). */
export function DeltaAreaChart({ deltas, 'aria-label': ariaLabel }: Props) {
  if (deltas.length === 0) {
    return null
  }

  const w = 320
  const h = 96
  const padX = 6
  const padY = 8
  const innerW = w - padX * 2
  const innerH = h - padY * 2

  const minY = Math.min(...deltas, 0)
  const maxY = Math.max(...deltas, 0)
  const spanY = Math.max(maxY - minY, 1)

  const points: Point[] = deltas.map((delta, index) => {
    const t = deltas.length === 1 ? 0.5 : index / (deltas.length - 1)
    const x = padX + t * innerW
    const ny = (delta - minY) / spanY
    const y = padY + (1 - ny) * innerH
    return { x, y }
  })

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const baseY = padY + (1 - (0 - minY) / spanY) * innerH
  const areaD = `${lineD} L ${points[points.length - 1]?.x.toFixed(1) ?? padX} ${baseY.toFixed(1)} L ${points[0]?.x.toFixed(1) ?? padX} ${baseY.toFixed(1)} Z`

  return (
    <svg
      className="delta-area-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <path className="delta-area-chart__area" d={areaD} fill="currentColor" opacity={0.12} />
      <path
        className="delta-area-chart__line"
        d={lineD}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
