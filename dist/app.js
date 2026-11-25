'use strict';
const $ = id => document.getElementById(id);
const metaMode=new URLSearchParams(location.search).get('source')==='metabot';
$('source').value=metaMode?'metabot':'pins';
$('source').onchange=()=>{
  const url=new URL(location.href);
  if($('source').value==='metabot')url.searchParams.set('source','metabot');
  else url.searchParams.delete('source');
  location.assign(url.href);
};
const catalog=metaMode?window.METABOT.catalog:window.CATALOG;
const groups = new Map(catalog.map(g => [g.key,g]));
const names = new Intl.NumberFormat('ko-KR');
const format = n => names.format(n);
const defaults = metaMode?catalog.filter(g=>g.on).map(g=>g.key):['Ancient_Spire','Hollow_Halls','Shroud_Root','srv_shroud_root','srv_well_core_unconfirmed','srv_fast_travel','Village','Flame_Shrine'];
const storageKey = metaMode?'enshrouded-map:metabot:filters:v1':'embervale-map:filters:v2';
function readSelection(){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(Array.isArray(saved)){
      if(!metaMode && saved.includes('srv_puzzle_parts'))saved.push('srv_puzzle_buttons','srv_levers_plates');
      return saved.filter(key=>groups.has(key));
    }
  }catch{}
  return defaults.filter(key=>groups.has(key));
}
const selected=new Set(readSelection());
const points=metaMode?window.METABOT.points:window.POINTS;
const sections=new Map();
for(const group of catalog){
  if(!sections.has(group.section))sections.set(group.section,[]);
  sections.get(group.section).push(group);
}
const map=L.map('map',{crs:L.CRS.Simple,zoomControl:false,attributionControl:false,minZoom:-4,maxZoom:5,zoomSnap:.125,zoomDelta:.5,zoomAnimation:false});
const size=2048;
const bounds=[[0,0],[size,size]];
L.imageOverlay('terrain.webp',bounds,{alt:'엠버베일 지형'}).addTo(map);
if(typeof addTerrainDetail==='function')addTerrainDetail(map);
// Highlight pale terrain within the mapped Albaneve Summits boundary.
const snowPane=map.createPane('snowRelief');
snowPane.style.zIndex=410;
snowPane.style.pointerEvents='none';
L.imageOverlay('albaneve-snow.webp',[[772.8, 1048.0], [1593.6, 2048.0]],{pane:'snowRelief',alt:''}).addTo(map);
const resetMap=()=>map.fitBounds(bounds,{animate:false});
resetMap();
map.setMaxBounds([[-size/2,-size/2],[size*1.5,size*1.5]]);
const pane=map.createPane('atlasPins');
pane.style.zIndex=440;
pane.style.pointerEvents='none';
const canvas=document.createElement('canvas');
canvas.setAttribute('aria-hidden','true');
pane.append(canvas);
const ctx=canvas.getContext('2d');
const images=new Map();
let hits=[],frame=0,visible=[],results=[],shown=0;
const perPage=80;
const mobile=window.matchMedia('(max-width:680px)');
const dataByKey=new Map();
const regionPane=map.createPane('regionOverlay');
regionPane.style.zIndex=415;
regionPane.style.pointerEvents='none';
const regionLayers=new Map();
const labels=L.layerGroup();
const alwaysVisible='레벨우드';
const spoilerKey='enshrouded-map:revealed-regions:v1';
const revealed=new Set([alwaysVisible]);
try{
  const saved=JSON.parse(localStorage.getItem(spoilerKey));
  if(Array.isArray(saved))for(const region of window.REGIONS){
    if(saved.includes(region.name))revealed.add(region.name);
  }
}catch{}
const svgNS='http://www.w3.org/2000/svg';
const fog=document.createElementNS(svgNS,'svg');
fog.setAttribute('viewBox','0 0 2048 2048');
const clip=document.createElementNS(svgNS,'clipPath');
clip.id='hidden-regions';
const defs=document.createElementNS(svgNS,'defs');
defs.append(clip);
const fogImage=document.createElementNS(svgNS,'image');
fogImage.setAttribute('href','spoiler-relief.webp');
fogImage.setAttribute('width','2048');
fogImage.setAttribute('height','2048');
fogImage.setAttribute('clip-path','url(#hidden-regions)');
fog.append(defs,fogImage);
const fogPane=map.createPane('spoilerTerrain');
fogPane.style.zIndex=408;
fogPane.style.pointerEvents='none';
L.svgOverlay(fog,bounds,{pane:'spoilerTerrain',interactive:false}).addTo(map);
function updateSpoilers(){
  $('spoilerCount').textContent=(revealed.size-1)+' / '+(window.REGIONS.length-1);
}
for(const r of window.REGIONS){
  const path=document.createElementNS(svgNS,'path');
  path.setAttribute('clip-rule','evenodd');
  path.setAttribute('d',r.rings.flatMap(polygon=>polygon.map(ring=>
    'M'+ring.map(([y,x])=>x+','+(size-y)).join('L')+'Z')).join(' '));
  if(!revealed.has(r.name))clip.append(path);
  const label=document.createElement('label');
  const box=document.createElement('input');
  box.type='checkbox';
  box.checked=revealed.has(r.name);
  box.disabled=r.name===alwaysVisible;
  label.append(box,r.name+(box.disabled?' (항상 표시)':''));
  $('spoilerOptions').append(label);
  box.onchange=()=>{
    if(box.checked){revealed.add(r.name);path.remove()}
    else{revealed.delete(r.name);clip.append(path)}
    try{localStorage.setItem(spoilerKey,JSON.stringify([...revealed]))}catch{}
    updateSpoilers();
    drawRegions();
    if(!$('places').hidden)search();
    refreshVisible();
  };
}
updateSpoilers();
for(const r of window.REGIONS){
  $('region').add(new Option(r.name+' · Lv. '+r.level,r.name));
  const polygon=L.polygon(r.rings,{pane:'regionOverlay',interactive:false,color:r.color,weight:1.5,opacity:.85,fillOpacity:.10});
  const label=L.tooltip({pane:'regionOverlay',permanent:true,direction:'center',className:'region-label',opacity:1})
    .setLatLng(r.anchor).setContent(r.name);
  regionLayers.set(r.name,{polygon,label});
}
function displayRegion(p){return p[3]==='Low Meadows'?'키 작은 목초지':p[3]}
function regionName(p){return p[3]==='Low Meadows'?'스프링랜드':p[3]}
function regionMatches(p){
  const name=regionName(p);
  return (revealed.has(name)||(!name&&revealed.size===window.REGIONS.length))&&(!$('region').value||name===$('region').value);
}
function drawRegions(){
  labels.clearLayers();
  for(const [name,{polygon,label}] of regionLayers){
    if(!$('boundaries').checked){polygon.remove();continue}
    const focused=$('region').value===name;
    polygon.setStyle({weight:focused?3:1.5,fillOpacity:focused ? 0.2 : 0.08}).addTo(map);
    if(!$('region').value||focused)labels.addLayer(label);
  }
  labels.addTo(map);
}
$('boundaries').onchange=drawRegions;
$('region').onchange=()=>{
  drawRegions();
  const region=regionLayers.get($('region').value);
  if(region)map.fitBounds(region.polygon.getBounds(),{padding:[8,8],animate:false});else resetMap();
  if(!$('places').hidden)search();
  refreshVisible();
};
drawRegions();
const coords=p=>[p[5]/5,p[4]/5];
const xy=p=>'X '+Math.round(p[4])+' · Z '+Math.round(p[5]);
const title=p=>p[1]||p[2]||groups.get(p[0]).title;
function searchable(value){return String(value||'').toLowerCase()}
const pointText=points.map(p=>{
  for(const key of [p[0],p[7]].filter(Boolean)){
    if(!dataByKey.has(key))dataByKey.set(key,[]);
    dataByKey.get(key).push(p);
  }
  const g=groups.get(p[0]);
  return searchable([p[1],p[2],p[3],displayRegion(p),regionName(p),p[8],g.title,g.en,g.aliases,groups.get(p[7])?.aliases,groups.get(p[7])?.title,groups.get(p[7])?.en,xy(p)].join(' '));
});
function element(tag,text,cls){
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(cls)el.className=cls;
  return el;
}
function icon(path){
  const img=element('img',undefined,'icon');
  img.alt='';
  img.loading='lazy';
  img.src=path;
  return img;
}
function sprite(path){
  if(!images.has(path)){
    const img=new Image();
    img.onload=scheduleDraw;
    img.src=path;
    images.set(path,img);
  }
  return images.get(path);
}
function panel(open){
  $('panel').classList.toggle('open',open);
  $('paneltoggle').setAttribute('aria-expanded',String(open));
}
$('paneltoggle').onclick=()=>panel(!$('panel').classList.contains('open'));
$('plus').onclick=()=>map.zoomIn();
$('minus').onclick=()=>map.zoomOut();
$('home').onclick=()=>{ $('region').value=''; $('region').onchange() };
function tab(places){
  $('places').hidden=!places;
  $('filters').hidden=places;
  $('placesTab').setAttribute('aria-pressed',String(places));
  $('filterTab').setAttribute('aria-pressed',String(!places));
  if(places)search();
  refreshVisible();
}
$('placesTab').onclick=()=>tab(true);
$('filterTab').onclick=()=>tab(false);
function saveSelection(){
  try{localStorage.setItem(storageKey,JSON.stringify([...selected]))}catch{}
  updateFilters();
  if(!$('places').hidden)search();
  refreshVisible();
}
const rows=new Map();
const detailsBySection=new Map();
for(const [section,items] of sections){
  const block=element('details');
  const summary=element('summary');
  const samples=element('span',undefined,'samples');
  samples.setAttribute('aria-hidden','true');
  for(const g of items.slice(0,2))samples.append(icon(g.icon));
  summary.append(samples,element('span',section));
  summary.append(element('small',String(items.length)));
  block.append(summary);
  const sectionActions=element('div',undefined,'section-actions');
  for(const [label,enable] of [['분류 선택',true],['분류 해제',false]]){
    const action=element('button',label);
    action.onclick=()=>{
      for(const group of items){
        if(enable)selected.add(group.key);else selected.delete(group.key);
      }
      saveSelection();
    };
    sectionActions.append(action);
  }
  block.append(sectionActions);
  detailsBySection.set(section,block);
  for(const g of items){
    const row=element('label',undefined,'group');
    const box=element('input');
    box.type='checkbox';
    box.onchange=()=>{
      if(box.checked)selected.add(g.key);else selected.delete(g.key);
      saveSelection();
    };
    row.append(box,icon(g.icon),element('span',g.title),element('small',format(g.count)));
    rows.set(g.key,{row,box});
    block.append(row);
  }
  $('groups').append(block);
}
function updateFilters(){
  $('filterInfo').textContent=selected.size+' / '+catalog.length+'개 필터';
  for(const [key,{box}] of rows)box.checked=selected.has(key);
}
$('selectAll').onclick=()=>{catalog.forEach(g=>selected.add(g.key));saveSelection()};
$('clearAll').onclick=()=>{selected.clear();saveSelection()};
let beforeSearch;
$('filterQuery').oninput=()=>{
  const q=searchable($('filterQuery').value.trim());
  if(q && !beforeSearch)beforeSearch=new Map([...detailsBySection].map(([k,d])=>[k,d.open]));
  for(const [section,items] of sections){
    const block=detailsBySection.get(section);
    let any=false;
    for(const g of items){
      const hit=searchable([section,g.title,g.en,g.key,g.aliases].join(' ')).includes(q);
      rows.get(g.key).row.hidden=!hit;
      if(hit)any=true;
    }
    block.hidden=!any;
    if(q)block.open=any;else if(beforeSearch)block.open=beforeSearch.get(section);
  }
  if(!q)beforeSearch=null;
  $('groups').querySelector('.empty')?.remove();
  if(![...detailsBySection.values()].some(d=>!d.hidden))$('groups').append(element('p','일치하는 필터가 없습니다.','empty'));
};
function refreshVisible(){
  const queryActive=!$('places').hidden && $('query').value.trim().length>0;
  visible=queryActive?results:[...new Set([...selected].flatMap(key=>dataByKey.get(key)||[]))].filter(regionMatches);
  map.closePopup();
  scheduleDraw();
}
function scheduleDraw(){
  if(!frame)frame=requestAnimationFrame(draw);
}
function draw(){
  frame=0;
  const view=map.getSize();
  const ratio=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(view.x*ratio)||canvas.height!==Math.round(view.y*ratio)){
    canvas.width=Math.round(view.x*ratio);canvas.height=Math.round(view.y*ratio);
    canvas.style.width=view.x+'px';canvas.style.height=view.y+'px';
  }
  L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,view.x,view.y);
  const origin=map.latLngToContainerPoint([0,0]);
  const scale=Math.pow(2,map.getZoom())/5;
  const cells=new Map();
  const spacing=map.getZoom()>2?25:34;
  for(const p of visible){
    const x=origin.x+p[4]*scale,y=origin.y-p[5]*scale;
    if(x< -18||x>view.x+18||y< -18||y>view.y+18)continue;
    const key=Math.floor(x/spacing)+':'+Math.floor(y/spacing);
    if(!cells.has(key))cells.set(key,{x,y,items:[p]});
    else cells.get(key).items.push(p);
  }
  hits=[...cells.values()];
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const {x,y,items} of hits){
    const p=items[0],img=sprite(markerIcon(p));
    ctx.beginPath();ctx.arc(x,y,11,0,2*Math.PI);ctx.fillStyle='#142221ec';ctx.fill();
    ctx.strokeStyle='#c2b38c';ctx.lineWidth=1.2;ctx.stroke();
    if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-9.5,y-9.5,19,19);
    if(items.length>1){
      const label=items.length>999?'999+':String(items.length);
      ctx.font='bold 10px system-ui';
      const w=Math.max(14,Math.ceil(ctx.measureText(label).width)+6);
      ctx.fillStyle='#f4d298';ctx.beginPath();ctx.roundRect(x+4,y-16,w,13,6);ctx.fill();
      ctx.fillStyle='#182221';ctx.fillText(label,x+4+w/2,y-9);
    }
  }
}
function markerIcon(p){
  const alternate=p[7];
  if(alternate && selected.has(alternate) && !selected.has(p[0]))return groups.get(alternate).icon;
  return p[6] || groups.get(p[0]).icon;
}
function openPlace(p){
  const g=groups.get(p[0]);
  const body=element('div',undefined,'place-note');
  const copy=element('div');
  copy.append(element('strong',title(p)),element('small',[g.title,displayRegion(p)].filter(Boolean).join(' · ')),element('small',xy(p)));
  if(p[8])copy.append(element('small',p[8]));
  if(p[9]){
    const source=element('a','MetaBot 원문');
    source.href='https://metabot.gg'+p[9];
    source.target='_blank';
    source.rel='noreferrer';
    copy.append(source);
  }
  body.append(icon(markerIcon(p)),copy);
  L.popup({offset:[0,-12]}).setLatLng(coords(p)).setContent(body).openOn(map);
}
function choose(p){
  if(mobile.matches)panel(false);
  if(!selected.has(p[0]) && !selected.has(p[7])){
    selected.add(p[0]);saveSelection();
  }
  map.setView(coords(p),Math.max(1,map.getZoom()),{animate:false});
  openPlace(p);
}
map.on('move zoom resize viewreset',scheduleDraw);
map.on('click',event=>{
  if(mobile.matches)panel(false);
  const pos=event.containerPoint;
  let hit,distance=22;
  for(const cell of hits){
    const d=Math.hypot(pos.x-cell.x,pos.y-cell.y);
    if(d<distance){hit=cell;distance=d}
  }
  if(!hit)return;
  if(hit.items.length===1){openPlace(hit.items[0]);return}
  if(map.getZoom()<map.getMaxZoom()){
    map.setView(coords(hit.items[0]),Math.min(map.getMaxZoom(),map.getZoom()+1.25));
  }else{
    const list=element('div',undefined,'popup-list');
    for(const p of hit.items){
      const btn=element('button',title(p)+' · '+xy(p));
      btn.onclick=()=>openPlace(p);list.append(btn);
    }
    L.popup().setLatLng(event.latlng).setContent(list).openOn(map);
  }
});
function addResults(){
  const container=$('results');
  container.querySelector('.more')?.remove();
  const fragment=document.createDocumentFragment();
  for(const p of results.slice(shown,shown+perPage)){
    const btn=element('button',undefined,'result');
    const label=element('span',title(p));
    label.append(element('small',[displayRegion(p),xy(p)].filter(Boolean).join(' · ')));
    btn.append(icon(markerIcon(p)),label);
    btn.onclick=()=>choose(p);
    fragment.append(btn);
  }
  shown=Math.min(results.length,shown+perPage);
  if(shown<results.length){
    const more=element('button','더 보기','more');
    more.onclick=addResults;
    fragment.append(more);
  }
  container.append(fragment);
}
const termIndex=window.MAP_TERMS.map(([en,ko])=>searchable(en+' '+ko));
let termResults=[],termsShown=0;
function appendTerms(){
  const list=$('termResults');
  list.querySelector('.more')?.remove();
  const next=termResults.slice(termsShown,termsShown+40);
  for(const [en,ko,path] of next){
    const link=element('a',undefined,'term-link');
    link.href='https://metabot.gg/ko_KR/enshrouded/'+path;
    link.target='_blank';link.rel='noreferrer';
    link.append(element('span',ko),element('small',en));
    list.append(link);
  }
  termsShown+=next.length;
  if(termsShown<termResults.length){
    const more=element('button','명칭 더 보기','more');
    more.onclick=appendTerms;
    list.append(more);
  }
}
function renderTerms(){
  $('termResults').replaceChildren();
  termsShown=0;
  if(!$('termPanel').open)return;
  if(termResults.length)appendTerms();
  else $('termResults').append(element('p','일치하는 명칭이 없습니다.','empty'));
}
$('termPanel').ontoggle=renderTerms;
function search(){
  const tokens=searchable($('query').value.trim()).split(/[\s,·]+/).filter(Boolean);
  termResults=window.MAP_TERMS.filter((_,i)=>tokens.every(t=>termIndex[i].includes(t)));
  $('termCount').textContent=format(termResults.length)+'건';
  renderTerms();
  results=points.filter((p,i)=>regionMatches(p)&&(!$('selectedOnly').checked||selected.has(p[0])||selected.has(p[7]))&&tokens.every(t=>pointText[i].includes(t)));
  shown=0;$('results').replaceChildren();$('results').scrollTop=0;
  $('count').textContent=format(results.length)+'곳';
  if(!results.length)$('results').append(element('p','일치하는 장소가 없습니다.','empty'));
  addResults();
}
function updateSearch(){search();refreshVisible()}
$('query').oninput=updateSearch;
$('selectedOnly').onchange=updateSearch;
updateFilters();refreshVisible();
