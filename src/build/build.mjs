import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  return require(name);
}

const esbuild = load('esbuild');
const JavaScriptObfuscator = load('javascript-obfuscator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(ROOT, '.buildtmp');

const args = new Map(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const LEVEL = args.get('level') || 'mid';
const OUT = args.get('out') || DIST;

if (!['min', 'mid', 'max'].includes(LEVEL)) {
  console.error(`未知 level: ${LEVEL}（可选 min / mid / max）`);
  process.exit(1);
}

const BG_ORDER = [
  'background/core/gate.js',
  'background/config/fingerprint.config.js',
  'background/config/rules.defaults.js',
  'background/core/rules-core.js',
  'i18n/core.js',
  'i18n/errors.js',
  'i18n/catalog.js',
  'background/adb/policy.js',
  'background/adb/user-scripts.js',
  'background/adb/service.js',
  'background/adb/bridge.js',
  'background/adb/debugger.js',
  'background/core/scan-core.js',
  'background/core/nextanti-core.js',
  'background/core/adb-core.js',
  'background/core/browser-core.js',
  'background/core/findings-core.js',
  'background/core/harness-core.js',
  'background/core/agent-core.js',
  'background/core/dsh-core.js'
];

const CONTENT_ENTRY = [
  'content/utils/logger.js',
  'content/config/scanner.config.js',
  'content/filters/scanner.filter.js',
  'content/security-detector.js',
  'content/content.js',
  'content/overview-panel.js'
];

const SCRIPT_LIBS = fs.readdirSync(path.join(ROOT, 'scripts')).filter(f => f.endsWith('.js'));

const obfuscatorOptions = (seed, opts = {}) => {
  const strings = opts.strings !== false;
  const heavy = LEVEL === 'max';
  return {
    compact: true,
    target: 'browser',
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    renameProperties: false,
    selfDefending: heavy && opts.selfDefending !== false,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    stringArray: LEVEL !== 'min' && strings,
    stringArrayThreshold: heavy ? 0.92 : 0.6,
    stringArrayEncoding: LEVEL === 'min' ? [] : (heavy ? ['base64', 'rc4'] : ['base64']),
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersType: 'function',
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    splitStrings: heavy && strings && opts.splitStrings !== false,
    splitStringsChunkLength: 8,
    controlFlowFlattening: heavy && opts.controlFlow !== false,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: heavy && opts.deadCode !== false,
    deadCodeInjectionThreshold: 0.25,
    numbersToExpressions: LEVEL !== 'min',
    simplify: true,
    seed
  };
};

const seedOf = name => {
  const hex = crypto.createHash('sha1').update(name).digest('hex').slice(0, 6);
  return parseInt(hex, 16) % 100000;
};

const stats = { files: 0, raw: 0, out: 0 };

const stubPlugin = {
  name: 'stub-runtime-require',
  setup(build) {
    build.onResolve({ filter: /^\.\..*\.js$/ }, args => {
      const abs = path.resolve(args.resolveDir, args.path);
      if (fs.existsSync(abs)) return null;
      return { path: args.path, namespace: 'stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default {};',
      loader: 'js'
    }));
  }
};

async function bundle(entryFile, outFile, { minify = true } = {}) {
  const result = await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'chrome120',
    minify,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
    plugins: [stubPlugin]
  });
  const code = result.outputFiles[0].text;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code);
  stats.raw += Buffer.byteLength(code);
  return code;
}

async function compile(name, source, outFile, opts = {}) {
  const res = await esbuild.transform(source, {
    minify: true,
    target: 'chrome120',
    legalComments: 'none',
    charset: 'utf8',
    loader: 'js'
  });
  let code = res.code;
  if (LEVEL !== 'min' && opts.obfuscate !== false) {
    code = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions(seedOf(name), opts)).getObfuscatedCode();
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code);
  stats.files += 1;
  stats.raw += Buffer.byteLength(source);
  stats.out += Buffer.byteLength(code);
  return code;
}

function concatSources(files) {
  return files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
}

async function transformFile(srcFile, outFile, opts = {}) {
  const source = fs.readFileSync(srcFile, 'utf8');
  return compile(path.basename(srcFile), source, outFile, opts);
}

const PAGE_SIDE = { selfDefending: false };

function writeEntry(name, imports) {
  const file = path.join(TMP, name);
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(file, imports.map(p => `import '${p}';`).join('\n') + '\n');
  return file;
}

