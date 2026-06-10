import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await mkdir('public/wasm', { recursive: true });
const sources = [
  'cpp/src/Mesh.cpp',
  'cpp/src/PrimitiveGenerator.cpp',
  'cpp/src/PixRemesh.cpp',
  'cpp/src/SculptEngine.cpp',
  'cpp/src/Brush.cpp',
  'cpp/src/HistoryManager.cpp',
  'cpp/src/bindings.cpp',
];
const args = [
  ...sources,
  '-Icpp/include',
  '--bind',
  '-O3',
  '-std=c++20',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sENVIRONMENT=web',
  '-o',
  'public/wasm/sculpt-engine.js',
];
const result = spawnSync('emcc', args, { stdio: 'inherit', shell: true });
if (result.status !== 0) {
  throw new Error('Emscripten emcc was not found or WASM compilation failed. Activate emsdk first.');
}
