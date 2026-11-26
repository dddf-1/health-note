// 휴식 종료 알림음. 아이폰은 사용자가 화면을 누른 순간에만 소리를 켤 수 있어서,
// ✓ 체크할 때 unlockAudio() 로 미리 켜 두고 0초가 되면 beep() 한다.

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

export function unlockAudio(): void {
  const AC = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
  if (!AC) return
  ctx ??= new AC()
  if (ctx.state === 'suspended') void ctx.resume()
}

export function beep(times = 3): void {
  if (!ctx) return
  const start = ctx.currentTime + 0.05
  for (let i = 0; i < times; i++) {
    const t = start + i * 0.3
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  }
}
