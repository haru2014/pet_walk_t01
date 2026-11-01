import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "file:///C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outDir = "D:/cody/pet_walk_t01/presentation/.build/petwalk-deck";
const C = { bg:"#FBF7FB", white:"#FFFFFF", border:"#ECE3F0", heading:"#4A3A5C", body:"#6A5E76", caption:"#A99FB3", lilac:"#9B6FBF", peach:"#F2A6B3", mint:"#8FD0C4", butter:"#F4D58D", lilacPale:"#F4EDF7", peachPale:"#FBEFF1", mintPale:"#EFF8F5", butterPale:"#FBF6E8" };
const p = Presentation.create({slideSize:{width:960,height:720}});

function rect(slide,x,y,w,h,fill=C.white,stroke=C.border,strokeWidth=1,radius="rounded-2xl"){
  return slide.shapes.add({geometry:"roundRect",position:{left:x,top:y,width:w,height:h},fill,line:{style:"solid",fill:stroke,width:strokeWidth},borderRadius:radius});
}
function ellipse(slide,x,y,w,h,fill){return slide.shapes.add({geometry:"ellipse",position:{left:x,top:y,width:w,height:h},fill,line:{style:"solid",fill:"none",width:0}});}
function line(slide,x,y,w,h,color=C.border,width=1){return slide.shapes.add({geometry:"line",position:{left:x,top:y,width:w,height:h},fill:"none",line:{style:"solid",fill:color,width}});}
function text(slide,value,x,y,w,h,size,color=C.body,font="Quicksand",bold=false){
  const o=slide.shapes.add({geometry:"textbox",position:{left:x,top:y,width:w,height:h},fill:"none",line:{style:"solid",fill:"none",width:0}});
  o.text=value; o.text.style={typeface:font,fontSize:size,color,bold}; return o;
}
function pill(slide,value,x,y,w,fill,color=C.heading,size=14){
  rect(slide,x,y,w,32,fill,"none",0,"rounded-full"); text(slide,value,x+10,y+6,w-20,22,size,color,"Quicksand",true);
}
function header(slide,section,title,num,time,source){
  slide.background.fill=C.bg;
  ellipse(slide,840,10,108,108,C.lilacPale); ellipse(slide,875,48,66,66,C.peachPale);
  text(slide,section,48,24,300,24,13,C.lilac,"Quicksand",true);
  text(slide,"편안하개 · 코디세이 네이티브",620,24,290,24,12,C.caption,"Quicksand");
  text(slide,title,48,72,860,62,31,C.heading,"Baloo 2",true);
  line(slide,48,674,864,0,C.border,1);
  text(slide,`근거: ${source} · 발표 ${time}`,48,682,790,21,10,C.caption,"Quicksand");
  text(slide,String(num).padStart(2,"0"),870,681,42,22,12,C.caption,"Quicksand",true);
}
function panel(slide,x,y,w,h,tint=C.lilacPale){rect(slide,x,y,w,h,C.white,C.border,1,"rounded-2xl"); ellipse(slide,x+w-48,y+18,20,20,tint);}
function smallLabel(slide,value,x,y,w,color=C.lilac){text(slide,value,x,y,w,22,13,color,"Quicksand",true);}

// 1. Cover
{
 const s=p.slides.add(); s.background.fill=C.bg;
 ellipse(s,688,52,224,224,C.lilacPale); ellipse(s,744,114,164,164,C.peachPale); ellipse(s,786,154,104,104,C.mintPale);
 pill(s,"코디세이 네이티브 · 성과 발표",72,78,276,C.mintPale,C.heading,14);
 text(s,"편안하개",72,166,760,82,66,C.heading,"Baloo 2",true);
 text(s,"AI Native 역량을\n반려견 산책의 실제 경험으로",72,268,770,118,39,C.heading,"Baloo 2",true);
 line(s,74,418,220,0,C.lilac,3);
 text(s,"팀 협업 · 맞춤형 안심 경로 · 모바일 서비스 구현",74,446,790,34,20,C.body,"Quicksand",true);
 text(s,"평가위원 및 코디세이 네이티브 참여원",74,500,700,28,16,C.caption,"Quicksand");
 text(s,"15분 발표  ·  15분 질의응답",74,619,500,28,16,C.heading,"Quicksand",true);
}

