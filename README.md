# 꽃놀이 고스톱

친구 두 명이 방 코드로 연결하거나 혼자 봇과 대전하는 금전 거래 없는 2인 맞고입니다. 화면은 GitHub Pages에서 제공하고 게임과 봇의 차례는 별도 서버에서 진행합니다.

봇 대전은 쉬움(무작위 위주), 보통(즉시 얻는 패와 점수 고려), 어려움(공개된 패와 남은 패의 가능성을 고려) 중에서 선택합니다. 난이도는 새 봇 대전을 시작할 때 적용되며, 다시 하기를 누르면 같은 난이도가 유지됩니다.

## 실행과 배포

`index.html`, `style.css`, `engine.js`, `app.js`를 공개 GitHub 저장소에 올리고 Settings → Pages에서 해당 브랜치와 루트(`/`)를 게시 소스로 지정하세요. 배포 주소에서 한 명이 방을 만들고 6자리 코드를 다른 사람에게 전달합니다. 설치나 계정은 필요 없습니다.

두 플레이어는 HTTPS로 별도의 게임 서버에 접속합니다. 서버가 방과 게임 상태를 관리하고 각 브라우저가 주기적으로 상태를 확인합니다. 서버가 작동하고 인터넷이 연결되어 있어야 합니다. 게임 중 한 사람이 나가면 방이 종료되며, 방은 생성 후 6시간 뒤 만료됩니다. 방 코드는 신뢰하는 상대와만 공유하세요.

## 적용한 2인 맞고 규칙

48장 중 각자 10장과 바닥 8장으로 시작하고, 7점부터 고/스톱을 선택합니다. 뻑·자뻑·쪽·따닥·싹쓸이, 피 가져오기, 흔들기·폭탄, 비삼광, 쌍피, 국진 열끗/쌍피 선택, 고도리와 홍단·청단·초단을 적용합니다. 폭탄을 내면 나중에 손패 대신 더미를 뒤집는 기회가 2번 생깁니다. 고 점수와 광박·피박·멍따·고박을 점수에 적용하며 돈을 사용하지 않습니다. 피박은 상대 피 1~7장일 때 적용합니다. 마지막 차례의 쪽·따닥·싹쓸이는 제외하며, 끝까지 스톱이 없으면 나가리입니다.

지역별 규칙 차이를 줄이기 위해 이 버전은 조커·보너스패, 총통, 첫뻑·삼뻑 특별 보너스, 다음 판 나가리 배수는 적용하지 않습니다. 같은 달에 흔들고 폭탄을 내더라도 배수는 한 번만 적용합니다.

## 이미지 출처

화투패 SVG는 Spenĉjo가 개별 파일로 분리한 작품이며, Marcus Richert의 한국 화투 도안과 Louie Mantia Jr.의 화투 그림을 바탕으로 합니다. [Wikimedia Commons 원본 모음](https://commons.wikimedia.org/wiki/Category:SVG_Hwatu), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)을 따릅니다. SVG 내용은 변경하지 않고 파일명만 바꿨습니다. 개별 파일 출처는 `assets/cards/verification.json`에 기록되어 있습니다.

초록색 게임판 질감 `assets/green-felt.jpg`는 OpenAI 내장 이미지 생성 도구로 제작한 뒤 JPEG로 변환했습니다. 생성 요청: “Top-down macro photograph of a dark forest-green traditional card table baize felt, very subtle woven fiber texture, gentle warm light, slight worn but clean natural cloth, evenly lit center, understated dark vignette along edges. Empty surface only, no playing cards, no objects, no hands, no text, no logos, no borders. Wide landscape framing, realistic and unobtrusive.”
