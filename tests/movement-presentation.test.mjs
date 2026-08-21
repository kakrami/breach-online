import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../2_CLIENT_REPO_UPLOAD/index.html', import.meta.url), 'utf8');

test('local view height is decoupled from discrete collision support height', () => {
  assert.match(html, /let crouchWanted=false,crouched=false,crouchBlend=0,viewFeetY=NaN/);
  assert.match(html, /function updateViewVertical\(dt\)/);
  assert.match(html, /camera\.position\.set\(position\.x,viewY\+/);
  assert.doesNotMatch(html, /camera\.position\.set\(position\.x,position\.y\+THREE\.MathUtils\.lerp\(PLAYER_HEIGHT,CROUCH_HEIGHT,crouchBlend\)/);
});

test('crouch presentation uses eased view motion while collision stance stays immediate', () => {
  assert.match(html, /const CROUCH_VIEW_RATE = 13/);
  assert.match(html, /crouchBlend=expFollow\(crouchBlend,target,CROUCH_VIEW_RATE/);
  assert.match(html, /stanceEase=smoothstep01\(crouchBlend\)/);
  assert.match(html, /function currentPlayerHeight\(\)\{return crouched\?CROUCH_HEIGHT:PLAYER_HEIGHT;\}/);
});

test('ground steps and airborne motion use distinct vertical presentation rates', () => {
  assert.match(html, /const GROUND_VIEW_UP_RATE = 11\.5/);
  assert.match(html, /const GROUND_VIEW_DOWN_RATE = 9\.0/);
  assert.match(html, /const AIR_VIEW_RATE = 28/);
  assert.match(html, /const rate=onGround\?\(target>=viewFeetY\?GROUND_VIEW_UP_RATE:GROUND_VIEW_DOWN_RATE\):AIR_VIEW_RATE/);
});

test('remote player network following remains combat-tight', () => {
  assert.match(html, /const netFollow=1-Math\.exp\(-dt\*28\);r\.group\.position\.lerp\(r\.target,netFollow\)/);
  assert.doesNotMatch(html, /REMOTE_GROUND_Y_RATE|REMOTE_AIR_Y_RATE/);
});
