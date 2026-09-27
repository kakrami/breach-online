// blue/red remain stable protocol/storage IDs for backward compatibility. Alpha/Bravo are user-facing faction labels.
export const TEAM_IDS=Object.freeze(['blue','red']);
export const TEAM_META=Object.freeze({
  blue:Object.freeze({id:'blue',key:'alpha',label:'ALPHA'}),
  red:Object.freeze({id:'red',key:'bravo',label:'BRAVO'}),
});
export function normalizeTeam(value){const v=String(value||'').trim().toLowerCase();return v==='red'||v==='bravo'?'red':'blue';}
export function otherTeam(value){return normalizeTeam(value)==='red'?'blue':'red';}
export function teamLabel(value){return TEAM_META[normalizeTeam(value)].label;}
export function teamKey(value){return TEAM_META[normalizeTeam(value)].key;}
