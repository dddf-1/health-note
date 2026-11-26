import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { SetValue, WeightUnit, WorkoutSet } from '../db/types'
import { clampDisplayWeight, clampReps, fromDisplayWeight } from '../domain/rules'
import { formatSet, formatWeight } from '../lib/format'

type Field = 'weight' | 'reps'

const SWIPE_START_PX = 10
const SWIPE_DELETE_PX = 70
const SWIPE_MAX_PX = 110

export interface SetRowProps {
  set: WorkoutSet
  previous: SetValue | undefined
  unit: WeightUnit
  isPR: boolean
  onChange: (patch: { weightKg?: number | null; reps?: number | null }) => void
  onStep: (field: Field, direction: 1 | -1) => void
  onToggle: () => void
  onDelete: () => void
}

/** 2-1 ③ 세트 행: 지난 기록 · kg [−][+] · 회 [−][+] · ✓, 왼쪽으로 밀면 삭제 */
export function SetRow(props: SetRowProps) {
  const { set, unit } = props
  const [editing, setEditing] = useState<Field | null>(null)
  const [draft, setDraft] = useState('')
  const [dx, setDx] = useState(0)
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)

  const openEdit = (field: Field) => {
    setEditing(field)
    setDraft(field === 'weight' ? formatWeight(set.weightKg, unit) : String(set.reps ?? ''))
  }

  const commit = () => {
    if (editing === null) return
    const text = draft.trim().replace(',', '.')
    if (text === '') {
      props.onChange(editing === 'weight' ? { weightKg: null } : { reps: null })
    } else {
      const n = Number(text)
      if (Number.isFinite(n)) {
        props.onChange(
          editing === 'weight'
            ? { weightKg: fromDisplayWeight(clampDisplayWeight(n), unit) }
            : { reps: clampReps(n) },
        )
      }
    }
    setEditing(null)
  }

  /** 횟수가 빈 칸이면 체크 대신 횟수 입력부터 연다 (처음 하는 종목) */
  const toggle = () => {
    if (!set.done && set.reps === null) {
      openEdit('reps')
      return
    }
    props.onToggle()
  }

  // ── 밀어서 삭제 ──
  const onPointerDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, active: false }
  }
  const onPointerMove = (e: PointerEvent) => {
    const s = swipe.current
    if (!s) return
    const moveX = e.clientX - s.x
    const moveY = e.clientY - s.y
    if (!s.active && Math.abs(moveX) > SWIPE_START_PX && Math.abs(moveX) > Math.abs(moveY)) {
      s.active = true
    }
    if (s.active) setDx(Math.max(-SWIPE_MAX_PX, Math.min(0, moveX)))
  }
  const onPointerEnd = () => {
    const s = swipe.current
    swipe.current = null
    if (!s?.active) return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 0)
    if (dx <= -SWIPE_DELETE_PX) props.onDelete()
    setDx(0)
  }

  const field = (kind: Field) => {
    const label = kind === 'weight' ? unit : '회'
    const value = kind === 'weight' ? formatWeight(set.weightKg, unit) : String(set.reps ?? '')
    const minus = () => props.onStep(kind, -1)
    const plus = () => props.onStep(kind, 1)
    return (
      <div className="stepper">
        <button type="button" className="step-btn" aria-label={`${label} 줄이기`} onClick={minus}>
          −
        </button>
        {editing === kind ? (
          <input
            className="step-input"
            autoFocus
            inputMode={kind === 'weight' ? 'decimal' : 'numeric'}
            aria-label={kind === 'weight' ? `무게(${unit})` : '횟수'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        ) : (
          <button
            type="button"
            className={`step-value ${value === '' ? 'empty' : ''}`}
            aria-label={kind === 'weight' ? `무게 ${value || '입력'}` : `횟수 ${value || '입력'}`}
            onClick={() => openEdit(kind)}
          >
            {value === '' ? '–' : value}
          </button>
        )}
        <button type="button" className="step-btn" aria-label={`${label} 늘리기`} onClick={plus}>
          +
        </button>
      </div>
    )
  }

  return (
    <div className="set-row-wrap">
      {dx < 0 && (
        <div className="set-row-delete" aria-hidden="true">
          삭제
        </div>
      )}
      <div
        className={`set-row ${set.done ? 'done' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        <span className="set-no">
          {props.isPR ? '🏆' : set.setNumber}
        </span>
        <span className="set-prev">{formatSet(props.previous, unit)}</span>
        {field('weight')}
        {field('reps')}
        <button
          type="button"
          className={`check-btn ${set.done ? 'checked' : ''}`}
          aria-label={set.done ? `${set.setNumber}세트 체크 해제` : `${set.setNumber}세트 완료`}
          aria-pressed={set.done}
          onClick={toggle}
        >
          ✓
        </button>
      </div>
    </div>
  )
}
