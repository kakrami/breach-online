export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.38;
export const ARENA_LIMIT = 120;
export const MAX_STEP_HEIGHT = 0.62;

export const STATIC_BOXES = [
  {x:0,z:0,w:8,d:8,h:3.2},{x:-24,z:-14,w:12,d:5,h:3.0},{x:28,z:19,w:11,d:6,h:3.8},{x:-42,z:34,w:7,d:13,h:4.2},
  {x:46,z:-36,w:9,d:9,h:3.4},{x:6,z:48,w:14,d:5,h:2.8},{x:-8,z:-52,w:6,d:15,h:3.1}
];

export const BUILDINGS = [
  {x:-8,z:28,w:18,d:14,floorH:3.25,balcony:4.2,levels:2},
  {x:63,z:-54,w:16,d:12,floorH:3.15,balcony:3.8,levels:2},
  {x:-70,z:42,w:14,d:11,floorH:3.05,balcony:3.4,levels:2},
  {x:68,z:38,w:20,d:16,floorH:3.15,balcony:4.0,levels:4,tall:true},
  {x:-62,z:-38,w:18,d:14,floorH:3.10,balcony:3.8,levels:5,tall:true}
];

export const PYRAMIDS = [
  {x:-34,z:-40,base:12,h:8},{x:38,z:42,base:14,h:10},{x:52,z:4,base:11,h:7},{x:-55,z:2,base:13,h:9},{x:18,z:-24,base:9,h:6}
];

export const NATURAL_OBSTACLES = [
  {type:'tree',x:-72,z:-28,r:.75,h:7.5},{type:'tree',x:-58,z:56,r:.82,h:8.2},{type:'tree',x:-38,z:72,r:.70,h:7.0},{type:'tree',x:-18,z:-78,r:.78,h:7.8},
  {type:'tree',x:16,z:72,r:.76,h:8.0},{type:'tree',x:34,z:-66,r:.82,h:8.4},{type:'tree',x:62,z:58,r:.75,h:7.6},{type:'tree',x:74,z:-30,r:.86,h:8.6},
  {type:'tree',x:-80,z:18,r:.72,h:7.2},{type:'tree',x:82,z:16,r:.78,h:8.0},{type:'tree',x:-48,z:-66,r:.76,h:7.7},{type:'tree',x:50,z:76,r:.72,h:7.4},
  {type:'bush',x:-62,z:-6,r:1.7,h:1.5},{type:'bush',x:-31,z:51,r:1.9,h:1.6},{type:'bush',x:-12,z:-34,r:1.6,h:1.4},{type:'bush',x:10,z:31,r:1.8,h:1.5},
  {type:'bush',x:31,z:-45,r:1.7,h:1.5},{type:'bush',x:57,z:23,r:1.9,h:1.6},{type:'bush',x:76,z:-58,r:1.6,h:1.4},{type:'bush',x:-78,z:62,r:1.8,h:1.5},
  {type:'rock',x:-54,z:20,r:2.2,h:2.7},{type:'rock',x:-22,z:16,r:1.8,h:2.2},{type:'rock',x:15,z:-58,r:2.1,h:2.5},{type:'rock',x:44,z:54,r:2.3,h:2.8},
  {type:'rock',x:68,z:-4,r:1.9,h:2.3},{type:'rock',x:-70,z:-52,r:2.0,h:2.4},{type:'rock',x:8,z:82,r:1.8,h:2.1},{type:'rock',x:86,z:46,r:2.1,h:2.6}
];

const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

export function rawTerrainHeight(x,z){
  const rolling=0.55+1.15*Math.sin(x*0.031)*Math.cos(z*0.027)+0.72*Math.sin((x+z)*0.021)+0.48*Math.cos((x-z)*0.018);
  const westRidge=8.8*Math.exp(-((x+62)**2)/1150)*Math.exp(-((z-20)**2)/6200);
  const northHill=10.5*Math.exp(-((x-34)**2+(z-68)**2)/1450);
  const southHill=7.2*Math.exp(-((x+20)**2+(z+67)**2)/1200);
  const eastRise=6.5*Math.exp(-((x-78)**2+(z+10)**2)/1750);
  const centerKnoll=4.4*Math.exp(-((x-8)**2+(z-4)**2)/900);
  const valley=4.0*Math.exp(-((x+12)**2+(z-34)**2)/1050);
  return clamp(rolling+westRidge+northHill+southHill+eastRise+centerKnoll-valley,-2.4,13.8);
}

