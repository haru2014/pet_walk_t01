import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "file:///C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outDir = "D:/cody/pet_walk_t01/presentation/.build";
const pres = Presentation.create({ slideSize: { width: 960, height: 720 } });
const C = { blue: "#0038FF", orange: "#FF8A3D", mint: "#00B386", black: "#000000", body: "#2B2B2B", grey: "#7A7A7A", rule: "#DCDCD8", panel: "#F2F2F0", white: "#FFFFFF" };

function text(slide, value, x, y, w, h, size, color=C.body, bold=false) {
  const s = slide.shapes.add({ geometry: "textbox", position: { left:x, top:y, width:w, height:h }, fill:"none", line:{style:"solid",fill:"none",width:0} });
  s.text = value;
  s.text.style = { typeface:"Pretendard", fontSize:size, color, bold };
  return s;
}
function line(slide, x1,y1,x2,y2,color=C.blue,width=1,dash="solid") {
  return slide.shapes.add({ geometry:"line", position:{left:Math.min(x1,x2),top:Math.min(y1,y2),width:Math.max(1,Math.abs(x2-x1)),height:Math.max(1,Math.abs(y2-y1))}, fill:"none", line:{style:dash,fill:color,width} });
}
function header(slide, section, title) {
  text(slide, section, 48, 28, 36, 22, 14, C.blue, true);
  text(slide, title, 90, 28, 480, 22, 14, C.black, true);
  text(slide, "편안하개 프로젝트 · 시제품", 650, 28, 260, 20, 12, C.grey, false);
  line(slide,48,60,912,60,C.rule,1);
}
function footer(slide, page) {
  line(slide,48,674,912,674,C.rule,1);
  text(slide,"편안하개 프로젝트",48,682,360,18,12,C.grey,false);
  text(slide,String(page),880,682,32,18,12,C.grey,false);
}

let s = pres.slides.add(); s.background.fill = C.white;
text(s,"편안하개",72,155,820,150,104,C.black,true);
line(s,74,322,420,322,C.blue,2);
line(s,74,314,74,330,C.blue,2); line(s,420,314,420,330,C.blue,2);
text(s,"4:3 화면과 Pretendard 적용 시제품",74,354,800,60,34,C.black,true);
text(s,"기술 사양서형 시각 규칙과 편집 가능한 도형을 검토합니다.",74,428,780,42,18,C.body,false);
text(s,"레이아웃 검증용 예시 — 프로젝트 성과 데이터 아님",74,610,780,24,12,C.grey,false);

s = pres.slides.add(); s.background.fill = C.white; header(s,"01","협업 흐름을 단계와 근거로 보여줍니다"); footer(s,2);
text(s,"각 단계의 산출물과 확인 자료를 연결하는 구성 예시",48,92,800,40,24,C.black,true);
const labels = [["요구사항","범위와 사용자 문제"],["구현","역할별 작업과 통합"],["검증","테스트와 피드백"]];
for(let i=0;i<3;i++){
  const x=60+i*286;
  line(s,x,210,x+210,210,C.blue,1.5,"dash");
  text(s,String(i+1).padStart(2,"0"),x,230,60,24,14,C.blue,true);
  text(s,labels[i][0],x,270,210,38,28,C.black,true);
  text(s,labels[i][1],x,320,210,60,16,C.body,false);
  if(i<2){ line(s,x+220,294,x+260,294,C.blue,1); line(s,x+250,289,x+260,294,C.blue,1); line(s,x+250,299,x+260,294,C.blue,1); }
}
text(s,"자료 근거를 붙일 위치",60,480,250,24,14,C.blue,true);
line(s,60,512,900,512,C.rule,1);
text(s,"문서명 · 기준일 · 확인한 지표",60,528,800,30,16,C.grey,false);

s = pres.slides.add(); s.background.fill = C.white; header(s,"02","검증 결과는 기준일과 조건을 함께 표시합니다"); footer(s,3);
text(s,"편집 가능한 표 레이아웃 확인",48,92,760,40,24,C.black,true);
const cols=[48,400,670,912], top=170, rh=58;
for(let r=0;r<4;r++) line(s,cols[0],top+r*rh,cols[3],top+r*rh,r===0?C.blue:C.rule,r===0?1.5:1);
const rows=[["항목","근거 위치","기준일"],["요구사항","문서·절","확인 필요"],["기능 구현","코드·화면","확인 필요"],["품질 검증","실행 결과","확인 필요"]];
for(let r=0;r<rows.length;r++) for(let c=0;c<3;c++) text(s,rows[r][c],cols[c]+12,top+14+r*rh,cols[c+1]-cols[c]-20,30,r===0?14:16,r===0?C.blue:C.body,r===0);
text(s,"이 표는 구조 확인용이며 실제 완료 여부를 주장하지 않습니다.",48,430,840,28,14,C.orange,false);

for (const [i, slide] of pres.slides.items.entries()) {
  const blob = await pres.export({slide,format:"png",scale:1});
  await fs.writeFile(`${outDir}/slide-${String(i+1).padStart(2,"0")}.png`,new Uint8Array(await blob.arrayBuffer()));
}
const pptx = await PresentationFile.exportPptx(pres);
await pptx.save(`${outDir}/candidate.pptx`);
console.log("Created 3-slide 4:3 prototype.");

