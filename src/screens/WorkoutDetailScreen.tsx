import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import {
  discardWorkout,
  getSettings,
  getWorkoutSets,
  getWorkoutSummary,
  MEMO_MAX,
  updateSetValues,
  updateWorkoutMemo,
} from '../db/repo'
import type { WeightUnit, WorkoutSet } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/types'
import { clampDisplayWeight, clampReps, fromDisplayWeight } from '../domain/rules'
import { formatMinutes, formatSet, formatVolume, formatWeight } from '../lib/format'

/** 수정 모드의 숫자 칸: 다 쓰고 나면(blur) 저장 */
function NumberCell(props: {
  value: string
  label: string
  decimal: boolean
  onCommit: (text: string) => void
}) {
  const [draft, setDraft] = useState(props.value)
  return (
    <input
      className="edit-input"
      inputMode={props.decimal ? 'decimal' : 'numeric'}
      aria-label={props.label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => props.onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function parse(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

function EditRow(props: { set: WorkoutSet; unit: WeightUnit }) {
  const { set, unit } = props
  return (
    <div className="edit-row">
      <span className="set-no">{set.setNumber}</span>
      <NumberCell
        value={formatWeight(set.weightKg, unit)}
        label={`${set.setNumber}세트 무게(${unit})`}
        decimal
        onCommit={(text) => {
          const n = parse(text)
          if (n === undefined) return
          void updateSetValues(db, set.id, {
            weightKg: n === null ? null : fromDisplayWeight(clampDisplayWeight(n), unit),
          })
        }}
      />
      <span className="muted">{unit} ×</span>
      <NumberCell
        value={String(set.reps ?? '')}
        label={`${set.setNumber}세트 횟수`}
        decimal={false}
        onCommit={(text) => {
          const n = parse(text)
          // 완료 기록의 횟수는 비울 수 없다
          if (n === undefined || n === null) return
          void updateSetValues(db, set.id, { reps: clampReps(n) })
        }}
      />
      <span className="muted">회</span>
    </div>
  )
}

/** 3-2 기록 상세: 세트 보기·고치기, 메모, 삭제 */
export function WorkoutDetailScreen(props: { workoutId: number; onBack: () => void }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(props.workoutId)
    if (!workout) return null
    const [sets, settings, exercises, summary] = await Promise.all([
      getWorkoutSets(db, props.workoutId),
      getSettings(db),
      db.exercises.toArray(),
      getWorkoutSummary(db, props.workoutId),
    ])
    const routine = workout.routineId !== undefined ? await db.routines.get(workout.routineId) : undefined
    return { workout, sets, settings, summary, routine, names: new Map(exercises.map((e) => [e.id, e.name])) }
  }, [props.workoutId])

  if (data === undefined) return <main className="app">불러오는 중…</main>
  if (data === null) {
    return (
      <main className="app">
        <p className="muted">기록을 찾을 수 없어요.</p>
        <button type="button" className="btn btn-plain" onClick={props.onBack}>
          목록으로
        </button>
      </main>
    )
  }

  const { workout, sets, summary, routine, names } = data
  const unit = data.settings.unit ?? DEFAULT_SETTINGS.unit
  const groups = new Map<number, WorkoutSet[]>()
  for (const s of sets.filter((x) => x.done)) {
    groups.set(s.exerciseOrder, [...(groups.get(s.exerciseOrder) ?? []), s])
  }
  const date = new Date(workout.startedAt).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <main className="app">
      <header className="detail-header">
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={props.onBack}>
          ‹
        </button>
        <div className="workout-title">
          <strong>{routine?.name ?? '자유 운동'}</strong>
          <span className="muted">{date}</span>
        </div>
        <button
          type="button"
          className={`btn btn-small ${editing ? 'btn-primary' : 'btn-plain'}`}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '완료' : '수정'}
        </button>
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

      {[...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([order, group]) => (
          <section key={order} className="card">
            <h2 className="exercise-name">{names.get(group[0].exerciseId) ?? '알 수 없는 종목'}</h2>
            {editing ? (
              group.map((s) => <EditRow key={s.id} set={s} unit={unit} />)
            ) : (
              <p className="muted detail-sets">{group.map((s) => formatSet(s, unit)).join(', ')}</p>
            )}
          </section>
        ))}

      <section className="card">
        <label className="label" htmlFor="detail-memo">
          메모
        </label>
        <textarea
          key={workout.memo ?? ''}
          id="detail-memo"
          className="memo"
          maxLength={MEMO_MAX}
          placeholder="오늘 컨디션, 느낀 점"
          defaultValue={workout.memo ?? ''}
          onBlur={(e) => void updateWorkoutMemo(db, workout.id, e.target.value)}
        />
      </section>

      <button type="button" className="btn btn-danger-text" onClick={() => setConfirmDelete(true)}>
        이 기록 지우기
      </button>

      {confirmDelete && (
        <Sheet
          title="이 기록을 지울까요?"
          message="지운 기록은 되돌릴 수 없고, 성장 그래프에서도 빠져요."
          actions={[
            {
              label: '지우기',
              tone: 'danger',
              onClick: () => {
                void discardWorkout(db, workout.id).then(props.onBack)
              },
            },
            { label: '취소', onClick: () => setConfirmDelete(false) },
          ]}
        />
      )}
    </main>
  )
}
