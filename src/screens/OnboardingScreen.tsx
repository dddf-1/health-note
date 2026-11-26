import { useState } from 'react'
import { db } from '../db/db'
import { GOAL_MAX, GOAL_MIN, updateSettings } from '../db/manage'
import type { WeightUnit } from '../db/types'

/** 홈 화면에 추가해서 실행 중인지 */
function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/** 1-1 첫 실행: 단위·주간 목표만 묻고 바로 시작 (나머지는 설정에서) */
export function OnboardingScreen(props: { onDone: () => void }) {
  const [unit, setUnit] = useState<WeightUnit>('kg')
  const [goal, setGoal] = useState(4)

  const start = async () => {
    await updateSettings(db, { unit, weeklyGoal: goal, onboardedAt: Date.now() })
    props.onDone()
  }

  return (
    <main className="app onboarding">
      <header className="summary-header">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={64} height={64} />
        <h1>나만의 헬스 노트</h1>
        <p className="muted">세트 기록은 3초, 지난번 기록은 자동으로.</p>
      </header>

      <section className="card">
        <div className="row-between setting-row">
          <span>무게 단위</span>
          <div className="segmented" role="group" aria-label="무게 단위">
            {(['kg', 'lb'] as WeightUnit[]).map((u) => (
              <button key={u} type="button" className={u === unit ? 'selected' : ''} aria-pressed={u === unit} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="row-between setting-row">
          <span>일주일에 몇 번?</span>
          <div className="mini-stepper">
            <button type="button" className="step-btn" aria-label="목표 줄이기" disabled={goal <= GOAL_MIN} onClick={() => setGoal((g) => g - 1)}>
              −
            </button>
            <span className="mini-value wide">{goal}일</span>
            <button type="button" className="step-btn" aria-label="목표 늘리기" disabled={goal >= GOAL_MAX} onClick={() => setGoal((g) => g + 1)}>
              +
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="label">예시 루틴이 들어 있어요</p>
        <p className="muted onboarding-text">
          가슴·삼두 → 등·이두 → 하체·어깨 순서로 추천해요. 내 분할에 맞게 <b>설정 → 루틴</b>에서 고치거나 새로 만들 수 있어요.
        </p>
      </section>

      {!isInstalled() && (
        <p className="hint">
          아이폰: Safari 하단 공유 버튼 → <b>홈 화면에 추가</b>를 하면 앱처럼 열리고 기록도 안전하게 보관돼요.
        </p>
      )}

      <button type="button" className="btn btn-primary btn-large" onClick={() => void start()}>
        시작하기
      </button>
    </main>
  )
}
