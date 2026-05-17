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

const artboardCount = file.artboardCount();
console.log(`Artboard count: ${artboardCount}`);
for (let i = 0; i < artboardCount; i++) {
  const ab = file.artboardByIndex(i);
  console.log(`\nArtboard ${i}: "${ab.name}"`);
  const animCount = ab.animationCount();
  console.log(`  Animations: ${animCount}`);
  for (let j = 0; j < animCount; j++) {
    const anim = ab.animationByIndex(j);
    console.log(`    Animation ${j}: "${anim.name}"`);
  }
  const smCount = ab.stateMachineCount();
  console.log(`  State Machines: ${smCount}`);
  for (let j = 0; j < smCount; j++) {
    const sm = ab.stateMachineByIndex(j);
    console.log(`    SM ${j}: "${sm.name}"`);
  }
  ab.delete();
}
file.delete();
