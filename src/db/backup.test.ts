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
import { BACKUP_MAX_CHARS, csvCell, exportBackup, exportSetsCsv, importBackup, parseBackup } from './backup'

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

describe('F-19 백업 복원 검증 (남이 준 파일도 안전하게)', () => {
  /** 정상 백업을 만들고 fn 으로 고친 뒤 JSON 글자로 */
  async function tampered(fn: (data: Record<string, Record<string, unknown>[]>) => void) {
    await oneWorkout()
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)))
    fn(backup.data)
    return JSON.stringify(backup)
  }

  it.each([
    ['종목 이름이 숫자', (d: Record<string, Record<string, unknown>[]>) => (d.exercises[0].name = 123)],
    ['종목 이름이 너무 김', (d: Record<string, Record<string, unknown>[]>) => (d.exercises[0].name = 'x'.repeat(21))],
    ['모르는 부위', (d: Record<string, Record<string, unknown>[]>) => (d.exercises[0].bodyPart = 'neck')],
    ['루틴 이름이 빈칸', (d: Record<string, Record<string, unknown>[]>) => (d.routines[0].name = '  ')],
    ['루틴 종목이 없는 종목을 가리킴', (d: Record<string, Record<string, unknown>[]>) => (d.routineItems[0].exerciseId = 99999)],
    ['루틴 세트 수 범위 밖', (d: Record<string, Record<string, unknown>[]>) => (d.routineItems[0].defaultSets = 50)],
    ['운동 상태가 이상함', (d: Record<string, Record<string, unknown>[]>) => (d.workouts[0].status = 'hacked')],
    ['메모가 너무 김', (d: Record<string, Record<string, unknown>[]>) => (d.workouts[0].memo = 'x'.repeat(201))],
    ['시작 시각이 글자', (d: Record<string, Record<string, unknown>[]>) => (d.workouts[0].startedAt = 'yesterday')],
    ['세트 무게가 음수', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0].weightKg = -10)],
    ['세트 무게가 너무 큼', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0].weightKg = 1e9)],
    ['세트 횟수가 소수', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0].reps = 2.5)],
    ['세트가 없는 종목을 가리킴', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0].exerciseId = 99999)],
    ['세트 완료 여부가 글자', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0].done = 'yes')],
    ['id 가 겹침', (d: Record<string, Record<string, unknown>[]>) => (d.exercises[1].id = d.exercises[0].id)],
    ['id 가 0', (d: Record<string, Record<string, unknown>[]>) => (d.workouts[0].id = 0)],
    ['진행 중 운동이 둘', (d: Record<string, Record<string, unknown>[]>) => {
      d.workouts.push({ ...d.workouts[0], id: 900, status: 'active' }, { ...d.workouts[0], id: 901, status: 'active' })
    }],
    ['줄이 객체가 아님', (d: Record<string, Record<string, unknown>[]>) => (d.workoutSets[0] = 'x' as never)],
  ])('%s → 거절', async (_, fn) => {
    const text = await tampered(fn)
    expect(() => parseBackup(text)).toThrow(ValidationError)
  })

  it('거절해도 기존 데이터는 그대로', async () => {
    const text = await tampered((d) => (d.workoutSets[0].weightKg = -1))
    const before = await db.workoutSets.count()
    expect(() => parseBackup(text)).toThrow('세트')
    expect(await db.workoutSets.count()).toBe(before)
  })

  it('모르는 필드와 __proto__ 는 버리고 아는 필드만 들여온다', async () => {
    const text = (await tampered((d) => {
      d.exercises[0].evil = '<img onerror=alert(1)>'
      d.workouts[0].extra = { deep: true }
    })).replace('"settings":[{', '"settings":[{"__proto__":{"polluted":true},')
    expect(text).toContain('"__proto__":{"polluted":true}')
    const backup = parseBackup(text)
    expect(backup.data.exercises[0]).not.toHaveProperty('evil')
    expect(backup.data.workouts[0]).not.toHaveProperty('extra')
    expect(Object.keys(backup.data.settings[0])).not.toContain('__proto__')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()

    await importBackup(other, backup)
    expect(await other.exercises.get(backup.data.exercises[0].id)).not.toHaveProperty('evil')
  })

  it('설정의 틀린 값은 기본값으로 바꾼다', async () => {
    const text = await tampered((d) => {
      Object.assign(d.settings[0], { unit: 'stone', weightStep: 999, restSeconds: -5, weeklyGoal: 30 })
    })
    const [s] = parseBackup(text).data.settings
    expect(s).toMatchObject({ unit: 'kg', weightStep: 2.5, restSeconds: 90, weeklyGoal: 4 })
  })

  it('지워진 루틴을 가리키는 지난 운동은 받아들인다', async () => {
    const text = await tampered((d) => (d.workouts[0].routineId = 99999))
    expect(parseBackup(text).data.workouts[0].routineId).toBe(99999)
  })

  it('너무 큰 파일은 읽지 않는다', () => {
    expect(() => parseBackup(' '.repeat(BACKUP_MAX_CHARS + 1))).toThrow('너무 커요')
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
