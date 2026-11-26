import { useEffect, useRef, useState } from 'react'
import { beep } from '../lib/sound'

/** 운동 경과 시간 (1초마다 갱신) */
export function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return startedAt === undefined ? 0 : now - startedAt
}

export interface RestTimer {
  running: boolean
  remainingMs: number
  totalMs: number
  /** 0초가 된 직후 잠깐 true (화면 강조용) */
  justFinished: boolean
  start: (seconds: number) => void
  adjust: (deltaSeconds: number) => void
  skip: () => void
}

const FINISHED_HIGHLIGHT_MS = 4000

/** 휴식 타이머 (F-08). 0초가 되면 알림음 + 잠깐 강조 */
export function useRestTimer(): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [totalMs, setTotalMs] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [justFinished, setJustFinished] = useState(false)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (endsAt === null) return
    const t = setInterval(() => {
      const n = Date.now()
      if (n >= endsAt) {
        setEndsAt(null)
        setJustFinished(true)
        beep()
        if (highlightTimer.current) clearTimeout(highlightTimer.current)
        highlightTimer.current = setTimeout(() => setJustFinished(false), FINISHED_HIGHLIGHT_MS)
      } else {
        setNow(n)
      }
    }, 250)
    return () => clearInterval(t)
  }, [endsAt])

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    [],
  )

  return {
    running: endsAt !== null,
    remainingMs: endsAt === null ? 0 : Math.max(0, endsAt - now),
    totalMs,
    justFinished,
    start: (seconds) => {
      const n = Date.now()
      setJustFinished(false)
      setNow(n)
      setTotalMs(seconds * 1000)
      setEndsAt(n + seconds * 1000)
    },
    adjust: (delta) => {
      setEndsAt((e) => (e === null ? e : Math.max(Date.now(), e + delta * 1000)))
      setTotalMs((t) => Math.max(0, t + delta * 1000))
    },
    skip: () => setEndsAt(null),
  }
}

/** 운동 중 화면이 저절로 꺼지지 않게 (지원하는 브라우저에서만) */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // 배터리 절약 모드 등에서는 거절될 수 있다
      }
    }
    void request()
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [enabled])
}

type PersistState = 'checking' | 'granted' | 'not-granted' | 'unsupported'

/** 브라우저가 저장 공간을 임의로 지우지 않도록 영구 보관 요청 */
export function usePersistentStorage(): PersistState {
  const supported = typeof navigator.storage?.persist === 'function'
  const [state, setState] = useState<PersistState>(supported ? 'checking' : 'unsupported')
  useEffect(() => {
    if (!supported) return
    navigator.storage
      .persist()
      .then((ok) => setState(ok ? 'granted' : 'not-granted'))
      .catch(() => setState('not-granted'))
  }, [supported])
  return state
}
