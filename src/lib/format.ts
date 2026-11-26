import type { SetValue, WeightUnit } from '../db/types'
import { toDisplayWeight } from '../domain/rules'

/** 62.50 → "62.5", 60 → "60", null → "" */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return ''
  return String(Number(toDisplayWeight(kg, unit).toFixed(2)))
}

/** 경과 시간: 24:13 또는 1:02:05 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 휴식 남은 시간: 01:12 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** 요약용: 52분, 1시간 5분 */
export function formatMinutes(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

/** 한 세트: "60×10", 값이 없으면 "—" */
export function formatSet(value: SetValue | undefined, unit: WeightUnit): string {
  if (!value || value.reps === null) return '—'
  const w = formatWeight(value.weightKg, unit)
  return w === '' ? `${value.reps}회` : `${w}×${value.reps}`
}

/** 지난번 요약: 무게가 모두 같으면 "60kg × 10, 10, 8", 다르면 "60×10, 62.5×8" */
export function formatPreviousSummary(sets: ReadonlyArray<SetValue>, unit: WeightUnit): string {
  const valid = sets.filter((s) => s.reps !== null)
  if (valid.length === 0) return '처음 하는 종목이에요'
  const weights = new Set(valid.map((s) => s.weightKg))
  if (weights.size === 1) {
    const w = formatWeight(valid[0].weightKg, unit)
    const reps = valid.map((s) => s.reps).join(', ')
    return w === '' ? `지난번 ${reps}회` : `지난번 ${w}${unit} × ${reps}`
  }
  return `지난번 ${valid.map((s) => formatSet(s, unit)).join(', ')}`
}

/** 총 볼륨: 8,450kg */
export function formatVolume(kg: number, unit: WeightUnit): string {
  return `${Math.round(toDisplayWeight(kg, unit)).toLocaleString('ko-KR')}${unit}`
}
