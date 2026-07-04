// WTJ-20260704-074 — static delivery check for pre-generated TTS audio.
// Asserts every missing-audio.json entry marked status:"delivered" for the three TTS
// categories (secretWords / taskVoice / compositePhrases) has a real, non-empty .m4a
// on disk at the declared path. This is the "静态检查" gate (acceptance criterion 7):
// it fails loudly if a delivered path is missing/empty or a count regresses, so a
// packaging step or a future edit can't silently drop audio the app expects to play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_WEB = join(REPO, 'app', 'web');
const manifest = JSON.parse(readFileSync(join(APP_WEB, 'audio', 'missing-audio.json'), 'utf8'));

function deliveredPaths(entries, pathKey) {
  return entries.filter((e) => e.status === 'delivered').map((e) => e[pathKey]);
}

const words = deliveredPaths(manifest.secretWords, 'path');
const tasks = deliveredPaths(manifest.taskVoice, 'voicePromptPath');
const phrases = deliveredPaths(manifest.compositePhrases, 'path');

test('074: expected delivered TTS counts (101 words / 8 tasks / 10 phrases)', () => {
  assert.equal(words.length, 101, 'all 101 secret words delivered');
  assert.equal(tasks.length, 8, 'all 8 task prompts delivered');
  assert.equal(phrases.length, 10, 'all 10 composite phrases delivered');
});

test('074: every delivered TTS .m4a exists on disk and is non-empty', () => {
  const missing = [];
  const empty = [];
  for (const rel of [...words, ...tasks, ...phrases]) {
    const abs = join(APP_WEB, rel);
    if (!existsSync(abs)) { missing.push(rel); continue; }
    if (statSync(abs).size === 0) empty.push(rel);
  }
  assert.deepEqual(missing, [], `missing audio files: ${missing.join(', ')}`);
  assert.deepEqual(empty, [], `empty (0-byte) audio files: ${empty.join(', ')}`);
});

test('074: delivered paths follow the audio/{words,tasks,phrases}/<name>.m4a convention', () => {
  for (const rel of words) assert.match(rel, /^audio\/words\/[^/]+\.m4a$/, rel);
  for (const rel of tasks) assert.match(rel, /^audio\/tasks\/[^/]+\.m4a$/, rel);
  for (const rel of phrases) assert.match(rel, /^audio\/phrases\/[^/]+\.m4a$/, rel);
});
