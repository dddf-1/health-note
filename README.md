# 나만의 헬스 노트

> 지난번 기록이 미리 채워져 있어, 체크 한 번이면 끝나는 나만의 헬스 노트

아이폰 홈 화면에 추가해서 쓰는 개인용 운동 기록 웹앱(PWA)입니다. 서버·로그인 없이 기록은 기기 안(IndexedDB)에만 저장됩니다.

- 기획 문서: Notion 「프로젝트」 페이지 (초기 버전 사본: [docs/운동기록앱_기획_v0.1.md](docs/운동기록앱_기획_v0.1.md))
- 일정: 2026-11-30 ~ 12-11 (1주 스프린트 2개) → MVP v1.0

## 기술 스택

| 영역 | 선택 |
| --- | --- |
| 화면 | React + TypeScript + Vite |
| 기기 저장 | IndexedDB (Dexie.js, dexie-react-hooks) |
| 그래프 | Recharts |
| 오프라인·홈 화면 설치 | vite-plugin-pwa |
| 배포 | GitHub Pages (예정) |

## 실행

```powershell
npm install
npm run dev
```

```powershell
npm run build
```
