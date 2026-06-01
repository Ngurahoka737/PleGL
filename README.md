# PleGL

Browser sculpting foundation with a C++ core compiled to WebAssembly. TypeScript owns browser input, UI, and Three.js visualization. C++ owns the mesh buffers, seamless quad sphere generation, subdivision, normals, Draw Brush, Smooth Brush, Clay Brush, and undo/redo snapshots.

The quad sphere starts from eight shared cube vertices and six outward-facing quads. Repeated subdivision builds sculpting density, sphere relaxation distributes quads evenly, and the final topology is exposed to Three.js as indexed `BufferGeometry`.

## Install Emscripten

Install and activate the Emscripten SDK before building WASM:

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
```

On Windows PowerShell, load the environment in each new terminal:

```powershell
.\emsdk_env.ps1
```

## Run

```bash
npm install
npm run build:wasm
npm run dev
```

If Emscripten has not been activated, the browser uses a TypeScript development fallback so the viewport remains usable.

## Verify topology

```bash
npm run check:quad-sphere
npm run check:cpp-core
npm run build
```

The TypeScript topology check verifies the browser fallback. The native C++ smoke test verifies that the C++ generator remains manifold and that Draw, Smooth, and Clay Brush deform the generated mesh.

Clay Brush is an original plane-based implementation: each dab offsets a surface plane from the hit point and moves affected vertices toward that plane using a smooth radial falloff.

Increasing the subdivision level subdivides the active sculpted mesh instead of rebuilding the primitive. Lowering the level restores an available coarse snapshot. Use `Rebuild manifold mesh` only when an explicit reset is intended.
