import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BackupCard } from '../components/BackupCard'
import { db } from '../db/db'
import { GOAL_MAX, GOAL_MIN, moveRoutine, REST_MAX, REST_MIN, updateSettings, WEIGHT_STEPS } from '../db/manage'
import { getSettings, listRoutines } from '../db/repo'
import type { Settings, WeightUnit } from '../db/types'
import { usePersistentStorage } from '../hooks/timers'

/** 홈 화면에 추가해서 실행 중인지 (아이폰 Safari 는 navigator.standalone) */
function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

const PERSIST_LABEL = {
  checking: '확인 중…',
  granted: '영구 보관 ✓',
  'not-granted': '일반 보관 (홈 화면 설치 권장)',
  unsupported: '이 브라우저는 지원 안 함',
} as const

const restLabel = (s: number) =>
  s < 60 ? `${s}초` : s % 60 === 0 ? `${s / 60}분` : `${Math.floor(s / 60)}분 ${s % 60}초`

function Stepper(props: {
  label: string
  value: string
  onMinus?: () => void
  onPlus?: () => void
}) {
  return (
    <div className="row-between setting-row">
      <span>{props.label}</span>
      <div className="mini-stepper">
        <button type="button" className="step-btn" aria-label={`${props.label} 줄이기`} disabled={!props.onMinus} onClick={props.onMinus}>
          −
        </button>
        <span className="mini-value wide">{props.value}</span>
        <button type="button" className="step-btn" aria-label={`${props.label} 늘리기`} disabled={!props.onPlus} onClick={props.onPlus}>
          +
        </button>
      </div>
    </div>
  )
}

/** 5-1 설정: 단위·증감·휴식·주간 목표, 루틴 관리, 기기 상태 */
export function SettingsScreen(props: { onEditRoutine: (routineId?: number) => void }) {
  const settings = useLiveQuery(() => getSettings(db))
  const routines = useLiveQuery(() => listRoutines(db)) ?? []
  const counts = useLiveQuery(async () => ({
    workouts: await db.workouts.where('status').equals('done').count(),
    exercises: await db.exercises.count(),
  }))
  const persist = usePersistentStorage()
  const [error, setError] = useState('')

  if (!settings) return <p className="muted">불러오는 중…</p>

  const save = (patch: Partial<Omit<Settings, 'id'>>) => {
    setError('')
    updateSettings(db, patch).catch((e: unknown) => setError(e instanceof Error ? e.message : '저장하지 못했어요'))
  }
  const { unit, weightStep, restSeconds, weeklyGoal } = settings

  return (
    <>
      <section className="card">
        <p className="label">기록 설정</p>
        <div className="row-between setting-row">
          <span>무게 단위</span>
          <div className="segmented" role="group" aria-label="무게 단위">
            {(['kg', 'lb'] as WeightUnit[]).map((u) => (
              <button key={u} type="button" className={u === unit ? 'selected' : ''} aria-pressed={u === unit} onClick={() => save({ unit: u })}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="row-between setting-row">
          <span>+/− 무게</span>
          <div className="segmented" role="group" aria-label="무게 증감 단위">
            {WEIGHT_STEPS[unit].map((s) => (
              <button key={s} type="button" className={s === weightStep ? 'selected' : ''} aria-pressed={s === weightStep} onClick={() => save({ weightStep: s })}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <Stepper
          label="기본 휴식"
          value={restLabel(restSeconds)}
          onMinus={restSeconds > REST_MIN ? () => save({ restSeconds: Math.max(REST_MIN, restSeconds - 15) }) : undefined}
          onPlus={restSeconds < REST_MAX ? () => save({ restSeconds: Math.min(REST_MAX, restSeconds + 15) }) : undefined}
        />
        <Stepper
          label="주간 목표"
          value={`${weeklyGoal}일`}
          onMinus={weeklyGoal > GOAL_MIN ? () => save({ weeklyGoal: weeklyGoal - 1 }) : undefined}
          onPlus={weeklyGoal < GOAL_MAX ? () => save({ weeklyGoal: weeklyGoal + 1 }) : undefined}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card">
        <p className="label">루틴 (위에서부터 돌아가며 추천)</p>
        {routines.map((r, i) => (
          <div key={r.id} className="routine-item">
            <div className="reorder">
              <button type="button" className="mini-btn" aria-label={`${r.name} 위로`} disabled={i === 0} onClick={() => void moveRoutine(db, r.id, -1)}>
                ▲
              </button>
              <button
                type="button"
                className="mini-btn"
                aria-label={`${r.name} 아래로`}
                disabled={i === routines.length - 1}
                onClick={() => void moveRoutine(db, r.id, 1)}
              >
                ▼
              </button>
            </div>
            <button type="button" className="routine-link" onClick={() => props.onEditRoutine(r.id)}>
              <span>{r.name}</span>
              <span className="muted">고치기 ›</span>
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-plain add-set" onClick={() => props.onEditRoutine()}>
          + 새 루틴
        </button>
      </section>

      <BackupCard lastBackupAt={settings.lastBackupAt} />

      <section className="card">
        <p className="label">이 기기 상태</p>
        <dl className="status">
          <dt>홈 화면 설치</dt>
          <dd>{isInstalled() ? '설치됨 ✓' : '브라우저에서 실행 중'}</dd>
          <dt>저장 공간</dt>
          <dd>{PERSIST_LABEL[persist]}</dd>
          <dt>저장된 데이터</dt>
          <dd>
            운동 {counts?.workouts ?? '-'}회 · 종목 {counts?.exercises ?? '-'}개
          </dd>
        </dl>
        {!isInstalled() && (
          <p className="hint">
            아이폰: Safari 하단 공유 버튼 → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.
          </p>
        )}
      </section>

      <footer className="footer">나만의 헬스 노트 · v0.5.0</footer>
    </>
  )
}
