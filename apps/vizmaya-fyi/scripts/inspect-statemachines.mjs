import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, writable: true });
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

const { default: RiveCanvas } = await import("@rive-app/canvas-advanced-single");
import { readFileSync } from "fs";

const bytes = readFileSync("public/vizmaya-logo.riv");
const rive = await RiveCanvas();
const file = await rive.load(new Uint8Array(bytes));

for (let i = 0; i < file.artboardCount(); i++) {
  const ab = file.artboardByIndex(i);
  const smCount = ab.stateMachineCount();
  if (smCount === 0) { ab.delete(); continue; }

  console.log(`\nArtboard "${ab.name}":`);
  for (let j = 0; j < smCount; j++) {
    const sm = ab.stateMachineByIndex(j);
    console.log(`  State Machine "${sm.name}":`);
    
    const inputCount = sm.inputCount();
    console.log(`    Inputs (${inputCount}):`);
    for (let k = 0; k < inputCount; k++) {
      const input = sm.inputByIndex(k);
      console.log(`      [${k}] name="${input.name}" type=${input.type}`);
    }
  }
  ab.delete();
}

// Also check ViewModel default instances and their current values
for (let i = 0; i < file.viewModelCount(); i++) {
  const vm = file.viewModelByIndex(i);
  console.log(`\nViewModel "${vm.name}":`);
  
  const inst = vm.defaultInstance();
  if (inst) {
    const numProp = inst.number("numberProperty");
    if (numProp) {
      console.log(`  numberProperty current value: ${numProp.value}`);
    }
    inst.delete();
  }
  
  const names = vm.getInstanceNames();
  console.log(`  Instances: ${JSON.stringify(names)}`);
  vm.delete();
}

file.delete();
