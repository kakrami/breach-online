import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

test('client and server game config copies are identical', async () => {
  const server = await readFile(resolve(root, '1_SERVER_REPO_UPLOAD/game-config.js'));
  const client = await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/game-config.js'));
  assert.equal(hash(server), hash(client));
});

test('client and server world geometry copies are identical', async () => {
  const server = await readFile(resolve(root, '1_SERVER_REPO_UPLOAD/world-geometry.js'));
  const client = await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/world-geometry.js'));
  assert.equal(hash(server), hash(client));
});
