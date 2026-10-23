import path from "node:path";
import { pathToFileURL } from "node:url";
const skillDir = "C:/Users/true9/.codex/plugins/cache/openai-primary-runtime/presentations/26.1022.11436/skills/presentations";
const workspaceDir = "D:/cody/pet_walk_t01/presentation";
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir,"container_tools/artifact_tool_utils.mjs")).href);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath: path.join(workspaceDir,".build/candidate.pptx"),
  finalPath: path.join(workspaceDir,"output/tool-spike.pptx"),
  pythonExecutable: "C:/Users/true9/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  integrityValidatorPath: path.join(skillDir,"container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir,"container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu","9144000,6858000"],
  explicitTotalSlideCount: 3,
  fontPolicy: {basis:"user_request",families:["Pretendard"]},
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir,".build/tool-spike.validation.json"),
});
console.log(JSON.stringify(result));

