import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
}

test('三个 version 字段始终一致', () => {
  const manifest = readJson('manifest.json');
  const rootPkg = readJson('package.json');
  const dshPkg = readJson('integrations', 'dsh-mapus', 'package.json');

  const versions = {
    'manifest.json': manifest.version,
    'package.json': rootPkg.version,
    'integrations/dsh-mapus/package.json': dshPkg.version,
  };

  const distinct = new Set(Object.values(versions));
  assert.equal(
    distinct.size,
    1,
    `版本号已经漂了：${JSON.stringify(versions, null, 2)}。改版本时这三个文件要一起改。`,
  );

  const version = Object.values(versions)[0];
  assert.match(version, /^\d+\.\d+\.\d+$/, `版本号格式不对：${version}`);
});
