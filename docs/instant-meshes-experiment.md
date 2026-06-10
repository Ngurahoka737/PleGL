# Instant Meshes experiment

This project now vendors the Instant Meshes source code for topology experiments:

- Source: `third_party/instant-meshes`
- License: `third_party/instant-meshes/LICENSE.txt`
- Batch runner: `npm.cmd run instant:remesh -- input.obj output.obj [options]`
- Browser dev endpoint: `POST /__instant_remesh`

Example:

```powershell
npm.cmd run instant:remesh -- work/input.obj work/output.obj --faces 20000 --smooth 2
```

Notes:

- This is an external experiment path. In dev mode, the browser sends OBJ data to the local Vite endpoint, Vite runs the native Instant Meshes executable, then the returned OBJ replaces the visible object set.
- Restart `npm.cmd run dev` after changing `vite.config.mjs`; Vite must reload the middleware before the browser button can use the endpoint.
- The dev endpoint asks Instant Meshes for a pure quad mesh. Because Instant Meshes performs a final regular subdivision in pure-quad mode, the endpoint sends roughly one quarter of the UI target face count to keep the final density close to the requested value.
- The browser pipeline uses a balanced C++ volume-union stage before Instant Meshes. It keeps the union resolution high enough to preserve sphere/cylinder necks, limits adaptive noise, and only uses detail projection at moderate resolutions because projection is the expensive part.
- The local machine currently does not have `cmake` in `PATH`, so the runner uses the downloaded Windows binary in `tools/instant-meshes/Instant Meshes.exe`.
- PixRemesh should remain shape-preserving. Do not replace the input shape procedurally; use field-aligned remeshing as a reference and project the result back to the source surface.
- Blender and QRemeshify/QuadWild code should be treated as separate license-sensitive references unless the whole project intentionally adopts compatible licensing.
