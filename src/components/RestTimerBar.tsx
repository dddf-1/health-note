import type { RestTimer } from '../hooks/timers'
import { formatCountdown } from '../lib/format'

/** 2-1 ⑥ 휴식 타이머 바 (하단 고정) */
export function RestTimerBar({ timer }: { timer: RestTimer }) {
  if (!timer.running && !timer.justFinished) return null

  if (timer.justFinished) {
    return (
      <div className="rest-bar finished" role="status">
        <strong>휴식 끝! 다음 세트 시작</strong>
      </div>
    )
  }

  const progress = timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0
  return (
    <div className="rest-bar" role="timer" aria-label="휴식 타이머">
      <div className="rest-progress" style={{ transform: `scaleX(${progress})` }} />
      <span className="rest-label">휴식</span>
      <span className="rest-time">{formatCountdown(timer.remainingMs)}</span>
      <button type="button" className="rest-btn" onClick={() => timer.adjust(-15)}>
        −15초
      </button>
      <button type="button" className="rest-btn" onClick={() => timer.adjust(15)}>
        +15초
      </button>
      <button type="button" className="rest-btn" onClick={timer.skip}>
        건너뛰기
      </button>
    </div>
  )
}
