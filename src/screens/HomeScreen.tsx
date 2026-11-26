import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { db } from '../db/db'
import { getHomeStats } from '../db/history'
import {
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  listRoutines,
  recommendRoutine,
  startWorkout,
} from '../db/repo'
import type { WorkoutSummary } from '../db/repo'
import { DEFAULT_SETTINGS } from '../db/types'
import { formatWeight } from '../lib/format'

const dayOf = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

const timeOf = (t: number) =>
  new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function HomeScreen(props: {
  onOpenWorkout: (workoutId: number) => void
  onFinished: (summary: WorkoutSummary) => void
}) {
  const active = useLiveQuery(() => getActiveWorkout(db))
  const routines = useLiveQuery(() => listRoutines(db)) ?? []
  const recommended = useLiveQuery(() => recommendRoutine(db))
  const stats = useLiveQuery(() => getHomeStats(db))
  const unit = useLiveQuery(() => db.settings.get('app'))?.unit ?? DEFAULT_SETTINGS.unit
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)

  const selectedId = pickedId ?? recommended?.id
  const selected = routines.find((r) => r.id === selectedId)
  const activeRoutine = routines.find((r) => r.id === active?.routineId)

  const start = async (replaceActive = false) => {
    if (selectedId === undefined) return
    setConfirmRestart(false)
    const id = await startWorkout(db, selectedId, { replaceActive })
    props.onOpenWorkout(id)
  }

  /** 12시간 지난 운동: 체크한 세트만 완료로 저장 (없으면 지움) */
  const saveStale = async () => {
    if (!active) return
    const result = await finishWorkout(db, active.id)
    if (result.status === 'empty') await discardWorkout(db, active.id)
    else props.onFinished(result.summary)
  }

  return (
    <>
      <header className="app-header">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={40} height={40} />
        <h1>나만의 헬스 노트</h1>
      </header>

      {active && (
        <section className="card active-card">
          <p className="label">{active.isStale ? '12시간 넘게 진행 중인 운동이 있어요' : '진행 중인 운동'}</p>
          <p className="routine">{activeRoutine?.name ?? '자유 운동'}</p>
          <p className="muted">{timeOf(active.startedAt)} 시작</p>
          <div className="button-row">
            {active.isStale && (
              <button type="button" className="btn btn-primary" onClick={() => void saveStale()}>
                완료로 저장
              </button>
            )}
            <button
              type="button"
              className={`btn ${active.isStale ? 'btn-plain' : 'btn-primary'}`}
              onClick={() => props.onOpenWorkout(active.id)}
            >
              이어하기
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <p className="label">{pickedId === null ? '오늘의 루틴' : '선택한 루틴'}</p>
        <p className="routine">{selected?.name ?? (routines.length === 0 ? '루틴이 없어요' : '불러오는 중…')}</p>
        <button
          type="button"
          className="btn btn-primary btn-large"
          disabled={selectedId === undefined}
          onClick={() => (active ? setConfirmRestart(true) : void start())}
        >
          ▶ 운동 시작
        </button>
        {routines.length > 1 && (
          <div className="chips" role="group" aria-label="다른 루틴 선택">
            {routines.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`chip ${r.id === selectedId ? 'selected' : ''}`}
                aria-pressed={r.id === selectedId}
                onClick={() => setPickedId(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {stats && (
        <section className="card">
          <p className="label">
            이번 주 {stats.weeklyDays}/{stats.weeklyGoal}회
            {stats.weeklyDays >= stats.weeklyGoal ? ' · 목표 달성 🎉' : ''}
          </p>
          <div className="week-dots" aria-hidden="true">
            {Array.from({ length: Math.max(stats.weeklyGoal, stats.weeklyDays) }, (_, i) => (
              <span key={i} className={`week-dot ${i < stats.weeklyDays ? 'filled' : ''}`} />
            ))}
          </div>
          {stats.last ? (
            <>
              <p className="label">
                지난 운동 · {stats.last.routineName} · {dayOf(stats.last.date)}
              </p>
              {stats.last.trends.length > 0 ? (
                <ul className="trend-list">
                  {stats.last.trends.map((t) => (
                    <li key={t.exerciseId}>
                      <span>{t.name}</span>
                      <span className={`trend ${t.trend}`}>
                        {formatWeight(t.latestTopKg, unit)}
                        {unit}{' '}
                        {t.trend === 'same'
                          ? '= 지난번과 같음'
                          : `${t.trend === 'up' ? '▲' : '▼'} ${formatWeight(Math.abs(t.diffKg), unit)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">다음 운동부터 지난번과 비교해 드려요.</p>
              )}
            </>
          ) : (
            <p className="muted">첫 운동을 시작해 보세요.</p>
          )}
        </section>
      )}

      {confirmRestart && (
        <Sheet
          title="새로 시작할까요?"
          message="진행 중인 운동 기록은 지워져요."
          actions={[
            { label: '새로 시작', tone: 'danger', onClick: () => void start(true) },
            { label: '취소', onClick: () => setConfirmRestart(false) },
          ]}
        />
      )}
    </>
  )
}
