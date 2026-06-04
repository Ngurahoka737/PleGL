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

Increasing the subdivision level applies Catmull-Clark smoothing to the active sculpted mesh, matching the default ZBrush Divide behavior with `Smt` enabled instead of rebuilding the primitive. Lowering the level restores an available coarse snapshot. Use `Rebuild manifold mesh` only when an explicit reset is intended.

Brush smoothing uses the original quad edges rather than the render-only triangle diagonals, so Smooth Brush remains uniform after Divide.

Surface normals are also averaged from the original quad faces. The triangle diagonals used only for WebGL rendering no longer create visible shading lines on sculpted areas after Divide.

The wireframe overlay keeps a stable visual hierarchy after Divide: major lines repeat every four minor cells, medium lines every two minor cells, and newly inserted lines remain subtle.

Subdivision levels behave like a lightweight multires stack in the browser fallback. Higher levels are preserved when stepping down and back up, while level 6 brush strokes use cached topology and a spatial brush index so only nearby vertices are evaluated.

High subdivision sculpting is optimized for interactive strokes: pointer moves are sampled once per animation frame, repeated dabs are skipped when they are too close together, normals are recalculated only around the brush footprint, and expensive bounds/spatial-grid rebuilds are delayed until the stroke ends.

Move Brush follows the grab-style sculpt workflow: vertices under the brush are cached at stroke start with falloff weights, then dragged along the camera plane by the mouse delta. Press `4` to activate it.

Smooth Brush follows Blender's sculpt smoothing pattern: brush strength is split into up to four iterations, each iteration computes neighbor-average target positions first and then applies falloff-scaled translations.

## OpenGL GPU Compute Foundation

The current browser build still uses WebGL for rendering and CPU/WASM or TypeScript for deformation. A modular desktop OpenGL compute foundation is available under `cpp/include/gpu`, `cpp/src/gpu`, and `cpp/shaders` for the future native renderer path.

It provides:

- `GpuMeshBuffer`: uploads position, normal, index, and quad-neighbor adjacency data into SSBOs.
- `ComputeBrush`: compiles and dispatches OpenGL compute shaders with error reporting and CPU-fallback signaling.
- `BrushCompute.comp`: Draw, Smooth, Inflate, and Move brush deformation directly on GPU position buffers.
- `NormalCompute.comp`: minimal neighbor-based GPU normal refresh after deformation.

Enable the optional CMake target for native OpenGL integration:

```bash
cmake -S cpp -B build-cpp -DPLEGL_BUILD_OPENGL_COMPUTE=ON
cmake --build build-cpp --target plegl-opengl-compute
```

Renderer integration should bind `GpuMeshBuffer::positionBuffer()` and `normalBuffer()` directly as vertex attributes, then call `ComputeBrush::dispatch(...)` before rendering. If OpenGL 4.3 compute entry points are unavailable, `ComputeBrush` reports unavailable so callers can keep the existing CPU brush path.
