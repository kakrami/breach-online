export const MATCH_STATUS = Object.freeze({
  WAITING:'waiting',
  WARMUP:'warmup',
  ACTIVE:'active',
  ENDED:'ended',
});

export const MATCH_STATUS_VALUES = Object.freeze(Object.values(MATCH_STATUS));

export function normalizeMatchStatus(value){
  const status=String(value||'').toLowerCase();
  return MATCH_STATUS_VALUES.includes(status)?status:MATCH_STATUS.WAITING;
}

export function matchAllowsLobbyEdits(value){return normalizeMatchStatus(value?.status??value)===MATCH_STATUS.WAITING;}
export function matchAllowsMovement(value){return normalizeMatchStatus(value?.status??value)===MATCH_STATUS.ACTIVE;}
export function matchAllowsCombat(value){return normalizeMatchStatus(value?.status??value)===MATCH_STATUS.ACTIVE;}
export function matchAllowsRespawn(value){return normalizeMatchStatus(value?.status??value)===MATCH_STATUS.ACTIVE;}
export function matchPreservesReconnectPosition(value){const status=normalizeMatchStatus(value?.status??value);return status===MATCH_STATUS.ACTIVE||status===MATCH_STATUS.ENDED;}
export function matchIsFrozen(value){return !matchAllowsMovement(value);}

export function matchPhaseChanged(previous,next){
  return normalizeMatchStatus(previous?.status??previous)!==normalizeMatchStatus(next?.status??next);
}
