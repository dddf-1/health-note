import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db/db'
import { getExerciseProgress, listExercisesWithHistory } from '../db/history'
import type { ProgressPoint } from '../db/history'
import { getSettings } from '../db/repo'
import type { WeightUnit } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/types'
import { toDisplayWeight } from '../domain/rules'
import { formatSet, formatVolume, formatWeight } from '../lib/format'

type Metric = 'top' | 'e1rm' | 'volume'

const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'top', label: '최고 무게' },
  { id: 'e1rm', label: '추정 1RM' },
  { id: 'volume', label: '볼륨' },
]

const shortDate = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function metricKg(p: ProgressPoint, metric: Metric): number | null {
  if (metric === 'top') return p.topWeightKg
  if (metric === 'e1rm') return p.e1rmKg
  return p.volumeKg
}

function formatMetric(kg: number, metric: Metric, unit: WeightUnit): string {
  return metric === 'volume' ? formatVolume(kg, unit) : `${formatWeight(Math.round(kg * 10) / 10, unit)}${unit}`
}

/** 4-1 종목별 성장 그래프 */
export function ProgressScreen() {
  const exercises = useLiveQuery(() => listExercisesWithHistory(db))
  const unit = useLiveQuery(() => getSettings(db))?.unit ?? DEFAULT_SETTINGS.unit
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [metric, setMetric] = useState<Metric>('top')
  const exerciseId = pickedId ?? exercises?.[0]?.exerciseId
  const points = useLiveQuery(
    async () => (exerciseId === undefined ? [] : getExerciseProgress(db, exerciseId)),
    [exerciseId],
  )

  if (!exercises) return <p className="muted">불러오는 중…</p>
  if (exercises.length === 0) {
    return (
      <section className="card empty-card">
        <p className="routine">아직 그래프가 없어요</p>
        <p className="muted">운동을 완료하면 종목별로 기록이 쌓여요.</p>
      </section>
    )
  }

  const data = (points ?? [])
    .map((p) => {
      const kg = metricKg(p, metric)
      return { ...p, label: shortDate(p.date), value: kg === null ? null : toDisplayWeight(kg, unit), kg }
    })
    .filter((d) => d.value !== null)
  const first = data[0]
  const last = data[data.length - 1]
  const diff = first && last ? (last.kg ?? 0) - (first.kg ?? 0) : 0

  return (
    <>
      <section className="card">
        <label className="label" htmlFor="exercise-pick">
          종목
        </label>
        <select
          id="exercise-pick"
          className="select"
          value={exerciseId}
          onChange={(e) => setPickedId(Number(e.target.value))}
        >
          {exercises.map((e) => (
            <option key={e.exerciseId} value={e.exerciseId}>
              {e.name} ({e.sessionCount}회)
            </option>
          ))}
        </select>
        <div className="chips" role="group" aria-label="볼 값">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${m.id === metric ? 'selected' : ''}`}
              aria-pressed={m.id === metric}
              onClick={() => setMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        {last ? (
          <div className="progress-head">
            <strong className="progress-value">{formatMetric(last.kg ?? 0, metric, unit)}</strong>
            {data.length > 1 && (
              <span className={`trend ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>
                {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} 처음보다{' '}
                {diff === 0 ? '같음' : formatMetric(Math.abs(diff), metric, unit)}
              </span>
            )}
          </div>
        ) : (
          <p className="muted">이 값으로 볼 기록이 없어요 (예: 13회 이상만 한 종목은 1RM 을 계산하지 않아요).</p>
        )}
        {data.length > 1 && (
          <div className="chart" role="img" aria-label={`${METRICS.find((m) => m.id === metric)?.label} 그래프`}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  domain={['auto', 'auto']}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--text)',
                  }}
                  labelStyle={{ color: 'var(--muted)' }}
                  itemStyle={{ color: 'var(--text)' }}
                  formatter={(_v, _n, item) => [
                    formatMetric((item.payload as { kg: number }).kg, metric, unit),
                    METRICS.find((m) => m.id === metric)?.label,
                  ]}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {data.length === 1 && <p className="muted">두 번 이상 하면 그래프가 그려져요.</p>}
      </section>

      <section className="card">
        <p className="label">운동별 기록</p>
        {[...(points ?? [])].reverse().map((p) => (
          <p key={p.workoutId} className="record">
            <span>{shortDate(p.date)}</span>
            <span className="muted">{p.sets.map((s) => formatSet(s, unit)).join(', ')}</span>
          </p>
        ))}
      </section>
    </>
  )
}
