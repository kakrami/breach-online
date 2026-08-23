export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.38;
export const ARENA_LIMIT = 120;
export const MAX_STEP_HEIGHT = 0.62;
export const CROUCH_WINDOW_STEP_HEIGHT = 0.86;

export const STATIC_BOXES = [
  // Freight-yard cover: container stacks, concrete barriers, and lane dividers.
  {x:-28,z:-8,w:18,d:4.2,h:2.9},{x:2,z:8,w:16,d:4.2,h:2.9},{x:32,z:-4,w:18,d:4.2,h:2.9},
  {x:-10,z:-34,w:4.2,d:16,h:2.9},{x:18,z:36,w:4.2,d:18,h:2.9},
  {x:-78,z:4,w:12,d:4.5,h:3.0},{x:78,z:-6,w:12,d:4.5,h:3.0},
  {x:-42,z:72,w:15,d:4.5,h:2.8},{x:46,z:-74,w:15,d:4.5,h:2.8},
  // Mantle-height Jersey barriers establish cross-lanes without becoming hard corridors.
  {x:-18,z:22,w:8,d:2.5,h:1.55},{x:18,z:-22,w:8,d:2.5,h:1.55},
  {x:-54,z:-48,w:2.6,d:9,h:1.65},{x:54,z:48,w:2.6,d:9,h:1.65},
  {x:-84,z:-30,w:8,d:2.6,h:1.55},{x:84,z:30,w:8,d:2.6,h:1.55},
  {x:0,z:78,w:10,d:2.6,h:1.55},{x:0,z:-78,w:10,d:2.6,h:1.55},
  // Authored combat-space props. Their box footprints are authoritative for movement/projectiles;
  // the client renders richer compound models for recognizable silhouettes.
  {x:90,z:52,w:2.55,d:11.2,h:3.05,kind:'burntBus'},
  {x:-6,z:-58,w:4.5,d:2.0,h:1.35,kind:'burntCar'},
  {x:-24,z:58,w:9.0,d:.72,h:2.20,kind:'brokenWall'},
  {x:64,z:24,w:3.6,d:2.25,h:1.48,kind:'dumpster'},
  {x:-10,z:30,w:5.5,d:2.6,h:2.40,kind:'fuelTank'},
  {x:78,z:64,w:5.0,d:3.4,h:2.45,kind:'checkpoint'},
  {x:-50,z:-22,w:7.5,d:1.15,h:1.18,kind:'sandbag'}

];

export const BUILDINGS = [
  {x:-58,z:8,w:24,d:18,floorH:3.20,balcony:4.2,levels:2,style:'warehouse'},
  {x:58,z:-24,w:22,d:16,floorH:3.15,balcony:4.0,levels:2,style:'brick'},
  {x:8,z:66,w:18,d:14,floorH:3.10,balcony:3.8,levels:3,tall:true,style:'office'},
  {x:24,z:-68,w:16,d:14,floorH:3.10,balcony:3.8,levels:4,tall:true,style:'industrial'},
  {x:-68,z:62,w:18,d:15,floorH:3.05,balcony:3.6,levels:2,style:'warehouse'}
];

export const PYRAMIDS = [
  {x:-28,z:-62,base:12,h:6.5},{x:42,z:62,base:13,h:7.5},{x:74,z:58,base:10,h:5.5}
];

export const NATURAL_OBSTACLES = [
  // Depot is intentionally more industrial than Highlands: sparse trees, brush, and rubble.
  {type:'tree',x:-92,z:76,r:.72,h:7.1},{type:'tree',x:94,z:-74,r:.78,h:7.8},{type:'tree',x:-94,z:-76,r:.70,h:7.0},{type:'tree',x:94,z:78,r:.76,h:7.5},
  {type:'bush',x:-74,z:-18,r:1.7,h:1.5},{type:'bush',x:-38,z:46,r:1.8,h:1.5},{type:'bush',x:42,z:-48,r:1.7,h:1.5},{type:'bush',x:74,z:18,r:1.8,h:1.5},
  {type:'rock',x:-88,z:42,r:2.0,h:2.5},{type:'rock',x:-42,z:-30,r:1.8,h:2.2},{type:'rock',x:-2,z:48,r:2.1,h:2.5},{type:'rock',x:42,z:22,r:1.9,h:2.3},
  {type:'rock',x:86,z:-42,r:2.1,h:2.6},{type:'rock',x:8,z:-92,r:1.9,h:2.3},{type:'rock',x:88,z:84,r:2.0,h:2.4},{type:'rock',x:-12,z:92,r:1.8,h:2.2}
];

