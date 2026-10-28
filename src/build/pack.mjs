import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');
const KEY = path.join(__dirname, 'mapus.pem');

const isWin = process.platform === 'win32';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
if (!chrome) {
  console.error('找不到 Chrome / Chromium，请设置环境变量 CHROME_PATH 指向浏览器可执行文件');
  process.exit(1);
}

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
  console.error('dist 不存在，先执行 npm run build');
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8')).version;
fs.mkdirSync(RELEASE, { recursive: true });

const crxTmp = path.join(ROOT, 'dist.crx');
const pemTmp = path.join(ROOT, 'dist.pem');
for (const stale of [crxTmp, pemTmp]) {
  if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
}

const hasKey = fs.existsSync(KEY);
const native = target => (isWin ? target.replace(/\//g, '\\') : target);
const args = ['--no-message-box', `--pack-extension=${native(DIST)}`];
if (hasKey) args.push(`--pack-extension-key=${native(KEY)}`);

try {
  execFileSync(chrome, args, { stdio: 'ignore' });
} catch (error) {
  if (!fs.existsSync(crxTmp)) {
    console.error(`浏览器打包失败：${error.message}`);
    process.exit(1);
  }
}

if (!fs.existsSync(crxTmp)) {
  console.error('浏览器没有产出 dist.crx，检查是否被安全软件拦截');
  process.exit(1);
}

if (!hasKey) {
  if (!fs.existsSync(pemTmp)) {
    console.error('首次打包未生成私钥，检查浏览器输出');
    process.exit(1);
  }
  fs.renameSync(pemTmp, KEY);
  console.log('');
  console.log('⚠️  已生成新的签名私钥 build/mapus.pem');
  console.log('    这把钥匙决定扩展 ID：新私钥 = 新扩展 ID，老用户必须卸载重装才能升级。');
  console.log('    如果之前已经发布过，请把旧的 mapus.pem 放回 build/ 再重跑一次，');
  console.log('    否则装在别人机器上的扩展不会认这个包。');
}

const crxOut = path.join(RELEASE, `MAPUS-${version}.crx`);
fs.rmSync(crxOut, { force: true });
fs.renameSync(crxTmp, crxOut);
if (fs.existsSync(pemTmp)) fs.rmSync(pemTmp, { force: true });

function extensionId(pemPath) {
  const key = crypto.createPrivateKey(fs.readFileSync(pemPath));
  const der = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
  const hash = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  return hash.split('').map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const buffer = fs.readFileSync(crxOut);
const sha = crypto.createHash('sha256').update(buffer).digest('hex');

console.log('');
console.log(`CRX      ${path.relative(ROOT, crxOut)}  ${(buffer.length / 1024).toFixed(1)} KB`);
console.log(`版本     ${version}`);
console.log(`扩展 ID  ${extensionId(KEY)}`);
console.log(`SHA-256  ${sha}`);
