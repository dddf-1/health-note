import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { TabBar } from './components/TabBar'
import type { Tab } from './components/TabBar'
import { db } from './db/db'
import { getActiveWorkout, getSettings } from './db/repo'
import type { WorkoutSummary } from './db/repo'
import { HistoryScreen } from './screens/HistoryScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { HomeScreen } from './screens/HomeScreen'
import { RoutineEditScreen } from './screens/RoutineEditScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { WorkoutDetailScreen } from './screens/WorkoutDetailScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

type View =
  | { name: 'loading' }
  | { name: 'onboarding' }
  | { name: Tab }
  | { name: 'workout'; workoutId: number }
  | { name: 'summary'; summary: WorkoutSummary }
  | { name: 'detail'; workoutId: number }
  | { name: 'routine'; routineId?: number }

// 그래프 라이브러리(Recharts)가 커서 성장 탭을 처음 열 때 불러온다
const ProgressScreen = lazy(() => import('./screens/ProgressScreen').then((m) => ({ default: m.ProgressScreen })))

const TITLES: Record<Exclude<Tab, 'home'>, string> = {
  history: '운동 기록',
  progress: '성장 그래프',
  settings: '설정',
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' })

  // F-10: 앱을 다시 열면 진행 중 운동으로 바로 복귀 (12시간 지난 운동은 홈에서 안내)
  useEffect(() => {
    Promise.all([getActiveWorkout(db), getSettings(db), db.workouts.count()])
      .then(([active, settings, workoutCount]) => {
        // F-01: 처음 쓰는 사람만 (이미 기록이 있으면 건너뜀)
        if (settings.onboardedAt === undefined && workoutCount === 0) setView({ name: 'onboarding' })
        else setView(active && !active.isStale ? { name: 'workout', workoutId: active.id } : { name: 'home' })
      })
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
  const goSettings = useCallback(() => setView({ name: 'settings' }), [])
  const editRoutine = useCallback((routineId?: number) => setView({ name: 'routine', routineId }), [])
  const openDetail = useCallback((workoutId: number) => setView({ name: 'detail', workoutId }), [])

  switch (view.name) {
    case 'loading':
      return <main className="app" />
    case 'onboarding':
      return <OnboardingScreen onDone={goHome} />
    case 'workout':
      return <WorkoutScreen workoutId={view.workoutId} onExit={goHome} onFinished={showSummary} />
    case 'summary':
      return <SummaryScreen summary={view.summary} onDone={goHome} />
    case 'detail':
      return <WorkoutDetailScreen workoutId={view.workoutId} onBack={goHistory} />
    case 'routine':
      return <RoutineEditScreen routineId={view.routineId} onDone={goSettings} />
    case 'home':
    case 'history':
    case 'progress':
    case 'settings':
      return (
        <>
          <main className="app has-tabs">
            {view.name !== 'home' && <h1 className="page-title">{TITLES[view.name]}</h1>}
            {view.name === 'home' && <HomeScreen onOpenWorkout={openWorkout} onFinished={showSummary} />}
            {view.name === 'history' && <HistoryScreen onOpen={openDetail} />}
            {view.name === 'progress' && (
              <Suspense fallback={<p className="muted">그래프 불러오는 중…</p>}>
                <ProgressScreen />
              </Suspense>
            )}
            {view.name === 'settings' && <SettingsScreen onEditRoutine={editRoutine} />}
          </main>
          <TabBar current={view.name} onChange={(tab) => setView({ name: tab })} />
        </>
      )
  }
}
