import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type HealthNoteDB } from './db'
import {
  finishWorkout,
  getWorkoutSets,
  setDone,
  startWorkout,
  updateSetValues,
  updateWorkoutMemo,
  ValidationError,
} from './repo'
import { updateSettings } from './manage'
import { csvCell, exportBackup, exportSetsCsv, importBackup, parseBackup } from './backup'

let db: HealthNoteDB
let other: HealthNoteDB

beforeEach(async () => {
  db = createDb(`test-${crypto.randomUUID()}`)
  other = createDb(`test-${crypto.randomUUID()}`)
  await Promise.all([db.open(), other.open()])
})
afterEach(async () => {
  await Promise.all([db.delete(), other.delete()])
})

async function oneWorkout() {
  const id = await startWorkout(db, 1, { now: new Date(2026, 10, 24, 19, 5).getTime() })
  const [first, second] = await getWorkoutSets(db, id)
  await updateSetValues(db, first.id, { weightKg: 60, reps: 10 })
  await setDone(db, first.id, true)
  await updateSetValues(db, second.id, { weightKg: 62.5, reps: 8 })
  await setDone(db, second.id, true)
  await finishWorkout(db, id)
  await updateWorkoutMemo(db, id, '어깨가 좀, 뻐근함')
  return id
}

describe('F-19 백업·복원', () => {
  it('백업 파일로 다른 기기(빈 DB)에 그대로 옮긴다', async () => {
    await oneWorkout()
    await updateSettings(db, { unit: 'lb' })
    const text = JSON.stringify(await exportBackup(db))

    await importBackup(other, parseBackup(text))
    expect(await other.workouts.toArray()).toEqual(await db.workouts.toArray())
    expect(await other.workoutSets.toArray()).toEqual(await db.workoutSets.toArray())
    expect(await other.routines.count()).toBe(await db.routines.count())
    expect((await other.settings.get('app'))?.unit).toBe('lb')
  })

  it('복원하면 기존 데이터는 백업 내용으로 바뀐다', async () => {
    const backup = await exportBackup(db) // 운동 0회
    await oneWorkout()
    await importBackup(db, backup)
    expect(await db.workouts.count()).toBe(0)
  })

  it('다른 파일·손상된 파일·새 버전 파일은 거절', () => {
    expect(() => parseBackup('not json')).toThrow(ValidationError)
    expect(() => parseBackup('{"app":"other","version":1,"data":{}}')).toThrow('이 앱의 백업')
    expect(() => parseBackup('{"app":"health-note","version":99,"data":{}}')).toThrow('새 버전')
    expect(() => parseBackup('{"app":"health-note","version":1,"data":{"exercises":[]}}')).toThrow('손상')
  })
})

describe('F-19 CSV 내보내기', () => {
  it('완료 세트를 한 줄씩, 쉼표 들어간 메모는 따옴표로', async () => {
    await oneWorkout()
    const csv = await exportSetsCsv(db)
    const lines = csv.replace('﻿', '').trim().split('\n')
    expect(lines[0]).toBe('날짜,루틴,종목,세트,무게(kg),횟수,메모')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-11-24 19:05,가슴·삼두,벤치프레스,1,60,10,"어깨가 좀, 뻐근함"')
    expect(lines[2]).toContain(',2,62.5,8,')
  })

  it('수식으로 시작하는 글자는 앞에 \' 를 붙여 실행되지 않게 (숫자는 그대로)', async () => {
    const id = await oneWorkout()
    await updateWorkoutMemo(db, id, '=HYPERLINK("http://evil.example","x")')
    const csv = await exportSetsCsv(db)
    const line = csv.replace('﻿', '').trim().split('\n')[1]
    expect(line.endsWith(`,"'=HYPERLINK(""http://evil.example"",""x"")"`)).toBe(true)

    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tx')).toBe("'\tx")
    expect(csvCell('\rx')).toBe(`"'\rx"`)
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell('벤치프레스')).toBe('벤치프레스')
  })
})
