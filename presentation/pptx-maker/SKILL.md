---
name: pptx-maker
description: Create or edit an editable PowerPoint presentation from arbitrary user-provided material, with a stated audience, scope, and design system. Use for PPTX and slide-deck work; do not use for unrelated document or image tasks.
---

# PPTX maker (Universal Presentation Generator)

사용자가 제공한 다양한 입력 자료(문서, 기획서, 데이터, 회의록 등)를 바탕으로, 표준 템플릿과 디자인 시스템을 적용하여 편집 가능한 고품질 `.pptx` 발표 자료를 생성합니다.

## 핵심 제작 워크플로우 (5단계)

### 1단계: 입력 자료 분석 및 요구사항 확인 (Analyze & Clarify)
1. **입력 자료 확인:**
   - `input/materials/` 또는 대화창에 제공된 자료(Markdown, 텍스트, 보고서 등)를 확인합니다.
   - `input/presentation-brief.md` 또는 `template/presentation-input-template.md`를 기준으로 발표 주제, 목적, 대상 청중, 핵심 메시지, 분량을 파악합니다.
   - 이미 제공된 정보는 재질문하지 않고, 슬라이드 구성에 필수적인 미확인 사항만 간결하게 확인합니다.
2. **근거 기반 작성:**
   - 입력 자료에 없는 수치나 성과를 임의로 지어내지 않습니다.
   - 불확실한 수치는 확인이 필요한 항목으로 명시하고 발표자 노트에 기록합니다.

### 2단계: 템플릿 테마 및 화면 비율 선정 (Select Theme & Ratio)
1. **테마 선택:**
   - `modern-business`: 경영·전략·비즈니스 보고 (네이비/블루, 16:9)
   - `tech-dark`: 기술 컨퍼런스, 개발자 밋업, IT 스타트업 피치 (다크 모드, 16:9)
   - `warm-pastel`: 라이프스타일, 교육, 친근한 서비스 소개 (소르베 파스텔, 16:9 or 4:3)
   - `clean-minimal`: 디자인 포트폴리오, 심플 브리핑 (모노크롬/오렌지 포인트, 16:9)
   - 세부 기준은 `design-system.md`를 참조합니다.
2. **화면 비율:** 기본값 16:9 와이드스크린 (필요시 4:3 선택).

### 3단계: 슬라이드 기획 및 레이아웃 매핑 (Outline & Layout Mapping)
- 1슬라이드 1메시지(One Slide, One Message) 원칙을 따릅니다.
- **[폰트 크기 절대 원칙] 본문, 캡션, 배지, 각주/푸터, 표 셀 등 모든 텍스트의 폰트 사이즈는 12pt 밑으로 절대 내려가지 않도록 작성합니다 (최소 12pt 이상).**
- 메시지의 성격에 맞춰 11종의 레이아웃 중 최적의 것을 매핑합니다:
  - 표지: `cover`
  - 목차: `agenda`
  - 섹션 전환: `section`
  - 2단 비교: `columns-2` (AS-IS vs TO-BE, 문제 vs 해결책)
  - 3대 핵심축: `columns-3` (Core Pillars, 주요 기능)
  - 4단 그리드: `cards-4` (2x2 영역별 과제)
  - 일정/프로세스: `timeline` (단계별 마일스톤)
  - 핵심 수치: `metrics` (정량 지표, KPI 대형 숫자)
  - 상세 비교표: `table` (네이티브 표)
  - 핵심 명제 강조: `key-message`
  - 마무리: `closing` (Q&A, 연락처)
- 상세 배경 설명 및 질의응답 팁은 `notes`(발표자 노트)로 분리합니다.

### 4단계: PPTX 자동 빌드 (Build Native PPTX)
- 슬라이드 명세를 JSON 파일(`input/deck.json` 등)로 작성하거나, `engine/cli.js`를 실행하여 PPTX를 생성합니다:
  ```bash
  node engine/cli.js --deck input/deck.json --theme <theme-id> --out output/<deck-name>.pptx
  ```
- 텍스트나 표가 비트맵으로 캡처되지 않고, PowerPoint에서 직접 편집 가능한 네이티브 객체인지 확인합니다.

### 5단계: 시각 검토 및 최종 전달 (Review & Deliver)
- 슬라이드 제목, 여백, 대비, 글자 잘림(Overflow) 여부를 확인합니다.
- 최종 PPTX 파일은 `output/` 폴더에 저장합니다.
- 필요한 경우 발표자 노트를 마크다운(`output/<deck-name>_발표자노트.md`)으로도 함께 제공합니다.

## 저장소 규칙 (Repository Conventions)

- **디자인 기준:** `design-system.md`
- **템플릿 정의:** `templates/` (`modern-business.json`, `tech-dark.json`, `warm-pastel.json`, `clean-minimal.json`)
- **생성 엔진:** `engine/` (`generator.js`, `layouts.js`, `theme.js`, `cli.js`)
- **입력 양식:** `template/presentation-input-template.md`, `template/deck-spec-template.json`
- **사용자 입력 자료:** `input/materials/`, `input/presentation-brief.md`
- **완성된 발표 자료:** `output/`
