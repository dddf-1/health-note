import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { SetRow } from '../components/SetRow'
import { RestTimerBar } from '../components/RestTimerBar'
import { Sheet, Toast } from '../components/Sheet'
import { db } from '../db/db'
import {
  addSet,
  deleteSet,
  discardWorkout,
  finishWorkout,
  getPreviousSessionSets,
  getSettings,
  getWorkoutSets,
  isSetPR,
  restoreSet,
  setDone,
  stepSetValue,
  updateSetValues,
} from '../db/repo'
import type { WorkoutSummary } from '../db/repo'
import type { WorkoutSet } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/types'
import { useElapsed, useRestTimer, useWakeLock } from '../hooks/timers'
import { formatClock, formatPreviousSummary } from '../lib/format'
import { unlockAudio } from '../lib/sound'

const TOAST_MS = 3000

type Dialog = 'exit' | 'finish-unchecked' | 'finish-empty' | null

/** 운동 화면에 필요한 데이터를 한 번에 (DB 가 바뀌면 자동 갱신) */
function useWorkoutView(workoutId: number) {
  return useLiveQuery(async () => {
    const workout = await db.workouts.get(workoutId)
    if (!workout) return null
    const [sets, settings, routine, exercises] = await Promise.all([
      getWorkoutSets(db, workoutId),
      getSettings(db),
      workout.routineId !== undefined ? db.routines.get(workout.routineId) : undefined,
      db.exercises.toArray(),
    ])
    const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))]
    const previous = new Map(
      await Promise.all(
        exerciseIds.map(
          async (id) => [id, await getPreviousSessionSets(db, id, workoutId)] as const,
        ),
      ),
    )
    const prIds = new Set<number>()
    for (const s of sets) if (s.done && (await isSetPR(db, s))) prIds.add(s.id)
    return {
      workout,
      sets,
      settings,
      routine,
      exerciseNames: new Map(exercises.map((e) => [e.id, e.name])),
      previous,
      prIds,
    }
  }, [workoutId])
}

/** 같은 종목끼리 묶기 (종목 순서대로) */
function groupByExercise(sets: WorkoutSet[]): WorkoutSet[][] {
  const groups = new Map<number, WorkoutSet[]>()
  for (const s of sets) {
    const g = groups.get(s.exerciseOrder) ?? []
    g.push(s)
    groups.set(s.exerciseOrder, g)
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)
}