const foundations = [
  ...PYRAMIDS.map(p=>({x:p.x,z:p.z,halfX:p.base/2+.45,halfZ:p.base/2+.45,blend:4.0})),
  ...STATIC_BOXES.map(o=>({x:o.x,z:o.z,halfX:o.w/2+.45,halfZ:o.d/2+.45,blend:4.0})),
  ...BUILDINGS.map(b=>({x:b.x,z:b.z,halfX:b.w/2+.55,halfZ:b.d/2+.55,blend:4.5}))
];

export function terrainHeight(x,z){
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

export function terrainMinAround(x,z,r){
  let min=terrainHeight(x,z);
  for(const scale of [.45,1])for(let i=0;i<24;i++){
    const a=i*Math.PI*2/24;
    min=Math.min(min,terrainHeight(x+Math.cos(a)*r*scale,z+Math.sin(a)*r*scale));
  }
  return min;
}

export function naturalGroundBase(type,x,z,r){
  const footprint=type==='tree'?r:type==='bush'?r*.95:r*.9;
  const burial=type==='tree'?.16:type==='bush'?.14:.24;
  return terrainMinAround(x,z,footprint)-burial;
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
    rects.push({left,right,bottom,top});
  }
  const eq=(a,b)=>Math.abs(a-b)<.001;let changed=true;
  while(changed){
    changed=false;
    outer:for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j];
      if(eq(a.bottom,b.bottom)&&eq(a.top,b.top)&&(eq(a.right,b.left)||eq(b.right,a.left))){rects[i]={left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),bottom:a.bottom,top:a.top};rects.splice(j,1);changed=true;break outer;}
      if(eq(a.left,b.left)&&eq(a.right,b.right)&&(eq(a.top,b.bottom)||eq(b.top,a.bottom))){rects[i]={left:a.left,right:a.right,bottom:Math.min(a.bottom,b.bottom),top:Math.max(a.top,b.top)};rects.splice(j,1);changed=true;break outer;}
    }
  }
  return rects.map(r=>({u:(r.left+r.right)/2,y:r.bottom,w:r.right-r.left,h:r.top-r.bottom}));
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
  const wallT=.36;
  // Each story uses one uninterrupted straight flight. Multi-story buildings
  // alternate between two adjacent lanes only after reaching a full floor.
  const stairW=Math.min(1.82,Math.max(1.58,b.d*.125)),stairGap=.48;
  const stairD=stairW*2+stairGap,runLen=Math.min(6.2,Math.max(5.15,b.w*.38));
  const stairZ=clamp(b.z+b.d*.13,b.z-b.d/2+stairD/2+.62,b.z+b.d/2-stairD/2-.62);
  const laneOffset=stairGap/2+stairW/2,laneA=stairZ-laneOffset,laneB=stairZ+laneOffset;
  const lowX=b.x-runLen/2,highX=b.x+runLen/2;
  const makeHole=z=>({left:lowX-.08,right:highX+.08,minZ:z-stairW/2-.10,maxZ:z+stairW/2+.10});
  const holes=[makeHole(laneA),makeHole(laneB)];
  const front=b.z-b.d/2,balconyOverlap=.92,balconyD=b.balcony+balconyOverlap,balconyZ=front-b.balcony/2+balconyOverlap/2,balconyOutsideZ=front-b.balcony/2;
  return{wallT,stairW,stairGap,stairD,runLen,stairZ,laneA,laneB,lowX,highX,holes,front,balconyOverlap,balconyD,balconyZ,balconyOutsideZ};
}

