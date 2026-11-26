import { useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { db } from '../db/db'
import { exportBackup, exportSetsCsv, importBackup, parseBackup } from '../db/backup'
import type { Backup } from '../db/backup'
import { updateSettings } from '../db/manage'
import { saveFile, todayStamp } from '../lib/file'

const BACKUP_NUDGE_DAYS = 14

const dateOf = (t: number) =>
  new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })

/** 5-1 데이터: 백업 저장·복원, CSV 내보내기 */
export function BackupCard(props: { lastBackupAt?: number }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  const stale = props.lastBackupAt === undefined || now - props.lastBackupAt > BACKUP_NUDGE_DAYS * 86400000

  const run = async (task: () => Promise<string | null>) => {
    setMessage('')
    setError('')
    try {
      const done = await task()
      if (done) setMessage(done)
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패했어요')
    }
  }

  const backup = () =>
    run(async () => {
      const data = await exportBackup(db)
      const saved = await saveFile(`헬스노트-백업-${todayStamp()}.json`, JSON.stringify(data), 'application/json')
      if (!saved) return null
      await updateSettings(db, { lastBackupAt: Date.now() })
      return '백업 파일을 저장했어요'
    })

  const csv = () =>
    run(async () => {
      const saved = await saveFile(`헬스노트-기록-${todayStamp()}.csv`, await exportSetsCsv(db), 'text/csv')
      return saved ? 'CSV 파일을 저장했어요' : null
    })

  const pick = (file: File | undefined) =>
    run(async () => {
      if (!file) return null
      setPending(parseBackup(await file.text()))
      return null
    })

  const restore = () =>
    run(async () => {
      if (!pending) return null
      await importBackup(db, pending)
      setPending(null)
      return '백업에서 복원했어요'
    })

  return (
    <section className="card">
      <p className="label">데이터 백업</p>
      <p className={stale ? 'backup-warn' : 'muted'}>
        {props.lastBackupAt === undefined
          ? '아직 백업한 적이 없어요. 기록은 이 기기에만 있어서, 폰을 바꾸거나 앱을 지우면 사라져요.'
          : `마지막 백업 ${dateOf(props.lastBackupAt)}${stale ? ' · 2주가 지났어요' : ''}`}
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={() => void backup()}>
          백업 저장
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          복원
        </button>
      </div>
      <button type="button" className="btn btn-plain add-set" onClick={() => void csv()}>
        엑셀용 CSV 내보내기
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {message && (
        <p className="ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <Sheet
          title="백업에서 복원할까요?"
          message={`${dateOf(pending.exportedAt)} 백업 (운동 ${pending.data.workouts.filter((w) => w.status === 'done').length}회). 지금 이 기기의 기록은 모두 이 백업으로 바뀌어요.`}
          actions={[
            { label: '복원하기', tone: 'danger', onClick: () => void restore() },
            { label: '취소', onClick: () => setPending(null) },
          ]}
        />
      )}
    </section>
  )
}
