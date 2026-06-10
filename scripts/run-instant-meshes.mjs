import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , input, output, ...rest] = process.argv;

if (!input || !output) {
  console.error([
    'Usage:',
    '  npm.cmd run instant:remesh -- input.obj output.obj [--faces 20000] [--smooth 2]',
    '',
    'The Instant Meshes source is vendored in third_party/instant-meshes.',
    'This runner uses tools/instant-meshes/Instant Meshes.exe in batch mode.',
  ].join('\n'));
  process.exit(1);
}

const executable = resolve('tools/instant-meshes/Instant Meshes.exe');
if (!existsSync(executable)) {
  console.error(`Instant Meshes executable not found: ${executable}`);
  process.exit(1);
}

const inputPath = resolve(input);
const outputPath = resolve(output);
mkdirSync(dirname(outputPath), { recursive: true });

const args = [
  inputPath,
  '--output',
  outputPath,
  '--rosy',
  '4',
  '--posy',
  '4',
  ...rest,
];

const result = spawnSync(executable, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
