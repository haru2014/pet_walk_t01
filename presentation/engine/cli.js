#!/usr/bin/env node

const path = require('path');
const { loadDeckFile } = require('./parser');
const { generatePresentation } = require('./generator');

function printUsage() {
  console.log(`
Universal Presentation Generator CLI
====================================
사용법:
  node engine/cli.js --deck <경로> [옵션]

옵션:
  --deck <path>     입력 슬라이드 명세 파일 (.json 또는 .md) (기본값: input/sample-deck.json)
  --theme <theme>   적용할 템플릿 테마 (modern-business, tech-dark, warm-pastel, clean-minimal)
  --layout <ratio>  화면 비율 (16x9 또는 4x3)
  --out <path>      출력 PPTX 파일 경로 (기본값: output/<deck-id>.pptx)
  --help            도움말 표시

예시:
  node engine/cli.js --deck input/sample-deck.json --theme modern-business --out output/presentation.pptx
  node engine/cli.js --deck examples/tech-pitch/deck.json --theme tech-dark
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let deckPath = 'input/sample-deck.json';
  let theme = null;
  let layout = null;
  let outPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--deck' && args[i + 1]) {
      deckPath = args[++i];
    } else if (arg === '--theme' && args[i + 1]) {
      theme = args[++i];
    } else if (arg === '--layout' && args[i + 1]) {
      layout = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      outPath = args[++i];
    }
  }

  try {
    console.log(`[Presentation Engine] Loading deck from: ${deckPath}`);
    const deckSpec = loadDeckFile(deckPath);

    const options = {};
    if (theme) options.theme = theme;
    if (layout) options.layout = layout;
    if (outPath) options.outputPath = path.resolve(outPath);

    console.log(`[Presentation Engine] Generating PPTX (Theme: ${options.theme || deckSpec.theme || 'modern-business'})...`);
    const result = await generatePresentation(deckSpec, options);

    console.log(`\n========================================`);
    console.log(`Presentation 생성 성공!`);
    console.log(`- 저장 위치: ${result.outputPath}`);
    console.log(`- 슬라이드 수: ${result.totalSlides}`);
    console.log(`- 템플릿 테마: ${result.theme}`);
    console.log(`- 화면 비율: ${result.layout}`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error(`\n[Presentation Engine] 오류 발생:`, err.message);
    process.exit(1);
  }
}

main();

