// Bundles the TypeScript tests with esbuild and runs them with the Node test runner.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

// Not under node_modules: the Node test runner ignores files there.
const outdir = '.test-build';
const tests = readdirSync('tests').filter((file) => file.endsWith('.test.ts'));

rmSync(outdir, { recursive: true, force: true });
await esbuild.build({
	entryPoints: tests.map((file) => path.join('tests', file)),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node20',
	outdir,
	outExtension: { '.js': '.mjs' },
	logLevel: 'warning',
});

const files = tests.map((file) => path.join(outdir, file.replace(/\.ts$/, '.mjs')));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
