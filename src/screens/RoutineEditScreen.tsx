import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ExercisePicker } from '../components/ExercisePicker'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import { getRoutineItems, REST_MAX, REST_MIN, updateRoutine } from '../db/manage'
import { createRoutine, deleteRoutine, ROUTINE_NAME_MAX, ROUTINE_SETS_MAX, ROUTINE_SETS_MIN } from '../db/repo'

interface Item {
  key: number
  exerciseId: number
  defaultSets: number
}

let nextKey = 1

const restLabel = (s: number) => (s % 60 === 0 ? `${s / 60}분` : s > 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`)

/** 5-2 루틴 만들기·고치기 (routineId 없으면 새 루틴) */
export function RoutineEditScreen(props: { routineId?: number; onDone: () => void }) {
  const isNew = props.routineId === undefined
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const names = new Map((exercises ?? []).map((e) => [e.id, e.name]))
  const [loaded, setLoaded] = useState(isNew)
  const [name, setName] = useState('')
  const [rest, setRest] = useState<number | undefined>(undefined)
  const [items, setItems] = useState<Item[]>([])
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (props.routineId === undefined) return
    const id = props.routineId
    let cancelled = false
    void Promise.all([db.routines.get(id), getRoutineItems(db, id)]).then(([routine, list]) => {
      if (cancelled || !routine) return
      setName(routine.name)
      setRest(routine.restSeconds)
      setItems(list.map((i) => ({ key: nextKey++, exerciseId: i.exerciseId, defaultSets: i.defaultSets })))
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [props.routineId])

  const patch = (key: number, change: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)))

  const move = (index: number, dir: -1 | 1) =>
    setItems((list) => {
      const j = index + dir
      if (j < 0 || j >= list.length) return list
      const copy = [...list]
      ;[copy[index], copy[j]] = [copy[j], copy[index]]
      return copy
    })

  const save = async () => {
    const input = {
      name,
      ...(rest !== undefined ? { restSeconds: rest } : {}),
      items: items.map((i) => ({ exerciseId: i.exerciseId, defaultSets: i.defaultSets })),
    }
    try {
      if (props.routineId === undefined) await createRoutine(db, input)
      else await updateRoutine(db, props.routineId, input)
      props.onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요')
    }
  }

  if (!loaded) return <main className="app">불러오는 중…</main>

  return (
    <main className="app">
      <header className="detail-header">
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={props.onDone}>
          ‹
        </button>
        <strong className="workout-title">{isNew ? '새 루틴' : '루틴 고치기'}</strong>
        <button type="button" className="btn btn-primary btn-small" onClick={() => void save()}>
          저장
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <label className="label" htmlFor="routine-name">
          이름
        </label>
        <input
          id="routine-name"
          className="select"
          maxLength={ROUTINE_NAME_MAX}
          placeholder="예: 가슴·삼두"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
        />
        <p className="label setting-gap">휴식 시간</p>
        <div className="row-between">
          <span>{rest === undefined ? '설정값 따름' : restLabel(rest)}</span>
          <div className="mini-stepper">
            <button
              type="button"
              className="step-btn"
              aria-label="휴식 줄이기"
              onClick={() => setRest((r) => Math.max(REST_MIN, (r ?? 90) - 15))}
            >
              −
            </button>
            <button
              type="button"
              className="step-btn"
              aria-label="휴식 늘리기"
              onClick={() => setRest((r) => Math.min(REST_MAX, (r ?? 90) + 15))}
            >
              +
            </button>
            {rest !== undefined && (
              <button type="button" className="btn btn-small" onClick={() => setRest(undefined)}>
                기본
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <p className="label">종목 · 기본 세트 수</p>
        {items.length === 0 && <p className="muted">아래에서 종목을 추가해 주세요.</p>}
        {items.map((item, index) => (
          <div key={item.key} className="routine-item">
            <div className="reorder">
              <button
                type="button"
                className="mini-btn"
                aria-label="위로"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="mini-btn"
                aria-label="아래로"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                ▼
              </button>
            </div>
            <span className="routine-item-name">{names.get(item.exerciseId) ?? '…'}</span>
            <div className="mini-stepper">
              <button
                type="button"
                className="step-btn"
                aria-label="세트 줄이기"
                disabled={item.defaultSets <= ROUTINE_SETS_MIN}
                onClick={() => patch(item.key, { defaultSets: item.defaultSets - 1 })}
              >
                −
              </button>
              <span className="mini-value">{item.defaultSets}</span>
              <button
                type="button"
                className="step-btn"
                aria-label="세트 늘리기"
                disabled={item.defaultSets >= ROUTINE_SETS_MAX}
                onClick={() => patch(item.key, { defaultSets: item.defaultSets + 1 })}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="mini-btn danger"
              aria-label={`${names.get(item.exerciseId) ?? ''} 빼기`}
              onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-plain add-set" onClick={() => setPicking(true)}>
          + 종목 추가
        </button>
      </section>

      {!isNew && (
        <button type="button" className="btn btn-danger-text" onClick={() => setConfirmDelete(true)}>
          루틴 지우기
        </button>
      )}

      {picking && (
        <ExercisePicker
          title="루틴에 종목 추가"
          selectedIds={new Set(items.map((i) => i.exerciseId))}
          onClose={() => setPicking(false)}
          onPick={(exerciseId) => {
            setPicking(false)
            setError('')
            setItems((list) => [...list, { key: nextKey++, exerciseId, defaultSets: 3 }])
          }}
        />
      )}
      {confirmDelete && props.routineId !== undefined && (
        <Sheet
          title="이 루틴을 지울까요?"
          message="지난 운동 기록은 그대로 남아요."
          actions={[
            {
              label: '지우기',
              tone: 'danger',
              onClick: () => void deleteRoutine(db, props.routineId!).then(props.onDone),
            },
            { label: '취소', onClick: () => setConfirmDelete(false) },
          ]}
        />
      )}
    </main>
  )
}