function addBox(parts,role,x,z,w,d,bottomY,topY,flags={}){
  if(w<=0||d<=0||topY-bottomY<=0)return;
  parts.push({role,x,z,w,d,bottomY,topY,playerSolid:flags.playerSolid!==false,projectileSolid:flags.projectileSolid!==false,supportTop:!!flags.supportTop,decorative:!!flags.decorative});
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
  const levels=Math.max(2,Math.min(6,Math.floor(b.levels||2))),base=terrainHeight(b.x,b.z),plan=buildingPlan(b),parts=[],supports=[],horizontalSolids=[];
  const t=plan.wallT;
  const addWallX=(z,level,side)=>{
    const openings=buildingWallOpenings(b,level,side);
    for(const cell of splitWall(b.w,b.floorH,openings))addBox(parts,'wall',b.x+cell.u,z,cell.w+.015,t,base+level*b.floorH+cell.y,base+level*b.floorH+cell.y+cell.h+.015);
    for(const opening of openings)addFrameX(parts,b,z+(side==='front'?-.012:.012),base,level,opening);
  };
  const addWallZ=(x,level,side)=>{
    const openings=buildingWallOpenings(b,level,side);
    for(const cell of splitWall(b.d,b.floorH,openings))addBox(parts,'wall',x,b.z+cell.u,t,cell.w+.015,base+level*b.floorH+cell.y,base+level*b.floorH+cell.y+cell.h+.015);
    for(const opening of openings)addFrameZ(parts,b,x+(side==='left'?-.012:.012),base,level,opening);
  };
  for(let level=0;level<levels;level++){
    addWallX(b.z-b.d/2+t/2,level,'front');addWallX(b.z+b.d/2-t/2,level,'back');
    addWallZ(b.x-b.w/2+t/2,level,'left');addWallZ(b.x+b.w/2-t/2,level,'right');
  }

  for(let floorLevel=1;floorLevel<levels;floorLevel++){
    const floorY=base+floorLevel*b.floorH,hole=plan.holes[(floorLevel-1)%2],panels=panelsAroundHole(b,hole);
    for(const panel of panels){
      addBox(parts,'floor',panel.x,panel.z,panel.w+.03,panel.d+.03,floorY-.18,floorY,{supportTop:true});
      supports.push({type:'rect',x:panel.x,z:panel.z,w:panel.w,d:panel.d,y:floorY});
      horizontalSolids.push({x:panel.x,z:panel.z,w:panel.w,d:panel.d,bottomY:floorY-.18,topY:floorY});
    }
    addBox(parts,'floor',b.x,plan.balconyZ,b.w*.56,plan.balconyD,floorY-.18,floorY,{supportTop:true});
    supports.push({type:'rect',x:b.x,z:plan.balconyZ,w:b.w*.56,d:plan.balconyD,y:floorY});
    horizontalSolids.push({x:b.x,z:plan.balconyZ,w:b.w*.56,d:plan.balconyD,bottomY:floorY-.18,topY:floorY});
    const railBottom=floorY+.08,outerZ=plan.front-b.balcony+.06;
    addBox(parts,'rail',b.x,outerZ,b.w*.56,.14,railBottom,railBottom+.82);
    addBox(parts,'rail',b.x-b.w*.28,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82);
    addBox(parts,'rail',b.x+b.w*.28,plan.balconyOutsideZ,.14,b.balcony,railBottom,railBottom+.82);

    const guardY=floorY+.05,guardH=.76;
    // Guard only the long sides of the stair opening. Both ends remain open so
    // the straight flight has a clean, continuous transition at each floor.
    addBox(parts,'rail',(hole.left+hole.right)/2,hole.minZ+.05,hole.right-hole.left,.12,guardY,guardY+guardH);
    addBox(parts,'rail',(hole.left+hole.right)/2,hole.maxZ-.05,hole.right-hole.left,.12,guardY,guardY+guardH);
  }

  const roofY=base+b.floorH*levels;
  addBox(parts,'roof',b.x,b.z,b.w+.04,b.d+.04,roofY-.20,roofY,{supportTop:true});
  supports.push({type:'rect',x:b.x,z:b.z,w:b.w,d:b.d,y:roofY});
  horizontalSolids.push({x:b.x,z:b.z,w:b.w,d:b.d,bottomY:roofY-.20,topY:roofY});
  if(b.tall){
    const py=roofY;
    addBox(parts,'rail',b.x,b.z-b.d/2+.10,b.w,.20,py,py+.55);addBox(parts,'rail',b.x,b.z+b.d/2-.10,b.w,.20,py,py+.55);
    addBox(parts,'rail',b.x-b.w/2+.10,b.z,.20,b.d,py,py+.55);addBox(parts,'rail',b.x+b.w/2-.10,b.z,.20,b.d,py,py+.55);
  }

  const steps=12,stepLen=plan.runLen/steps;
  for(let story=0;story<levels-1;story++){
    const floorY=base+story*b.floorH,nextY=floorY+b.floorH;
    const ascendingRight=story%2===0,laneZ=story%2===0?plan.laneA:plan.laneB;
    const x0=ascendingRight?plan.lowX:plan.highX,x1=ascendingRight?plan.highX:plan.lowX;
    supports.push({type:'ramp',x1:x0,x2:x1,z:laneZ,w:plan.stairW-.12,y0:floorY,y1:nextY});
    for(let i=0;i<steps;i++){
      const p0=i/steps,p1=(i+1)/steps,mid=(p0+p1)/2,tread=floorY+(nextY-floorY)*p1,x=x0+(x1-x0)*mid;
      addBox(parts,'stairStep',x,laneZ,stepLen+.04,plan.stairW,tread-.16,tread,{playerSolid:true,projectileSolid:true,supportTop:true});
      horizontalSolids.push({x,z:laneZ,w:stepLen+.04,d:plan.stairW,bottomY:tread-.16,topY:tread});
      // Solid stair stringers prevent sideways clipping through the flight and
      // also make the visible staircase match player/projectile collision.
      for(const side of [-1,1]){
        const sideZ=laneZ+side*(plan.stairW/2-.06);
        addBox(parts,'stairSide',x,sideZ,stepLen+.055,.14,floorY,tread+.78,{playerSolid:true,projectileSolid:true});
      }
    }
  }

  return{levels,base,plan,parts,supports,horizontalSolids};
}

