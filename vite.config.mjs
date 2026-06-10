import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { defineConfig } from 'vite';

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32 * 1024 * 1024) {
        rejectBody(new Error('Request body is too large for the Instant Meshes experiment endpoint.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(body || '{}'));
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on('error', rejectBody);
  });
}

function runInstantMeshes(inputPath, outputPath, options) {
  const executable = resolve('tools/instant-meshes/Instant Meshes.exe');
  if (!existsSync(executable)) {
    throw new Error(`Instant Meshes executable not found: ${executable}`);
  }

  const args = [
    inputPath,
    '--output',
    outputPath,
    '--rosy',
    '4',
    '--posy',
    '4',
    '--faces',
    String(options.faces),
    '--smooth',
    String(options.smooth),
  ];

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(stderr.trim() || `Instant Meshes exited with code ${code}.`));
    });
  });
}

function instantMeshesExperimentPlugin() {
  return {
    name: 'instant-meshes-experiment',
    configureServer(server) {
      server.middlewares.use('/__instant_remesh', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const body = await readJsonBody(req);
          const obj = typeof body.obj === 'string' ? body.obj : '';
          if (!obj.includes('\nv ') || !obj.includes('\nf ')) {
            throw new Error('Request must contain an OBJ string with vertices and faces.');
          }

          const targetFaces = Math.max(128, Math.min(250000, Math.round(Number(body.faces) || 12000)));
          const instantFaces = Math.max(128, Math.round(targetFaces / 4));
          const smooth = Math.max(0, Math.min(20, Math.round(Number(body.smooth) || 2)));
          const jobDir = resolve('work/instant-remesh');
          const inputPath = resolve(jobDir, 'input.obj');
          const outputPath = resolve(jobDir, 'output.obj');
          mkdirSync(dirname(inputPath), { recursive: true });
          writeFileSync(inputPath, obj, 'utf8');

          await runInstantMeshes(inputPath, outputPath, { faces: instantFaces, smooth });

          if (!existsSync(outputPath)) {
            throw new Error('Instant Meshes finished but did not write an output OBJ.');
          }

          const remeshedObj = readFileSync(outputPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ obj: remeshedObj }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [instantMeshesExperimentPlugin()],
});
