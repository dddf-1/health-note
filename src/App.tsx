import { useCallback, useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { db } from './db/db'
import { getActiveWorkout } from './db/repo'
import type { WorkoutSummary } from './db/repo'
import { HistoryScreen } from './screens/HistoryScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { WorkoutDetailScreen } from './screens/WorkoutDetailScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

type View =
  | { name: 'loading' }
  | { name: Tab }
  | { name: 'workout'; workoutId: number }
  | { name: 'summary'; summary: WorkoutSummary }
  | { name: 'detail'; workoutId: number }

const TITLES: Record<Exclude<Tab, 'home'>, string> = { history: '운동 기록', progress: '성장 그래프' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' })

  // F-10: 앱을 다시 열면 진행 중 운동으로 바로 복귀 (12시간 지난 운동은 홈에서 안내)
  useEffect(() => {
    getActiveWorkout(db)
      .then((active) =>
        setView(active && !active.isStale ? { name: 'workout', workoutId: active.id } : { name: 'home' }),
      )
      .catch(() => setView({ name: 'home' }))
  }, [])

  // 화면이 바뀌면 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.name])

  const goHome = useCallback(() => setView({ name: 'home' }), [])
  const goHistory = useCallback(() => setView({ name: 'history' }), [])
  const openWorkout = useCallback((workoutId: number) => setView({ name: 'workout', workoutId }), [])
  const showSummary = useCallback((summary: WorkoutSummary) => setView({ name: 'summary', summary }), [])
  const openDetail = useCallback((workoutId: number) => setView({ name: 'detail', workoutId }), [])

  switch (view.name) {
    case 'loading':
      return <main className="app" />
    case 'workout':
      return <WorkoutScreen workoutId={view.workoutId} onExit={goHome} onFinished={showSummary} />
    case 'summary':
      return <SummaryScreen summary={view.summary} onDone={goHome} />
    case 'detail':
      return <WorkoutDetailScreen workoutId={view.workoutId} onBack={goHistory} />
    case 'home':
    case 'history':
    case 'progress':
      return (
        <>
          <main className="app has-tabs">
            {view.name !== 'home' && <h1 className="page-title">{TITLES[view.name]}</h1>}
            {view.name === 'home' && <HomeScreen onOpenWorkout={openWorkout} onFinished={showSummary} />}
            {view.name === 'history' && <HistoryScreen onOpen={openDetail} />}
            {view.name === 'progress' && <ProgressScreen />}
          </main>
          <TabBar current={view.name} onChange={(tab) => setView({ name: tab })} />
        </>
      )
  }
}
