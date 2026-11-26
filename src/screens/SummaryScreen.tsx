import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { getSettings, getWorkoutSets, MEMO_MAX, updateWorkoutMemo } from '../db/repo'
import type { WorkoutSummary } from '../db/repo'
import { DEFAULT_SETTINGS } from '../db/types'
import { formatMinutes, formatVolume, formatWeight } from '../lib/format'

/** 2-4 운동 완료 요약 */
export function SummaryScreen(props: { summary: WorkoutSummary; onDone: () => void }) {
  const { summary } = props
  const [memo, setMemo] = useState('')
  const data = useLiveQuery(async () => {
    const [workout, sets, settings, exercises] = await Promise.all([
      db.workouts.get(summary.workoutId),
      getWorkoutSets(db, summary.workoutId),
      getSettings(db),
      db.exercises.toArray(),
    ])
    const routine = workout?.routineId !== undefined ? await db.routines.get(workout.routineId) : undefined
    return { workout, sets, settings, routine, names: new Map(exercises.map((e) => [e.id, e.name])) }
  }, [summary.workoutId])

  const unit = data?.settings.unit ?? DEFAULT_SETTINGS.unit
  const byExercise = new Map<number, string[]>()
  for (const s of data?.sets ?? []) {
    const list = byExercise.get(s.exerciseId) ?? []
    list.push(s.weightKg === null ? `${s.reps}회` : `${formatWeight(s.weightKg, unit)}×${s.reps}`)
    byExercise.set(s.exerciseId, list)
  }

  const save = async () => {
    if (memo.trim() !== '') await updateWorkoutMemo(db, summary.workoutId, memo)
    props.onDone()
  }

  const date = data?.workout?.startedAt
    ? new Date(data.workout.startedAt).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
      })
    : ''

  return (
    <main className="app">
      <header className="summary-header">
        <p className="summary-emoji">🎉</p>
        <h1>운동 완료!</h1>
        <p className="label">
          {data?.routine?.name ?? '자유 운동'} · {date}
        </p>
      </header>

      <section className="card summary-stats">
        <div>
          <span className="label">운동 시간</span>
          <strong>{formatMinutes(summary.durationMs)}</strong>
        </div>
        <div>
          <span className="label">총 볼륨</span>
          <strong>{formatVolume(summary.totalVolumeKg, unit)}</strong>
        </div>
        <div>
          <span className="label">세트</span>
          <strong>{summary.doneSetCount}</strong>
        </div>
      </section>

      {summary.records.length > 0 && (
        <section className="card">
          <p className="label">🏆 최고 기록 갱신</p>
          {summary.records.map((r) => (
            <p key={r.exerciseId} className="record">
              <span>{data?.names.get(r.exerciseId)}</span>
              <strong>
                {formatWeight(r.weightKg, unit)}
                {unit} × {r.reps}
              </strong>
            </p>
          ))}
        </section>
      )}

      <section className="card">
        <p className="label">종목별 기록</p>
        {[...byExercise.entries()].map(([exerciseId, list]) => (
          <p key={exerciseId} className="record">
            <span>{data?.names.get(exerciseId)}</span>
            <span className="muted">{list.join(', ')}</span>
          </p>
        ))}
      </section>

      <section className="card">
        <label className="label" htmlFor="memo">
          메모 (선택)
        </label>
        <textarea
          id="memo"
          className="memo"
          maxLength={MEMO_MAX}
          placeholder="오늘 컨디션, 느낀 점"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </section>

      <button type="button" className="btn btn-primary btn-large" onClick={() => void save()}>
        저장하고 홈으로
      </button>
    </main>
  )
}