export const COMBAT_FLOW_NODES = Object.freeze([
  Object.freeze({x:-96,z:-54}),Object.freeze({x:-78,z:-30}),Object.freeze({x:-78,z:0}),Object.freeze({x:-78,z:34}),Object.freeze({x:-92,z:58}),
  Object.freeze({x:-54,z:-72}),Object.freeze({x:-52,z:-42}),Object.freeze({x:-38,z:-18}),Object.freeze({x:-40,z:34}),Object.freeze({x:-38,z:82}),
  Object.freeze({x:-18,z:-88}),Object.freeze({x:-18,z:-54}),Object.freeze({x:-18,z:-18}),Object.freeze({x:-18,z:18}),Object.freeze({x:-18,z:54}),Object.freeze({x:-10,z:88}),
  Object.freeze({x:12,z:-88}),Object.freeze({x:12,z:-52}),Object.freeze({x:12,z:-16}),Object.freeze({x:12,z:18}),Object.freeze({x:12,z:50}),Object.freeze({x:12,z:88}),
  Object.freeze({x:42,z:-82}),Object.freeze({x:48,z:-48}),Object.freeze({x:42,z:-10}),Object.freeze({x:42,z:28}),Object.freeze({x:42,z:78}),
  Object.freeze({x:76,z:-70}),Object.freeze({x:82,z:-38}),Object.freeze({x:78,z:0}),Object.freeze({x:78,z:36}),Object.freeze({x:92,z:66})
]);

const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const SUPPORT_CONTACT_RADIUS = 0.075;
const CEILING_HEAD_RADIUS = 0.22;

export function rawTerrainHeight(x,z){
  // Flatter industrial terrain with shallow drainage channels and raised perimeter berms.
  const slab=0.42+0.24*Math.sin(x*0.026)*Math.cos(z*0.024)+0.18*Math.sin((x-z)*0.018);
  const westBerm=2.8*Math.exp(-((x+98)**2)/520)*Math.exp(-(z*z)/7600);
  const eastBerm=2.5*Math.exp(-((x-100)**2)/520)*Math.exp(-(z*z)/7600);
  const northBerm=2.2*Math.exp(-((z-103)**2)/620)*Math.exp(-(x*x)/8200);
  const southBerm=2.4*Math.exp(-((z+102)**2)/620)*Math.exp(-(x*x)/8200);
  const yardRise=1.35*Math.exp(-((x+48)**2+(z-56)**2)/1250)+1.05*Math.exp(-((x-54)**2+(z+56)**2)/1100);
  const drain=1.15*Math.exp(-((x-2)**2)/280)*Math.exp(-((z+2)**2)/6800);
  return clamp(slab+westBerm+eastBerm+northBerm+southBerm+yardRise-drain,-1.0,5.2);
}

const foundations = [
  ...PYRAMIDS.map(p=>({x:p.x,z:p.z,halfX:p.base/2+.45,halfZ:p.base/2+.45,blend:4.0})),
  ...STATIC_BOXES.map(o=>({x:o.x,z:o.z,halfX:o.w/2+.45,halfZ:o.d/2+.45,blend:4.0})),
  ...BUILDINGS.map(b=>({x:b.x,z:b.z,halfX:b.w/2+.55,halfZ:b.d/2+.55,blend:4.5}))
];

export const TERRAIN_SIZE = 244;
export const TERRAIN_SEGMENTS = 128;
const TERRAIN_HALF = TERRAIN_SIZE / 2;
const TERRAIN_STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS;

