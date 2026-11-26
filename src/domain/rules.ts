// 공통 계산·판정 규칙 — 기획서 12-3, 입력 범위 — 기획서 F-06
import type { SetValue, WeightUnit } from '../db/types'

export const MAX_WEIGHT = 500
export const MAX_REPS = 100
export const KG_PER_LB = 0.45359237
/** 진행 중 운동이 이 시간보다 오래되면 "어제 운동을 완료로 저장할까요?" 안내 (F-10) */
export const STALE_ACTIVE_MS = 12 * 60 * 60 * 1000
/** 추정 1RM 은 이 횟수 미만에서만 계산 (13회 이상은 오차가 커서 제외) */
export const E1RM_MAX_REPS = 12

const round2 = (v: number) => Math.round(v * 100) / 100

// ── 입력 범위 ───────────────────────────────────────────

/** 표시 단위 기준 무게를 0~500 으로 고정, 소수 둘째 자리까지 */
export function clampDisplayWeight(value: number): number {
  if (!Number.isFinite(value)) return 0
  return round2(Math.min(MAX_WEIGHT, Math.max(0, value)))
}

/** 횟수를 0~100 정수로 고정 */
export function clampReps(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_REPS, Math.max(0, Math.round(value)))
}

// ── 단위 변환 (저장은 항상 kg) ───────────────────────────

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return round2(unit === 'kg' ? kg : kg / KG_PER_LB)
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB
}

/** +/− 버튼: 표시 단위로 step 만큼 증감한 뒤 kg 로 돌려준다 */
export function stepWeight(
  currentKg: number | null,
  direction: 1 | -1,
  step: number,
  unit: WeightUnit,
): number {
  const display = currentKg === null ? 0 : toDisplayWeight(currentKg, unit)
  const next = clampDisplayWeight(display + direction * step)
  return fromDisplayWeight(next, unit)
}

export function stepReps(current: number | null, direction: 1 | -1): number {
  return clampReps((current ?? 0) + direction)
}

// ── 자동 채움 ──────────────────────────────────────────

/**
 * 가장 최근 완료 운동의 같은 세트 번호 값을 가져온다.
 * 그 세트 번호가 없으면 마지막 세트 값, 기록이 없으면 null.
 * @param previousSets 직전 운동의 완료 세트 (세트 번호 순)
 */
export function autofillValue(
  previousSets: ReadonlyArray<SetValue & { setNumber: number }>,
  setNumber: number,
): SetValue | null {
  if (previousSets.length === 0) return null
  const same = previousSets.find((s) => s.setNumber === setNumber)
  const source = same ?? previousSets[previousSets.length - 1]
  return { weightKg: source.weightKg, reps: source.reps }
}

// ── 볼륨·1RM·최고 기록 ──────────────────────────────────

type DoneSet = SetValue & { done: boolean }

/** 총 볼륨: 완료 세트의 무게 × 횟수 합 */
export function totalVolume(sets: ReadonlyArray<DoneSet>): number {
  return round2(
    sets.reduce((sum, s) => (s.done ? sum + (s.weightKg ?? 0) * (s.reps ?? 0) : sum), 0),
  )
}

/** Epley 공식 추정 1RM. 횟수 1이면 무게 그대로, 13회 이상이나 값이 없으면 null */
export function estimate1RM(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null || weightKg <= 0 || reps < 1) return null
  if (reps === 1) return weightKg
  if (reps > E1RM_MAX_REPS) return null
  return weightKg * (1 + reps / 30)
}

/** 완료 세트 중 가장 높은 추정 1RM */
export function bestE1RM(sets: ReadonlyArray<DoneSet>): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (!s.done) continue
    const e = estimate1RM(s.weightKg, s.reps)
    if (e !== null && (best === null || e > best)) best = e
  }
  return best
}

/** 최고 기록 판정: 이전 최고치보다 클 때만. 이전 기록이 없으면(첫 기록) PR 아님 */
export function isPersonalRecord(e1rm: number | null, previousBest: number | null): boolean {
  return e1rm !== null && previousBest !== null && e1rm > previousBest
}

// ── 지난번 대비 ────────────────────────────────────────

export type Trend = 'up' | 'same' | 'down'

/** 완료 세트 중 가장 무거운 무게 */
export function topSetWeight(sets: ReadonlyArray<DoneSet>): number | null {
  let top: number | null = null
  for (const s of sets) {
    if (!s.done || s.weightKg === null) continue
    if (top === null || s.weightKg > top) top = s.weightKg
  }
  return top
}

/** 최근 운동과 그 전 운동의 최고 무게 세트 비교 */
export function compareTrend(latestTop: number | null, previousTop: number | null): Trend | null {
  if (latestTop === null || previousTop === null) return null
  if (latestTop > previousTop) return 'up'
  if (latestTop < previousTop) return 'down'
  return 'same'
}

// ── 주간 운동일 ────────────────────────────────────────

/** 이번 주 월요일 0시 (기기 시간대 기준) */
export function startOfWeek(now: number): number {
  const d = new Date(now)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysSinceMonday)
  return d.getTime()
}

/** 월~일 기준, 운동을 완료한 서로 다른 날짜 수 */
export function weeklyWorkoutDays(finishedAts: ReadonlyArray<number>, now: number): number {
  const from = startOfWeek(now)
  const to = from + 7 * 24 * 60 * 60 * 1000
  const days = new Set<string>()
  for (const t of finishedAts) {
    if (t < from || t >= to) continue
    const d = new Date(t)
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  return days.size
}

// ── 오늘의 루틴 추천 ───────────────────────────────────

/**
 * 마지막으로 완료한 루틴의 다음 루틴 (마지막 다음은 처음으로 순환).
 * 완료 기록이 없거나 그 루틴이 지워졌으면 첫 번째 루틴, 루틴이 없으면 null.
 */
export function nextRoutineId(
  routines: ReadonlyArray<{ id: number; order: number }>,
  lastDoneRoutineId: number | undefined,
): number | null {
  if (routines.length === 0) return null
  const sorted = [...routines].sort((a, b) => a.order - b.order)
  const idx = sorted.findIndex((r) => r.id === lastDoneRoutineId)
  if (idx === -1) return sorted[0].id
  return sorted[(idx + 1) % sorted.length].id
}

/** 진행 중 운동이 12시간을 넘겼는지 */
export function isStaleActive(startedAt: number, now: number): boolean {
  return now - startedAt > STALE_ACTIVE_MS
}