// 2. Problem definition
{
 const s=p.slides.add(); header(s,"01  문제 정의","반려견 산책에는 사람과 노면을 함께 보는 기준이 필요합니다",2,"1:15","README.md · docs/04_ai_problem_definition.md");
 text(s,"서비스가 해결하려고 정의한 세 가지 과제",48,142,840,28,17,C.body,"Quicksand",true);
 const cards=[
  {x:48,c:C.lilac,t:C.lilacPale,n:"01",h:"길의 조건",b:"계단·경사·노면 상태를\n산책 전에 파악하기 어렵다"},
  {x:340,c:C.peach,t:C.peachPale,n:"02",h:"보행 중 화면",b:"경로를 확인하려고\n화면을 계속 보기 쉽다"},
  {x:632,c:C.mint,t:C.mintPale,n:"03",h:"개별 차이",b:"반려견의 체급·관절 케어를\n산책 경로에 반영하기 어렵다"}
 ];
 for(const a of cards){panel(s,a.x,198,260,270,a.t); ellipse(s,a.x+22,224,52,52,a.t); text(s,a.n,a.x+31,239,38,23,15,a.c,"Quicksand",true); text(s,a.h,a.x+22,310,216,42,27,C.heading,"Baloo 2",true); text(s,a.b,a.x+22,374,220,68,17,C.body,"Quicksand");}
 rect(s,48,512,844,78,C.lilacPale,"none",0,"rounded-2xl");
 text(s,"문제 정의 문서의 서비스 가설입니다. 이 슬라이드는 사용자 조사 결과나 인터뷰 통계를 주장하지 않습니다.",68,534,800,36,14,C.body,"Quicksand");
}

// 3. User experience
{
 const s=p.slides.add(); header(s,"02  제품 경험","요청부터 산책 기록과 공유까지 한 흐름으로 연결합니다",3,"1:25","README.md · docs/02_편안하개_Team_building.md");
 const steps=[
  {x:48,n:"1",c:C.lilac,t:C.lilacPale,h:"조건 입력",b:"자연어 요청\n반려견 프로필"},
  {x:264,n:"2",c:C.peach,t:C.peachPale,h:"경로 추천",b:"AI 플래닝\n안심 점수와 이유"},
  {x:480,n:"3",c:C.mint,t:C.mintPale,h:"핸즈프리 산책",b:"GPS 추적\n분기점 음성 안내"},
  {x:696,n:"4",c:C.butter,t:C.butterPale,h:"기록과 공유",b:"완주 리포트\n선택 공유·위치 보호"}
 ];
 for(const a of steps){panel(s,a.x,195,200,220,a.t); ellipse(s,a.x+18,214,44,44,a.c); text(s,a.n,a.x+33,224,24,22,17,C.white,"Quicksand",true); text(s,a.h,a.x+18,282,168,38,23,C.heading,"Baloo 2",true); text(s,a.b,a.x+18,337,168,56,16,C.body,"Quicksand");}
 line(s,248,306,16,0,C.peach,3); line(s,464,306,16,0,C.mint,3); line(s,680,306,16,0,C.butter,3);
 rect(s,48,462,844,110,C.white,C.border,1,"rounded-2xl");
 text(s,"제품의 핵심은 화면에 기능을 나열하는 데 그치지 않고, 산책 전·중·후의 경험을 이어 주는 것입니다.",72,485,785,55,19,C.heading,"Quicksand",true);
}

