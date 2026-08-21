import { DEFAULT_MATCH_RULES } from './game-config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeMatchRules(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    scoreLimit: clamp(Math.floor(finiteNumber(v.scoreLimit, DEFAULT_MATCH_RULES.scoreLimit)), 5, 100),
    timeLimitMs: clamp(Math.round(finiteNumber(v.timeLimitMs, DEFAULT_MATCH_RULES.timeLimitMs)), 2 * 60 * 1000, 30 * 60 * 1000),
  };
}

export function defaultMatchState(now = Date.now(), rules = DEFAULT_MATCH_RULES) {
  const normalized = normalizeMatchRules(rules);
  return {
    status: 'waiting',
    round: 1,
    blueScore: 0,
    redScore: 0,
    scoreLimit: normalized.scoreLimit,
    timeLimitMs: normalized.timeLimitMs,
    warmupEndsAt: 0,
    startedAt: 0,
    endsAt: 0,
    endedAt: 0,
    restartAt: 0,
    winner: '',
    reason: '',
    updatedAt: now,
  };
}

export function normalizeMatchState(value, now = Date.now(), rules = DEFAULT_MATCH_RULES) {
  const def = defaultMatchState(now, rules);
  const v = value && typeof value === 'object' ? value : {};
  const status = ['waiting', 'warmup', 'active', 'ended'].includes(String(v.status)) ? String(v.status) : def.status;
  const scoreLimit = clamp(Math.floor(finiteNumber(v.scoreLimit, def.scoreLimit)), 5, 100);
  const timeLimitMs = clamp(Math.round(finiteNumber(v.timeLimitMs, def.timeLimitMs)), 2 * 60 * 1000, 30 * 60 * 1000);
  return {
    status,
    round: Math.max(1, Math.floor(finiteNumber(v.round, def.round))),
    blueScore: Math.max(0, Math.floor(finiteNumber(v.blueScore, 0))),
    redScore: Math.max(0, Math.floor(finiteNumber(v.redScore, 0))),
    scoreLimit,
    timeLimitMs,
    warmupEndsAt: Math.max(0, finiteNumber(v.warmupEndsAt, 0)),
    startedAt: Math.max(0, finiteNumber(v.startedAt, 0)),
    endsAt: Math.max(0, finiteNumber(v.endsAt, 0)),
    endedAt: Math.max(0, finiteNumber(v.endedAt, 0)),
    restartAt: Math.max(0, finiteNumber(v.restartAt, 0)),
    winner: ['blue', 'red', 'draw'].includes(String(v.winner)) ? String(v.winner) : '',
    reason: String(v.reason || '').slice(0, 24),
    updatedAt: Math.max(0, finiteNumber(v.updatedAt, now)),
  };
}

export function publicMatchState(value, now = Date.now()) {
  const match = normalizeMatchState(value, now, value);
  return { ...match, serverTime: now };
}

export function matchRulesAreDefault(match) {
  const normalized = normalizeMatchState(match, Date.now(), match);
  return normalized.scoreLimit === DEFAULT_MATCH_RULES.scoreLimit && normalized.timeLimitMs === DEFAULT_MATCH_RULES.timeLimitMs;
}
