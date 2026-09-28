// Shared parametric assets. Dimensions are compiler inputs, never mesh-only scale.
export const BUILDING_ASSETS=Object.freeze({rowhouse:{label:'Row House',w:16,d:12,levels:2,floorH:3.1,style:'brick',balcony:2.8},shop:{label:'Corner Shop',w:18,d:14,levels:2,floorH:3.1,style:'plaster',balcony:2.5},garage:{label:'Garage',w:18,d:12,levels:1,floorH:3.8,style:'industrial',balcony:0},warehouse:{label:'Warehouse',w:28,d:20,levels:2,floorH:3.6,style:'warehouse',balcony:2},office:{label:'Office',w:20,d:16,levels:4,floorH:3.15,style:'office',balcony:3.5,tall:true},apartment:{label:'Apartment',w:22,d:18,levels:5,floorH:3.05,style:'plaster',balcony:3.8,tall:true},barracks:{label:'Barracks',w:24,d:12,levels:2,floorH:3.05,style:'utility',balcony:2.5},tower:{label:'Tower',w:15,d:15,levels:6,floorH:3.1,style:'tower',balcony:3,tall:true}});
export const PROP_ASSETS=Object.freeze({ruins:{label:'Ruins',w:8,d:7,h:3.1},doorway:{label:'Doorway',w:4,d:.5,h:3.1},windowWall:{label:'Window wall',w:4,d:.5,h:3.1},crate:{label:'Crate',w:4,d:4,h:3},barrier:{label:'Barrier',w:8,d:2,h:2.2},lowwall:{label:'Low Wall',w:10,d:1.5,h:1.6},pillar:{label:'Pillar',w:3,d:3,h:6},container:{label:'Container',w:12,d:5,h:4.8},car:{label:'Burnt Car',w:4.4,d:2,h:1.35},bus:{label:'Burnt Bus',w:10.5,d:2.5,h:2.95},brokenwall:{label:'Broken Wall',w:8,d:.7,h:2.15},sandbag:{label:'Sandbags',w:6.5,d:1.1,h:1.2},dumpster:{label:'Dumpster',w:3.4,d:2.2,h:1.45},fueltank:{label:'Fuel Tank',w:5,d:3.4,h:2.7},checkpoint:{label:'Checkpoint',w:4.6,d:3.2,h:2.45},pipebank:{label:'Pipe Bank',w:8,d:4,h:2.4},tank:{label:'Tank',w:8,d:10,h:3.3},shed:{label:'Shed',w:10,d:7,h:3.5}});
export const ELEVATION_ASSETS=Object.freeze({platform:{label:'Platform',w:12,d:12,rise:3},ramp:{label:'Ramp',w:6,d:14,rise:3},stairs:{label:'Stairs',w:5,d:10,rise:3},overpass:{label:'Overpass',w:9,d:24,rise:4.5}});

const aliases={car:'burntCar',bus:'burntBus',brokenwall:'brokenWall',fueltank:'fuelTank',pipebank:'pipe',box:'crate'};
export function assetIdentity(o={},family='building'){
 const raw=String(o.assetId||'');
 if(raw){if(!raw.startsWith(family+'/'))throw new Error(`Asset ${raw} does not belong to ${family}.`);return raw;}
 if(family==='building'){
  const legacy=o.archetype;
  if(BUILDING_ASSETS[legacy])return 'building/'+legacy;
  const style={brick:'rowhouse',plaster:'shop',office:'office',warehouse:'warehouse',utility:'barracks',tower:'tower'};
  return 'building/'+(style[o.style]||'custom');
 }
 const kind=o.kind||o.type||(family==='prop'?'crate':family==='elevation'?'platform':family);
 return family+'/'+(aliases[kind]||kind);
}
export function resolveAsset(o={},family='building'){
 const assetId=assetIdentity(o,family),key=assetId.split('/')[1];
 const presets=family==='building'?BUILDING_ASSETS:family==='elevation'?ELEVATION_ASSETS:PROP_ASSETS;
 if(family==='building'&&!presets[key]&&key!=='custom')throw new Error(`Unknown building asset: ${assetId}`);
 if(family==='elevation'&&!presets[key])throw new Error(`Unknown elevation asset: ${assetId}`);
 const preset=presets[key]||Object.entries(presets).find(([k])=>(aliases[k]||k)===key)?.[1]||{};
 return {...preset,...o,assetId,...(family==='building'?{archetype:key}:family==='prop'||family==='elevation'?{kind:key}:{})};
}

export const BUILDING_MATERIALS=Object.freeze({"plaster": [11972514, 5986129, 7367524], "brick": [9069909, 4209464, 6708567], "stone": [9211011, 4541001, 6776930], "office": [9542045, 3423555, 6449773], "industrial": [7765890, 3160125, 5594464], "warehouse": [9343891, 4147019, 6054499], "tower": [7299664, 3879465, 5984581], "utility": [9007963, 5325622, 5984581]});

// Parametric structural assets rebuild openings/supports as well as their visible mesh.
// Vehicles and detailed props retain their proportions instead of exposing stretch handles.
export function assetResizeMode(o={}){
 if(!o)return 'fixed';
 if(['road','building','elevation','mound'].includes(o.type))return 'parametric';
 if(o.type!=='prop')return 'fixed';
 const kind=String(o.assetId||o.kind||'').split('/').pop().toLowerCase();
 return ['crate','barrier','lowwall','pillar','concrete','brokenwall','ruins','doorway','windowwall'].includes(kind)?'parametric':'fixed';
}