// 4. Agent architecture
{
 const s=p.slides.add(); header(s,"03  AI 설계","AI Agent가 경로 도구를 조합해 개인화된 코스를 만듭니다",4,"1:40","README.md · backend/agent/walk_planning_agent.py · backend/main.py");
 const boxes=[
  {x:48,y:190,w:190,height:96,t:C.lilacPale,title:"사용자 요청",b:"자연어 + 로컬 프로필"},
  {x:275,y:190,w:190,height:96,t:C.peachPale,title:"LangGraph Agent",b:"의도·제약 해석"},
  {x:502,y:190,w:190,height:96,t:C.mintPale,title:"경로 도구",b:"Routing · 보행망 분석"},
  {x:729,y:190,w:183,height:96,t:C.butterPale,title:"후보 평가",b:"조건 점수화·선정"}
 ];
 for(const a of boxes){panel(s,a.x,a.y,a.w,a.height,a.t); const titleSize=a.title==="LangGraph Agent"?16:19; text(s,a.title,a.x+16,a.y+19,a.w-32,30,titleSize,C.heading,"Baloo 2",true); text(s,a.b,a.x+16,a.y+58,a.w-32,25,13,C.body,"Quicksand");}
 line(s,238,238,37,0,C.lilac,2); line(s,465,238,37,0,C.peach,2); line(s,692,238,37,0,C.mint,2);
 const tools=[
  {x:48,h:"라우팅",b:"ORS / OSRM 어댑터",c:C.lilac},
  {x:264,h:"계단·경사",b:"OSM 보행망 · DEM",c:C.peach},
  {x:480,h:"환경",b:"기상청 · 지면열·그늘",c:C.mint},
  {x:696,h:"개인화",b:"체급 · 시간 · 피드백",c:C.butter}
 ];
 text(s,"에이전트가 선택·조합하는 입력과 도구",48,346,800,25,16,C.body,"Quicksand",true);
 for(const a of tools){rect(s,a.x,392,200,86,C.white,C.border,1,"rounded-2xl"); ellipse(s,a.x+15,414,14,14,a.c); text(s,a.h,a.x+38,406,150,25,17,C.heading,"Quicksand",true); text(s,a.b,a.x+16,443,170,24,13,C.body,"Quicksand");}
 rect(s,48,515,864,76,C.lilacPale,"none",0,"rounded-2xl");
 text(s,"응답에는 코스뿐 아니라 선택 이유와 경로 안내 단계가 포함됩니다.",68,538,810,32,17,C.heading,"Quicksand",true);
}

// 5. route data and safety
{
 const s=p.slides.add(); header(s,"04  경로 품질","공공 보행 데이터와 환경 신호를 경로 선택에 반영합니다",5,"1:30","README.md · docs/02_편안하개_Team_building.md");
 panel(s,48,168,294,414,C.lilacPale);
 text(s,"5",74,198,180,106,86,C.lilac,"Baloo 2",true);
 text(s,"파일럿 공원",74,302,210,34,24,C.heading,"Baloo 2",true);
 text(s,"대전 3곳 + 세종 2곳",74,350,228,28,16,C.body,"Quicksand",true);
 text(s,"유림 · 송강 · 도안\n세종호수 · 세종중앙",74,395,230,60,16,C.body,"Quicksand");
 pill(s,"OSM 보행망 기반",74,494,180,C.mintPale,C.heading,13);
 const rows=[
  {y:173,c:C.lilac,t:C.lilacPale,h:"계단 회피",b:"보행망 태그를 경로 제약에 사용"},
  {y:278,c:C.peach,t:C.peachPale,h:"경사 평가",b:"DEM 지형 분석 결과를 후보 점수에 반영"},
  {y:383,c:C.mint,t:C.mintPale,h:"기상·지면열",b:"기상청 예보와 지면열 추정으로 시간대 안내"},
  {y:488,c:C.butter,t:C.butterPale,h:"순환 경로",b:"목표 시간과 출발점으로 루프 코스 구성"}
 ];
 for(const a of rows){panel(s,374,a.y,538,88,a.t); ellipse(s,394,a.y+24,38,38,a.c); text(s,"•",407,a.y+26,20,30,20,C.white,"Quicksand",true); text(s,a.h,448,a.y+13,190,27,20,C.heading,"Baloo 2",true); text(s,a.b,448,a.y+48,438,26,14,C.body,"Quicksand");}
}

