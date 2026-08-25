// dxf-viewer@1.0.48 ships an incomplete/inaccurate index.d.ts relative to its
// actual runtime API (confirmed by reading node_modules/dxf-viewer/src/DxfViewer.js
// directly): it's missing GetDxf()/canvas entirely, declares GetLayers() with
// zero params when the real method takes an optional nonEmptyOnly flag, and
// declares FitView()'s padding param as required when the real implementation
// defaults it. `tsc --noEmit` on this project's non-strict tsconfig silently
// treats the whole import as `any` and never caught this; `tsc -b` (the real
// build command) resolves the .d.ts properly and fails on all of it. This
// patches the declarations to match actual behavior — no runtime code here.
import 'dxf-viewer'

declare module 'dxf-viewer' {
  interface DxfViewer {
    /** Real instance property (`this.canvas = renderer.domElement`), not just exposed via GetCanvas(). */
    readonly canvas: HTMLCanvasElement

    /** Returns the parsed DXF object when constructed with `retainParsedDxf: true`; null otherwise. */
    GetDxf(): {
      entities?: Array<{
        type: string
        vertices?: Array<{ x: number; y: number }>
        shape?: boolean
        closed?: boolean
      }>
    } | null

    // eslint-disable-next-line @typescript-eslint/unified-signatures -- overload, not a duplicate: adds the real optional param the shipped .d.ts omits.
    // Returns a real array at runtime (`const result = []; ...; return result`
    // in DxfViewer.js), not just an Iterable — the shipped zero-arg overload's
    // weaker `Iterable<LayerInfo>` return type loses .map()/.length, so this
    // overload declares the true, more specific return type.
    GetLayers(nonEmptyOnly: boolean): LayerInfo[]

    // eslint-disable-next-line @typescript-eslint/unified-signatures -- overload: the real implementation defaults `padding`, the shipped .d.ts wrongly requires it
    FitView(minX: number, maxX: number, minY: number, maxY: number): void
  }
}