function sourceTerrainHeight(x,z){
  let h=rawTerrainHeight(x,z);
  for(const f of foundations){
    const ox=Math.max(Math.abs(x-f.x)-f.halfX,0),oz=Math.max(Math.abs(z-f.z)-f.halfZ,0),d=Math.hypot(ox,oz);
    if(d>=f.blend)continue;
    const center=rawTerrainHeight(f.x,f.z);
    if(d<=1e-6){h=center;continue;}
    const t=clamp(d/f.blend,0,1),s=t*t*(3-2*t);
    h=center*(1-s)+h*s;
  }
  return h;
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

export function terrainVertexHeight(ix,iz){
  const x=Math.max(0,Math.min(TERRAIN_SEGMENTS,Math.floor(Number(ix)||0)));
  const z=Math.max(0,Math.min(TERRAIN_SEGMENTS,Math.floor(Number(iz)||0)));
  return TERRAIN_HEIGHTFIELD[z*(TERRAIN_SEGMENTS+1)+x];
}

export function terrainHeight(x,z){
  const gx=clamp((Number(x)+TERRAIN_HALF)/TERRAIN_STEP,0,TERRAIN_SEGMENTS);
  const gz=clamp((Number(z)+TERRAIN_HALF)/TERRAIN_STEP,0,TERRAIN_SEGMENTS);
  const ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz));
  const fx=gx-ix,fz=gz-iz,row=TERRAIN_SEGMENTS+1;
  const a=TERRAIN_HEIGHTFIELD[iz*row+ix],b=TERRAIN_HEIGHTFIELD[iz*row+ix+1];
  const c=TERRAIN_HEIGHTFIELD[(iz+1)*row+ix],d=TERRAIN_HEIGHTFIELD[(iz+1)*row+ix+1];
  if(fx+fz<=1)return a+fx*(b-a)+fz*(c-a);
  return d+(1-fx)*(c-d)+(1-fz)*(b-d);
}

// Functional ladder traversal anchors. The ladder itself is non-solid; the wall/roof it serves
// remains authoritative collision, and traversal is validated on both client and server.
export const LADDERS = Object.freeze([Object.freeze({id:'depot-warehouse-roof',x:-58,z:17.08,nx:0,nz:1,tx:1,tz:0,width:1.22,bottomY:terrainHeight(-58,18.0),topY:terrainHeight(-58,8)+6.40})]);

export function terrainMinAround(x,z,r){
  let min=terrainHeight(x,z);
  for(const scale of [.45,1])for(let i=0;i<24;i++){
    const a=i*Math.PI*2/24;
    min=Math.min(min,terrainHeight(x+Math.cos(a)*r*scale,z+Math.sin(a)*r*scale));
  }
  return min;
}

const naturalGroundBaseCache=new Map();
export function naturalGroundBase(type,x,z,r){
  const key=`${type}|${x}|${z}|${r}`;
  const cached=naturalGroundBaseCache.get(key);if(cached!==undefined)return cached;
  const footprint=type==='tree'?r:type==='bush'?r*.95:r*.9;
  const burial=type==='tree'?.16:type==='bush'?.14:.24;
  const base=terrainMinAround(x,z,footprint)-burial;naturalGroundBaseCache.set(key,base);return base;
}

