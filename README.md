# 꽃놀이 고스톱

친구 두 명이 방 코드로 연결해 즐기는 금전 거래 없는 간소화 고스톱입니다. 정적 파일이므로 GitHub Pages에서 바로 호스팅할 수 있습니다.

## 실행과 배포

`index.html`, `style.css`, `engine.js`, `app.js`를 공개 GitHub 저장소에 올리고 Settings → Pages에서 해당 브랜치와 루트(`/`)를 게시 소스로 지정하세요. 배포 주소에서 한 명이 방을 만들고 6자리 코드를 다른 사람에게 전달합니다. 설치나 계정은 필요 없습니다.

두 플레이어는 HTTPS로 별도의 게임 서버에 접속합니다. 서버가 방과 게임 상태를 관리하고 각 브라우저가 주기적으로 상태를 확인합니다. 서버가 작동하고 인터넷이 연결되어 있어야 합니다. 게임 중 한 사람이 나가면 방이 종료되며, 방은 생성 후 6시간 뒤 만료됩니다. 방 코드는 신뢰하는 상대와만 공유하세요.

## 자체 간소화 규칙

48장 중 각자 10장, 바닥 8장으로 시작합니다. 같은 월을 매칭하며 7점 이상부터 고/스톱을 선택합니다. 광 3/4/5장은 3/4/15점, 열끗과 띠는 각각 5장부터 장당 1점, 피는 10장부터 장당 1점입니다. 고 후에는 직전 점수보다 1점 이상 올라야 다시 선택합니다. 고 추가점, 광박, 피박, 쌍피, 흔들기, 폭탄 등의 전통 세부 규칙은 적용하지 않습니다. 패가 소진되면 점수가 높은 쪽이 이깁니다.

## 이미지 출처

화투패 SVG는 Spenĉjo가 개별 파일로 분리한 작품이며, Marcus Richert의 한국 화투 도안과 Louie Mantia Jr.의 화투 그림을 바탕으로 합니다. [Wikimedia Commons 원본 모음](https://commons.wikimedia.org/wiki/Category:SVG_Hwatu), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)을 따릅니다. SVG 내용은 변경하지 않고 파일명만 바꿨습니다. 개별 파일 출처는 `assets/cards/verification.json`에 기록되어 있습니다.

초록색 게임판 질감 `assets/green-felt.jpg`는 OpenAI 내장 이미지 생성 도구로 제작한 뒤 JPEG로 변환했습니다. 생성 요청: “Top-down macro photograph of a dark forest-green traditional card table baize felt, very subtle woven fiber texture, gentle warm light, slight worn but clean natural cloth, evenly lit center, understated dark vignette along edges. Empty surface only, no playing cards, no objects, no hands, no text, no logos, no borders. Wide landscape framing, realistic and unobtrusive.”
