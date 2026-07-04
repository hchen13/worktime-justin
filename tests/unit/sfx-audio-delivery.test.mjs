// WTJ-20260704-075 — static delivery check for the SFX audio pack.
// Asserts every missing-audio.json sfx entry is status:"delivered" with a real,
// non-empty .m4a on disk at the declared path, and that audio.js's DEFAULT_SFX_MAP
// keys are all covered by delivered files. This is the "静态检查" gate (criterion 6):
// it fails loudly if a delivered SFX path is missing/empty, if any key is still
// not-delivered, or if the manifest and the on-disk set drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_WEB = join(REPO, 'app', 'web');
const manifest = JSON.parse(readFileSync(join(APP_WEB, 'audio', 'missing-audio.json'), 'utf8'));
const sfx = manifest.sfx;

test('075: all SFX entries are delivered (≥20, none not-delivered)', () => {
  assert.ok(sfx.length >= 20, `expected >=20 sfx keys, got ${sfx.length}`);
  const notDelivered = sfx.filter((e) => e.status !== 'delivered').map((e) => e.sfxKey);
  assert.deepEqual(notDelivered, [], `still not-delivered: ${notDelivered.join(', ')}`);
});

test('075: every delivered SFX .m4a exists on disk and is non-empty', () => {
  const missing = [];
  const empty = [];
  for (const e of sfx) {
    const abs = join(APP_WEB, e.path);
    if (!existsSync(abs)) { missing.push(e.path); continue; }
    if (statSync(abs).size === 0) empty.push(e.path);
  }
  assert.deepEqual(missing, [], `missing SFX files: ${missing.join(', ')}`);
  assert.deepEqual(empty, [], `empty (0-byte) SFX files: ${empty.join(', ')}`);
});

test('075: SFX paths follow the flat audio/sfx/<key>.m4a convention', () => {
  for (const e of sfx) {
    assert.match(e.path, /^audio\/sfx\/[^/]+\.m4a$/, e.path);
    assert.equal(e.path, `audio/sfx/${e.sfxKey}.m4a`, `path/key mismatch for ${e.sfxKey}`);
  }
});

test('075: audio.js DEFAULT_SFX_MAP keys are all backed by a delivered file', () => {
  const audioJs = readFileSync(join(APP_WEB, 'audio.js'), 'utf8');
  const start = audioJs.indexOf('DEFAULT_SFX_MAP');
  assert.ok(start !== -1, 'DEFAULT_SFX_MAP present in audio.js');
  const block = audioJs.slice(start, audioJs.indexOf('}', start));
  const keys = [...block.matchAll(/'([a-z0-9-]+)'\s*:/g)].map((m) => m[1]);
  const onDisk = new Set(readdirSync(join(APP_WEB, 'audio', 'sfx')).map((f) => f.replace(/\.m4a$/, '')));
  const uncovered = keys.filter((k) => !onDisk.has(k));
  assert.deepEqual(uncovered, [], `DEFAULT_SFX_MAP keys without a delivered file: ${uncovered.join(', ')}`);
});
