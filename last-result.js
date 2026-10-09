import {APP_VERSION,BUILD_ID,PROTOCOL_VERSION,MAX_PLAYERS,MAX_MATCH_BOTS,normalizeGameMode,normalizeMapId,mapSpec} from './game-config.js';
import {publicMatchState} from './match-model.js';
import {normalizePlayerName} from './player-name.js';
import {INFECTION} from './infection-rules.js';

export const LAST_RESULT_SCHEMA_VERSION=1;
export const LAST_RESULT_MAX_PLAYERS=MAX_PLAYERS+MAX_MATCH_BOTS;
const MAX_COUNT=1_000_000;
const MAX_TIMESTAMP=8_640_000_000_000_000;
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const count=(value,max=MAX_COUNT)=>Math.max(0,Math.min(max,Math.floor(finite(value))));
const text=(value,max)=>Array.from(String(value||'').replace(/[<>\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim()).slice(0,max).join('').trim();
const identity=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const stats=value=>Object.fromEntries(['conversions','assists','damage','supplies'].map(key=>[key,count(value?.[key],key==='damage'?1_000_000_000:MAX_COUNT)]));

function snapshotMatch(value,endedAt,practice){
  const match=publicMatchState(value,endedAt);
  for(const [key,number]of Object.entries(match))if(typeof number==='number')match[key]=count(number,key.endsWith('At')||key==='serverTime'?MAX_TIMESTAMP:1_000_000_000);
  match.status='ended';match.endedAt=endedAt;match.serverTime=endedAt;
  if(practice)Object.assign(match,{winner:'',winnerId:'',winnerName:'',reason:'host_return',restartAt:0,updatedAt:endedAt});
  return match;
}

function snapshotPlayers(values,mode){
  const players=[],seen=new Set();
  for(const value of (Array.isArray(values)?values:[]).slice(0,LAST_RESULT_MAX_PLAYERS)){
    if(players.length>=LAST_RESULT_MAX_PLAYERS)break;
    if(!value||mode==='zombies'&&(value.bot||value.zombie))continue;
    const id=identity(value.id??value.clientId);if(!id||seen.has(id))continue;seen.add(id);
    const player={id,name:normalizePlayerName(value.name),team:value.team==='red'?'red':'blue',bot:!!value.bot,kills:count(value.kills),deaths:count(value.deaths)};
    if(mode==='infection')Object.assign(player,{
      infectionStats:stats(value.infectionStats),infectionTotals:stats(value.infectionTotals),
      survivalMs:count(value.survivalMs,INFECTION.roundMs),survivalTotalMs:count(value.survivalTotalMs,INFECTION.roundMs*INFECTION.rounds),cash:count(value.cash,INFECTION.cashCap),
    });
    players.push(player);
  }
  return players;
}

export function createLastResult(meta,players,endedAt=Date.now(),{practice=false}={}){
  if(!meta?.match?.sessionId||!practice&&meta.match.status!=='ended'||practice&&meta.match.mode!=='sandbox')return null;
  const at=count(endedAt,MAX_TIMESTAMP),match=snapshotMatch(meta.match,at,practice),mapId=normalizeMapId(meta.mapId);
  return freeze({
    schemaVersion:LAST_RESULT_SCHEMA_VERSION,version:APP_VERSION,protocol:PROTOCOL_VERSION,buildId:BUILD_ID,
    sessionId:match.sessionId,endedAt:at,mapId,mapName:text(mapId==='custom-map'?meta.customMap?.name||'CUSTOM MAP':mapSpec(mapId).name,64),
    custom:!!meta.custom,completion:practice?'practice':'completed',match,players:snapshotPlayers(players,match.mode),
  });
}

export function restoreLastResult(value){
  try{
  if(!value||value.schemaVersion!==LAST_RESULT_SCHEMA_VERSION||value.match?.status!=='ended'||value.match.mode!==normalizeGameMode(value.match.mode)||!value.sessionId||value.sessionId!==value.match.sessionId||!['completed','practice'].includes(value.completion))return null;
  const endedAt=count(value.endedAt,MAX_TIMESTAMP),practice=value.completion==='practice';
  if(!endedAt||practice&&value.match.mode!=='sandbox')return null;
  const match=snapshotMatch(value.match,endedAt,practice);
  return freeze({
    schemaVersion:LAST_RESULT_SCHEMA_VERSION,version:text(value.version,24),protocol:count(value.protocol),buildId:text(value.buildId,40),
    sessionId:match.sessionId,endedAt,mapId:normalizeMapId(value.mapId),mapName:text(value.mapName,64),custom:!!value.custom,completion:value.completion,
    match,players:snapshotPlayers(value.players,match.mode),
  });
  }catch{return null;}
}
