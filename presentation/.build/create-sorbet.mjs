import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "file:///C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outDir = "D:/cody/pet_walk_t01/presentation/.build";
const C = { bg:"#FBF7FB", white:"#FFFFFF", border:"#ECE3F0", heading:"#4A3A5C", body:"#6A5E76", caption:"#A99FB3", lilac:"#9B6FBF", peach:"#F2A6B3", mint:"#8FD0C4", butter:"#F4D58D" };
const p = Presentation.create({slideSize:{width:960,height:720}});
function shape(slide, geometry, x,y,w,h, fill="none", stroke="none", strokeWidth=0, radius) {
  return slide.shapes.add({geometry,position:{left:x,top:y,width:w,height:h},fill,line:{style:"solid",fill:stroke,width:strokeWidth},...(radius?{borderRadius:radius}:{})});
}
function txt(slide,value,x,y,w,h,size,color,typeface,bold=false) {
  const o=shape(slide,"textbox",x,y,w,h);
  o.text=value; o.text.style={typeface,fontSize:size,color,bold}; return o;
}
function header(slide,idx,section,title) {
  txt(slide,idx,48,24,38,25,14,C.lilac,"Quicksand",true);
  txt(slide,section,92,24,240,25,14,C.heading,"Quicksand",true);
  txt(slide,"편안하개 프로젝트 · 시제품",610,24,300,25,12,C.caption,"Quicksand");
  txt(slide,title,48,80,860,55,32,C.heading,"Baloo 2",true);
}
function footer(slide,num) {
  shape(slide,"line",48,674,864,1,"none",C.border,1);
  txt(slide,"편안하개 프로젝트",48,683,350,20,12,C.caption,"Quicksand");
  txt(slide,String(num),870,683,42,20,12,C.caption,"Quicksand");
}
let s=p.slides.add(); s.background.fill=C.bg;
shape(s,"ellipse",700,50,190,190,"#F3EAF6");
shape(s,"ellipse",760,105,155,155,"#FBEAED");
txt(s,"편안하개",72,155,800,100,72,C.heading,"Baloo 2",true);
shape(s,"line",74,285,170,2,C.lilac);
txt(s,"팀의 협업으로 완성한 반려견 안심 산책 서비스",74,322,800,54,38,C.heading,"Baloo 2",true);
txt(s,"프로젝트 목표부터 구현과 검증까지",74,390,780,36,20,C.body,"Quicksand");
shape(s,"roundRect",74,586,330,42,"#EEE5F4",C.border,1,"rounded-full");
txt(s,"시제품 · 레이아웃 확인용",92,594,300,24,14,C.heading,"Quicksand",true);

s=p.slides.add(); s.background.fill=C.bg; header(s,"01","협업과 구현","팀의 역할을 연결해 서비스 흐름을 완성했습니다"); footer(s,2);
const cards=[
 {x:48,c:C.lilac,n:"01",h:"요구사항",b:"사용자 문제와 서비스 범위를 정리"},
 {x:340,c:C.peach,n:"02",h:"구현",b:"팀 역할에 따라 기능을 개발하고 통합"},
 {x:632,c:C.mint,n:"03",h:"검증",b:"테스트와 사용자 피드백을 반영"}
];
for(const a of cards){
  shape(s,"roundRect",a.x,190,260,260,C.white,C.border,1,"rounded-2xl");
  shape(s,"ellipse",a.x+22,212,48,48,a.c);
  txt(s,a.n,a.x+28,222,40,25,16,C.white,"Quicksand",true);
  txt(s,a.h,a.x+22,286,216,42,28,C.heading,"Baloo 2",true);
  txt(s,a.b,a.x+22,345,216,70,17,C.body,"Quicksand");
}
shape(s,"line",312,320,28,2,C.peach); shape(s,"line",604,320,28,2,C.mint);
txt(s,"자료 근거를 각 단계에 연결하는 자리",48,500,820,28,16,C.caption,"Quicksand");

s=p.slides.add(); s.background.fill=C.bg; header(s,"02","검증 결과","각 수치에 기준일과 근거를 함께 표시합니다"); footer(s,3);
shape(s,"roundRect",48,165,864,380,C.white,C.border,1,"rounded-2xl");
txt(s,"검증 항목",72,188,240,28,16,C.lilac,"Quicksand",true);
txt(s,"근거 자료",360,188,240,28,16,C.lilac,"Quicksand",true);
txt(s,"기준일",672,188,180,28,16,C.lilac,"Quicksand",true);
for(let i=0;i<3;i++) shape(s,"line",72,232+i*80,816,1,C.border,1);
const rows=[["요구사항","문서·절","확인 필요"],["기능 구현","코드·화면","확인 필요"],["품질 검증","실행 결과","확인 필요"]];
for(let i=0;i<rows.length;i++){
 const y=252+i*80;
 txt(s,rows[i][0],72,y,240,32,18,C.heading,"Quicksand",true);
 txt(s,rows[i][1],360,y,240,32,18,C.body,"Quicksand");
 shape(s,"roundRect",672,y-4,155,34,[C.butter,"#E7F4F1","#EEE5F4"][i],C.border,0,"rounded-full");
 txt(s,rows[i][2],687,y+2,135,24,14,C.body,"Quicksand");
}
txt(s,"레이아웃 시제품의 예시 행이며 실제 완료 상태를 나타내지 않습니다.",72,490,780,24,14,C.caption,"Quicksand");

for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.export({slide:p.slides.items[i],format:"png",scale:1});
 await fs.writeFile(outDir+"/sorbet-"+String(i+1).padStart(2,"0")+".png",new Uint8Array(await blob.arrayBuffer()));
}
const pptx=await PresentationFile.exportPptx(p); await pptx.save(outDir+"/sorbet-candidate.pptx");
console.log("Created 3-slide Sorbet prototype.");

