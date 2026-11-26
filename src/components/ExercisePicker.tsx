import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { createExercise, EXERCISE_NAME_MAX, listExercises } from '../db/manage'
import { BODY_PART_LABELS } from '../db/types'
import type { BodyPart } from '../db/types'

const PARTS = Object.keys(BODY_PART_LABELS) as BodyPart[]

/** 종목 고르기 (검색·부위 필터·직접 추가) — 전체 화면 */
export function ExercisePicker(props: {
  title: string
  /** 이미 들어 있어서 표시만 해 둘 종목 */
  selectedIds?: ReadonlySet<number>
  onPick: (exerciseId: number) => void
  onClose: () => void
}) {
  const exercises = useLiveQuery(() => listExercises(db)) ?? []
  const [query, setQuery] = useState('')
  const [part, setPart] = useState<BodyPart | null>(null)
  const [creating, setCreating] = useState(false)
  const [newPart, setNewPart] = useState<BodyPart>('chest')
  const [error, setError] = useState('')

  const q = query.replace(/\s/g, '')
  const filtered = exercises.filter(
    (e) => (part === null || e.bodyPart === part) && (q === '' || e.name.replace(/\s/g, '').includes(q)),
  )

  const create = async () => {
    try {
      const id = await createExercise(db, { name: query, bodyPart: newPart })
      props.onPick(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가하지 못했어요')
    }
  }

  return (
    <div className="picker" role="dialog" aria-modal="true" aria-label={props.title}>
      <header className="picker-header">
        <button type="button" className="icon-btn" aria-label="닫기" onClick={props.onClose}>
          ✕
        </button>
        <strong>{props.title}</strong>
      </header>
      <input
        className="select"
        type="search"
        placeholder="종목 검색 또는 새 이름"
        aria-label="종목 검색"
        maxLength={EXERCISE_NAME_MAX}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setError('')
        }}
      />
      <div className="chips picker-parts" role="group" aria-label="부위">
        <button type="button" className={`chip ${part === null ? 'selected' : ''}`} onClick={() => setPart(null)}>
          전체
        </button>
        {PARTS.map((p) => (
          <button key={p} type="button" className={`chip ${part === p ? 'selected' : ''}`} onClick={() => setPart(p)}>
            {BODY_PART_LABELS[p]}
          </button>
        ))}
      </div>

      <ul className="picker-list">
        {filtered.map((e) => (
          <li key={e.id}>
            <button type="button" className="picker-item" onClick={() => props.onPick(e.id)}>
              <span>{e.name}</span>
              <span className="muted">
                {props.selectedIds?.has(e.id) ? '추가됨 · ' : ''}
                {BODY_PART_LABELS[e.bodyPart]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {query.trim() !== '' && (
        <section className="card">
          {creating ? (
            <>
              <p className="label">"{query.trim()}" 부위</p>
              <div className="chips">
                {PARTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${newPart === p ? 'selected' : ''}`}
                    aria-pressed={newPart === p}
                    onClick={() => setNewPart(p)}
                  >
                    {BODY_PART_LABELS[p]}
                  </button>
                ))}
              </div>
              {error && <p className="error">{error}</p>}
              <div className="button-row">
                <button type="button" className="btn btn-primary" onClick={() => void create()}>
                  만들고 추가
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-plain picker-new" onClick={() => setCreating(true)}>
              + "{query.trim()}" 새 종목으로 만들기
            </button>
          )}
        </section>
      )}
    </div>
  )
}
