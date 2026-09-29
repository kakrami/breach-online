// Shared placement support policy, consumed by editor and runtime geometry.
export function supportProfile(o,height,isBuilding=false,margin=0){
 const a=(o.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),hs=[];
 const nx=Math.max(2,Math.ceil(o.w/2)),nz=Math.max(2,Math.ceil(o.d/2));
 for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){const x=o.w*(ix/nx-.5),z=o.d*(iz/nz-.5);hs.push(height(o.x+x*c-z*s,o.z+x*s+z*c));}
 hs.sort((a,b)=>a-b);const min=hs[0],max=hs.at(-1),level=isBuilding?max:hs[Math.floor(hs.length/2)],relief=max-min;
 return {o,level,min,max,relief,margin,blend:Math.max(isBuilding?3:1.5,Math.min(12,relief/0.3+2)),active:Math.abs(o.yOffset||0)<.05};
}
export function supportWeight(p,x,z){const o=p.o,a=(o.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-o.x,dz=z-o.z,ox=Math.max(Math.abs(dx*c+dz*s)-o.w/2-(p.margin||0),0),oz=Math.max(Math.abs(-dx*s+dz*c)-o.d/2-(p.margin||0),0),t=Math.min(1,Math.hypot(ox,oz)/p.blend);return 1-t*t*(3-2*t);}
