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


test('client websocket URL never contains permanent identity credentials', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  const socketLines = client.split('\n').filter((line) => line.includes('new WebSocket') || line.includes('/socket?'));
  assert.ok(socketLines.some((line) => line.includes('ticket=')));
  for (const line of socketLines) {
    assert.equal(line.includes('auth='), false);
    assert.equal(line.includes('client='), false);
  }
});

test('server package uses the breach-online Worker name', async () => {
  const pkg = JSON.parse((await readFile(resolve(root, '1_SERVER_REPO_UPLOAD/package.json'))).toString('utf8'));
  assert.equal(pkg.name, 'breach-online');
  assert.equal(pkg.version, '1.16.20');
});


test('client startup assets are release-versioned and guarded against stale module cache', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  const rev = '1.16.20';
  assert.ok(client.includes(`./game-config.js?v=${rev}`));
  assert.ok(client.includes(`./world-geometry.js?v=${rev}`));
  assert.ok(client.includes(`./collision-grid.js?v=${rev}`));
  assert.ok(client.includes(`./vendor/three.module.min.js?v=${rev}`));
  assert.ok(client.includes('window.__breachModuleBooted=false'));
  assert.ok(client.includes('CLIENT MODULE LOAD FAILED · RETRYING'));
});