// 6. Local-first privacy
{
 const s=p.slides.add(); header(s,"05  개인정보 설계","민감한 산책 정보는 로컬에 두고 공유 데이터만 분리합니다",6,"1:15","README.md · docs/02_편안하개_Team_building.md · docs/03_편안하개_Agile_User_Stories.md");
 panel(s,48,180,386,336,C.lilacPale); panel(s,526,180,386,336,C.mintPale);
 pill(s,"사용자 기기",72,204,150,C.lilacPale,C.lilac,14);
 text(s,"AsyncStorage",72,261,310,44,30,C.heading,"Baloo 2",true);
 text(s,"반려견 프로필\n원본 산책 궤적\n즐겨찾기·피드백",72,325,310,120,19,C.body,"Quicksand");
 pill(s,"선택한 커뮤니티 정보",550,204,205,C.mintPale,C.heading,14);
 text(s,"Supabase / REST",550,261,320,44,27,C.heading,"Baloo 2",true);
 text(s,"공유를 선택한 코스\n출발·도착 주변 200m 마스킹\n커뮤니티 피드와 현장 제보",550,325,324,120,18,C.body,"Quicksand");
 text(s,"200 m",370,544,220,54,38,C.lilac,"Baloo 2",true);
 text(s,"공유 시 위치 노출을 줄이는 공간 마스킹 반경",250,601,470,24,14,C.body,"Quicksand");
}

// 7. Screenshots
{
 const s=p.slides.add(); header(s,"06  앱 화면","저장소의 실제 앱 캡처에서 홈·기록·커뮤니티 흐름을 확인할 수 있습니다",7,"1:30","docs/screenshots/README.md · 2026-10-18 캡처");
 const imgs=[
  {x:48,path:"D:/cody/pet_walk_t01/docs/screenshots/02_home_screen1.png",alt:"편안하개 홈 화면 실제 앱 캡처",cap:"홈 · 산책 준비",sub:"시간·노면 선호"},
  {x:340,path:"D:/cody/pet_walk_t01/docs/screenshots/08-3_my_walk_report.png",alt:"편안하개 내 산책 기록 실제 앱 캡처",cap:"활동 · 산책 기록",sub:"거리·시간·노면 비율"},
  {x:632,path:"D:/cody/pet_walk_t01/docs/screenshots/09_community_feed1.png",alt:"편안하개 커뮤니티 피드 실제 앱 캡처",cap:"커뮤니티 · 코스 피드",sub:"200m 보호 안내"}
 ];
 for(const a of imgs){rect(s,a.x,148,260,478,C.white,C.border,1,"rounded-2xl"); s.images.add({blob:new Uint8Array(await fs.readFile(a.path)),contentType:"image/png",alt:a.alt,fit:"contain",position:{left:a.x+30,top:160,width:200,height:408}}); text(s,a.cap,a.x+16,575,228,24,17,C.heading,"Baloo 2",true); text(s,a.sub,a.x+16,602,228,20,12,C.caption,"Quicksand");}
}

// 8. Collaboration
{
 const s=p.slides.add(); header(s,"07  팀 협업","다섯 역할의 산출물이 하나의 산책 여정에서 만납니다",8,"1:35","README.md · docs/02_편안하개_Team_building.md");
 const people=[
  {x:48,y:162,n:"조현정",r:"PM · AI Agent",d:"문제·요구사항 정리\n에이전트와 기능 통합",c:C.lilac,t:C.lilacPale},
  {x:340,y:162,n:"전황진",r:"공간 데이터",d:"공원 보행망·DEM\n기상·공간 분석",c:C.peach,t:C.peachPale},
  {x:632,y:162,n:"노희선",r:"백엔드 · 라우팅",d:"FastAPI·경로 계산\nAPI·공유 데이터",c:C.mint,t:C.mintPale},
  {x:194,y:375,n:"김승현",r:"모바일 앱",d:"Expo·GPS·음성 안내\n로컬 저장·배포",c:C.butter,t:C.butterPale},
  {x:486,y:375,n:"김정님",r:"UI/UX · QA",d:"핵심 화면·카피\n통합 검증·CBT 준비",c:C.lilac,t:C.lilacPale}
 ];
 for(const a of people){panel(s,a.x,a.y,260,170,a.t); ellipse(s,a.x+18,a.y+18,46,46,a.c); text(s,a.n.slice(0,1),a.x+31,a.y+28,20,24,16,C.white,"Quicksand",true); text(s,a.n,a.x+78,a.y+17,164,29,21,C.heading,"Baloo 2",true); text(s,a.r,a.x+78,a.y+49,164,24,13,C.lilac,"Quicksand",true); line(s,a.x+18,a.y+83,224,0,C.border,1); text(s,a.d,a.x+18,a.y+98,224,54,14,C.body,"Quicksand");}
 text(s,"역할 분담은 책임 경계를 명확히 하고, API·시나리오·테스트를 통해 통합 지점을 공유합니다.",48,586,850,32,15,C.body,"Quicksand");
}

