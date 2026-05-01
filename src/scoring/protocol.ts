export const SCORE_PROTOCOL_V1 = 1 as const

const MIN_HOLE_COUNT = 1
const MAX_HOLE_COUNT = 36
const MIN_STROKES = 1
const MAX_STROKES = 99
const MIN_PAR = 2
const MAX_PAR = 9

type NumericLike = number | string

export type HoleScoreInput = {
  strokes: NumericLike
  par: NumericLike
}

export type NormalizedHoleScore = {
  strokes: number
  par: number
}

export type ScoreProtocolInput = {
  version?: NumericLike
  holeCount: NumericLike
  holeScores: Record<string, HoleScoreInput>
}

export type ScoreProtocol = {
  version: typeof SCORE_PROTOCOL_V1
  holeCount: number
  holeScores: Record<string, NormalizedHoleScore>
}

export type ScoreProtocolIssueCode =
  | 'invalid_version'
  | 'unsupported_version'
  | 'invalid_hole_count'
  | 'invalid_hole_key'
  | 'duplicate_hole_key'
  | 'hole_out_of_range'
  | 'invalid_strokes'
  | 'invalid_par'

export type ScoreProtocolIssue = {
  code: ScoreProtocolIssueCode
  message: string
  path: string
}

export class ScoreProtocolValidationError extends Error {
  issues: ScoreProtocolIssue[]

  constructor(issues: ScoreProtocolIssue[]) {
    super(
      `Score protocol validation failed: ${issues
        .map((issue) => `${issue.path} (${issue.code})`)
        .join(', ')}`,
    )
    this.name = 'ScoreProtocolValidationError'
    this.issues = issues
  }
}

export type HoleScoreUpdateInput = {
  holeNumber: NumericLike
  strokes: NumericLike
  par: NumericLike
}

export type NormalizedHoleScoreUpdate = {
  holeNumber: number
  holeKey: string
  strokes: number
  par: number
}

export type ScoreProtocolAggregate = {
  scoredHoles: number
  totalStrokes: number
  totalPar: number
  totalDelta: number
  missingHoles: number[]
}

