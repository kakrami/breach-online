import { DEFAULT_MATCH_RULES } from './game-config.js';

const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const number = (value,fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeMatchRules(value) {
  const v=value&&typeof value==='object'?value:{};
  return {
    scoreLimit:clamp(Math.floor(number(v.scoreLimit,DEFAULT_MATCH_RULES.scoreLimit)),5,100),
    timeLimitMs:clamp(Math.round(number(v.timeLimitMs,DEFAULT_MATCH_RULES.timeLimitMs)),120000,1800000),
  };
}

export function defaultMatchState(now=Date.now(),rules=DEFAULT_MATCH_RULES) {
  const r=normalizeMatchRules(rules);
  return {status:'waiting',round:1,blueScore:0,redScore:0,scoreLimit:r.scoreLimit,timeLimitMs:r.timeLimitMs,warmupEndsAt:0,startedAt:0,endsAt:0,endedAt:0,restartAt:0,winner:'',reason:'',updatedAt:now};
}

export function normalizeMatchState(value,now=Date.now(),rules=DEFAULT_MATCH_RULES) {
  const v=value&&typeof value==='object'?value:{},def=defaultMatchState(now,rules);
  return {
    status:['waiting','warmup','active','ended'].includes(v.status)?v.status:def.status,
    round:Math.max(1,Math.floor(number(v.round,def.round))),
    blueScore:Math.max(0,Math.floor(number(v.blueScore))),
    redScore:Math.max(0,Math.floor(number(v.redScore))),
    scoreLimit:clamp(Math.floor(number(v.scoreLimit,def.scoreLimit)),5,100),
    timeLimitMs:clamp(Math.round(number(v.timeLimitMs,def.timeLimitMs)),120000,1800000),
    warmupEndsAt:Math.max(0,number(v.warmupEndsAt)),startedAt:Math.max(0,number(v.startedAt)),endsAt:Math.max(0,number(v.endsAt)),
    endedAt:Math.max(0,number(v.endedAt)),restartAt:Math.max(0,number(v.restartAt)),
    winner:['blue','red','draw'].includes(v.winner)?v.winner:'',reason:String(v.reason||'').slice(0,24),updatedAt:Math.max(0,number(v.updatedAt,now)),
  };
}

export function publicMatchState(value,now=Date.now()) { return {...value,serverTime:now}; }
export function matchRulesAreDefault(match) { return match.scoreLimit===DEFAULT_MATCH_RULES.scoreLimit&&match.timeLimitMs===DEFAULT_MATCH_RULES.timeLimitMs; }