export function WorkoutScreen(props: {
  workoutId: number
  onExit: () => void
  onFinished: (summary: WorkoutSummary) => void
}) {
  const view = useWorkoutView(props.workoutId)
  const elapsed = useElapsed(view?.workout.startedAt)
  const rest = useRestTimer()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useWakeLock(true)

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const showToast = (message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, undo })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  // 다른 곳에서 운동이 지워졌으면 (예: 홈에서 새로 시작) 홈으로
  const { onExit } = props
  useEffect(() => {
    if (view === null) onExit()
  }, [view, onExit])

  if (!view) return <main className="app">불러오는 중…</main>

  const { workout, sets, settings, routine, exerciseNames, previous, prIds } = view
  const unit = settings.unit ?? DEFAULT_SETTINGS.unit
  const restSeconds = routine?.restSeconds ?? settings.restSeconds
  const uncheckedCount = sets.filter((s) => !s.done).length

  const toggle = async (set: WorkoutSet) => {
    if (set.done) {
      await setDone(db, set.id, false)
      return
    }
    unlockAudio() // 버튼을 누른 순간에 소리를 켜 둬야 0초 알림음이 난다
    const { isPR } = await setDone(db, set.id, true)
    rest.start(restSeconds)
    if (isPR) showToast('🏆 최고 기록 갱신!')
  }

  const remove = async (set: WorkoutSet) => {
    const deleted = await deleteSet(db, set.id)
    if (!deleted) return
    showToast(`${exerciseNames.get(set.exerciseId) ?? ''} ${deleted.setNumber}세트를 지웠어요`, () => {
      void restoreSet(db, deleted)
      setToast(null)
    })
  }

  const finish = async () => {
    setDialog(null)
    const result = await finishWorkout(db, workout.id)
    if (result.status === 'empty') {
      setDialog('finish-empty')
      return
    }
    props.onFinished(result.summary)
  }

  const onFinishClick = () => {
    if (sets.every((s) => !s.done)) setDialog('finish-empty')
    else if (uncheckedCount > 0) setDialog('finish-unchecked')
    else void finish()
  }

  return (
    <main className="app workout">
      <header className="workout-header">
        <button type="button" className="icon-btn" aria-label="나가기" onClick={() => setDialog('exit')}>
          ✕
        </button>
        <div className="workout-title">
          <strong>{routine?.name ?? '자유 운동'}</strong>
          <span className="elapsed">⏱ {formatClock(elapsed)}</span>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={onFinishClick}>
          완료
        </button>
      </header>

      {groupByExercise(sets).map((group) => {
        const exerciseId = group[0].exerciseId
        const prev = previous.get(exerciseId) ?? []
        return (
          <section key={group[0].exerciseOrder} className="card exercise-card">
            <h2 className="exercise-name">{exerciseNames.get(exerciseId) ?? '알 수 없는 종목'}</h2>
            <p className="exercise-prev">{formatPreviousSummary(prev, unit)}</p>
            <div className="set-head" aria-hidden="true">
              <span>세트</span>
              <span>지난</span>
              <span>{unit}</span>
              <span>회</span>
              <span>✓</span>
            </div>
            {group.map((s) => (
              <SetRow
                key={s.id}
                set={s}
                previous={prev.find((p) => p.setNumber === s.setNumber)}
                unit={unit}
                isPR={prIds.has(s.id)}
                onChange={(patch) => void updateSetValues(db, s.id, patch)}
                onStep={(field, direction) => void stepSetValue(db, s.id, field, direction, settings)}
                onToggle={() => void toggle(s)}
                onDelete={() => void remove(s)}
              />
            ))}
            <button
              type="button"
              className="btn btn-plain add-set"
              onClick={() => void addSet(db, workout.id, exerciseId)}
            >
              + 세트 추가
            </button>
          </section>
        )
      })}

      <p className="hint-small">세트를 왼쪽으로 밀면 지울 수 있어요.</p>

      <div className="bottom-dock">
        {toast && (
          <Toast message={toast.message} actionLabel={toast.undo ? '되돌리기' : undefined} onAction={toast.undo} />
        )}
        <RestTimerBar timer={rest} />
      </div>

      {dialog === 'exit' && (
        <Sheet
          title="운동을 잠깐 나갈까요?"
          message="지금까지 기록은 저장돼 있어요. 홈에서 이어할 수 있어요."
          actions={[
            { label: '저장하고 나가기', tone: 'primary', onClick: props.onExit },
            { label: '계속하기', onClick: () => setDialog(null) },
          ]}
        />
      )}
      {dialog === 'finish-unchecked' && (
        <Sheet
          title="운동을 완료할까요?"
          message={`체크하지 않은 세트 ${uncheckedCount}개는 저장되지 않아요.`}
          actions={[
            { label: '완료하기', tone: 'primary', onClick: () => void finish() },
            { label: '계속하기', onClick: () => setDialog(null) },
          ]}
        />
      )}
      {dialog === 'finish-empty' && (
        <Sheet
          title="기록할 세트가 없어요"
          message="체크한 세트가 없어서 저장할 기록이 없어요. 이 운동을 지울까요?"
          actions={[
            {
              label: '운동 지우기',
              tone: 'danger',
              onClick: () => {
                void discardWorkout(db, workout.id).then(props.onExit)
              },
            },
            { label: '계속하기', onClick: () => setDialog(null) },
          ]}
        />
      )}
    </main>
  )
}