export function buildingWallOpenings(b,level,side){
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

export function splitWall(length,height,openings){
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

export function buildingPlan(b){
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
  parts.push({role,x,z,w,d,bottomY,topY,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:!!flags.supportTop,crouchStep:!!flags.crouchStep,traversal:flags.traversal||'',decorative:!!flags.decorative});
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

export function makeBuildingGeometry(b){
  const levels=Math.max(2,Math.min(6,Math.floor(b.levels||2))),base=terrainHeight(b.x,b.z),plan=buildingPlan(b),parts=[],supports=[],horizontalSolids=[],playerRamps=[];
  const t=plan.wallT;
  const addWallX=(z,level,side)=>{
    const openings=buildingWallOpenings(b,level,side);
    for(const cell of splitWall(b.w,b.floorH,openings)){
      const x=b.x+cell.u,bottomY=base+level*b.floorH+cell.y,topY=bottomY+cell.h+.015;
      addBox(parts,'wall',x,z,cell.w+.015,t,bottomY,topY,{supportTop:cell.crouchStep,crouchStep:cell.crouchStep,traversal:cell.crouchStep?'vault':'mantle'});
      if(cell.crouchStep)supports.push({type:'rect',x,z,w:cell.w+.015,d:t,y:topY,role:'windowSill',crouchStep:true});
    }
    for(const opening of openings)addFrameX(parts,b,z+(side==='front'?-.012:.012),base,level,opening);
  };
  const addWallZ=(x,level,side)=>{
    const openings=buildingWallOpenings(b,level,side);
    for(const cell of splitWall(b.d,b.floorH,openings)){
      const z=b.z+cell.u,bottomY=base+level*b.floorH+cell.y,topY=bottomY+cell.h+.015;
      addBox(parts,'wall',x,z,t,cell.w+.015,bottomY,topY,{supportTop:cell.crouchStep,crouchStep:cell.crouchStep,traversal:cell.crouchStep?'vault':'mantle'});
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
      addBox(parts,'floor',panel.x,panel.z,panel.w+.03,panel.d+.03,floorY-.18,floorY,{supportTop:true,traversal:'mantle'});
      supports.push({type:'rect',x:panel.x,z:panel.z,w:panel.w,d:panel.d,y:floorY});
      horizontalSolids.push({x:panel.x,z:panel.z,w:panel.w,d:panel.d,bottomY:floorY-.18,topY:floorY});
    }
    addBox(parts,'floor',b.x,plan.balconyZ,plan.balconyW,plan.balconyD,floorY-.18,floorY,{supportTop:true,traversal:'mantle'});
    supports.push({type:'rect',x:b.x,z:plan.balconyZ,w:plan.balconyW,d:plan.balconyD,y:floorY});
    horizontalSolids.push({x:b.x,z:plan.balconyZ,w:plan.balconyW,d:plan.balconyD,bottomY:floorY-.18,topY:floorY});
    const railBottom=floorY+.08,outerZ=plan.front-b.balcony+.06;
    addBox(parts,'rail',b.x,outerZ,plan.balconyW,.14,railBottom,railBottom+.82,{traversal:'vault'});
    addBox(parts,'rail',b.x-plan.balconyW/2,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82,{traversal:'vault'});
    addBox(parts,'rail',b.x+plan.balconyW/2,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82,{traversal:'vault'});

    const guardY=floorY+.05,guardH=.76;
    // Guard the long edges only. The bottom and top of every straight flight
    // stay open so the player can walk directly onto and off the staircase.
    addBox(parts,'rail',(hole.left+hole.right)/2,hole.minZ+.05,hole.right-hole.left,.12,guardY,guardY+guardH,{traversal:'vault'});
    addBox(parts,'rail',(hole.left+hole.right)/2,hole.maxZ-.05,hole.right-hole.left,.12,guardY,guardY+guardH,{traversal:'vault'});
  }

  const roofY=base+b.floorH*levels;
  addBox(parts,'roof',b.x,b.z,b.w+.04,b.d+.04,roofY-.20,roofY,{supportTop:true,traversal:'mantle'});
  supports.push({type:'rect',x:b.x,z:b.z,w:b.w,d:b.d,y:roofY});
  horizontalSolids.push({x:b.x,z:b.z,w:b.w,d:b.d,bottomY:roofY-.20,topY:roofY});
  if(b.tall){
    const py=roofY;
    addBox(parts,'rail',b.x,b.z-b.d/2+.10,b.w,.20,py,py+.55,{traversal:'vault'});addBox(parts,'rail',b.x,b.z+b.d/2-.10,b.w,.20,py,py+.55,{traversal:'vault'});
    addBox(parts,'rail',b.x-b.w/2+.10,b.z,.20,b.d,py,py+.55,{traversal:'vault'});addBox(parts,'rail',b.x+b.w/2-.10,b.z,.20,b.d,py,py+.55,{traversal:'vault'});
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

export function makeAllBuildingGeometry(){return BUILDINGS.map(makeBuildingGeometry);}

export const BUILDING_GEOMETRY = makeAllBuildingGeometry();
export const BUILDING_SUPPORTS = BUILDING_GEOMETRY.flatMap(g=>g.supports);
export const BUILDING_HORIZONTAL_SOLIDS = BUILDING_GEOMETRY.flatMap(g=>g.horizontalSolids);
export const BUILDING_PLAYER_RAMPS = BUILDING_GEOMETRY.flatMap(g=>g.playerRamps);
export const BUILDING_PARTS = BUILDING_GEOMETRY.flatMap(g=>g.parts);

export const BUILDING_WINDOW_PORTALS = Object.freeze(BUILDINGS.flatMap((b,buildingIndex)=>{
  const base=terrainHeight(b.x,b.z),plan=buildingPlan(b),levels=Math.max(2,Math.min(6,Math.floor(b.levels||2))),portals=[];
  const sides=[
    {side:'front',nx:0,nz:-1,tx:1,tz:0,x:b.x,z:b.z-b.d/2+plan.wallT/2},
    {side:'back',nx:0,nz:1,tx:1,tz:0,x:b.x,z:b.z+b.d/2-plan.wallT/2},
    {side:'left',nx:-1,nz:0,tx:0,tz:1,x:b.x-b.w/2+plan.wallT/2,z:b.z},
    {side:'right',nx:1,nz:0,tx:0,tz:1,x:b.x+b.w/2-plan.wallT/2,z:b.z},
  ];
  for(let level=0;level<levels;level++)for(const face of sides){
    for(const opening of buildingWallOpenings(b,level,face.side)){
      if(opening.kind!=='window')continue;
      const cx=face.x+face.tx*opening.u,cz=face.z+face.tz*opening.u,floorY=base+level*b.floorH;
      portals.push(Object.freeze({
        id:`b${buildingIndex}-l${level}-${face.side}-${Math.round(opening.u*1000)}`,
        buildingIndex,level,side:face.side,cx,cz,nx:face.nx,nz:face.nz,tx:face.tx,tz:face.tz,
        width:opening.w,halfWidth:opening.w/2,wallThickness:plan.wallT,floorY,
        bottomY:floorY+opening.bottom,topY:floorY+opening.top,
      }));
    }
  }
  return portals;
}));

export const STATIC_SUPPORTS = STATIC_BOXES.map(o=>({type:'rect',x:o.x,z:o.z,w:o.w,d:o.d,y:terrainHeight(o.x,o.z)+o.h}));


// Canonical player collision proxies. Both the client predictor and the server
// authority consume these exact shapes; rendering never creates a second set of
// ad-hoc collision bounds.
export const STATIC_PLAYER_COLLIDERS = STATIC_BOXES.map(o=>{
  const minY=terrainHeight(o.x,o.z);
  return {type:'box',x:o.x,z:o.z,w:o.w,d:o.d,minX:o.x-o.w/2,maxX:o.x+o.w/2,minZ:o.z-o.d/2,maxZ:o.z+o.d/2,minY,maxY:minY+o.h,role:'static',supportTop:true,traversal:'mantle'};
});

export const NATURAL_PLAYER_COLLIDERS = NATURAL_OBSTACLES.map(o=>{
  const minY=naturalGroundBase(o.type,o.x,o.z,o.r);
  if(o.type==='tree')return {type:'round',x:o.x,z:o.z,r:o.r*.72,minY,maxY:minY+o.h*.64,role:'tree',supportTop:false,traversal:''};
  if(o.type==='bush'){
    // Foliage is visual/soft cover. Only the dense lower core blocks movement,
    // so a normal jump or vault clears a bush instead of colliding with leaves.
    const r=o.r*.46,maxY=minY+Math.min(.74,o.h*.50);
    return {type:'round',x:o.x,z:o.z,r,minY,maxY,role:'bush',supportTop:false,traversal:'vault'};
  }
  const r=o.r*.88,maxY=minY+o.h,supportRadius=Math.max(PLAYER_RADIUS+.14,o.r*.62);
  return {type:'round',x:o.x,z:o.z,r,minY,maxY,role:'rock',supportTop:true,supportRadius,traversal:'mantle'};
});

export const NATURAL_SUPPORTS = NATURAL_PLAYER_COLLIDERS.filter(c=>c.role==='rock').map(c=>({type:'round',x:c.x,z:c.z,r:c.supportRadius,y:c.maxY,role:'rock'}));

export const BUILDING_PLAYER_COLLIDERS = [
  ...BUILDING_PARTS.filter(p=>p.playerSolid).map(p=>({type:'box',x:p.x,z:p.z,w:p.w,d:p.d,minX:p.x-p.w/2,maxX:p.x+p.w/2,minZ:p.z-p.d/2,maxZ:p.z+p.d/2,minY:p.bottomY,maxY:p.topY,role:p.role,crouchStep:!!p.crouchStep,supportTop:!!p.supportTop,traversal:p.traversal||(p.crouchStep?'vault':p.supportTop?'mantle':'')})),
  ...BUILDING_PLAYER_RAMPS.map(r=>({...r,supportTop:true,traversal:''})),
];

export const WORLD_PLAYER_COLLIDERS = [...STATIC_PLAYER_COLLIDERS,...NATURAL_PLAYER_COLLIDERS,...BUILDING_PLAYER_COLLIDERS];


function circleTouchesRect(x,z,r,minX,maxX,minZ,maxZ){
  const qx=clamp(x,minX,maxX),qz=clamp(z,minZ,maxZ),dx=x-qx,dz=z-qz;
  return dx*dx+dz*dz<=r*r;
}

function surfaceHeightAt(surface,x,z,radius=PLAYER_RADIUS,contactRadius=SUPPORT_CONTACT_RADIUS){
  const r=Math.max(0,Number(radius)||0),contact=Math.min(r,Math.max(0,Number(contactRadius)||0));
  if(surface.type==='rect'){
    const minX=surface.x-surface.w/2,maxX=surface.x+surface.w/2,minZ=surface.z-surface.d/2,maxZ=surface.z+surface.d/2;
    // Feet need meaningful contact with a flat surface. Using the whole player
    // radius made floors/roofs grab the capsule ~38 cm before its center reached
    // an edge, causing stair-top pops and sticky ledges.
    return circleTouchesRect(x,z,contact,minX,maxX,minZ,maxZ)?surface.y:null;
  }
  // Round rocks still require the full capsule footprint to fit on top.
  if(surface.type==='round')return Math.hypot(x-surface.x,z-surface.z)<=Math.max(0,surface.r-r)?surface.y:null;
  if(surface.type==='ramp'){
    const lo=Math.min(surface.x1,surface.x2),hi=Math.max(surface.x1,surface.x2),minZ=surface.z-surface.w/2,maxZ=surface.z+surface.w/2;
    if(!circleTouchesRect(x,z,contact,lo,hi,minZ,maxZ))return null;
    const sx=clamp(x,lo,hi),span=surface.x2-surface.x1,t=Math.abs(span)>1e-9?(sx-surface.x1)/span:0;
    return surface.y0+(surface.y1-surface.y0)*t;
  }
  return null;
}

export function worldSupportHeight(x,z,currentY=terrainHeight(x,z),allowCrouchStep=false,playerRadius=PLAYER_RADIUS){
  let best=terrainHeight(x,z),limit=currentY+MAX_STEP_HEIGHT;
  for(const p of PYRAMIDS){
    const dx=Math.abs(x-p.x),dz=Math.abs(z-p.z),half=p.base/2;
    if(dx<=half&&dz<=half){const y=terrainHeight(p.x,p.z)+p.h*(1-Math.max(dx,dz)/half);if(y<=limit&&y>best)best=y;}
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
export function worldStepUpHeight(x,z,currentY,maxStepHeight=MAX_STEP_HEIGHT,playerRadius=PLAYER_RADIUS){
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
  for(const surface of BUILDING_SUPPORTS)consider(surface,false);
  return best;
}

export function resolveCeilingCollision(previousY,nextY,x,z,playerHeight=PLAYER_HEIGHT,playerRadius=PLAYER_RADIUS){
  if(nextY<=previousY)return{y:nextY,hit:false};
  const newHead=nextY+playerHeight,r=Math.max(0,Math.min(playerRadius,CEILING_HEAD_RADIUS)-.01);let resolved=nextY,hit=false;
  for(const s of BUILDING_HORIZONTAL_SOLIDS){
    const minX=s.x-s.w/2,maxX=s.x+s.w/2,minZ=s.z-s.d/2,maxZ=s.z+s.d/2;
    const qx=clamp(x,minX,maxX),qz=clamp(z,minZ,maxZ),dx=x-qx,dz=z-qz;
    if(dx*dx+dz*dz>=r*r)continue;
    // If the feet are still below the slab, any upward head penetration is a
    // ceiling hit. This also repairs a missed prior frame instead of letting the
    // player oscillate through the underside. The smaller head probe prevents
    // full-body-radius snagging at open stair/roof edges.
    if(previousY<s.bottomY-.01&&newHead>=s.bottomY-.018){resolved=Math.min(resolved,s.bottomY-playerHeight-.012);hit=true;}
  }
  return{y:resolved,hit};
}
