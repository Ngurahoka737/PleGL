import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

await mkdir('work/cpp', { recursive: true });
const sources = [
  'cpp/src/Mesh.cpp',
  'cpp/src/PrimitiveGenerator.cpp',
  'cpp/src/Brush.cpp',
  'cpp/src/HistoryManager.cpp',
  'cpp/src/SculptEngine.cpp',
  'cpp/tests/core_smoke.cpp',
];
const output = process.platform === 'win32' ? 'work/cpp/core_smoke.exe' : 'work/cpp/core_smoke';
const compile = spawnSync('g++', ['-std=c++20', '-O2', '-Icpp/include', ...sources, '-o', output], {
  stdio: 'inherit',
});
if (compile.status !== 0) throw new Error('Native C++ smoke-test compilation failed. Install g++ or use Emscripten.');
const run = spawnSync(resolve(output), [], { stdio: 'inherit' });
if (run.status !== 0) throw new Error('Native C++ smoke test failed.');