// Shared library presets; editor and runtime resolve the same asset definitions.
export const OBJECT_LIBRARY = Object.freeze([
  {
    key: "house",
    label: "House",
    group: "Buildings",
    type: "building",
    archetype: "rowhouse",
    ...BUILDING_ASSETS.rowhouse,
    label: "House",
  },
  {
    key: "garage",
    label: "Garage",
    group: "Buildings",
    type: "building",
    archetype: "garage",
    ...BUILDING_ASSETS.garage,
  },
  {
    key: "warehouse",
    label: "Warehouse",
    group: "Buildings",
    type: "building",
    archetype: "warehouse",
    ...BUILDING_ASSETS.warehouse,
  },
  {
    key: "office",
    label: "Office",
    group: "Buildings",
    type: "building",
    archetype: "office",
    ...BUILDING_ASSETS.office,
  },
  {
    key: "wall",
    label: "Wall",
    group: "Pieces",
    type: "prop",
    kind: "barrier",
    w: 4,
    d: 0.4,
    h: 3.1,
  },
  {
    key: "floor",
    label: "Floor",
    group: "Pieces",
    type: "prop",
    kind: "concrete",
    w: 4,
    d: 4,
    h: 0.2,
  },
  {
    key: "block",
    label: "Block",
    group: "Pieces",
    type: "prop",
    kind: "crate",
    w: 4,
    d: 4,
    h: 3.1,
  },
  {
    key: "stairs",
    label: "Stairs",
    group: "Pieces",
    type: "elevation",
    kind: "stairs",
    w: 3,
    d: 6.35,
    rise: 3.1,
  },
  {
    key: "ramp",
    label: "Ramp",
    group: "Pieces",
    type: "elevation",
    kind: "ramp",
    w: 4,
    d: 8,
    rise: 3.1,
  },
  {
    key: "bridge",
    label: "Bridge",
    group: "Pieces",
    type: "elevation",
    kind: "overpass",
    w: 8,
    d: 12,
    rise: 3.1,
  },
  {
    key: "broken",
    label: "Broken wall",
    group: "Pieces",
    type: "prop",
    kind: "brokenWall",
    ...PROP_ASSETS.brokenwall,
  },
  {
    key: "ruins",
    label: "Ruins",
    group: "Pieces",
    type: "prop",
    kind: "ruins",
    w: 8,
    d: 7,
    h: 3.1,
  },
  {
    key: "doorway",
    label: "Doorway",
    group: "Pieces",
    type: "prop",
    kind: "doorway",
    w: 4,
    d: 0.5,
    h: 3.1,
  },
  {
    key: "window",
    label: "Window wall",
    group: "Pieces",
    type: "prop",
    kind: "windowWall",
    w: 4,
    d: 0.5,
    h: 3.1,
  },
  {
    key: "pillar",
    label: "Pillar",
    group: "Pieces",
    type: "prop",
    kind: "pillar",
    w: 1,
    d: 1,
    h: 3.1,
  },
  {
    key: "crate",
    label: "Crate",
    group: "Cover",
    type: "prop",
    kind: "crate",
    w: 2,
    d: 2,
    h: 1.5,
  },
  {
    key: "sandbag",
    label: "Sandbags",
    group: "Cover",
    type: "prop",
    kind: "sandbag",
    ...PROP_ASSETS.sandbag,
  },
  {
    key: "car",
    label: "Car",
    group: "Cover",
    type: "prop",
    kind: "burntCar",
    ...PROP_ASSETS.car,
    label: "Car",
  },
  {
    key: "container",
    label: "Container",
    group: "Cover",
    type: "prop",
    kind: "containerBlue",
    w: 12,
    d: 3.2,
    h: 2.85,
  },
  {
    key: "tree",
    label: "Tree",
    group: "Nature",
    type: "natural",
    kind: "tree",
    r: 0.8,
    h: 7.8,
  },
  {
    key: "rock",
    label: "Rock",
    group: "Nature",
    type: "natural",
    kind: "rock",
    r: 2,
    h: 2.4,
  },
  {
    key: "bush",
    label: "Bush",
    group: "Nature",
    type: "natural",
    kind: "bush",
    r: 1.7,
    h: 1.5,
  },
  ...Object.entries(BUILDING_ASSETS)
    .filter(
      ([key]) => !["rowhouse", "garage", "warehouse", "office"].includes(key),
    )
    .map(([key, value]) => ({
      key,
      label: value.label,
      group: "Buildings",
      type: "building",
      ...resolveAsset({ archetype: key }, "building"),
    })),
  ...Object.entries(PROP_ASSETS)
    .filter(
      ([key]) =>
        ![
          "ruins",
          "doorway",
          "windowWall",
          "crate",
          "barrier",
          "pillar",
          "container",
          "car",
          "brokenwall",
          "sandbag",
        ].includes(key),
    )
    .map(([key, value]) => ({
      key,
      label: value.label,
      group: "Cover",
      type: "prop",
      ...resolveAsset({ kind: key }, "prop"),
    })),
]);