// 9. Quality evidence
{
 const s=p.slides.add(); header(s,"08  품질 근거","저장소 README에는 자동화 검증 결과가 기록되어 있습니다",9,"1:25","README.md · 2026-10-23 확인");
 const data=[
  {x:48,y:176,n:"796",unit:"통과",h:"Backend Pytest",d:"801개 수집 · 5개 skip",c:C.lilac,t:C.lilacPale},
  {x:486,y:176,n:"406/406",unit:"통과",h:"Mobile Vitest",d:"70개 테스트 파일",c:C.peach,t:C.peachPale},
  {x:48,y:380,n:"0",unit:"오류",h:"TypeScript 검사",d:"tsc --noEmit",c:C.mint,t:C.mintPale},
  {x:486,y:380,n:"≤250",unit:"줄",h:"파일 크기 가드레일",d:"README에 100% 준수로 기록",c:C.butter,t:C.butterPale}
 ];
 for(const a of data){panel(s,a.x,a.y,426,174,a.t); text(s,a.n,a.x+22,a.y+24,236,66,46,a.c,"Baloo 2",true); pill(s,a.unit,a.x+264,a.y+35,112,a.t,C.heading,13); text(s,a.h,a.x+22,a.y+100,370,28,20,C.heading,"Baloo 2",true); text(s,a.d,a.x+22,a.y+134,375,22,13,C.body,"Quicksand");}
 text(s,"위 수치는 README에 적힌 결과이며, 이 발표 제작 과정에서 테스트를 재실행하지 않았습니다.",48,594,840,28,13,C.caption,"Quicksand");
}

// 10. Performance
{
 const s=p.slides.add(); header(s,"09  성능 측정","경로 생성은 빠르지만 기상 첫 호출은 별도 개선이 필요합니다",10,"1:20","docs/reports/2026-10-21_API_P95_Latency_검증보고서.md");
 panel(s,48,175,408,326,C.mintPale); panel(s,504,175,408,326,C.peachPale);
 smallLabel(s,"WARM P95 · FastAPI TestClient",72,198,340,C.mint);
 text(s,"112.55 ms",72,242,336,58,38,C.heading,"Baloo 2",true);
 text(s,"공원 보행망 경로 생성",72,309,340,30,18,C.body,"Quicksand",true);
 text(s,"91.54 ms",72,379,336,54,34,C.heading,"Baloo 2",true);
 text(s,"주차장 P&R 경로 생성",72,436,340,26,16,C.body,"Quicksand");
 smallLabel(s,"COLD FIRST CALL · 기상 위험 조회",528,198,350,C.peach);
 text(s,"3,356 ms",528,244,330,60,38,C.heading,"Baloo 2",true);
 text(s,"1.5초 SLA 기준 미달",528,312,330,30,18,C.heading,"Quicksand",true);
 text(s,"동일 보고서의 표에서 heat-risk 첫 호출을\nSLA 미달로 표기합니다. 경로 API의 warm 결과와\n혼합해 전체 성능으로 일반화하지 않습니다.",528,366,342,92,14,C.body,"Quicksand");
 text(s,"실측값은 보고서에 기록된 측정 환경·캐시 조건의 결과입니다.",48,548,840,24,13,C.caption,"Quicksand");
}

