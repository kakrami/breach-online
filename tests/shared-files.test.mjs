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

test('client and server match model copies are identical', async () => {
  const server = await readFile(resolve(root, '1_SERVER_REPO_UPLOAD/match-model.js'));
  const client = await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/match-model.js'));
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
  assert.equal(pkg.version, '1.17.0');
});


test('client startup assets are release-versioned and guarded against stale module cache', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  const rev = '1.17.0';
  assert.ok(client.includes(`./game-config.js?v=${rev}`));
  assert.ok(client.includes(`./world-geometry.js?v=${rev}`));
  assert.ok(client.includes(`./collision-grid.js?v=${rev}`));
  assert.ok(client.includes(`./audio-engine.js?v=${rev}`));
  assert.ok(client.includes(`./match-model.js?v=${rev}`));
  assert.ok(client.includes(`./vendor/three.module.min.js?v=${rev}`));
  assert.ok(client.includes('window.__breachModuleBooted=false'));
  assert.ok(client.includes('CLIENT MODULE LOAD FAILED · RETRYING'));
});

test('main menu does not expose the audio credits footer link', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  assert.equal(client.includes('>Audio Credits</a>'), false);
});

test('grenade detonation uses a bundled local explosion asset', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  assert.ok(client.includes("grenadeExplosion:Object.freeze({url:'audio/grenade-explosion.wav'"));
  assert.ok(client.includes("if(m.t==='explosion'){soundTacticalDetonation(m.kind||'sticky',m);"));
  const wav = await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/audio/grenade-explosion.wav'));
  assert.ok(wav.length > 8000);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
});



test('client state protocol sends normalized movement input and treats input changes as active state', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  assert.ok(client.includes("moveX:round3(input.mx),moveZ:round3(input.mz)"));
  assert.ok(client.includes("Math.abs(p.moveX-lastSentState.moveX)>.02"));
  assert.ok(client.includes("Math.abs(p.moveZ-lastSentState.moveZ)>.02"));
});

test('server movement no longer uses client-controlled movement credit', async () => {
  const worker = (await readFile(resolve(root, '1_SERVER_REPO_UPLOAD/worker.js'))).toString('utf8');
  assert.equal(worker.includes('moveCredit'), false);
  assert.ok(worker.includes('const maxUserDistance = allowedSpeed * inputMagnitude * elapsed'));
});

test('client projectile visuals reuse geometry and materials instead of reallocating per shot', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  assert.ok(client.includes('const bulletGeometryCache = new Map()'));
  assert.ok(client.includes('const bulletMaterialCache = new Map()'));
  assert.ok(client.includes('const bulletMeshPool = []'));
  assert.equal(client.includes('b.mesh.geometry.dispose();b.mesh.material.dispose()'), false);
});


test('audio engine uses bounded preload concurrency and only local generated cues', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  const engine = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/audio-engine.js'))).toString('utf8');
  const generator = (await readFile(resolve(root, '3_TOOLS/generate_8bit_audio.py'))).toString('utf8');
  assert.ok(engine.includes("Math.min(4, ids.length)"));
  assert.ok(engine.includes('await Promise.all(workers)'));
  assert.equal(/https?:\/\/[^'"\s]+\.(?:wav|ogg|mp3|flac|m4a|aac)/i.test(client), false);
  assert.ok(generator.includes('No downloaded samples or third-party audio'));
});

test('client exposes native match, loadout, minimap, and player settings behavior', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  assert.ok(client.includes("PRIMARY_WEAPONS.includes(m.self.primaryWeapon)"));
  assert.ok(client.includes("function teamScores(){return{blue:Math.max(0,Number(matchState.blueScore)"));
  assert.ok(client.includes("rmt.team!==myTeam&&now>=rmt.revealedUntil"));
  assert.ok(client.includes('id="settingsPanel"'));
  assert.equal(client.includes('drawDeathFlames'), false);
  assert.equal(client.includes('touchVisual.reloadUntil'), false);
  assert.equal(client.includes('touchVisual.swapUntil'), false);
  assert.ok(client.includes("else playSpatialCue(m.kind==='sticky'?'stickyThrow':'flashThrow'"));
  assert.equal(client.includes("if(m.t==='teamChange')"), false);
});

test('PWA manifest and visible branding match the release', async () => {
  const client = (await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/index.html'))).toString('utf8');
  const manifest = JSON.parse((await readFile(resolve(root, '2_CLIENT_REPO_UPLOAD/manifest.webmanifest'))).toString('utf8'));
  assert.equal(manifest.name, 'Breach v1.17.0');
  assert.equal(manifest.short_name, 'Breach');
  assert.ok(client.includes('<title>Breach v1.17.0</title>'));
  assert.equal(client.includes('Breachline'), false);
});
