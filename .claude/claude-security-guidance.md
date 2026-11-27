# 헬스 노트 보안 기준

서버·로그인 없는 개인용 PWA다. 기록은 기기 IndexedDB(Dexie)에만 있고, GitHub Pages(https://dddf-1.github.io/health-note/)로 정적 배포한다.
가장 큰 위험은 (1) 사용자 기록이 기기 밖으로 새는 것, (2) 백업 파일로 들어온 값이 앱이나 엑셀에서 코드처럼 실행되는 것, (3) 배포 경로가 오염되는 것이다.

## 기록은 기기 밖으로 나가지 않는다
- 운동 기록·메모·설정을 외부로 보내는 fetch, XMLHttpRequest, sendBeacon, WebSocket을 추가하지 않는다. 데이터가 기기를 떠나는 길은 사용자가 누르는 백업 저장·CSV 내보내기(src/lib/file.ts의 saveFile)뿐이다
- 분석·광고·에러 수집 SDK, 외부 CDN 스크립트·폰트를 넣지 않는다. 모든 자원은 빌드 결과물(dist)에서 같은 출처로 내려준다
- 기록·메모를 URL(쿼리, 해시)에 넣지 않는다. console.log로 기록 전체를 찍는 코드를 남기지 않는다
- 기록을 localStorage나 쿠키로 옮기지 않는다. 저장은 src/db의 Dexie를 거친다

## 백업 복원은 믿을 수 없는 입력이다
- 백업 파일은 다른 사람이 보낸 파일일 수도 있다. parseBackup(src/db/backup.ts)을 거치지 않고 importBackup에 넣지 않는다
- 백업 형식을 바꾸면 parseBackup 검사도 같이 늘린다. 이름·메모는 문자열, 무게·횟수·시간은 유한한 숫자인지 확인하고, 모르는 필드는 버리거나 무시한다
- 백업의 settings는 DEFAULT_SETTINGS 위에 덮어쓰는 방식을 유지한다. __proto__, constructor 같은 키로 객체를 오염시킬 수 있는 병합(재귀 merge, Object.assign 대상이 공유 객체)을 쓰지 않는다
- 복원은 기존 데이터를 모두 지운다. 확인 창 없이 복원이 실행되는 경로를 만들지 않는다

## 화면에 그리기
- 종목 이름·루틴 이름·메모는 사용자 입력이자 백업으로 들어올 수 있는 값이다. JSX 텍스트로만 그리고 dangerouslySetInnerHTML, innerHTML, document.write를 쓰지 않는다
- 사용자 입력이나 백업 값을 href, src, style 문자열에 넣지 않는다 (javascript: 주소 실행 방지)
- eval, new Function, 문자열 setTimeout을 쓰지 않는다

## CSV 내보내기
- CSV 셀 값이 =, +, -, @, 탭, 캐리지리턴으로 시작하면 엑셀·구글 시트가 수식으로 실행한다. 메모·종목·루틴 이름 셀은 앞에 '를 붙이거나 막아서 수식으로 해석되지 않게 한다 (숫자 열인 세트·무게·횟수는 예외)
- 쉼표·큰따옴표·줄바꿈 이스케이프(csvCell)를 우회하는 새 내보내기 경로를 만들지 않는다

## PWA·서비스 워커
- 서비스 워커는 같은 출처의 빌드 결과물만 캐시한다. 외부 주소를 런타임 캐시에 넣지 않는다
- manifest의 scope·start_url은 /health-note/ 아래로 유지한다

## 배포 (.github/workflows)
- 워크플로 권한은 지금처럼 최소(contents: read, pages: write, id-token: write)로 둔다. write-all이나 불필요한 권한을 추가하지 않는다
- pull_request_target 트리거를 쓰지 않는다. 배포는 main 푸시와 수동 실행에서만 한다
- run: 안에 ${{ github.event.* }} 값(브랜치 이름, PR 제목 등)을 그대로 넣지 않는다. 필요하면 env로 넘긴다
- 테스트·린트를 건너뛰고 배포하는 단계를 만들지 않는다

## 의존성·비밀 정보
- 이 앱은 비밀 키가 필요 없다. API 키·토큰을 코드나 VITE_ 환경 변수에 넣지 않는다 (VITE_ 값은 빌드 결과물에 그대로 노출된다)
- 새 패키지는 꼭 필요할 때만 추가하고 package-lock.json을 같이 커밋한다. postinstall 스크립트가 있는 낯선 패키지는 피한다
