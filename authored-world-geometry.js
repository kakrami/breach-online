const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clampNumber=(v,a,b,f)=>clamp(finite(v,f),a,b);
const normalizeRot=v=>{let r=finite(v)%360;if(r<0)r+=360;return r;};
const rotatePoint=(x,z,cx,cz,rot)=>{const a=normalizeRot(rot)*Math.PI/180,c=Math.cos(a),ss=Math.sin(a),dx=x-cx,dz=z-cz;return{x:cx+dx*c-dz*ss,z:cz+dx*ss+dz*c};};
const rotateVector=(x,z,rot)=>{const a=normalizeRot(rot)*Math.PI/180,c=Math.cos(a),ss=Math.sin(a);return{x:x*c-z*ss,z:x*ss+z*c};};
const orientedAabb=(x,z,w,d,rot=0)=>{const a=normalizeRot(rot)*Math.PI/180,c=Math.abs(Math.cos(a)),ss=Math.abs(Math.sin(a)),hx=w/2*c+d/2*ss,hz=w/2*ss+d/2*c;return{minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz};};
function sanitizeStaticBoxes(list){return (Array.isArray(list)?list:[]).map(o=>({x:finite(o?.x),z:finite(o?.z),w:clampNumber(o?.w,.2,100,2),d:clampNumber(o?.d,.2,100,2),h:clampNumber(o?.h,.2,50,2),rot:normalizeRot(o?.rot),yOffset:clampNumber(o?.yOffset,-20,40,0),...(o?.kind?{kind:String(o.kind)}:{})}));}
function sanitizeRoads(list){const kinds=new Set(['street','alley','service','dirt','sidewalk','crosswalk']);return (Array.isArray(list)?list:[]).map(o=>{let w=clampNumber(o?.w,2,300,20),d=clampNumber(o?.d,2,300,8),rot=normalizeRot(o?.rot);if(o?.rot==null&&d>w){[w,d]=[d,w];rot=90;}return{kind:kinds.has(String(o?.kind))?String(o.kind):'street',x:finite(o?.x),z:finite(o?.z),w,d,rot};});}
function sanitizeBuildings(list){return (Array.isArray(list)?list:[]).map(b=>{let balcony=finite(b?.balcony,4);if(balcony<1.8||balcony>8)balcony=4;const levels=Math.max(2,Math.min(6,Math.round(finite(b?.levels,2))));return{x:finite(b?.x),z:finite(b?.z),w:clampNumber(b?.w,10,60,18),d:clampNumber(b?.d,9,50,14),floorH:clampNumber(b?.floorH,2.7,4.2,3.1),balcony,levels,rot:normalizeRot(b?.rot),yOffset:clampNumber(b?.yOffset,-20,40,0),...((b?.tall||levels>=4)?{tall:true}:{}),style:String(b?.style||'industrial')};});}
function sanitizeTerrainModifiers(list){const kinds=new Set(['hill','valley','plateau','pit']);return (Array.isArray(list)?list:[]).map(o=>({kind:kinds.has(String(o?.kind))?String(o.kind):'hill',x:finite(o?.x),z:finite(o?.z),radius:clampNumber(o?.radius,3,100,16),height:clampNumber(o?.height,-24,30,(o?.kind==='valley'||o?.kind==='pit')?-3:3)}));}
function sanitizeAuthoredHeightfield(raw,arena){if(!raw||typeof raw!=='object')return null;const size=Math.max(9,Math.min(129,Math.round(finite(raw.size,0)))),extent=clampNumber(raw.extent,20,arena,arena),values=Array.isArray(raw.values)?raw.values:null;if(!values||values.length!==size*size)return null;return Object.freeze({size,extent,values:Object.freeze(values.map(v=>clampNumber(v,-30,30,0)))});}
function sampleAuthoredHeightfield(hf,x,z){if(!hf)return 0;const n=hf.size,e=hf.extent,u=clamp((finite(x)+e)/(e*2)*(n-1),0,n-1),v=clamp((finite(z)+e)/(e*2)*(n-1),0,n-1),x0=Math.floor(u),z0=Math.floor(v),x1=Math.min(n-1,x0+1),z1=Math.min(n-1,z0+1),tx=u-x0,tz=v-z0,a=hf.values[z0*n+x0],b=hf.values[z0*n+x1],c=hf.values[z1*n+x0],d=hf.values[z1*n+x1];return(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz;}
function sanitizeAuthoredMaterials(raw,arena){if(!raw||typeof raw!=='object')return null;const size=Math.max(9,Math.min(129,Math.round(finite(raw.size,0)))),extent=clampNumber(raw.extent,20,arena,arena),values=Array.isArray(raw.values)?raw.values:null;if(!values||values.length!==size*size)return null;return Object.freeze({size,extent,values:Object.freeze(values.map(v=>Math.max(0,Math.min(8,Math.round(finite(v,0))))))});}
function sampleAuthoredMaterial(surface,x,z){if(!surface)return 0;const n=surface.size,e=surface.extent,u=clamp((finite(x)+e)/(e*2)*(n-1),0,n-1),v=clamp((finite(z)+e)/(e*2)*(n-1),0,n-1),ix=Math.max(0,Math.min(n-1,Math.round(u))),iz=Math.max(0,Math.min(n-1,Math.round(v)));return surface.values[iz*n+ix]||0;}
function sanitizeElevation(list){const kinds=new Set(['platform','ramp','stairs','overpass']);return (Array.isArray(list)?list:[]).map(o=>({kind:kinds.has(String(o?.kind))?String(o.kind):'platform',x:finite(o?.x),z:finite(o?.z),w:clampNumber(o?.w,2,80,8),d:clampNumber(o?.d,2,100,10),rise:clampNumber(o?.rise,.5,24,3),rot:normalizeRot(o?.rot),yOffset:clampNumber(o?.yOffset,-20,40,0)}));}
function sanitizePyramids(list){return (Array.isArray(list)?list:[]).map(p=>({x:finite(p?.x),z:finite(p?.z),base:clampNumber(p?.base,2,80,8),h:clampNumber(p?.h,.5,40,4)}));}
function sanitizeNatural(list){return (Array.isArray(list)?list:[]).map(o=>({type:['tree','bush','rock'].includes(String(o?.type))?String(o.type):'rock',x:finite(o?.x),z:finite(o?.z),r:clampNumber(o?.r,.2,20,1),h:clampNumber(o?.h,.2,40,1)}));}
function sanitizeFlow(list){return (Array.isArray(list)?list:[]).map(p=>({x:finite(p?.x),z:finite(p?.z)}));}
function sanitizeLadders(list){return (Array.isArray(list)?list:[]).map((l,i)=>({id:String(l?.id||`ladder-${i+1}`),x:finite(l?.x),z:finite(l?.z),nx:finite(l?.nx),nz:finite(l?.nz),tx:finite(l?.tx),tz:finite(l?.tz),width:clampNumber(l?.width,.5,4,1.2),bottomY:finite(l?.bottomY),topY:finite(l?.topY,3)})).filter(l=>l.topY>l.bottomY+.4);}
function authoredMinimapLimit(def,arena){let extent=0;const take=(x,z,pad=0)=>{extent=Math.max(extent,Math.abs(finite(x))+pad,Math.abs(finite(z))+pad);};const rect=(o)=>take(o.x,o.z,Math.abs(finite(o.rot))>1e-6?Math.hypot(finite(o.w),finite(o.d))/2:Math.max(finite(o.w),finite(o.d))/2);for(const o of def?.roads||[])rect(o);for(const o of def?.staticBoxes||[])rect(o);for(const b of def?.buildings||[])rect(b);for(const e of def?.elevationObjects||def?.elevation||[])rect(e);for(const t of def?.terrain?.modifiers||def?.terrainModifiers||[])take(t.x,t.z,finite(t.radius));for(const p of def?.pyramids||[])take(p.x,p.z,finite(p.base)/2);for(const o of def?.naturalObstacles||[])take(o.x,o.z,finite(o.r));for(const team of Object.values(def?.spawnSets||{}))for(const p of Array.isArray(team)?team:[])if(Array.isArray(p)&&p.length>=2)take(p[0],p[1]);return Math.min(arena,Math.max(12,finite(def?.minimapLimit,arena),Math.min(arena,extent+6)));}

function terrainPresetHeight(preset,x,z){const key=String(preset||'flat').toLowerCase();if(key==='highlands'){const rolling=.55+1.15*Math.sin(x*.031)*Math.cos(z*.027)+.72*Math.sin((x+z)*.021)+.48*Math.cos((x-z)*.018),westRidge=8.8*Math.exp(-((x+62)**2)/1150)*Math.exp(-((z-20)**2)/6200),northHill=10.5*Math.exp(-((x-34)**2+(z-68)**2)/1450),southHill=7.2*Math.exp(-((x+20)**2+(z+67)**2)/1200),eastRise=6.5*Math.exp(-((x-78)**2+(z+10)**2)/1750),centerKnoll=4.4*Math.exp(-((x-8)**2+(z-4)**2)/900),valley=4*Math.exp(-((x+12)**2+(z-34)**2)/1050);return clamp(rolling+westRidge+northHill+southHill+eastRise+centerKnoll-valley,-2.4,13.8);}if(key==='depot'||key==='freight-depot'){const slab=.42+.24*Math.sin(x*.026)*Math.cos(z*.024)+.18*Math.sin((x-z)*.018),west=2.8*Math.exp(-((x+98)**2)/520)*Math.exp(-(z*z)/7600),east=2.5*Math.exp(-((x-100)**2)/520)*Math.exp(-(z*z)/7600),north=2.2*Math.exp(-((z-103)**2)/620)*Math.exp(-(x*x)/8200),south=2.4*Math.exp(-((z+102)**2)/620)*Math.exp(-(x*x)/8200),rise=1.35*Math.exp(-((x+48)**2+(z-56)**2)/1250)+1.05*Math.exp(-((x-54)**2+(z+56)**2)/1100),drain=1.15*Math.exp(-((x-2)**2)/280)*Math.exp(-((z+2)**2)/6800);return clamp(slab+west+east+north+south+rise-drain,-1,5.2);}if(key==='yard'||key==='container-yard'){return clamp(.18+.035*Math.sin(x*.11)+.028*Math.cos(z*.09)+.018*Math.sin((x+z)*.07),.08,.30);}if(key==='rig'||key==='dust-rig'){const base=.22+.055*Math.sin(x*.055)*Math.cos(z*.047)+.032*Math.sin((x-z)*.071),edge=.42*Math.max(0,(Math.max(Math.abs(x),Math.abs(z))-43)/12);return clamp(base+edge,.10,.72);}return 0;}

export function createAuthoredWorldGeometry(def={}){
  const PLAYER_HEIGHT = 1.7;
  const PLAYER_RADIUS = 0.38;
  const ARENA_LIMIT = clampNumber(def?.arenaLimit,40,300,120);
  const MINIMAP_LIMIT = authoredMinimapLimit(def,ARENA_LIMIT);
  const MAX_STEP_HEIGHT = 0.62;
  const CROUCH_WINDOW_STEP_HEIGHT = 0.86;
  
  const ROADS = sanitizeRoads(def?.roads);
  
  const STATIC_BOXES = sanitizeStaticBoxes(def?.staticBoxes);
  
  const BUILDINGS = sanitizeBuildings(def?.buildings);
  const AUTHORED_HEIGHTFIELD = sanitizeAuthoredHeightfield(def?.terrain?.heightfield||def?.heightfield,ARENA_LIMIT);
  const AUTHORED_MATERIAL_SURFACE = sanitizeAuthoredMaterials(def?.terrain?.materials||def?.materials,ARENA_LIMIT);
  const AUTHORED_ENVIRONMENT = Object.freeze({...((def?.environment&&typeof def.environment==='object')?def.environment:{})});
  const TERRAIN_MODIFIERS = Object.freeze(sanitizeTerrainModifiers(def?.terrain?.modifiers||def?.terrainModifiers).map(o=>Object.freeze(o)));
  const ELEVATION_OBJECTS = Object.freeze(sanitizeElevation(def?.elevationObjects||def?.elevation).map(o=>Object.freeze(o)));
  
  const PYRAMIDS = sanitizePyramids(def?.pyramids);
  
  const NATURAL_OBSTACLES = sanitizeNatural(def?.naturalObstacles);
  
  const COMBAT_FLOW_NODES = Object.freeze(sanitizeFlow(def?.combatFlowNodes).map(p=>Object.freeze(p)));
  
  const SUPPORT_CONTACT_RADIUS = 0.075;
  const CEILING_HEAD_RADIUS = 0.22;
  
  function terrainStampWeight(m,x,z){const r=Math.max(2,m.radius),d=Math.hypot(x-m.x,z-m.z),t=clamp(d/r,0,1);if(t>=1)return 0;if(m.kind==='plateau'){if(t<=.55)return 1;const q=(t-.55)/.45;return 1-(q*q*(3-2*q));}const q=1-t;return q*q*(3-2*q);}
  function rawTerrainHeight(x,z){let h=terrainPresetHeight(def?.terrain?.preset||def?.theme||'flat',x,z)+sampleAuthoredHeightfield(AUTHORED_HEIGHTFIELD,x,z);for(const m of TERRAIN_MODIFIERS)h+=m.height*terrainStampWeight(m,x,z);return clamp(h,-30,36);}
  function groundMaterialCode(x,z){return sampleAuthoredMaterial(AUTHORED_MATERIAL_SURFACE,x,z);}
  
  function localPoint(o,x,z){const a=-normalizeRot(o.rot)*Math.PI/180,c=Math.cos(a),ss=Math.sin(a),dx=x-o.x,dz=z-o.z;return{x:dx*c-dz*ss,z:dx*ss+dz*c};}
  function worldPoint(o,lx,lz){const a=normalizeRot(o.rot)*Math.PI/180,c=Math.cos(a),ss=Math.sin(a);return{x:o.x+lx*c-lz*ss,z:o.z+lx*ss+lz*c};}
  function median(values){const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
  function supportProfile(o,isBuilding=false){const pts=[[0,0],[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[0,-.5],[.5,0],[0,.5],[-.5,0]].map(([u,v])=>worldPoint(o,u*o.w,v*o.d)),hs=pts.map(p=>rawTerrainHeight(p.x,p.z)),level=median(hs),blend=isBuilding?clamp(Math.max(o.w,o.d)*.18,2.5,6):clamp(Math.max(o.w,o.d)*.14,1.25,3.5);return{o,level,blend,active:Math.abs(o.yOffset)<.05};}
  function roadProfile(o){const a=worldPoint(o,-o.w/2,0),b=worldPoint(o,o.w/2,0);return{o,h0:rawTerrainHeight(a.x,a.z),h1:rawTerrainHeight(b.x,b.z),shoulder:clamp(o.d*.28,1.2,3),endBlend:clamp(o.d*.2,.8,2)};}
  const supportProfiles=[...STATIC_BOXES.map(o=>supportProfile(o,false)),...BUILDINGS.map(o=>supportProfile(o,true))],roadProfiles=ROADS.map(roadProfile);
  
  const TERRAIN_SIZE = Math.max(244,ARENA_LIMIT*2+4);
  const TERRAIN_SEGMENTS = 128;
  const TERRAIN_HALF = TERRAIN_SIZE / 2;
  const TERRAIN_STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS;
  
  function sourceTerrainHeight(x,z){
    const raw=rawTerrainHeight(x,z);let ground=raw,roadWeight=0,roadSum=0,maxRoadWeight=0;
    for(const p of roadProfiles){const q=localPoint(p.o,x,z),ox=Math.max(Math.abs(q.x)-p.o.w/2,0),oz=Math.max(Math.abs(q.z)-p.o.d/2,0);if(ox>=p.endBlend||oz>=p.shoulder)continue;const tx=ox<=0?1:1-clamp(ox/p.endBlend,0,1),tz=oz<=0?1:1-clamp(oz/p.shoulder,0,1),wx=tx*tx*(3-2*tx),wz=tz*tz*(3-2*tz),w=wx*wz;if(w<=0)continue;const t=clamp(q.x/p.o.w+.5,0,1),target=p.h0+(p.h1-p.h0)*t;roadSum+=target*w;roadWeight+=w;maxRoadWeight=Math.max(maxRoadWeight,w);}
    if(roadWeight>0)ground=raw+(roadSum/roadWeight-raw)*clamp(maxRoadWeight,0,1);
    let best=null,bestWeight=0;for(const p of supportProfiles){if(!p.active)continue;const q=localPoint(p.o,x,z),ox=Math.max(Math.abs(q.x)-p.o.w/2,0),oz=Math.max(Math.abs(q.z)-p.o.d/2,0),dist=Math.hypot(ox,oz);if(dist>=p.blend)continue;const t=clamp(dist/p.blend,0,1),w=1-(t*t*(3-2*t));if(w>bestWeight){bestWeight=w;best=p;}}
    return best?ground+(best.level-ground)*bestWeight:ground;
  }
  
  // The rendered terrain mesh is the physical terrain. Heights are sampled once
  // at the exact PlaneGeometry vertices and every physics query interpolates the
  // same two triangles Three.js renders. This removes the old split where the
  // camera/player used an analytic surface that could differ from the visible
  // mesh by tens of centimeters around flattened foundations.
  const TERRAIN_HEIGHTFIELD = new Float32Array((TERRAIN_SEGMENTS+1)*(TERRAIN_SEGMENTS+1));
  for(let iz=0;iz<=TERRAIN_SEGMENTS;iz++)for(let ix=0;ix<=TERRAIN_SEGMENTS;ix++){
    const x=-TERRAIN_HALF+ix*TERRAIN_STEP,z=-TERRAIN_HALF+iz*TERRAIN_STEP;
    TERRAIN_HEIGHTFIELD[iz*(TERRAIN_SEGMENTS+1)+ix]=sourceTerrainHeight(x,z);
  }
  
  function terrainVertexHeight(ix,iz){
    const x=Math.max(0,Math.min(TERRAIN_SEGMENTS,Math.floor(Number(ix)||0)));
    const z=Math.max(0,Math.min(TERRAIN_SEGMENTS,Math.floor(Number(iz)||0)));
    return TERRAIN_HEIGHTFIELD[z*(TERRAIN_SEGMENTS+1)+x];
  }
  
  function terrainHeight(x,z){
    const gx=clamp((Number(x)+TERRAIN_HALF)/TERRAIN_STEP,0,TERRAIN_SEGMENTS);
    const gz=clamp((Number(z)+TERRAIN_HALF)/TERRAIN_STEP,0,TERRAIN_SEGMENTS);
    const ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz));
    const fx=gx-ix,fz=gz-iz,row=TERRAIN_SEGMENTS+1;
    const a=TERRAIN_HEIGHTFIELD[iz*row+ix],b=TERRAIN_HEIGHTFIELD[iz*row+ix+1];
    const c=TERRAIN_HEIGHTFIELD[(iz+1)*row+ix],d=TERRAIN_HEIGHTFIELD[(iz+1)*row+ix+1];
    if(fx+fz<=1)return a+fx*(b-a)+fz*(c-a);
    return d+(1-fx)*(c-d)+(1-fz)*(b-d);
  }
  
  function makeStaticGeometry(o){
    const base=terrainHeight(o.x,o.z)+o.yOffset,parts=[];
    const toWorld=(lx,lz)=>worldPoint(o,lx,lz);
    const addBox=(role,lx,lz,w,d,bottomY,topY,flags={})=>{const p=toWorld(lx,lz);parts.push({type:'box',role,x:p.x,z:p.z,w,d,rot:o.rot,minY:bottomY,maxY:topY,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:flags.supportTop!==false});};
    const addRound=(role,lx,lz,r,bottomY,topY,flags={})=>{const p=toWorld(lx,lz);parts.push({type:'round',role,x:p.x,z:p.z,r,minY:bottomY,maxY:topY,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:!!flags.supportTop});};
    const kind=String(o.kind||'box'),longX=o.w>=o.d,length=Math.max(o.w,o.d),width=Math.min(o.w,o.d),boxDims=(L,W)=>longX?[L,W]:[W,L],axis=(v)=>longX?[v,0]:[0,v];
    if(kind==='burntCar'){const [bw,bd]=boxDims(length*.96,width*.94),[cw,cd]=boxDims(length*.47,width*.84),[cx,cz]=axis(-length*.03);addBox('burntCarBody',0,0,bw,bd,base,base+o.h*.55,{supportTop:true});addBox('burntCarCabin',cx,cz,cw,cd,base+o.h*.50,base+o.h*.90,{supportTop:true});}
    else if(kind==='burntBus'){const [bw,bd]=boxDims(length*.96,width*.94),[uw,ud]=boxDims(length*.90,width*.88);addBox('burntBusBody',0,0,bw,bd,base,base+o.h*.66,{supportTop:true});addBox('burntBusUpper',0,0,uw,ud,base+o.h*.62,base+o.h*.96,{supportTop:true});}
    else if(kind==='dumpster'){addBox('dumpsterBody',0,0,o.w,o.d,base,base+o.h*.84,{supportTop:true});addBox('dumpsterLid',0,0,o.w*1.02,o.d*1.03,base+o.h*.86,base+o.h*.98,{supportTop:true});}
    else if(kind==='fuelTank'){const radius=width*.46,segment=Math.max(.05,length-2*radius),[cw,cd]=boxDims(segment,radius*2),end=Math.max(0,length/2-radius),[ax,az]=axis(end),[bx,bz]=axis(-end);addBox('fuelTankCenter',0,0,cw,cd,base,base+o.h,{supportTop:false});addRound('fuelTankCap',ax,az,radius,base,base+o.h,{supportTop:false});addRound('fuelTankCap',bx,bz,radius,base,base+o.h,{supportTop:false});}
    else if(kind==='checkpoint'){addBox('checkpointBody',0,0,o.w,o.d,base,base+o.h*.92,{supportTop:true});addBox('checkpointRoof',0,0,o.w*1.10,o.d*1.10,base+o.h*.92,base+o.h+0.20,{supportTop:true});}
    else if(kind==='sandbag')addBox('sandbag',0,0,o.w,o.d,base,base+o.h,{supportTop:false});
    else if(kind==='brokenWall')addBox('brokenWall',0,0,o.w,o.d,base,base+o.h,{supportTop:false});
    else if(kind==='barrier')addBox('barrier',0,0,o.w,o.d,base,base+o.h,{supportTop:false});
    else if(kind==='boundary')addBox('boundary',0,0,o.w,o.d,base,base+o.h,{supportTop:false});
    else addBox(kind,0,0,o.w,o.d,base,base+o.h,{supportTop:true});
    return{parts};
  }
  const STATIC_GEOMETRY=STATIC_BOXES.map(makeStaticGeometry);
  const STATIC_PARTS=STATIC_GEOMETRY.flatMap(g=>g.parts);

  // Standalone ladder anchors. Ladders are non-solid interaction volumes; the wall/roof
  // remains authoritative collision, while ladder mount/climb/dismount is validated separately.
  const LADDERS = Object.freeze(sanitizeLadders(def?.ladders).map(l=>Object.freeze(l)));
  
  function terrainMinAround(x,z,r){
    let min=terrainHeight(x,z);
    for(const scale of [.45,1])for(let i=0;i<24;i++){
      const a=i*Math.PI*2/24;
      min=Math.min(min,terrainHeight(x+Math.cos(a)*r*scale,z+Math.sin(a)*r*scale));
    }
    return min;
  }
  
  const naturalGroundBaseCache=new Map();
  function naturalGroundBase(type,x,z,r){
    const key=`${type}|${x}|${z}|${r}`;
    const cached=naturalGroundBaseCache.get(key);if(cached!==undefined)return cached;
    const footprint=type==='tree'?r:type==='bush'?r*.95:r*.9;
    const burial=type==='tree'?.16:type==='bush'?.14:.24;
    const base=terrainMinAround(x,z,footprint)-burial;naturalGroundBaseCache.set(key,base);return base;
  }
  
  function buildingWallOpenings(b,level,side){
    const windowBottom=.78,windowTop=Math.min(b.floorH-.38,2.62),windows=[];
    if(side==='front'||side==='back'){
      const center=b.w*.285;
      windows.push({u:-center,w:2.05,bottom:windowBottom,top:windowTop,kind:'window'});
      windows.push({u:center,w:2.05,bottom:windowBottom,top:windowTop,kind:'window'});
      if(side==='front')windows.push({u:0,w:level===0?2.4:2.25,bottom:0,top:Math.min(b.floorH-.38,2.5),kind:'door'});
    }else{
      const count=b.d>=13?2:1;
      if(count===1)windows.push({u:0,w:2.1,bottom:windowBottom,top:windowTop,kind:'window'});
      else for(const sign of [-1,1])windows.push({u:sign*b.d*.22,w:1.9,bottom:windowBottom,top:windowTop,kind:'window'});
    }
    return windows;
  }
  
  function splitWall(length,height,openings){
    const half=length/2,xs=[-half,half],ys=[0,height],safe=[];
    for(const opening of openings){
      const left=clamp(opening.u-opening.w/2,-half,half),right=clamp(opening.u+opening.w/2,-half,half),bottom=clamp(opening.bottom,0,height),top=clamp(opening.top,0,height);
      if(right-left<=.02||top-bottom<=.02)continue;
      safe.push({...opening,left,right,bottom,top});xs.push(left,right);ys.push(bottom,top);
    }
    const uniq=values=>[...new Set(values.map(v=>Math.round(v*10000)/10000))].sort((a,b)=>a-b),ux=uniq(xs),uy=uniq(ys),rects=[];
    for(let xi=0;xi<ux.length-1;xi++)for(let yi=0;yi<uy.length-1;yi++){
      const left=ux[xi],right=ux[xi+1],bottom=uy[yi],top=uy[yi+1];
      if(right-left<=.02||top-bottom<=.02)continue;
      const midU=(left+right)/2,midY=(bottom+top)/2;
      if(safe.some(o=>midU>o.left&&midU<o.right&&midY>o.bottom&&midY<o.top))continue;
      const crouchStep=safe.some(o=>o.kind==='window'&&midU>o.left&&midU<o.right&&top<=o.bottom+.001);
      rects.push({left,right,bottom,top,crouchStep});
    }
    const eq=(a,b)=>Math.abs(a-b)<.001;let changed=true;
    while(changed){
      changed=false;
      outer:for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
        const a=rects[i],b=rects[j];
        if(a.crouchStep===b.crouchStep&&eq(a.bottom,b.bottom)&&eq(a.top,b.top)&&(eq(a.right,b.left)||eq(b.right,a.left))){rects[i]={left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),bottom:a.bottom,top:a.top,crouchStep:a.crouchStep};rects.splice(j,1);changed=true;break outer;}
        if(a.crouchStep===b.crouchStep&&eq(a.left,b.left)&&eq(a.right,b.right)&&(eq(a.top,b.bottom)||eq(b.top,a.bottom))){rects[i]={left:a.left,right:a.right,bottom:Math.min(a.bottom,b.bottom),top:Math.max(a.top,b.top),crouchStep:a.crouchStep};rects.splice(j,1);changed=true;break outer;}
      }
    }
    return rects.map(r=>({u:(r.left+r.right)/2,y:r.bottom,w:r.right-r.left,h:r.top-r.bottom,crouchStep:!!r.crouchStep}));
  }
  
  function panelsAroundHole(b,hole){
    const innerL=b.x-b.w/2+.18,innerR=b.x+b.w/2-.18,innerMinZ=b.z-b.d/2+.18,innerMaxZ=b.z+b.d/2-.18;
    return [
      {x1:innerL,x2:hole.left,z1:innerMinZ,z2:innerMaxZ},
      {x1:hole.right,x2:innerR,z1:innerMinZ,z2:innerMaxZ},
      {x1:hole.left,x2:hole.right,z1:innerMinZ,z2:hole.minZ},
      {x1:hole.left,x2:hole.right,z1:hole.maxZ,z2:innerMaxZ}
    ].filter(p=>p.x2-p.x1>.08&&p.z2-p.z1>.08).map(p=>({x:(p.x1+p.x2)/2,z:(p.z1+p.z2)/2,w:p.x2-p.x1,d:p.z2-p.z1}));
  }
  
  function buildingPlan(b){
    const wallT=.36,levels=Math.max(2,Math.min(6,Math.floor(b.levels||2)));
    // One simple straight flight connects each pair of floors. In tall buildings
    // successive flights are deliberately placed on opposite sides of the room,
    // so reaching a new floor never feeds directly into a U-turn/switchback.
    const stairW=Math.min(2.25,Math.max(2.0,b.d*.15));
    const runLen=Math.min(6.35,Math.max(5.45,b.w*.39));
    const lowX=b.x-runLen/2,highX=b.x+runLen/2;
    const laneInset=Math.max(stairW/2+.72,Math.min(b.d*.255,b.d/2-stairW/2-.78));
    const backLane=clamp(b.z+laneInset,b.z-b.d/2+stairW/2+.72,b.z+b.d/2-stairW/2-.72);
    const frontLane=clamp(b.z-laneInset,b.z-b.d/2+stairW/2+.72,b.z+b.d/2-stairW/2-.72);
    const stairZs=Array.from({length:Math.max(1,levels-1)},(_,story)=>story%2===0?backLane:frontLane);
    // The opening ends exactly at the flight ends. Previous extra padding left a
    // support gap at the top edge that could make a player fall or fail to climb.
    const holes=stairZs.map(z=>({left:lowX,right:highX,minZ:z-stairW/2-.06,maxZ:z+stairW/2+.06}));
    const front=b.z-b.d/2,balconyOverlap=.92,balconyD=b.balcony+balconyOverlap,balconyZ=front-b.balcony/2+balconyOverlap/2,balconyOutsideZ=front-b.balcony/2;
    // Front windows sit near +/-28.5% of building width. The old 56%-wide
    // balcony put its side rails directly through those window openings. The
    // balcony now spans the openings with real player clearance on both sides.
    const balconyW=b.w*.80;
    return{wallT,stairW,runLen,lowX,highX,backLane,frontLane,stairZs,holes,front,balconyOverlap,balconyD,balconyZ,balconyOutsideZ,balconyW};
  }
  
  function addBox(parts,role,x,z,w,d,bottomY,topY,flags={}){
    if(w<=0||d<=0||topY-bottomY<=0)return;
    parts.push({role,x,z,w,d,bottomY,topY,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:!!flags.supportTop,crouchStep:!!flags.crouchStep,decorative:!!flags.decorative});
  }
  
  function addFrameX(parts,b,z,base,level,opening){
    const y=base+level*b.floorH,bars=.095,depth=.07,h=opening.top-opening.bottom;
    addBox(parts,'trim',b.x+opening.u-opening.w/2,z,bars,depth,y+opening.bottom,y+opening.bottom+h,{playerSolid:false,projectileSolid:false,decorative:true});
    addBox(parts,'trim',b.x+opening.u+opening.w/2,z,bars,depth,y+opening.bottom,y+opening.bottom+h,{playerSolid:false,projectileSolid:false,decorative:true});
    addBox(parts,'trim',b.x+opening.u,z,opening.w,depth,y+opening.top-bars,y+opening.top,{playerSolid:false,projectileSolid:false,decorative:true});
    if(opening.kind==='window')addBox(parts,'trim',b.x+opening.u,z,opening.w,depth,y+opening.bottom,y+opening.bottom+bars,{playerSolid:false,projectileSolid:false,decorative:true});
  }
  
  function addFrameZ(parts,b,x,base,level,opening){
    const y=base+level*b.floorH,bars=.095,depth=.07,h=opening.top-opening.bottom;
    addBox(parts,'trim',x,b.z+opening.u-opening.w/2,depth,bars,y+opening.bottom,y+opening.bottom+h,{playerSolid:false,projectileSolid:false,decorative:true});
    addBox(parts,'trim',x,b.z+opening.u+opening.w/2,depth,bars,y+opening.bottom,y+opening.bottom+h,{playerSolid:false,projectileSolid:false,decorative:true});
    addBox(parts,'trim',x,b.z+opening.u,depth,opening.w,y+opening.top-bars,y+opening.top,{playerSolid:false,projectileSolid:false,decorative:true});
    if(opening.kind==='window')addBox(parts,'trim',x,b.z+opening.u,depth,opening.w,y+opening.bottom,y+opening.bottom+bars,{playerSolid:false,projectileSolid:false,decorative:true});
  }
  
  function makeBuildingGeometry(b){
    const levels=Math.max(2,Math.min(6,Math.floor(b.levels||2))),base=terrainHeight(b.x,b.z)+b.yOffset,plan=buildingPlan(b),parts=[],supports=[],horizontalSolids=[],playerRamps=[];
    const t=plan.wallT;
    const addWallX=(z,level,side)=>{
      const openings=buildingWallOpenings(b,level,side);
      for(const cell of splitWall(b.w,b.floorH,openings)){
        const x=b.x+cell.u,bottomY=base+level*b.floorH+cell.y,topY=bottomY+cell.h+.015;
        addBox(parts,'wall',x,z,cell.w+.015,t,bottomY,topY,{supportTop:cell.crouchStep,crouchStep:cell.crouchStep});
        if(cell.crouchStep)supports.push({type:'rect',x,z,w:cell.w+.015,d:t,y:topY,role:'windowSill',crouchStep:true});
      }
      for(const opening of openings)addFrameX(parts,b,z+(side==='front'?-.012:.012),base,level,opening);
    };
    const addWallZ=(x,level,side)=>{
      const openings=buildingWallOpenings(b,level,side);
      for(const cell of splitWall(b.d,b.floorH,openings)){
        const z=b.z+cell.u,bottomY=base+level*b.floorH+cell.y,topY=bottomY+cell.h+.015;
        addBox(parts,'wall',x,z,t,cell.w+.015,bottomY,topY,{supportTop:cell.crouchStep,crouchStep:cell.crouchStep});
        if(cell.crouchStep)supports.push({type:'rect',x,z,w:t,d:cell.w+.015,y:topY,role:'windowSill',crouchStep:true});
      }
      for(const opening of openings)addFrameZ(parts,b,x+(side==='left'?-.012:.012),base,level,opening);
    };
    for(let level=0;level<levels;level++){
      addWallX(b.z-b.d/2+t/2,level,'front');addWallX(b.z+b.d/2-t/2,level,'back');
      addWallZ(b.x-b.w/2+t/2,level,'left');addWallZ(b.x+b.w/2-t/2,level,'right');
    }
  
    for(let floorLevel=1;floorLevel<levels;floorLevel++){
      const floorY=base+floorLevel*b.floorH,hole=plan.holes[floorLevel-1],panels=panelsAroundHole(b,hole);
      for(const panel of panels){
        addBox(parts,'floor',panel.x,panel.z,panel.w+.03,panel.d+.03,floorY-.18,floorY,{supportTop:true});
        supports.push({type:'rect',x:panel.x,z:panel.z,w:panel.w,d:panel.d,y:floorY});
        horizontalSolids.push({x:panel.x,z:panel.z,w:panel.w,d:panel.d,bottomY:floorY-.18,topY:floorY});
      }
      addBox(parts,'floor',b.x,plan.balconyZ,plan.balconyW,plan.balconyD,floorY-.188,floorY-.008,{supportTop:true});
      supports.push({type:'rect',x:b.x,z:plan.balconyZ,w:plan.balconyW,d:plan.balconyD,y:floorY});
      horizontalSolids.push({x:b.x,z:plan.balconyZ,w:plan.balconyW,d:plan.balconyD,bottomY:floorY-.188,topY:floorY-.008});
      const railBottom=floorY+.08,outerZ=plan.front-b.balcony+.06;
      addBox(parts,'rail',b.x,outerZ,plan.balconyW,.14,railBottom,railBottom+.82,{});
      addBox(parts,'rail',b.x-plan.balconyW/2,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82,{});
      addBox(parts,'rail',b.x+plan.balconyW/2,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82,{});
  
      const guardY=floorY+.05,guardH=.76;
      // Guard the long edges only. The bottom and top of every straight flight
      // stay open so the player can walk directly onto and off the staircase.
      addBox(parts,'rail',(hole.left+hole.right)/2,hole.minZ+.05,hole.right-hole.left,.12,guardY,guardY+guardH,{});
      addBox(parts,'rail',(hole.left+hole.right)/2,hole.maxZ-.05,hole.right-hole.left,.12,guardY,guardY+guardH,{});
    }
  
    const roofY=base+b.floorH*levels;
    addBox(parts,'roof',b.x,b.z,b.w+.04,b.d+.04,roofY-.20,roofY,{supportTop:true});
    supports.push({type:'rect',x:b.x,z:b.z,w:b.w,d:b.d,y:roofY});
    horizontalSolids.push({x:b.x,z:b.z,w:b.w,d:b.d,bottomY:roofY-.20,topY:roofY});
    if(b.tall){
      const py=roofY;
      addBox(parts,'rail',b.x,b.z-b.d/2+.10,b.w,.20,py,py+.55,{});addBox(parts,'rail',b.x,b.z+b.d/2-.10,b.w,.20,py,py+.55,{});
      addBox(parts,'rail',b.x-b.w/2+.10,b.z,.20,b.d,py,py+.55,{});addBox(parts,'rail',b.x+b.w/2-.10,b.z,.20,b.d,py,py+.55,{});
    }
  
    // Visible treads stay discrete, but player support uses one continuous
    // ramp per flight. This is the conventional FPS stair collider: the rendered
    // steps keep their shape while feet/camera move continuously instead of
    // climbing fourteen 23 cm ledges and producing a repeated vertical hitch.
    const steps=14,stepLen=plan.runLen/steps;
    for(let story=0;story<levels-1;story++){
      const floorY=base+story*b.floorH,nextY=floorY+b.floorH,laneZ=plan.stairZs[story],x0=plan.lowX,x1=plan.highX;
      supports.push({type:'ramp',x1:x0,x2:x1,z:laneZ,w:plan.stairW,y0:floorY,y1:nextY,role:'stairRamp'});
      playerRamps.push({type:'ramp',x1:x0,x2:x1,z:laneZ,w:plan.stairW,bottomY:floorY,y0:floorY,y1:nextY,role:'stairRamp'});
      for(let i=0;i<steps;i++){
        const p0=i/steps,p1=(i+1)/steps,mid=(p0+p1)/2,tread=floorY+(nextY-floorY)*p1,x=x0+(x1-x0)*mid;
        const treadW=stepLen+.055;
        // The visual staircase is a solid stepped volume. Player movement uses
        // the matching continuous ramp top, so the camera stays smooth without
        // allowing the player to pass through an open/non-physical stair model.
        addBox(parts,'stairStep',x,laneZ,treadW,plan.stairW,floorY,tread,{playerSolid:false,projectileSolid:true,supportTop:false});
        // Stair treads are a solid stepped projectile volume, but players use the
        // continuous stair ramp. Treating each tread as an overhead slab made its
        // floor-level bottom act as a false ceiling while jumping near stairs.
      }
    }
  
    return{levels,base,plan,parts,supports,horizontalSolids,playerRamps};
  }
  
  function transformRect(rect,b){const p=rotatePoint(rect.x,rect.z,b.x,b.z,b.rot);return{...rect,x:p.x,z:p.z,rot:normalizeRot((rect.rot||0)+b.rot)};}
  function transformRamp(r,b){const a=rotatePoint(r.x1,r.z1??r.z,b.x,b.z,b.rot),c=rotatePoint(r.x2,r.z2??r.z,b.x,b.z,b.rot);return{...r,x1:a.x,z1:a.z,x2:c.x,z2:c.z,rot:normalizeRot((r.rot||0)+b.rot)};}
  function transformBuildingGeometry(g,b){if(!b.rot)return{...g,parts:g.parts.map(p=>({...p,rot:0})),supports:g.supports.map(s=>s.type==='ramp'?transformRamp(s,b):({...s,rot:0})),horizontalSolids:g.horizontalSolids.map(s=>({...s,rot:0})),playerRamps:g.playerRamps.map(r=>transformRamp(r,b))};return{...g,parts:g.parts.map(p=>transformRect(p,b)),supports:g.supports.map(s=>s.type==='ramp'?transformRamp(s,b):transformRect(s,b)),horizontalSolids:g.horizontalSolids.map(s=>transformRect(s,b)),playerRamps:g.playerRamps.map(r=>transformRamp(r,b))};}
  function makeAllBuildingGeometry(){return BUILDINGS.map(b=>transformBuildingGeometry(makeBuildingGeometry(b),b));}
  function makeElevationGeometry(o){const base=terrainHeight(o.x,o.z)+o.yOffset,parts=[],supports=[],horizontalSolids=[],playerRamps=[],toWorld=(lx,lz)=>rotatePoint(o.x+lx,o.z+lz,o.x,o.z,o.rot),addRect=(role,lx,lz,w,d,bottomY,topY,flags={})=>{const p=toWorld(lx,lz);parts.push({role,x:p.x,z:p.z,w,d,bottomY,topY,rot:o.rot,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:!!flags.supportTop,crouchStep:false,decorative:false});};
    if(o.kind==='platform'||o.kind==='overpass'){const thick=o.kind==='overpass'?.7:.5,top=base+o.rise;addRect(o.kind,0,0,o.w,o.d,top-thick,top,{supportTop:true});supports.push({type:'rect',x:o.x,z:o.z,w:o.w,d:o.d,y:top,rot:o.rot,role:o.kind});horizontalSolids.push({x:o.x,z:o.z,w:o.w,d:o.d,bottomY:top-thick,topY:top,rot:o.rot});if(o.kind==='overpass')for(const side of [-1,1])addRect('overpassSupport',side*(o.w/2-.45),0,.7,o.d*.94,base,top-thick,{supportTop:false});}
    else {const steps=Math.max(4,Math.ceil(o.rise/(o.kind==='stairs'?.34:.45))),stepD=o.d/steps;for(let i=0;i<steps;i++){const h=o.rise*(i+1)/steps,lz=-o.d/2+stepD*(i+.5);addRect(o.kind==='stairs'?'stairStep':'rampStep',0,lz,o.w,stepD+.04,base,base+h,{playerSolid:false,projectileSolid:true});}const low=toWorld(0,-o.d/2),high=toWorld(0,o.d/2),ramp={type:'ramp',x1:low.x,z1:low.z,x2:high.x,z2:high.z,w:o.w,bottomY:base,y0:base,y1:base+o.rise,role:o.kind==='stairs'?'stairRamp':'ramp',supportTop:true};supports.push(ramp);playerRamps.push(ramp);}
    return{parts,supports,horizontalSolids,playerRamps};}
  const BUILDING_GEOMETRY = makeAllBuildingGeometry();
  const ELEVATION_GEOMETRY = ELEVATION_OBJECTS.map(makeElevationGeometry);
  const BUILDING_SUPPORTS = [...BUILDING_GEOMETRY.flatMap(g=>g.supports),...ELEVATION_GEOMETRY.flatMap(g=>g.supports)];
  const BUILDING_HORIZONTAL_SOLIDS = [...BUILDING_GEOMETRY.flatMap(g=>g.horizontalSolids),...ELEVATION_GEOMETRY.flatMap(g=>g.horizontalSolids)];
  const BUILDING_PLAYER_RAMPS = [...BUILDING_GEOMETRY.flatMap(g=>g.playerRamps),...ELEVATION_GEOMETRY.flatMap(g=>g.playerRamps)];
  const BUILDING_PARTS = [...BUILDING_GEOMETRY.flatMap(g=>g.parts),...ELEVATION_GEOMETRY.flatMap(g=>g.parts)];
  
  const BUILDING_WINDOW_PORTALS = Object.freeze(BUILDINGS.flatMap((b,buildingIndex)=>{
    const base=terrainHeight(b.x,b.z)+b.yOffset,plan=buildingPlan(b),levels=Math.max(2,Math.min(6,Math.floor(b.levels||2))),portals=[];
    const sides=[
      {side:'front',nx:0,nz:-1,tx:1,tz:0,x:b.x,z:b.z-b.d/2+plan.wallT/2},
      {side:'back',nx:0,nz:1,tx:1,tz:0,x:b.x,z:b.z+b.d/2-plan.wallT/2},
      {side:'left',nx:-1,nz:0,tx:0,tz:1,x:b.x-b.w/2+plan.wallT/2,z:b.z},
      {side:'right',nx:1,nz:0,tx:0,tz:1,x:b.x+b.w/2-plan.wallT/2,z:b.z},
    ];
    for(let level=0;level<levels;level++)for(const face of sides){
      for(const opening of buildingWallOpenings(b,level,face.side)){
        if(opening.kind!=='window')continue;
        const rawX=face.x+face.tx*opening.u,rawZ=face.z+face.tz*opening.u,floorY=base+level*b.floorH,p=rotatePoint(rawX,rawZ,b.x,b.z,b.rot),nv=rotateVector(face.nx,face.nz,b.rot),tv=rotateVector(face.tx,face.tz,b.rot);
        portals.push(Object.freeze({
          id:`b${buildingIndex}-l${level}-${face.side}-${Math.round(opening.u*1000)}`,
          buildingIndex,level,side:face.side,cx:p.x,cz:p.z,nx:nv.x,nz:nv.z,tx:tv.x,tz:tv.z,
          width:opening.w,halfWidth:opening.w/2,wallThickness:plan.wallT,floorY,
          bottomY:floorY+opening.bottom,topY:floorY+opening.top,
        }));
      }
    }
    return portals;
  }));
  
  const STATIC_SUPPORTS = STATIC_PARTS.filter(p=>p.supportTop).map(p=>p.type==='round'?{type:'round',x:p.x,z:p.z,r:p.r,y:p.maxY,role:p.role}:{type:'rect',x:p.x,z:p.z,w:p.w,d:p.d,y:p.maxY,rot:p.rot,role:p.role});

  // Canonical player/projectile collision proxies. These are derived from the same
  // physical parts used to describe authored props, rather than one oversized box
  // around detailed visual models. This prevents invisible corners and walk-through
  // bodywork on compound props.
  const STATIC_PLAYER_COLLIDERS = STATIC_PARTS.filter(p=>p.playerSolid).map(p=>p.type==='round'?{type:'round',x:p.x,z:p.z,r:p.r,minY:p.minY,maxY:p.maxY,role:p.role,supportTop:!!p.supportTop}:{type:'box',x:p.x,z:p.z,w:p.w,d:p.d,rot:p.rot,...orientedAabb(p.x,p.z,p.w,p.d,p.rot),minY:p.minY,maxY:p.maxY,role:p.role,supportTop:!!p.supportTop});
  const STATIC_PROJECTILE_COLLIDERS = STATIC_PARTS.filter(p=>p.projectileSolid).map(p=>p.type==='round'?{type:'round',x:p.x,z:p.z,r:p.r,minY:p.minY,maxY:p.maxY,role:p.role}:{type:'box',x:p.x,z:p.z,w:p.w,d:p.d,rot:p.rot,minY:p.minY,maxY:p.maxY,role:p.role});

  const NATURAL_PLAYER_COLLIDERS = NATURAL_OBSTACLES.map(o=>{
    const minY=naturalGroundBase(o.type,o.x,o.z,o.r);
    if(o.type==='tree')return {type:'round',x:o.x,z:o.z,r:o.r*.92,minY,maxY:minY+o.h*.64,role:'tree',supportTop:false};
    if(o.type==='bush'){
      // Foliage is visual/soft cover. Only the dense lower core blocks movement,
      // so a normal jump or vault clears a bush instead of colliding with leaves.
      const r=o.r*.46,maxY=minY+Math.min(.74,o.h*.50);
      return {type:'round',x:o.x,z:o.z,r,minY,maxY,role:'bush',supportTop:false};
    }
    const r=o.r*.98,maxY=minY+o.h,supportRadius=Math.max(PLAYER_RADIUS+.14,o.r*.72);
    return {type:'round',x:o.x,z:o.z,r,minY,maxY,role:'rock',supportTop:true,supportRadius};
  });

  const NATURAL_SUPPORTS = NATURAL_PLAYER_COLLIDERS.filter(c=>c.role==='rock').map(c=>({type:'round',x:c.x,z:c.z,r:c.supportRadius,y:c.maxY,role:'rock'}));
  const PYRAMID_PLAYER_COLLIDERS = PYRAMIDS.map(p=>{const minY=terrainHeight(p.x,p.z)-.05;return{type:'pyramid',x:p.x,z:p.z,base:p.base,h:p.h,minY,maxY:minY+p.h,role:'mound',supportTop:true};});

  const BUILDING_PLAYER_COLLIDERS = [
    ...BUILDING_PARTS.filter(p=>p.playerSolid).map(p=>{const a=orientedAabb(p.x,p.z,p.w,p.d,p.rot||0);return{type:'box',x:p.x,z:p.z,w:p.w,d:p.d,rot:p.rot||0,...a,minY:p.bottomY,maxY:p.topY,role:p.role,crouchStep:!!p.crouchStep,supportTop:!!p.supportTop}}),
    ...BUILDING_PLAYER_RAMPS.map(r=>({...r,supportTop:true})),
  ];
  
  const WORLD_PLAYER_COLLIDERS = [...STATIC_PLAYER_COLLIDERS,...NATURAL_PLAYER_COLLIDERS,...PYRAMID_PLAYER_COLLIDERS,...BUILDING_PLAYER_COLLIDERS];
  
  
  function circleTouchesRect(x,z,r,minX,maxX,minZ,maxZ){const qx=clamp(x,minX,maxX),qz=clamp(z,minZ,maxZ),dx=x-qx,dz=z-qz;return dx*dx+dz*dz<=r*r;}
  function circleTouchesOrientedRect(x,z,r,surface){const a=-normalizeRot(surface.rot||0)*Math.PI/180,c=Math.cos(a),ss=Math.sin(a),dx=x-surface.x,dz=z-surface.z,lx=dx*c-dz*ss,lz=dx*ss+dz*c;return circleTouchesRect(lx,lz,r,-surface.w/2,surface.w/2,-surface.d/2,surface.d/2);}
  function rampPoint(surface,x,z){const z1=surface.z1??surface.z,z2=surface.z2??surface.z,vx=surface.x2-surface.x1,vz=z2-z1,len2=vx*vx+vz*vz;if(len2<1e-9)return{t:0,d:Math.hypot(x-surface.x1,z-z1),length:0};const raw=((x-surface.x1)*vx+(z-z1)*vz)/len2,t=clamp(raw,0,1),px=surface.x1+vx*t,pz=z1+vz*t;return{t,d:Math.hypot(x-px,z-pz),length:Math.sqrt(len2),raw};}
  function surfaceHeightAt(surface,x,z,radius=PLAYER_RADIUS,contactRadius=SUPPORT_CONTACT_RADIUS){
    const r=Math.max(0,Number(radius)||0),contact=Math.min(r,Math.max(0,Number(contactRadius)||0));
    if(surface.type==='rect')return circleTouchesOrientedRect(x,z,contact,surface)?surface.y:null;
    if(surface.type==='round')return Math.hypot(x-surface.x,z-surface.z)<=Math.max(0,surface.r-r)?surface.y:null;
    if(surface.type==='ramp'){const rampContact=Math.max(contact,r),q=rampPoint(surface,x,z),alongPad=q.length>0?rampContact/q.length:0;if(q.raw<-alongPad||q.raw>1+alongPad||q.d>surface.w/2+rampContact)return null;return surface.y0+(surface.y1-surface.y0)*q.t;}
    return null;
  }
  
  function worldSupportHeight(x,z,currentY=terrainHeight(x,z),allowCrouchStep=false,playerRadius=PLAYER_RADIUS){
    let best=terrainHeight(x,z),limit=currentY+MAX_STEP_HEIGHT;
    for(const p of PYRAMID_PLAYER_COLLIDERS){
      const half=p.base/2,qx=clamp(x,p.x-half,p.x+half),qz=clamp(z,p.z-half,p.z+half),od=Math.hypot(x-qx,z-qz);if(od>playerRadius)continue;const y=p.minY+p.h*(1-Math.max(Math.abs(qx-p.x),Math.abs(qz-p.z))/half);if(y<=limit&&y>best)best=y;
    }
    for(const surface of STATIC_SUPPORTS){const y=surfaceHeightAt(surface,x,z,playerRadius);if(y!=null&&y<=limit&&y>best)best=y;}
    for(const surface of NATURAL_SUPPORTS){const y=surfaceHeightAt(surface,x,z,playerRadius);if(y!=null&&y<=limit&&y>best)best=y;}
    for(const surface of BUILDING_SUPPORTS){
      const y=surfaceHeightAt(surface,x,z,playerRadius);if(y==null)continue;
      const surfaceLimit=currentY+(surface.crouchStep&&allowCrouchStep?CROUCH_WINDOW_STEP_HEIGHT:MAX_STEP_HEIGHT);
      if(y<=surfaceLimit&&y>best)best=y;
    }
    return best;
  }
  
  // Support query used only after horizontal collision. Unlike ordinary ground
  // support, this uses most of the capsule radius so a walkable landing is found
  // before its vertical edge catches the body. It never raises the player by more
  // than maxStepHeight and therefore cannot auto-climb window sills, rails or walls.
  function worldStepUpHeight(x,z,currentY,maxStepHeight=MAX_STEP_HEIGHT,playerRadius=PLAYER_RADIUS){
    const py=Number(currentY),limit=py+Math.max(0,Number(maxStepHeight)||0),contact=Math.max(SUPPORT_CONTACT_RADIUS,Math.max(0,Number(playerRadius)||PLAYER_RADIUS));
    if(!Number.isFinite(py))return null;
    let best=null;
    const consider=(surface,allow=false)=>{
      const y=surfaceHeightAt(surface,x,z,playerRadius,contact);if(y==null||y<=py+.015||y>limit+.001)return;
      if(surface.crouchStep&&!allow)return;
      if(best==null||y>best)best=y;
    };
    for(const surface of STATIC_SUPPORTS)consider(surface);
    for(const surface of NATURAL_SUPPORTS)consider(surface);
    for(const p of PYRAMID_PLAYER_COLLIDERS){const half=p.base/2,qx=clamp(x,p.x-half,p.x+half),qz=clamp(z,p.z-half,p.z+half);if(Math.hypot(x-qx,z-qz)>playerRadius)continue;const y=p.minY+p.h*(1-Math.max(Math.abs(qx-p.x),Math.abs(qz-p.z))/half);if(y>py+.015&&y<=limit+.001&&(best==null||y>best))best=y;}
    for(const surface of BUILDING_SUPPORTS)consider(surface,false);
    return best;
  }
  
  function resolveCeilingCollision(previousY,nextY,x,z,playerHeight=PLAYER_HEIGHT,playerRadius=PLAYER_RADIUS){
    if(nextY<=previousY)return{y:nextY,hit:false};
    const newHead=nextY+playerHeight,r=Math.max(0,Math.min(playerRadius,CEILING_HEAD_RADIUS)-.01);let resolved=nextY,hit=false;
    for(const s of BUILDING_HORIZONTAL_SOLIDS){
      if(!circleTouchesOrientedRect(x,z,r,s))continue;
      // If the feet are still below the slab, any upward head penetration is a
      // ceiling hit. This also repairs a missed prior frame instead of letting the
      // player oscillate through the underside. The smaller head probe prevents
      // full-body-radius snagging at open stair/roof edges.
      if(previousY<s.bottomY-.01&&newHead>=s.bottomY-.018){resolved=Math.min(resolved,s.bottomY-playerHeight-.012);hit=true;}
    }
    return{y:resolved,hit};
  }
  return {PLAYER_HEIGHT,PLAYER_RADIUS,ARENA_LIMIT,MAX_STEP_HEIGHT,CROUCH_WINDOW_STEP_HEIGHT,ROADS,STATIC_BOXES,STATIC_GEOMETRY,STATIC_PARTS,STATIC_PROJECTILE_COLLIDERS,BUILDINGS,AUTHORED_HEIGHTFIELD,AUTHORED_MATERIAL_SURFACE,AUTHORED_ENVIRONMENT,groundMaterialCode,TERRAIN_MODIFIERS,ELEVATION_OBJECTS,PYRAMIDS,PYRAMID_PLAYER_COLLIDERS,NATURAL_OBSTACLES,COMBAT_FLOW_NODES,rawTerrainHeight,TERRAIN_SIZE,TERRAIN_SEGMENTS,terrainVertexHeight,terrainHeight,LADDERS,terrainMinAround,naturalGroundBase,buildingWallOpenings,splitWall,buildingPlan,makeBuildingGeometry,makeAllBuildingGeometry,BUILDING_GEOMETRY,BUILDING_SUPPORTS,BUILDING_HORIZONTAL_SOLIDS,BUILDING_PLAYER_RAMPS,BUILDING_PARTS,BUILDING_WINDOW_PORTALS,STATIC_SUPPORTS,STATIC_PLAYER_COLLIDERS,NATURAL_PLAYER_COLLIDERS,NATURAL_SUPPORTS,BUILDING_PLAYER_COLLIDERS,WORLD_PLAYER_COLLIDERS,worldSupportHeight,worldStepUpHeight,resolveCeilingCollision,MINIMAP_LIMIT};
}
