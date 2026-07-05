/// <reference types="vite/client" />

// canvas2svg ships no types. It exports a constructor that mimics a
// CanvasRenderingContext2D but records draw calls and serializes to SVG.
declare module "canvas2svg" {
  export default class C2S {
    constructor(width: number, height: number);
    getSerializedSvg(fixNamedEntities?: boolean): string;
    // It quacks like a 2D context; the rest of the surface is used by Chart.js.
    [key: string]: unknown;
  }
}
