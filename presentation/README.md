# 편안하개 발표 자료 (Presentation)

편안하개(PetWalk) 프로젝트 발표 자료를 만드는 폴더입니다. 범용 PPTX 생성 엔진(`engine/`, Node.js + PptxGenJS)과 테마(`templates/`)를 사용하고, 편안하개 발표 명세는 `input/petwalk-deck.json`에 있습니다.

## 실행 프롬프트
presentation/pptx-maker/SKILL.md의 절차를 따라 PPTX를 만들어줘. 이번 발표 입력과 참고 자료는 presentation/input/을 확인해줘.

## 편안하개 발표 생성

```bash
cd presentation
npm install            # 최초 1회 (pptxgenjs)
npm run generate:petwalk
# → output/편안하개_프로젝트_발표.pptx (4:3, petwalk 테마, 15장, 발표자 노트 포함)
```

- 명세: `input/petwalk-deck.json` (슬라이드 내용, 출처, 발표자 노트)
- 요건 정의서: `input/materials/편안하개_발표_브리프.md`
- 테마: `templates/petwalk.json` (앱 디자인 토큰의 포레스트 그린·크림 계열, Pretendard)
- 앱 화면 이미지는 저장소의 `docs/screenshots/`를 `../docs/screenshots/...` 경로로 참조합니다. 반드시 `presentation/` 폴더에서 실행하세요.
- 발표자 노트 원고: `output/편안하개_발표자노트_v2.md`

내용을 고칠 때는 PPTX를 직접 고치기보다 `input/petwalk-deck.json`을 수정하고 다시 생성하는 것을 권장합니다. 근거가 없는 수치·성과는 넣지 않습니다(현장 CBT 결과는 아직 미포함).

---

## 범용 엔진 안내


이 프로젝트는 다양한 문서·데이터·기획서 등 **범용적인 입력 자료를 바탕으로 고품질의 템플릿 기반 PowerPoint(.pptx) 발표 자료를 자동 생성**하기 위한 프로젝트입니다.

## 템플릿 다운로드
https://slidespeak.co/slide-design-prompts

---

## 🌟 주요 특징

1. **범용 입력 자료 지원 (Universal Input Handling):**
   - Markdown 문서, 회의록, 기획서, 데이터 요약 등 어떤 형식의 입력 자료라도 핵심 메시지와 수치를 추출하여 슬라이드로 변환합니다.
2. **사전 정의된 테마 시스템 (Multi-Theme Support):**
   - `petwalk`: 편안하개 앱 브랜드 포레스트 그린 & 크림 (편안하개 발표 기본, 4:3)
   - `modern-business`: 신뢰감 있는 딥 네이비 & 로열 블루 (경영 실적, 전략 보고, IR)
   - `tech-dark`: 세련된 딥 슬레이트 & 네온 시안 포인트 (기술 컨퍼런스, 개발자 밋업, IT 피치)
   - `warm-pastel`: 부드럽고 친근한 소르베 파스텔 (라이프스타일, 교육, 서비스 소개)
   - `clean-minimal`: 고대비 모노크롬 & 따뜻한 앰버 포인트 (포트폴리오, 에디토리얼 브리핑)
3. **11종의 풍부한 슬라이드 레이아웃 카탈로그:**
   - 표지(`cover`), 목차(`agenda`), 간지(`section`), 2단 비교(`columns-2`), 3단 기둥(`columns-3`), 4단 그리드(`cards-4`), 타임라인 로드맵(`timeline`), 핵심 지표(`metrics`), 네이티브 테이블(`table`), 핵심 명제(`key-message`), 마무리(`closing`)
4. **100% 네이티브 편집 가능성 (Native PPTX):**
   - 비트맵 캡처가 아닌 순수 파워포인트 텍스트 상자, 기본 도형, 표 객체로 생성되어 사용자가 파워포인트나 키노트에서 자유롭게 서식을 수정할 수 있습니다.
5. **원클릭 CLI 및 모듈형 아키텍처:**
   - 간결한 CLI 명령 및 npm 스크립트로 누구나 손쉽게 PPTX를 생성할 수 있습니다.

