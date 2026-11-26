export type Tab = 'home' | 'history' | 'progress'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'home', label: '홈', icon: '🏠' },
  { id: 'history', label: '기록', icon: '📅' },
  { id: 'progress', label: '성장', icon: '📈' },
]

/** 하단 탭 (운동 중에는 숨긴다) */
export function TabBar(props: { current: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="tab-bar" aria-label="메뉴">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab ${t.id === props.current ? 'selected' : ''}`}
          aria-current={t.id === props.current ? 'page' : undefined}
          onClick={() => props.onChange(t.id)}
        >
          <span aria-hidden="true">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
