/**
 * 파일 저장. 아이폰은 공유 시트(“파일에 저장”, AirDrop 등)가 가장 확실해서 먼저 시도하고,
 * 안 되면 일반 다운로드. 사용자가 공유 창을 닫으면 false.
 */
export async function saveFile(name: string, content: string, type: string): Promise<boolean> {
  const file = new File([content], name, { type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      // 공유가 막힌 환경이면 아래 다운로드로
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/** 오늘 날짜: 2026-11-26 */
export function todayStamp(now = Date.now()): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