export function makeAllBuildingGeometry(){return BUILDINGS.map(makeBuildingGeometry);}

export const BUILDING_GEOMETRY = makeAllBuildingGeometry();
export const BUILDING_SUPPORTS = BUILDING_GEOMETRY.flatMap(g=>g.supports);
export const BUILDING_HORIZONTAL_SOLIDS = BUILDING_GEOMETRY.flatMap(g=>g.horizontalSolids);
export const BUILDING_PARTS = BUILDING_GEOMETRY.flatMap(g=>g.parts);

export const STATIC_SUPPORTS = STATIC_BOXES.map(o=>({type:'rect',x:o.x,z:o.z,w:o.w,d:o.d,y:terrainHeight(o.x,o.z)+o.h}));


function surfaceHeightAt(surface,x,z){
  if(surface.type==='rect')return Math.abs(x-surface.x)<=surface.w/2&&Math.abs(z-surface.z)<=surface.d/2?surface.y:null;
  if(surface.type==='ramp'&&Math.abs(z-surface.z)<=surface.w/2){
    const lo=Math.min(surface.x1,surface.x2),hi=Math.max(surface.x1,surface.x2);
    if(x>=lo&&x<=hi){const t=(x-surface.x1)/(surface.x2-surface.x1);return surface.y0+(surface.y1-surface.y0)*t;}
  }
  return null;
}

export function worldSupportHeight(x,z,currentY=terrainHeight(x,z)){
  let best=terrainHeight(x,z),limit=currentY+MAX_STEP_HEIGHT;
  for(const p of PYRAMIDS){
    const dx=Math.abs(x-p.x),dz=Math.abs(z-p.z),half=p.base/2;
    if(dx<=half&&dz<=half){const y=terrainHeight(p.x,p.z)+p.h*(1-Math.max(dx,dz)/half);if(y<=limit&&y>best)best=y;}
  }
  for(const surface of STATIC_SUPPORTS){const y=surfaceHeightAt(surface,x,z);if(y!=null&&y<=limit&&y>best)best=y;}
  for(const surface of BUILDING_SUPPORTS){const y=surfaceHeightAt(surface,x,z);if(y!=null&&y<=limit&&y>best)best=y;}
  return best;
}

export function resolveCeilingCollision(previousY,nextY,x,z){
  if(nextY<=previousY)return{y:nextY,hit:false};
  const oldHead=previousY+PLAYER_HEIGHT,newHead=nextY+PLAYER_HEIGHT;let resolved=nextY,hit=false;
  for(const s of BUILDING_HORIZONTAL_SOLIDS){
    if(Math.abs(x-s.x)>s.w/2+PLAYER_RADIUS*.35||Math.abs(z-s.z)>s.d/2+PLAYER_RADIUS*.35)continue;
    if(oldHead<=s.bottomY+.025&&newHead>=s.bottomY-.025){resolved=Math.min(resolved,s.bottomY-PLAYER_HEIGHT-.012);hit=true;}
  }
  return{y:resolved,hit};
}
