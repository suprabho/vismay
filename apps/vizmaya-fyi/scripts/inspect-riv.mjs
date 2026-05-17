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

// Inspect ViewModels and their properties
for (let i = 0; i < file.viewModelCount(); i++) {
  const vm = file.viewModelByIndex(i);
  console.log(`\n=== ViewModel ${i}: "${vm.name}" ===`);

  // Get properties
  const props = vm.getProperties();
  console.log(`  Properties:`, props);

  // Inspect property methods
  if (props && props.length > 0) {
    for (const p of props) {
      const pProps = [];
      let o = p;
      while (o && o !== Object.prototype) {
        pProps.push(...Object.getOwnPropertyNames(o));
        o = Object.getPrototypeOf(o);
      }
      const methods = [...new Set(pProps)].sort();
      console.log(`    Property: name="${p.name}", type=${p.type}, all keys: [${methods.join(", ")}]`);
    }
  }

  // Get instances
  const instanceNames = vm.getInstanceNames();
  console.log(`  Instance names:`, instanceNames);

  // Try default instance
  const defInst = vm.defaultInstance();
  if (defInst) {
    console.log(`  Default instance:`, defInst.name);
    const diProps = [];
    let o2 = defInst;
    while (o2 && o2 !== Object.prototype) {
      diProps.push(...Object.getOwnPropertyNames(o2));
      o2 = Object.getPrototypeOf(o2);
    }
    const diMethods = [...new Set(diProps)].filter(p => typeof defInst[p] === "function").sort();
    console.log(`  Instance methods: ${diMethods.join(", ")}`);

    // Try to read properties on the instance
    try {
      const numProp = defInst.propertyNumber("numberProperty");
      if (numProp) {
        console.log(`  numberProperty value: ${numProp.value}`);
        const npProps = [];
        let o3 = numProp;
        while (o3 && o3 !== Object.prototype) {
          npProps.push(...Object.getOwnPropertyNames(o3));
          o3 = Object.getPrototypeOf(o3);
        }
        console.log(`  numberProperty keys: [${[...new Set(npProps)].sort().join(", ")}]`);
      }
    } catch (e) {
      console.log(`  Error reading numberProperty: ${e.message}`);
    }

    defInst.delete();
  }

  vm.delete();
}

file.delete();