function parseInteger(value: NumericLike): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function parseHoleKey(key: string): number | null {
  if (!/^\d+$/.test(key)) {
    return null
  }
  const parsed = Number(key)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function issue(code: ScoreProtocolIssueCode, path: string, message: string): ScoreProtocolIssue {
  return { code, path, message }
}

function normalizeVersion(rawVersion: NumericLike | undefined): number | null {
  const version = rawVersion === undefined ? SCORE_PROTOCOL_V1 : parseInteger(rawVersion)
  if (version === null || version < 1) {
    return null
  }
  return version
}

function normalizeHoleCount(rawHoleCount: NumericLike): number | null {
  const holeCount = parseInteger(rawHoleCount)
  if (holeCount === null) {
    return null
  }
  if (holeCount < MIN_HOLE_COUNT || holeCount > MAX_HOLE_COUNT) {
    return null
  }
  return holeCount
}

export function validateScoreProtocol(input: ScoreProtocolInput): ScoreProtocolIssue[] {
  const issues: ScoreProtocolIssue[] = []
  const version = normalizeVersion(input.version)
  const holeCount = normalizeHoleCount(input.holeCount)

  if (version === null) {
    issues.push(
      issue(
        'invalid_version',
        'version',
        `Version must be a positive integer. Supported version: ${SCORE_PROTOCOL_V1}.`,
      ),
    )
  } else if (version !== SCORE_PROTOCOL_V1) {
    issues.push(
      issue(
        'unsupported_version',
        'version',
        `Unsupported score protocol version ${version}. Supported: ${SCORE_PROTOCOL_V1}.`,
      ),
    )
  }

  if (holeCount === null) {
    issues.push(
      issue(
        'invalid_hole_count',
        'holeCount',
        `holeCount must be an integer in range ${MIN_HOLE_COUNT}-${MAX_HOLE_COUNT}.`,
      ),
    )
  }

  const seenNormalizedKeys = new Map<number, string>()
  for (const [rawKey, score] of Object.entries(input.holeScores)) {
    const pathPrefix = `holeScores.${rawKey}`
    const holeNumber = parseHoleKey(rawKey)
    if (holeNumber === null) {
      issues.push(issue('invalid_hole_key', pathPrefix, `Hole key "${rawKey}" must be a positive integer string.`))
      continue
    }

    const canonical = String(holeNumber)
    const existingRawKey = seenNormalizedKeys.get(holeNumber)
    if (existingRawKey && existingRawKey !== rawKey) {
      issues.push(
        issue(
          'duplicate_hole_key',
          pathPrefix,
          `Hole key "${rawKey}" collides with "${existingRawKey}" after normalization (${canonical}).`,
        ),
      )
      continue
    }
    seenNormalizedKeys.set(holeNumber, rawKey)

    if (holeCount !== null && holeNumber > holeCount) {
      issues.push(
        issue(
          'hole_out_of_range',
          pathPrefix,
          `Hole ${holeNumber} is outside configured holeCount (${holeCount}).`,
        ),
      )
    }

    const strokes = parseInteger(score.strokes)
    if (strokes === null || strokes < MIN_STROKES || strokes > MAX_STROKES) {
      issues.push(
        issue(
          'invalid_strokes',
          `${pathPrefix}.strokes`,
          `strokes must be an integer in range ${MIN_STROKES}-${MAX_STROKES}.`,
        ),
      )
    }

    const par = parseInteger(score.par)
    if (par === null || par < MIN_PAR || par > MAX_PAR) {
      issues.push(
        issue('invalid_par', `${pathPrefix}.par`, `par must be an integer in range ${MIN_PAR}-${MAX_PAR}.`),
      )
    }
  }

  return issues
}

export function normalizeScoreProtocol(input: ScoreProtocolInput): ScoreProtocol {
  const issues = validateScoreProtocol(input)
  if (issues.length > 0) {
    throw new ScoreProtocolValidationError(issues)
  }

  const normalizedHoles: Array<[number, NormalizedHoleScore]> = []
  for (const [rawKey, score] of Object.entries(input.holeScores)) {
    const holeNumber = parseHoleKey(rawKey)
    if (holeNumber === null) {
      continue
    }
    normalizedHoles.push([
      holeNumber,
      {
        strokes: parseInteger(score.strokes) as number,
        par: parseInteger(score.par) as number,
      },
    ])
  }

  normalizedHoles.sort(([a], [b]) => a - b)
  const holeScores: Record<string, NormalizedHoleScore> = {}
  for (const [holeNumber, score] of normalizedHoles) {
    holeScores[String(holeNumber)] = score
  }

  return {
    version: SCORE_PROTOCOL_V1,
    holeCount: normalizeHoleCount(input.holeCount) as number,
    holeScores,
  }
}

export function normalizeHoleScoreUpdate(
  input: HoleScoreUpdateInput,
  options?: { holeCount?: number | null },
): NormalizedHoleScoreUpdate {
  const holeNumber = parseInteger(input.holeNumber)
  const strokes = parseInteger(input.strokes)
  const par = parseInteger(input.par)
  const issues: ScoreProtocolIssue[] = []

  if (holeNumber === null || holeNumber < MIN_HOLE_COUNT || holeNumber > MAX_HOLE_COUNT) {
    issues.push(
      issue(
        'invalid_hole_key',
        'holeNumber',
        `holeNumber must be an integer in range ${MIN_HOLE_COUNT}-${MAX_HOLE_COUNT}.`,
      ),
    )
  } else if (
    typeof options?.holeCount === 'number' &&
    Number.isInteger(options.holeCount) &&
    holeNumber > options.holeCount
  ) {
    issues.push(
      issue(
        'hole_out_of_range',
        'holeNumber',
        `Hole ${holeNumber} is outside configured holeCount (${options.holeCount}).`,
      ),
    )
  }

  if (strokes === null || strokes < MIN_STROKES || strokes > MAX_STROKES) {
    issues.push(
      issue('invalid_strokes', 'strokes', `strokes must be an integer in range ${MIN_STROKES}-${MAX_STROKES}.`),
    )
  }

  if (par === null || par < MIN_PAR || par > MAX_PAR) {
    issues.push(issue('invalid_par', 'par', `par must be an integer in range ${MIN_PAR}-${MAX_PAR}.`))
  }

  if (issues.length > 0) {
    throw new ScoreProtocolValidationError(issues)
  }

  return {
    holeNumber: holeNumber as number,
    holeKey: String(holeNumber),
    strokes: strokes as number,
    par: par as number,
  }
}

export function aggregateScoreProtocol(protocol: ScoreProtocol): ScoreProtocolAggregate {
  let totalStrokes = 0
  let totalPar = 0
  let scoredHoles = 0

  const scoredHoleNumbers = new Set<number>()
  for (const [holeKey, score] of Object.entries(protocol.holeScores)) {
    const holeNumber = parseHoleKey(holeKey)
    if (holeNumber === null) {
      continue
    }
    scoredHoleNumbers.add(holeNumber)
    scoredHoles += 1
    totalStrokes += score.strokes
    totalPar += score.par
  }

  const missingHoles: number[] = []
  for (let hole = 1; hole <= protocol.holeCount; hole += 1) {
    if (!scoredHoleNumbers.has(hole)) {
      missingHoles.push(hole)
    }
  }

  return {
    scoredHoles,
    totalStrokes,
    totalPar,
    totalDelta: totalStrokes - totalPar,
    missingHoles,
  }
}
