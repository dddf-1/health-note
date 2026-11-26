import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from './db/db'
import { recommendRoutine } from './db/repo'

/** 홈 화면에 추가해서 실행 중인지 (아이폰 Safari 는 navigator.standalone) */
function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

type PersistState = 'checking' | 'granted' | 'not-granted' | 'unsupported'

/** 브라우저가 저장 공간을 임의로 지우지 않도록 영구 보관을 요청 */
function usePersistentStorage(): PersistState {
  // 오래된 브라우저에는 navigator.storage 가 없을 수 있다
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

const PERSIST_LABEL: Record<PersistState, string> = {
  checking: '확인 중…',
  granted: '영구 보관 ✓',
  'not-granted': '일반 보관 (홈 화면 설치 권장)',
  unsupported: '이 브라우저는 지원 안 함',
}

export default function App() {
  const routine = useLiveQuery(() => recommendRoutine(db))
  const routineCount = useLiveQuery(() => db.routines.count())
  const exerciseCount = useLiveQuery(() => db.exercises.count())
  const persist = usePersistentStorage()
  const installed = isInstalled()

  return (
    <main className="app">
      <header className="app-header">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={40} height={40} />
        <h1>나만의 헬스 노트</h1>
      </header>

      <section className="card">
        <p className="label">오늘의 루틴</p>
        <p className="routine">{routine?.name ?? '불러오는 중…'}</p>
        <button type="button" className="primary" disabled>
          ▶ 운동 시작 (곧 열려요)
        </button>
      </section>

      <section className="card">
        <p className="label">이 기기 상태</p>
        <dl className="status">
          <dt>홈 화면 설치</dt>
          <dd>{installed ? '설치됨 ✓' : '브라우저에서 실행 중'}</dd>
          <dt>저장 공간</dt>
          <dd>{PERSIST_LABEL[persist]}</dd>
          <dt>저장된 데이터</dt>
          <dd>
            루틴 {routineCount ?? '-'}개 · 종목 {exerciseCount ?? '-'}개
          </dd>
        </dl>
        {!installed && (
          <p className="hint">
            아이폰: Safari 하단 공유 버튼 → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.
          </p>
        )}
      </section>

      <footer className="footer">스프린트 1 개발 중 · v0.1.0</footer>
    </main>
  )
}
