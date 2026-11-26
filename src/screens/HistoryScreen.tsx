import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { listWorkoutHistory } from '../db/history'
import { getSettings } from '../db/repo'
import { DEFAULT_SETTINGS } from '../db/types'
import { formatMinutes, formatVolume } from '../lib/format'

const dateOf = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

const monthOf = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

/** 3-1 기록 목록 (월별로 묶음) */
export function HistoryScreen(props: { onOpen: (workoutId: number) => void }) {
  const list = useLiveQuery(() => listWorkoutHistory(db))
  const unit = useLiveQuery(() => getSettings(db))?.unit ?? DEFAULT_SETTINGS.unit

  if (!list) return <p className="muted">불러오는 중…</p>
  if (list.length === 0) {
    return (
      <section className="card empty-card">
        <p className="routine">아직 기록이 없어요</p>
        <p className="muted">운동을 완료하면 여기에 쌓여요.</p>
      </section>
    )
  }

  const months = new Map<string, typeof list>()
  for (const w of list) {
    const key = monthOf(w.startedAt)
    months.set(key, [...(months.get(key) ?? []), w])
  }

  return (
    <>
      {[...months.entries()].map(([month, items]) => (
        <section key={month} className="history-month">
          <h2 className="label">
            {month} · {items.length}회
          </h2>
          {items.map((w) => (
            <button key={w.workoutId} type="button" className="card history-item" onClick={() => props.onOpen(w.workoutId)}>
              <span className="history-top">
                <strong>{w.routineName}</strong>
                <span className="muted">{dateOf(w.startedAt)}</span>
              </span>
              <span className="muted history-exercises">{w.exerciseNames.join(' · ')}</span>
              <span className="history-stats">
                {formatMinutes(w.durationMs)} · {w.setCount}세트 · {formatVolume(w.totalVolumeKg, unit)}
              </span>
            </button>
          ))}
        </section>
      ))}
    </>
  )
}
