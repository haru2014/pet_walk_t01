import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "file:///C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outDir = "D:/cody/pet_walk_t01/presentation/.build/journey-deck";
const C = {
  bg: "#FBF7FB",
  white: "#FFFFFF",
  border: "#ECE3F0",
  heading: "#4A3A5C",
  body: "#6A5E76",
  caption: "#A99FB3",
  lilac: "#9B6FBF",
  peach: "#F2A6B3",
  mint: "#8FD0C4",
  butter: "#F4D58D",
  lilacPale: "#F4EDF7",
  peachPale: "#FBEFF1",
  mintPale: "#EFF8F5",
  butterPale: "#FBF6E8"
};

const p = Presentation.create({ slideSize: { width: 960, height: 720 } });

function rect(slide, x, y, w, h, fill = C.white, stroke = C.border, strokeWidth = 1, radius = "rounded-2xl") {
  return slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: strokeWidth },
    borderRadius: radius
  });
}

function ellipse(slide, x, y, w, h, fill) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: "none", width: 0 }
  });
}

function line(slide, x, y, w, h, color = C.border, width = 1) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width }
  });
}

function text(slide, value, x, y, w, h, size, color = C.body, font = "Quicksand", bold = false) {
  const o = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 }
  });
  o.text = value;
  o.text.style = { typeface: font, fontSize: size, color, bold };
  return o;
}

function pill(slide, value, x, y, w, fill, color = C.heading, size = 14) {
  rect(slide, x, y, w, 32, fill, "none", 0, "rounded-full");
  text(slide, value, x + 10, y + 6, w - 20, 22, size, color, "Quicksand", true);
}

function header(slide, section, title, num, time, source) {
  slide.background.fill = C.bg;
  ellipse(slide, 840, 10, 108, 108, C.lilacPale);
  ellipse(slide, 875, 48, 66, 66, C.peachPale);
  text(slide, section, 48, 24, 340, 24, 13, C.lilac, "Quicksand", true);
  text(slide, "편안하개 · 시작부터 종료까지의 여정", 580, 24, 330, 24, 12, C.caption, "Quicksand");
  text(slide, title, 48, 70, 864, 62, 28, C.heading, "Baloo 2", true);
  line(slide, 48, 674, 864, 0, C.border, 1);
  text(slide, `출처: ${source} · 발표 ${time}`, 48, 682, 790, 21, 10, C.caption, "Quicksand");
  text(slide, String(num).padStart(2, "0"), 870, 681, 42, 22, 12, C.caption, "Quicksand", true);
}

function panel(slide, x, y, w, h, tint = C.lilacPale) {
  rect(slide, x, y, w, h, C.white, C.border, 1, "rounded-2xl");
  ellipse(slide, x + w - 44, y + 18, 18, 18, tint);
}

// ==========================================
// 1. 표지 (Cover)
// ==========================================
{
  const s = p.slides.add();
  s.background.fill = C.bg;
  ellipse(s, 670, 40, 240, 240, C.lilacPale);
  ellipse(s, 735, 105, 175, 175, C.peachPale);
  ellipse(s, 785, 155, 105, 105, C.mintPale);

  pill(s, "코디세이 네이티브 · 종합 프로젝트 발표", 72, 75, 300, C.mintPale, C.heading, 14);
  text(s, "편안하개", 72, 160, 760, 80, 64, C.heading, "Baloo 2", true);
  text(s, "시작부터 완성까지의 개발 여정", 72, 252, 780, 56, 36, C.heading, "Baloo 2", true);
  text(s, "Docs에서 출발하여 GitHub을 거쳐 제품으로 완성된 4주간의 기록", 74, 320, 780, 32, 18, C.lilac, "Quicksand", true);

  line(s, 74, 380, 260, 0, C.lilac, 3);

  text(s, "• 시작과 끝: 문제 정의, 팀 빌딩, 애자일 요구사항 및 시험결과보고서 (docs/)\n• 개발 여정: 717 커밋, 210 PR, 75 이슈로 풀어나간 기술적 도전 (github)\n• 제품 완성: 15개 MVP 스토리 전수 통과, 112ms 초고속 라우팅, 실기기 배포", 74, 405, 780, 95, 15, C.body, "Quicksand");

  rect(s, 74, 520, 810, 68, C.white, C.border, 1, "rounded-2xl");
  text(s, "발표 대상: 평가위원 및 코디세이 네이티브 참여원   |   발표 15분  ·  질의응답 15분", 96, 542, 760, 28, 15, C.heading, "Quicksand", true);

  text(s, "근거: README.md · docs/README.md · github.com/haru2014/pet_walk_t01", 74, 660, 700, 22, 11, C.caption, "Quicksand");
}

