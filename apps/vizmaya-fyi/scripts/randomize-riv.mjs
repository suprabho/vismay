/**
 * Randomize numberProperty on ViewModel1 and ViewModel2 in vizmaya-logo.riv.
 *
 * - ViewModel1.numberProperty → random integer in [0, 4]
 * - ViewModel2.numberProperty → random integer in [0, 5]
 *
 * Usage:  node scripts/randomize-riv.mjs
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
});
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

const { default: RiveCanvas } = await import(
  "@rive-app/canvas-advanced-single"
);
import { readFileSync } from "fs";

const bytes = readFileSync("public/vizmaya-logo.riv");
const rive = await RiveCanvas();
const file = await rive.load(new Uint8Array(bytes));

if (!file) {
  console.error("Failed to load .riv file");
  process.exit(1);
}

function randomizeViewModel(file, vmName, max) {
  const vm = file.viewModelByName(vmName);
  if (!vm) {
    console.error(`ViewModel "${vmName}" not found`);
    return;
  }

  const inst = vm.defaultInstance();
  if (!inst) {
    console.error(`No default instance for "${vmName}"`);
    vm.delete();
    return;
  }

  const numProp = inst.number("numberProperty");
  if (!numProp) {
    console.error(`numberProperty not found on "${vmName}"`);
    inst.delete();
    vm.delete();
    return;
  }

  const value = Math.floor(Math.random() * (max + 1));
  numProp.value = value;
  console.log(`${vmName}.numberProperty = ${value} (range 0–${max})`);
}

randomizeViewModel(file, "ViewModel1", 4);
randomizeViewModel(file, "ViewModel2", 5);

console.log("\nDone.");
file.delete();
