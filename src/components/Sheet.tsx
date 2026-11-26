export interface SheetAction {
  label: string
  onClick: () => void
  tone?: 'primary' | 'danger' | 'plain'
}

/** 화면 아래에서 올라오는 확인 창 (브라우저 confirm 대신) */
export function Sheet(props: { title: string; message?: string; actions: SheetAction[] }) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <h2 className="sheet-title">{props.title}</h2>
        {props.message && <p className="sheet-message">{props.message}</p>}
        <div className="sheet-actions">
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`btn btn-${a.tone ?? 'plain'}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 화면 아래 잠깐 뜨는 안내 (되돌리기 버튼 선택) */
export function Toast(props: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="toast" role="status">
      <span>{props.message}</span>
      {props.actionLabel && props.onAction && (
        <button type="button" className="toast-action" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      )}
    </div>
  )
}