// 11. Delivery & field test status
{
 const s=p.slides.add(); header(s,"10  배포와 실사용 검증","배포 경로는 마련했고, 현장 CBT는 다음 검증 단계입니다",11,"1:25","README.md · docs/reports/2026-10-21_Code_Freeze_무결성_감사보고서.md · docs/reports/2026-10-21_5인_CBT_실행_시나리오_명세서.md");
 const timeline=[
  {x:48,w:255,c:C.lilac,t:C.lilacPale,date:"저장소 README",h:"APK · 운영 주소",b:"테스트용 APK 링크와\n서버 주소를 공개"},
  {x:352,w:255,c:C.mint,t:C.mintPale,date:"10월 21일 보고",h:"사전 E2E 5/5",b:"5개 거점 시나리오\n사전 시뮬레이션 통과"},
  {x:656,w:255,c:C.peach,t:C.peachPale,date:"10월 31일–11월 7일",h:"실사용 CBT 예정",b:"5인 현장 테스트와\n피드백 수집 계획"}
 ];
 for(const a of timeline){panel(s,a.x,194,a.w,238,a.t); pill(s,a.date,a.x+16,212,a.w-32,a.t,a.c,12); text(s,a.h,a.x+16,274,a.w-32,54,24,C.heading,"Baloo 2",true); text(s,a.b,a.x+16,346,a.w-32,58,15,C.body,"Quicksand");}
 line(s,303,310,49,0,C.lilac,2); line(s,607,310,49,0,C.peach,2);
 rect(s,48,475,864,112,C.butterPale,"none",0,"rounded-2xl");
 text(s,"완료된 코드·시뮬레이션 검증과 완료 전인 실사용자 피드백을 구분합니다.",72,498,810,30,18,C.heading,"Quicksand",true);
 text(s,"최종 평가 전에는 CBT 실행 결과와 실제 피드백 반영 내역을 추가해야 합니다.",72,540,810,28,14,C.body,"Quicksand");
}

// 12. Closing / Q&A
{
 const s=p.slides.add(); s.background.fill=C.bg;
 ellipse(s,700,35,220,220,C.lilacPale); ellipse(s,755,91,160,160,C.peachPale);
 pill(s,"핵심 정리",72,72,132,C.mintPale,C.heading,14);
 text(s,"편안하개가 보여준\n세 가지 역량",72,133,760,96,43,C.heading,"Baloo 2",true);
 const takeaways=[
  {y:270,c:C.lilac,t:"AI를 서비스 흐름에 연결",d:"LangGraph·공간 데이터·모바일 안내를 하나의 산책 경험으로 통합"},
  {y:356,c:C.peach,t:"안전과 프라이버시를 설계에 반영",d:"계단·경사·열 환경과 로컬 우선 저장, 공유 위치 마스킹"},
  {y:442,c:C.mint,t:"검증 결과와 남은 검증을 구분",d:"자동화 품질 지표를 제시하고, 5인 현장 CBT로 실제 사용성을 확인할 계획"}
 ];
 for(const a of takeaways){ellipse(s,76,a.y+7,26,26,a.c); text(s,a.t,120,a.y,720,28,20,C.heading,"Baloo 2",true); text(s,a.d,120,a.y+36,740,28,14,C.body,"Quicksand");}
 line(s,72,553,816,0,C.border,1);
 text(s,"질의응답",72,579,380,52,34,C.lilac,"Baloo 2",true);
 text(s,"15분",655,580,180,52,32,C.heading,"Baloo 2",true);
 text(s,"근거: README.md · docs/00_final_mission.md · docs/reports/2026-10-21_5인_CBT_실행_시나리오_명세서.md",72,672,790,20,10,C.caption,"Quicksand");
}

await fs.mkdir(outDir,{recursive:true});
for(let i=0;i<p.slides.items.length;i++){
  const blob=await p.export({slide:p.slides.items[i],format:"png",scale:1});
  await fs.writeFile(`${outDir}/slide-${String(i+1).padStart(2,"0")}.png`,new Uint8Array(await blob.arrayBuffer()));
}
const pptx=await PresentationFile.exportPptx(p);
await pptx.save(`${outDir}/candidate.pptx`);
console.log(`Created ${p.slides.items.length}-slide 4:3 editable presentation candidate.`);
