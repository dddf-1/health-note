import { useCallback, useEffect, useState } from 'react'
import { db } from './db/db'
import { getActiveWorkout } from './db/repo'
import type { WorkoutSummary } from './db/repo'
import { HomeScreen } from './screens/HomeScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

type View =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'workout'; workoutId: number }
  | { name: 'summary'; summary: WorkoutSummary }

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

  const goHome = useCallback(() => setView({ name: 'home' }), [])
  const openWorkout = useCallback((workoutId: number) => setView({ name: 'workout', workoutId }), [])
  const showSummary = useCallback((summary: WorkoutSummary) => setView({ name: 'summary', summary }), [])

  switch (view.name) {
    case 'loading':
      return <main className="app" />
    case 'home':
      return <HomeScreen onOpenWorkout={openWorkout} onFinished={showSummary} />
    case 'workout':
      return (
        <WorkoutScreen workoutId={view.workoutId} onExit={goHome} onFinished={showSummary} />
      )
    case 'summary':
      return <SummaryScreen summary={view.summary} onDone={goHome} />
  }
}
