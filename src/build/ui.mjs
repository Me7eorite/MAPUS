import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MODULE_DIRS = [
  process.env.MAPUS_NODE_MODULES,
  path.join(process.cwd(), 'node_modules'),
].filter(Boolean);

function load(name) {
  for (const dir of MODULE_DIRS) {
    try {
      return require(path.join(dir, name));
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  return require(name);
}

const esbuild = load('esbuild');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'ui/agent/index.jsx');
const OUT = path.join(ROOT, 'popup/agent.bundle.js');

if (!fs.existsSync(ENTRY)) {
  console.error('找不到界面入口：' + ENTRY);
  process.exit(1);
}

const result = await esbuild.build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  nodePaths: MODULE_DIRS,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
  metafile: true
});

const size = fs.statSync(OUT).size;
const inputs = Object.keys(result.metafile.inputs || {});
console.log(`智能体界面构建完成 → ${path.relative(ROOT, OUT)}`);
console.log(`依赖 ${inputs.length} 个模块，产物 ${(size / 1024).toFixed(1)} KB`);