---

## 📁 디렉터리 구조

```text
presentation/
├── package.json                   # npm 스크립트 및 프로젝트 메타데이터
├── README.md                      # 프로젝트 사용 안내서 (본 문서)
├── design-system.md               # 범용 디자인 시스템 표준 (색상, 타이포그래피, 레이아웃)
├── templates/                     # 테마 정의 JSON (비즈니스, 테크, 파스텔, 미니멀)
│   ├── petwalk.json               # 편안하개 테마
│   ├── modern-business.json
│   ├── tech-dark.json
│   ├── warm-pastel.json
│   └── clean-minimal.json
├── template/                      # 재사용 입력 양식
│   ├── presentation-input-template.md  # 발표 요건 정의서(Brief) 템플릿
│   └── deck-spec-template.json         # 슬라이드 명세 JSON 템플릿
├── engine/                        # PPTX 생성 엔진 (Node.js + PptxGenJS)
│   ├── index.js                   # 메인 모듈 진입점
│   ├── cli.js                     # CLI 실행기
│   ├── generator.js               # PPTX 슬라이드 조립 및 저장 로직
│   ├── layouts.js                 # 11종 슬라이드 레이아웃 렌더러
│   ├── theme.js                   # 테마 로더 및 토큰 관리자
│   └── parser.js                  # JSON / Markdown 슬라이드 파서
├── input/                         # 사용자 입력 자료 저장소
│   ├── README.md                  # 입력 자료 가이드
│   ├── materials/                 # 브리프·원본 문서 (.md 등)
│   └── petwalk-deck.json          # 편안하개 발표 명세
├── examples/                      # 도메인별 완성된 실전 예시
│   ├── business-report/           # 분기 경영 실적 보고서 예시
│   └── tech-pitch/                # AI 테크 제품 피치 예시
├── pptx-maker/                    # AI 에이전트 자동화 스킬
│   ├── SKILL.md                   # AI 에이전트 실행 지침
│   └── references/
│       └── authoring-workflow.md  # 상세 제작 및 검토 워크플로우
└── output/                        # 최종 생성된 PPTX 저장 폴더
```

---

## 🚀 빠른 시작 (Quick Start)

### 완성된 예시 실행
```bash
# 경영 실적 보고서 예시 (modern-business)
npm run example:business

# AI 플랫폼 기술 피치 예시 (tech-dark)
npm run example:tech

# 소르베 파스텔 테마 예시 (warm-pastel)
npm run example:pastel
```

---

## 🛠️ 새 발표 자료 제작 워크플로우

1. **자료 준비:**
   - 발표에 활용할 원본 문서를 `input/materials/`에 넣습니다.
   - 필요 시 `template/presentation-input-template.md`를 참고하여 발표 목적, 대상 청중, 선호 테마를 정합니다.

2. **슬라이드 기획 및 명세 작성:**
   - 원본 자료의 핵심 메시지를 11종 레이아웃에 맞춰 `input/my-deck.json`으로 작성합니다. (또는 AI 에이전트에게 입력 자료를 주고 자동 작성을 요청합니다.)

3. **지능형 레이아웃 자동 최적화 (선택 사항):**
   - 작성된 슬라이드 명세의 내용과 데이터 형태에 맞춰 가장 어울리는 포맷을 지능적으로 자동 배정하고 싶다면:
   ```bash
   # 슬라이드별 최적 포맷 분석 및 미리보기
   python apply_tailored_layouts.py --deck input/my-deck.json --dry-run

   # 최적 포맷 자동 적용 및 PPTX 원클릭 빌드
   python apply_tailored_layouts.py --deck input/my-deck.json --build
   ```

4. **PPTX 생성:**
   ```bash
   node engine/cli.js --deck input/my-deck.json --theme tech-dark --out output/my-deck.pptx
   ```

5. **검토 및 수정:**
   - `output/`에 생성된 `.pptx` 파일을 열어 확인하고, 필요 시 파워포인트에서 직접 편집합니다.