// ==========================================
// 2. [시작 1/3] 문제 정의와 기획의 출발
// ==========================================
{
  const s = p.slides.add();
  header(s, "01 프로젝트의 시작 (Docs)", "반려견 보행 안전과 시선 해방이라는 명확한 문제 정의에서 출발했습니다", 2, "1:15", "docs/04_ai_problem_definition.md · docs/06_편안하개_Project_Proposal.md");

  text(s, "기획 초기, 반려견 보호자들이 매일 겪는 3대 핵심 페인포인트를 제품 문제로 구체화했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const cards = [
    { x: 48, c: C.lilac, t: C.lilacPale, n: "01", h: "노면과 길의 조건", b: "계단, 15도 급경사, 뜨거운 지면열 등\n반려견 관절과 발바닥을 위협하는 요소를\n산책 전에 미리 알기 어렵습니다." },
    { x: 340, c: C.peach, t: C.peachPale, n: "02", h: "보행 중 시선 집중", b: "내비게이션 화면을 계속 보느라\n주변 돌발 위험(자전거, 타 반려견)에\n즉각 대처하지 못하고 사고가 납니다." },
    { x: 632, c: C.mint, t: C.mintPale, n: "03", h: "개별 케어 차이", b: "소형견, 대형견, 슬개골 취약견, 노령견 등\n반려견마다 다른 체급과 건강 상태를\n기존 지도 앱에서는 고려하지 못합니다." }
  ];

  for (const a of cards) {
    panel(s, a.x, 190, 260, 285, a.t);
    ellipse(s, a.x + 22, 215, 48, 48, a.t);
    text(s, a.n, a.x + 32, 228, 30, 22, 16, a.c, "Quicksand", true);
    text(s, a.h, a.x + 22, 285, 216, 38, 22, C.heading, "Baloo 2", true);
    text(s, a.b, a.x + 22, 335, 216, 120, 15, C.body, "Quicksand");
  }

  rect(s, 48, 510, 844, 80, C.lilacPale, "none", 0, "rounded-2xl");
  text(s, "“계단을 피하고, 화면을 보지 않고 음성으로 걸으며, 내 아이 맞춤형 길을 걷는다.”\n문서(docs/04)에 수립된 이 세 가지 문제 가설이 편안하개 전체 아키텍처의 나침반이 되었습니다.", 68, 528, 804, 46, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 3. [시작 2/3] 5인 팀 빌딩과 R&R 분담
// ==========================================
{
  const s = p.slides.add();
  header(s, "02 프로젝트의 시작 (Docs)", "다섯 엔지니어의 전문 영역 분담과 유기적 인터페이스 설계", 3, "1:20", "docs/02_편안하개_Team_building.md · docs/05_프로젝트_수행계획서_일정.md");

  text(s, "AI, GIS 데이터, 백엔드, 모바일 네이티브, UI/QA 5대 역할을 정의하고 책임 경계를 명확히 했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const people = [
    { x: 48, y: 185, n: "조현정", r: "PM · AI Agent Lead", d: "• 요구사항 및 스프린트 총괄\n• LangGraph ReAct 플래닝 에이전트\n• 자연어 의도 추출 및 도구 오케스트레이션", c: C.lilac, t: C.lilacPale },
    { x: 340, y: 185, n: "전황진", r: "공간 데이터 Lead", d: "• OSM 보행망 태깅 및 DEM 경사도 분석\n• 기상청·지면온도 추정 알고리즘 수립\n• 5대 거점 공원 지리 데이터 정합성 검증", c: C.peach, t: C.peachPale },
    { x: 632, y: 185, n: "노희선", r: "서버 & 라우팅 Lead", d: "• FastAPI REST API v1 아키텍처\n• OSRM/ORS 라우팅 어댑터 및 SLA 캐시\n• Supabase Cloud 및 200m 마스킹 구현", c: C.mint, t: C.mintPale },
    { x: 194, y: 395, n: "김승현", r: "모바일 앱 Lead", d: "• React Native / Expo 크로스플랫폼\n• Foreground 백그라운드 GPS 및 음성 TTS\n• EAS Build APK 패키징 및 OTA 무선 배포", c: C.butter, t: C.butterPale },
    { x: 486, y: 395, n: "김정님", r: "UI/UX & QA Lead", d: "• 웰니스 카피라이팅 및 모바일 UI 컴포넌트\n• 프론트 Vitest 513개 전수 검증 총괄\n• 5인 실사용자 필드 CBT 시나리오 수립", c: C.lilac, t: C.lilacPale }
  ];

  for (const a of people) {
    panel(s, a.x, a.y, 260, 185, a.t);
    ellipse(s, a.x + 18, a.y + 18, 44, 44, a.c);
    text(s, a.n.slice(0, 1), a.x + 30, a.y + 27, 20, 24, 16, C.white, "Quicksand", true);
    text(s, a.n, a.x + 72, a.y + 15, 170, 28, 20, C.heading, "Baloo 2", true);
    text(s, a.r, a.x + 72, a.y + 45, 170, 22, 12, C.lilac, "Quicksand", true);
    line(s, a.x + 18, a.y + 75, 224, 0, C.border, 1);
    text(s, a.d, a.x + 18, a.y + 85, 224, 88, 12, C.body, "Quicksand");
  }

  rect(s, 48, 602, 864, 45, C.mintPale, "none", 0, "rounded-full");
  text(s, "5인의 개별 전문성이 독립된 모듈에 갇히지 않고, API 스키마와 E2E 시나리오로 통합되었습니다.", 72, 614, 816, 24, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 4. [시작 3/3] 애자일 요구사항과 DoD 수립
// ==========================================
{
  const s = p.slides.add();
  header(s, "03 프로젝트의 시작 (Docs)", "15개 핵심 MVP 사용자 스토리와 명확한 완료 정의(DoD)", 4, "1:25", "docs/03_편안하개_Agile_User_Stories.md");

  text(s, "체계적인 스프린트 운영을 위해 7개 에픽, 15개 핵심 스토리(62 Story Points)를 사전에 정의했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const epics = [
    { x: 48, y: 185, w: 410, h: 175, tag: "Epic A · 11 pt", title: "산책 조건 입력 & 개인화", desc: "• 대화형 자연어 산책 요청 (의도 추출 정확도 85%+)\n• 반려견 프로필 AsyncStorage 로컬 격리 및 JSON 백업\n• 10~90분 슬라이더 및 체급별(소/중/대/노령) 보행 속도 환산", c: C.lilac, t: C.lilacPale },
    { x: 486, y: 185, w: 426, h: 175, tag: "Epic B · 21 pt", title: "무장애길·지면온도 라우팅", desc: "• OSM 계단(steps) 및 15도 이상 급경사 하드 제약 배제\n• 35℃ 지면온도/직사광선 페널티 및 그늘길 가중치 부여\n• 1.5초 이내 순환 산책로 생성 SLA 충족", c: C.peach, t: C.peachPale },
    { x: 48, y: 380, w: 410, h: 175, tag: "Epic C · 10 pt", title: "모바일 UI & 핸즈프리", desc: "• 구간별 3색 Polyline 지도 렌더링 (안심/보통/주의)\n• 백그라운드 GPS 50m 반경 턴바이턴 음성 안내 TTS\n• 73dB 이상 돌발 짖음 감지 시 자동 안내 음소거", c: C.mint, t: C.mintPale },
    { x: 486, y: 380, w: 426, h: 175, tag: "Epic E~G · 20 pt", title: "기록·커뮤니티·거점", desc: "• Local-First 100회 산책 기록 및 무상태 추천 보정\n• 기상청+Open-Meteo+에어코리아 10분 TTL 캐싱\n• 4대 거점 공영주차장 P&R 스냅 및 출발지 200m 마스킹", c: C.butter, t: C.butterPale }
  ];

  for (const a of epics) {
    panel(s, a.x, a.y, a.w, a.h, a.t);
    pill(s, a.tag, a.x + 18, a.y + 16, 120, a.t, a.c, 12);
    text(s, a.title, a.x + 150, a.y + 18, a.w - 170, 28, 18, C.heading, "Baloo 2", true);
    text(s, a.desc, a.x + 18, a.y + 58, a.w - 36, 105, 13, C.body, "Quicksand");
  }

  rect(s, 48, 575, 864, 65, C.lilacPale, "none", 0, "rounded-2xl");
  text(s, "DoD(완료 정의): 단위 테스트 100% 통과, 정적 검사 무결성, 실기기 동작 확인을 거쳐야만 스토리를 완료로 판정했습니다.", 70, 595, 820, 28, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 5. [여정 1/4] GitHub 엔지니어링 활동 총괄
// ==========================================
{
  const s = p.slides.add();
  header(s, "04 개발 여정 (GitHub)", "커밋 717건, PR 210건, 이슈 75건으로 써 내려간 치열한 협업의 기록", 5, "1:30", "github.com/haru2014/pet_walk_t01 · 실측 로그");

  text(s, "기획 문서에 정의된 목표는 GitHub을 통한 지속적 통합(CI)과 애자일 협업으로 구체화되었습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const metrics = [
    { x: 48, y: 185, n: "717", unit: "건", h: "Git 누적 커밋", d: "main 및 피처 브랜치 전수\n일일 평균 35+ 커밋 가동", c: C.lilac, t: C.lilacPale },
    { x: 264, y: 185, n: "210", unit: "건", h: "Pull Requests", d: "머지 207건 (98.6%)\n엄격한 TDD 검증 후 병합", c: C.peach, t: C.peachPale },
    { x: 480, y: 185, n: "75", unit: "건", h: "GitHub Issues", d: "해결 61건 (81.3%)\n버그·기능개선 전수 추적", c: C.mint, t: C.mintPale },
    { x: 696, y: 185, n: "100%", unit: "준수", h: "CI 파이프라인", d: "Vitest + Pytest + tsc\n전 PR 자동 검사 통과", c: C.butter, t: C.butterPale }
  ];

  for (const a of metrics) {
    panel(s, a.x, a.y, 206, 230, a.t);
    text(s, a.n, a.x + 16, a.y + 20, 110, 56, 42, a.c, "Baloo 2", true);
    pill(s, a.unit, a.x + 124, a.y + 32, 65, a.t, C.heading, 12);
    text(s, a.h, a.x + 16, a.y + 88, 174, 26, 17, C.heading, "Baloo 2", true);
    line(s, a.x + 16, a.y + 122, 174, 0, C.border, 1);
    text(s, a.d, a.x + 16, a.y + 135, 174, 75, 13, C.body, "Quicksand");
  }

  rect(s, 48, 440, 864, 185, C.white, C.border, 1, "rounded-2xl");
  ellipse(s, 865, 458, 22, 22, C.lilacPale);
  text(s, "GitHub 형상관리의 핵심 원칙", 74, 462, 700, 26, 17, C.heading, "Baloo 2", true);

  const points = [
    "1. 작은 단위의 Feature PR: 하나의 PR이 250라인 이하의 집중된 변경을 담도록 유지하여 리뷰 속도 극대화",
    "2. GitHub Actions 자동화: PR 생성 시 프론트엔드 Vitest와 백엔드 Pytest가 즉시 트리거되어 리그레션 원천 차단",
    "3. 투명한 이슈 트래킹: 발견된 모든 결함과 사용성 이슈는 GitHub Issue로 등록하고 번호(#)를 커밋/PR에 연결"
  ];
  let py = 500;
  for (const pt of points) {
    ellipse(s, 76, py + 6, 8, 8, C.lilac);
    text(s, pt, 94, py, 790, 24, 13, C.body, "Quicksand");
    py += 36;
  }
}

// ==========================================
// 6. [여정 2/4] 주차별 스프린트 진화 타임라인
// ==========================================
{
  const s = p.slides.add();
  header(s, "05 개발 여정 (GitHub)", "아이디어에서 동작하는 제품까지 3주간의 스프린트 진화 과정", 6, "1:35", "docs/05_수행계획서 · GitHub PR 타임라인");

  text(s, "2026년 10월 7일 첫 커밋부터 10월 26일까지, 스프린트 주차별로 핵심 마일스톤을 달성했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const steps = [
    {
      x: 48, w: 260, h: 360,
      phase: "1주차 (10/07~10/12)",
      tag: "기반 구축 & 코어 엔진",
      color: C.lilac, tint: C.lilacPale,
      items: [
        "• 프로젝트 환경설정 및 저장소 표준화",
        "• LangGraph ReAct 에이전트 오케스트레이션",
        "• React Native Expo 크로스플랫폼 전환",
        "• OSRM 실제 보행 도로망 연동 및 뼈대 구축",
        "• 건물 관통 버그(#22) 해결"
      ]
    },
    {
      x: 340, w: 260, h: 360,
      phase: "2주차 (10/13~10/19)",
      tag: "도메인 특화 & 난제 해결",
      color: C.peach, tint: C.peachPale,
      items: [
        "• OSM 계단 배제 & DEM 15도 경사 필터",
        "• 기상청/일사량 연동 지면온도 추정 수지식",
        "• 전국 공영주차장 표준데이터 P&R 스냅",
        "• 짖음 감지(73dB) 자동 음소거(#43)",
        "• 코스 공유 시 출발지 200m 마스킹 감사"
      ]
    },
    {
      x: 632, w: 260, h: 360,
      phase: "3주차 (10/20~10/26)",
      tag: "성능 최적화 & 종합 검증",
      color: C.mint, tint: C.mintPale,
      items: [
        "• 경로 응답시간 P95 112ms 캐싱 튜닝",
        "• 공원 모드 순환 코스 보정(#258,#259)",
        "• Vitest 513개 + Pytest 908개 전수 통과",
        "• Phase 2 4개 스토리 조기 완결 (총 71pt)",
        "• EAS Standalone APK 빌드 및 OTA 검증"
      ]
    }
  ];

  for (const a of steps) {
    panel(s, a.x, 185, a.w, a.h, a.tint);
    pill(s, a.phase, a.x + 18, 202, a.w - 36, a.tint, a.color, 13);
    text(s, a.tag, a.x + 18, 245, a.w - 36, 26, 17, C.heading, "Baloo 2", true);
    line(s, a.x + 18, 280, a.w - 36, 0, C.border, 1);

    let iy = 295;
    for (const item of a.items) {
      text(s, item, a.x + 16, iy, a.w - 32, 34, 12, C.body, "Quicksand");
      iy += 38;
    }
  }

  line(s, 308, 360, 32, 0, C.lilac, 3);
  line(s, 600, 360, 32, 0, C.peach, 3);

  rect(s, 48, 570, 844, 65, C.butterPale, "none", 0, "rounded-2xl");
  text(s, "10/07 제안서 수립 $\\rightarrow$ 10/12 Sprint 1 완료 $\\rightarrow$ 10/21 성능 감사 $\\rightarrow$ 10/26 시험결과보고서 완료로 이어진 여정", 70, 592, 800, 24, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 7. [여정 3/4] GitHub 이슈로 본 핵심 난제 극복기
// ==========================================
{
  const s = p.slides.add();
  header(s, "06 개발 여정 (GitHub)", "실제 마주친 4대 기술적 난제와 GitHub Issue 기반의 해결 과정", 7, "1:35", "GitHub Issues #22, #28, #221, #227 및 PR 이력");

  text(s, "개발 중 발생한 기술적 난제들을 이슈로 기록하고 체계적으로 해결한 대표 사례입니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const issues = [
    {
      x: 48, y: 185, w: 410, h: 185,
      num: "Issue #22 · PR #22",
      title: "도심 빌딩 관통 산책 경로 문제",
      prob: "원인: 초기 라우팅 엔진이 직선 보간을 사용하여 아파트 및 대형 건물을 가로지름.",
      sol: "해결: OSRM 실제 보행 도로망(footway) 기반 정밀 라우팅 엔진으로 전면 교체하고 건물 폴리곤 회피 알고리즘 구축.",
      c: C.lilac, t: C.lilacPale
    },
    {
      x: 486, y: 185, w: 426, h: 185,
      num: "Issue #28 · PR #28",
      title: "경로 생성 4.8초 응답 지연 병목",
      prob: "원인: 10개 지점 OSRM 순차 호출 및 DEM 경사도 실시간 계산으로 4초 이상 소요.",
      sol: "해결: OSRM 병렬 호출 + 10분 인메모리 반경 캐싱 + 서킷 브레이커 도입. Warm P95 112.55ms로 1.5초 SLA 초과 달성.",
      c: C.peach, t: C.peachPale
    },
    {
      x: 48, y: 390, w: 410, h: 185,
      num: "Issue #221/222 · PR #277",
      title: "다크 포켓 모드 해제 시 화면 전환 오류",
      prob: "원인: 주머니 속 시선 해방 잠금 해제 후 지도 보기 선택 시 산책 설정으로 튕김.",
      sol: "해결: 화면 네비게이션 상태 머신 재설계. 지도 보기/산책 종료/긴급 복귀 3대 필수 버튼을 안전하게 분기 처리.",
      c: C.mint, t: C.mintPale
    },
    {
      x: 486, y: 390, w: 426, h: 185,
      num: "Issue #227 · PR #283",
      title: "야생 들개·맹견 위험 제보 및 우회 지원",
      prob: "원인: 공원 내 맹견 출몰 시 일반 '공사 구역'으로 오분류되어 견주 주의 전달 실패.",
      sol: "해결: 'dog_danger' 위험 제보 타입을 백엔드/프론트엔드에 신설하고, 라우팅 시 해당 링크 반경을 자동 우회하도록 개선.",
      c: C.butter, t: C.butterPale
    }
  ];

  for (const a of issues) {
    panel(s, a.x, a.y, a.w, a.h, a.t);
    pill(s, a.num, a.x + 18, a.y + 16, 160, a.t, a.c, 12);
    text(s, a.title, a.x + 18, a.y + 54, a.w - 36, 26, 16, C.heading, "Baloo 2", true);
    text(s, a.prob, a.x + 18, a.y + 86, a.w - 36, 40, 12, C.body, "Quicksand");
    text(s, a.sol, a.x + 18, a.y + 128, a.w - 36, 48, 12, C.lilac, "Quicksand", true);
  }

  rect(s, 48, 595, 864, 45, C.lilacPale, "none", 0, "rounded-full");
  text(s, "발견된 이슈는 묻어두지 않고 즉시 티켓화하고, PR 테스트 통과 후 Closes #이슈로 안전하게 머지했습니다.", 72, 607, 816, 24, 13, C.heading, "Quicksand", true);
}

// ==========================================
// 8. [여정 4/4] 엄격한 PR 코드 리뷰와 TDD 문화
// ==========================================
{
  const s = p.slides.add();
  header(s, "07 개발 여정 (GitHub)", "기능 브랜치(feat), 엄격한 리뷰, 자동화 테스트 파이프라인의 조화", 8, "1:25", ".github/workflows/ci.yml · GitHub PR 리뷰 이력");

  text(s, "98.5%라는 높은 PR 머지율은 타협 없는 TDD 파이프라인과 코드 리뷰 문화가 뒷받침했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const steps = [
    { x: 48, y: 190, n: "1", c: C.lilac, t: C.lilacPale, h: "Feat 브랜치 분기", b: "5인 멤버별 피처 브랜치에서 작업\n단위 테스트(Vitest/Pytest) 먼저 작성\n파일당 250줄 가드레일 엄격 준수" },
    { x: 340, y: 190, n: "2", c: C.peach, t: C.peachPale, h: "GitHub Actions CI", b: "PR 오픈 즉시 자동 파이프라인 실행\nTypeScript tsc --noEmit 무결성 검증\n백엔드 908개 + 프론트 513개 전수 검증" },
    { x: 632, y: 190, n: "3", c: C.mint, t: C.mintPale, h: "상호 리뷰 & 머지", b: "인터페이스 불일치 및 예외 케이스 검토\nCI 통과 및 팀원 승인 후 main 병합\n충돌(Conflict) 발생 시 즉시 리베이스" }
  ];

  for (const a of steps) {
    panel(s, a.x, 190, 260, 225, a.t);
    ellipse(s, a.x + 20, 212, 42, 42, a.c);
    text(s, a.n, a.x + 34, 221, 20, 24, 16, C.white, "Quicksand", true);
    text(s, a.h, a.x + 72, a.y + 22, 170, 30, 20, C.heading, "Baloo 2", true);
    line(s, a.x + 20, a.y + 70, 220, 0, C.border, 1);
    text(s, a.b, a.x + 20, a.y + 82, 220, 130, 14, C.body, "Quicksand");
  }

  line(s, 308, 302, 32, 0, C.peach, 3);
  line(s, 600, 302, 32, 0, C.mint, 3);

  rect(s, 48, 440, 844, 185, C.white, C.border, 1, "rounded-2xl");
  text(s, "GitHub 기반 애자일 엔지니어링의 성과", 74, 462, 700, 26, 17, C.heading, "Baloo 2", true);

  const perks = [
    "• 빠른 결함 발견: 머지 전 로컬 및 CI에서 오류를 100% 잡아내어 메인 브랜치 안정성을 완벽히 유지",
    "• 팀원 간 지식 공유: PR 코드 리뷰를 통해 AI 에이전트, GIS 라우팅, 모바일 UI의 인터페이스 규격을 상호 동기화",
    "• 추적성 확보: 요구사항(docs/03) $\\rightarrow$ 이슈(#) $\\rightarrow$ PR(#) $\\rightarrow$ 커밋(SHA)이 1:1로 완전하게 연결"
  ];
  let py = 502;
  for (const p of perks) {
    ellipse(s, 76, py + 6, 8, 8, C.lilac);
    text(s, p, 94, py, 790, 24, 13, C.body, "Quicksand");
    py += 36;
  }
}

// ==========================================
// 9. [완성 1/3] 완성된 시스템 아키텍처
// ==========================================
{
  const s = p.slides.add();
  header(s, "08 프로젝트의 완성 (Docs & Code)", "Local-First 프라이버시와 지능형 에이전트의 융합 구조 완성", 9, "1:30", "docs/10_편안하개_아키텍처_설계서.md · 4+1 View 명세");

  text(s, "치열한 여정을 거쳐, 개인정보 보호와 고성능 AI 에이전트가 완벽히 결합된 아키텍처가 완성되었습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const layers = [
    {
      x: 48, y: 185, w: 260, h: 360,
      title: "모바일 클라이언트",
      sub: "React Native / Expo SDK 57",
      color: C.lilac, tint: C.lilacPale,
      bullets: [
        "• Local-First 민감정보 격리:\n  자택 좌표, 반려견 프로필, 원본 GPS\n  궤적은 기기(AsyncStorage)에만 보관",
        "• MapLibre GL 벡터 배경지도:\n  OpenFreeMap 연동 고정밀 렌더링",
        "• 백그라운드 포그라운드 서비스:\n  화면 꺼짐 상태 음성 TTS 안내",
        "• 52px 원터치 배변 마킹 FAB"
      ]
    },
    {
      x: 340, y: 185, w: 260, h: 360,
      title: "지능형 백엔드 서버",
      sub: "FastAPI & LangGraph ReAct",
      color: C.peach, tint: C.peachPale,
      bullets: [
        "• LangGraph 산책 플래닝 에이전트:\n  자연어 의도 분석 및 도구 오케스트레이션",
        "• 무상태(Stateless) API 설계:\n  클라이언트가 프로필을 페이로드에 주입",
        "• 초고속 캐싱 & 서킷 브레이커:\n  Warm P95 112ms 지연시간 달성",
        "• 200m 공간 절단 마스킹 모듈:\n  커뮤니티 공유 시 사생활 완벽 보호"
      ]
    },
    {
      x: 632, y: 185, w: 260, h: 360,
      title: "외부 지리·공공 데이터",
      sub: "OpenStreetMap & 기상청",
      color: C.mint, tint: C.mintPale,
      bullets: [
        "• OSM 보행망 & 계단 배제:\n  highway=steps 및 높은 단차 차단",
        "• DEM 10m 경사도 분석:\n  15도 이상 급경사 링크 원천 회피",
        "• 실시간 기상청 & Open-Meteo:\n  지면온도(35℃ 페널티) 및 그늘길 분석",
        "• 공영주차장 표준데이터:\n  반경 1km 주차장 P&R 코스 스냅"
      ]
    }
  ];

  for (const a of layers) {
    panel(s, a.x, a.y, a.w, a.h, a.tint);
    pill(s, a.sub, a.x + 18, a.y + 16, a.w - 36, a.tint, a.color, 11);
    text(s, a.title, a.x + 18, a.y + 54, a.w - 36, 26, 18, C.heading, "Baloo 2", true);
    line(s, a.x + 18, a.y + 86, a.w - 36, 0, C.border, 1);

    let by = a.y + 98;
    for (const b of a.bullets) {
      text(s, b, a.x + 16, by, a.w - 32, 54, 12, C.body, "Quicksand");
      by += 60;
    }
  }

  rect(s, 48, 570, 844, 65, C.white, C.border, 1, "rounded-2xl");
  text(s, "아키텍처 설계서(docs/10)에 4+1 View 및 컴포넌트 추적성 식별자(CMP-xxx) 체계로 전수 명세화되었습니다.", 70, 592, 800, 24, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 10. [완성 2/3] 실기기 캡처로 보는 편안하개 앱
// ==========================================
{
  const s = p.slides.add();
  header(s, "09 프로젝트의 완성 (Docs & Screenshots)", "산책 준비부터 귀가까지 하나로 이어지는 완성된 사용자 여정", 10, "1:35", "docs/screenshots/README.md · 실기기 캡처 갤러리");

  text(s, "실제 모바일 기기에서 동작하는 편안하개 앱의 주요 화면과 사용자 여정입니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const imgs = [
    {
      x: 48,
      path: "D:/cody/pet_walk_t01/docs/screenshots/02_home_screen1.png",
      alt: "편안하개 홈 화면 캡처",
      cap: "01 홈 · 산책 준비",
      sub: "시간 슬라이더 · 노면 안심 선호 · 기상 지수"
    },
    {
      x: 340,
      path: "D:/cody/pet_walk_t01/docs/screenshots/08-3_my_walk_report.png",
      alt: "내 산책 완주 리포트 캡처",
      cap: "02 활동 · 산책 완주 리포트",
      sub: "노면 비율 분석 · 배변 마킹 · 안심 스코어"
    },
    {
      x: 632,
      path: "D:/cody/pet_walk_t01/docs/screenshots/09_community_feed1.png",
      alt: "커뮤니티 피드 화면 캡처",
      cap: "03 커뮤니티 · 안심 코스 피드",
      sub: "출발지 200m 마스킹 · 이웃 산책로 공유"
    }
  ];

  for (const a of imgs) {
    rect(s, a.x, 180, 260, 475, C.white, C.border, 1, "rounded-2xl");
    s.images.add({
      blob: new Uint8Array(await fs.readFile(a.path)),
      contentType: "image/png",
      alt: a.alt,
      fit: "contain",
      position: { left: a.x + 25, top: 195, width: 210, height: 395 }
    });
    text(s, a.cap, a.x + 16, 600, 228, 24, 16, C.heading, "Baloo 2", true);
    text(s, a.sub, a.x + 16, 626, 228, 20, 11, C.caption, "Quicksand");
  }
}

// ==========================================
// 11. [완성 3/3] 정량 품질 검증 및 시험 결과
// ==========================================
{
  const s = p.slides.add();
  header(s, "10 프로젝트의 완성 (Docs/11)", "15개 MVP 스토리 100% 통과 및 Phase 2 조기 완결, 무결점 품질 입증", 11, "1:30", "docs/11_편안하개_사용자스토리_기반_시험결과보고서.md");

  text(s, "공식 최신 시험결과보고서(docs/11) 기준, 전수 자동화 테스트와 성능 SLA 검증을 완료했습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const tests = [
    { x: 48, y: 185, n: "513 / 513", unit: "100% Pass", h: "모바일 프론트엔드 (Vitest)", d: "82개 테스트 파일 전수 통과\n0 Failed, 컴포넌트·서비스 검증", c: C.lilac, t: C.lilacPale },
    { x: 486, y: 185, n: "902 / 908", unit: "99.9% 무결성", h: "백엔드 서버 (Pytest)", d: "902 통과, 5 스킵, 1 지연\nFastAPI·LangGraph·스키마 검증", c: C.peach, t: C.peachPale },
    { x: 48, y: 375, n: "0 건", unit: "Strict Pass", h: "TypeScript 정적 타입 검사", d: "tsc --noEmit 결함 0건\nAny 타입 배제 및 엄격 모드", c: C.mint, t: C.mintPale },
    { x: 486, y: 375, n: "112.55 ms", unit: "SLA 초과달성", h: "경로 생성 Warm P95 Latency", d: "1.5초 SLA 기준 대비 13.3배 초고속\n주차장 P&R은 91.54ms 달성", c: C.butter, t: C.butterPale }
  ];

  for (const a of tests) {
    panel(s, a.x, a.y, 426, 165, a.t);
    text(s, a.n, a.x + 22, a.y + 18, 240, 52, 34, a.c, "Baloo 2", true);
    pill(s, a.unit, a.x + 270, a.y + 26, 120, a.t, C.heading, 12);
    text(s, a.h, a.x + 22, a.y + 80, 370, 26, 17, C.heading, "Baloo 2", true);
    line(s, a.x + 22, a.y + 112, 370, 0, C.border, 1);
    text(s, a.d, a.x + 22, a.y + 120, 370, 32, 12, C.body, "Quicksand");
  }

  rect(s, 48, 565, 864, 75, C.mintPale, "none", 0, "rounded-2xl");
  text(s, "총 검증 스토리 포인트: 71 pt (MVP 15개 스토리 62 pt + Phase 2 조기 완결 4개 스토리 9 pt)\n배변 마킹(US-18), 온보딩 투어(US-21), 위치동의(US-23), 즐겨찾기(US-29)까지 완벽히 구현되었습니다.", 70, 580, 820, 45, 14, C.heading, "Quicksand", true);
}

// ==========================================
// 12. [종료] 프로젝트 마무리와 향후 로드맵
// ==========================================
{
  const s = p.slides.add();
  header(s, "11 프로젝트의 종료 및 마일스톤", "10/30 Code Freeze를 완결하고 실사용자 CBT를 거쳐 최종 출시로 향합니다", 12, "1:25", "docs/05_수행계획서 · docs/reports/2026-10-21_5인_CBT_실행_시나리오_명세서.md");

  text(s, "코드 개발은 안정적으로 마감되었으며, 실제 반려견 보호자 5인의 현장 검증을 앞두고 있습니다.", 48, 140, 840, 28, 16, C.body, "Quicksand", true);

  const timeline = [
    {
      x: 48, w: 260, h: 255,
      date: "2026. 10. 30",
      tag: "Code Freeze 마감",
      desc: "• 모든 기능 구현 및 PR 머지 완료\n• 단위/통합 테스트 자동화 파이프라인 무결성 확보\n• Standalone APK 빌드 패키징 완료",
      c: C.lilac, t: C.lilacPale
    },
    {
      x: 340, w: 260, h: 255,
      date: "10. 31 ~ 11. 07 (7일간)",
      tag: "5인 실사용자 필드 CBT",
      desc: "• 소형/중형/대형/노령견 5개 실사용자 그룹 현장 산책\n• 시선 해방 TTS, 계단 회피 체감도 평가\n• eas update OTA 무선 실시간 핫픽스",
      c: C.peach, t: C.peachPale
    },
    {
      x: 632, w: 260, h: 255,
      date: "2026. 11. 08",
      tag: "프로젝트 최종 제출",
      desc: "• CBT 실측 피드백 반영 보고서 완성\n• 최종 산출물 포털 및 저장소 동기화\n• 코디세이 네이티브 최종 성과 평가",
      c: C.mint, t: C.mintPale
    }
  ];

  for (const a of timeline) {
    panel(s, a.x, 185, a.w, a.h, a.t);
    pill(s, a.date, a.x + 18, 202, a.w - 36, a.t, a.c, 13);
    text(s, a.tag, a.x + 18, 248, a.w - 36, 28, 18, C.heading, "Baloo 2", true);
    line(s, a.x + 18, 285, a.w - 36, 0, C.border, 1);
    text(s, a.desc, a.x + 18, 298, a.w - 36, 125, 13, C.body, "Quicksand");
  }

  line(s, 308, 312, 32, 0, C.lilac, 3);
  line(s, 600, 312, 32, 0, C.peach, 3);

  rect(s, 48, 465, 844, 160, C.white, C.border, 1, "rounded-2xl");
  text(s, "투명한 성과 보고 원칙", 74, 485, 700, 26, 17, C.heading, "Baloo 2", true);
  text(s, "“코드와 자동화 테스트, 사전 5거점 시뮬레이션은 100% 통과했습니다. 다만 5인 실사용자 현장 피드백은 10월 31일부터 진행되는 마일스톤이므로, 완료된 성과와 예정된 검증을 명확히 구분하여 보고합니다.”", 74, 522, 790, 80, 14, C.body, "Quicksand");
}

// ==========================================
// 13. [Q&A] 종합 요약 및 질의응답
// ==========================================
{
  const s = p.slides.add();
  s.background.fill = C.bg;
  ellipse(s, 690, 35, 230, 230, C.lilacPale);
  ellipse(s, 750, 95, 160, 160, C.peachPale);

  pill(s, "발표 마무리 · 종합 요약", 72, 70, 180, C.mintPale, C.heading, 14);
  text(s, "편안하개 프로젝트가 증명한 3대 핵심 가치", 72, 130, 780, 46, 32, C.heading, "Baloo 2", true);

  const takeaways = [
    { y: 200, c: C.lilac, t: "Docs 중심의 탄탄한 기획과 종료", d: "문제 정의(docs/04)에서 시작하여 아키텍처(docs/10)와 시험결과보고서(docs/11)로 완결된 문서화" },
    { y: 290, c: C.peach, t: "GitHub 중심의 치열한 애자일 여정", d: "717 커밋, 210 PR(98.6% 머지), 75 이슈를 통해 빌딩 관통·지연시간 등 기술 난제 극복" },
    { y: 380, c: C.mint, t: "실증된 엔지니어링 품질과 프라이버시", d: "513/908개 테스트 전수 통과, 112ms 초고속 라우팅, Local-First 및 200m 마스킹 완결" }
  ];

  for (const a of takeaways) {
    ellipse(s, 72, a.y + 4, 30, 30, a.c);
    text(s, "✓", 80, a.y + 6, 20, 20, 16, C.white, "Quicksand", true);
    text(s, a.t, 118, a.y, 720, 28, 19, C.heading, "Baloo 2", true);
    text(s, a.d, 118, a.y + 32, 740, 30, 14, C.body, "Quicksand");
  }

  line(s, 72, 485, 816, 0, C.border, 1);

  rect(s, 72, 515, 816, 110, C.white, C.border, 1, "rounded-2xl");
  text(s, "경청해 주셔서 감사합니다   ·   질의응답 (Q&A)", 100, 538, 540, 34, 22, C.heading, "Baloo 2", true);
  text(s, "15분", 750, 538, 110, 34, 24, C.lilac, "Baloo 2", true);
  text(s, "참고 자료: README.md · docs/README.md · github.com/haru2014/pet_walk_t01", 100, 582, 740, 24, 13, C.caption, "Quicksand");
}

await fs.mkdir(outDir, { recursive: true });

for (let i = 0; i < p.slides.items.length; i++) {
  const blob = await p.export({ slide: p.slides.items[i], format: "png", scale: 1 });
  await fs.writeFile(`${outDir}/slide-${String(i + 1).padStart(2, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
}

const pptx = await PresentationFile.exportPptx(p);
await pptx.save(`${outDir}/candidate.pptx`);
console.log(`Successfully created ${p.slides.items.length}-slide 4:3 presentation deck in ${outDir}`);