function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return;
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, item.name);
    const dest = path.join(to, item.name);
    if (item.isDirectory()) copyDir(src, dest, filter);
    else if (filter(item.name)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function buildManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  manifest.content_scripts = [
    { matches: ['<all_urls>'], js: ['content/anti/nextanti.js'], run_at: 'document_start', all_frames: true },
    { matches: ['<all_urls>'], js: ['content/adb/bridge.js'], run_at: 'document_start', all_frames: false },
    { matches: ['<all_urls>'], js: ['content/content.js'], run_at: 'document_end', all_frames: true }
  ];
  manifest.web_accessible_resources = [
    { resources: ['scripts/*.js', 'inject/nextanti.js'], matches: ['<all_urls>'] }
  ];
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const bgSource = fs.readFileSync(path.join(ROOT, 'background/background.js'), 'utf8');
const rest = bgSource.replace(/importScripts\([\s\S]*?\);/, '').trim();

const pagefnSource = fs.readFileSync(path.join(ROOT, 'background/pagefn.js'), 'utf8');
await compile('pagefn', pagefnSource, path.join(OUT, 'background/pagefn.js'), { obfuscate: false });

const bgSourceConcat = concatSources(BG_ORDER) + '\n' + rest;
const bgCode = await compile('background', bgSourceConcat, path.join(OUT, 'background/background.js'));
fs.writeFileSync(path.join(OUT, 'background/background.js'), `importScripts('/background/pagefn.js');\n${bgCode}`);

const contentSourceConcat = concatSources(CONTENT_ENTRY);
await compile('content', contentSourceConcat, path.join(OUT, 'content/content.js'));

await transformFile(path.join(ROOT, 'content/anti/nextanti.js'), path.join(OUT, 'content/anti/nextanti.js'));
await transformFile(path.join(ROOT, 'content/adb/bridge.js'), path.join(OUT, 'content/adb/bridge.js'));
for (const f of fs.readdirSync(path.join(ROOT, 'content/modules'))) {
  if (!f.endsWith('.js')) continue;
  await transformFile(path.join(ROOT, 'content/modules', f), path.join(OUT, 'content/modules', f), PAGE_SIDE);
}
await transformFile(path.join(ROOT, 'inject/nextanti.js'), path.join(OUT, 'inject/nextanti.js'), PAGE_SIDE);
for (const f of fs.readdirSync(path.join(ROOT, 'i18n'))) {
  if (!f.endsWith('.js')) continue;
  await transformFile(path.join(ROOT, 'i18n', f), path.join(OUT, 'i18n', f));
}
for (const f of SCRIPT_LIBS) {
  await transformFile(path.join(ROOT, 'scripts', f), path.join(OUT, 'scripts', f), PAGE_SIDE);
}

const popupEntry = path.join(ROOT, 'popup/popup.js');
const popupCode = await bundle(popupEntry, path.join(OUT, 'popup/popup.js'));
if (LEVEL !== 'min') {
  const ob = JavaScriptObfuscator.obfuscate(popupCode, obfuscatorOptions(seedOf('popup'), {})).getObfuscatedCode();
  fs.writeFileSync(path.join(OUT, 'popup/popup.js'), ob);
  stats.out += Buffer.byteLength(ob);
} else {
  stats.out += Buffer.byteLength(popupCode);
}
const dashboardEntry = path.join(ROOT, 'dashboard/dashboard.js');
const dashboardCode = await bundle(dashboardEntry, path.join(OUT, 'dashboard/dashboard.js'));
if (LEVEL !== 'min') {
  const dashOb = JavaScriptObfuscator.obfuscate(dashboardCode, obfuscatorOptions(seedOf('dashboard'), PAGE_SIDE)).getObfuscatedCode();
  fs.writeFileSync(path.join(OUT, 'dashboard/dashboard.js'), dashOb);
  stats.out += Buffer.byteLength(dashOb);
} else {
  stats.out += Buffer.byteLength(dashboardCode);
}

const agentBundle = path.join(ROOT, 'popup/agent.bundle.js');
if (fs.existsSync(agentBundle)) fs.copyFileSync(agentBundle, path.join(OUT, 'popup/agent.bundle.js'));
copyDir(path.join(ROOT, 'icons'), path.join(OUT, 'icons'), n => /^(icon(16|32|48|64|128|256)|logo)\.png$/.test(n));
copyDir(path.join(ROOT, 'popup'), path.join(OUT, 'popup'), n => n.endsWith('.css') || n.endsWith('.html'));
if (fs.existsSync(path.join(ROOT, 'dashboard'))) copyDir(path.join(ROOT, 'dashboard'), path.join(OUT, 'dashboard'), n => n.endsWith('.css') || n.endsWith('.html'));
copyDir(path.join(ROOT, 'ui'), path.join(OUT, 'ui'), n => n.endsWith('.css'));
fs.copyFileSync(path.join(ROOT, 'scripts.json'), path.join(OUT, 'scripts.json'));

const manifest = buildManifest();

fs.rmSync(TMP, { recursive: true, force: true });

const outFiles = [];
(function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else outFiles.push(p);
  }
})(OUT);

let total = 0;
for (const f of outFiles) total += fs.statSync(f).size;

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`MAPUS 构建完成  level=${LEVEL}  version=${manifest.version}`);
console.log(`资源文件 ${outFiles.length} 个，合计 ${kb(total)}`);
console.log(`JS 源 ${kb(stats.raw)} → 产物 ${kb(stats.out)}`);
const leaks = outFiles.filter(f => /\.(map|ts|tsx|jsx)$/.test(f));
console.log(leaks.length ? `⚠ 可疑残留：${leaks.map(f => path.relative(OUT, f)).join(', ')}` : '无 sourcemap / 源码残留');
