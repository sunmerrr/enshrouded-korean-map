'use strict';
const $ = id => document.getElementById(id);
const catalog = window.CATALOG;
const groups = new Map(catalog.map(g => [g.key,g]));
const names = new Intl.NumberFormat('ko-KR');
const format = n => names.format(n);
const defaults = ['Ancient_Spire','Hollow_Halls','Shroud_Root','srv_shroud_root','srv_well_core_unconfirmed','srv_fast_travel','Village','Flame_Shrine'];
const storageKey = 'embervale-map:filters:v2';
function readSelection(){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(Array.isArray(saved))return saved.filter(key=>groups.has(key));
  }catch{}
  return defaults.filter(key=>groups.has(key));
}
const selected=new Set(readSelection());
const points=window.POINTS;
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
  return searchable([p[1],p[2],p[3],g.title,g.en,groups.get(p[7])?.title,groups.get(p[7])?.en,xy(p)].join(' '));
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
$('home').onclick=resetMap;
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
      const hit=searchable([section,g.title,g.en,g.key].join(' ')).includes(q);
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
  visible=queryActive?results:[...new Set([...selected].flatMap(key=>dataByKey.get(key)||[]))];
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
    const p=items[0],g=groups.get(p[0]),img=sprite(p[6]||g.icon);
    ctx.beginPath();ctx.arc(x,y,14,0,2*Math.PI);ctx.fillStyle='#142221ec';ctx.fill();
    ctx.strokeStyle='#c2b38c';ctx.lineWidth=1.2;ctx.stroke();
    if(img.complete&&img.naturalWidth)ctx.drawImage(img,x-12,y-12,24,24);
    if(items.length>1){
      const label=items.length>999?'999+':String(items.length);
      ctx.font='bold 10px system-ui';
      const w=Math.max(14,Math.ceil(ctx.measureText(label).width)+6);
      ctx.fillStyle='#f4d298';ctx.beginPath();ctx.roundRect(x+5,y-19,w,13,6);ctx.fill();
      ctx.fillStyle='#182221';ctx.fillText(label,x+5+w/2,y-12);
    }
  }
}
function openPlace(p){
  const g=groups.get(p[0]);
  const body=element('div',undefined,'place-note');
  const copy=element('div');
  copy.append(element('strong',title(p)),element('small',[g.title,p[3]].filter(Boolean).join(' · ')),element('small',xy(p)));
  body.append(icon(p[6]||g.icon),copy);
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
    const g=groups.get(p[0]);
    const btn=element('button',undefined,'result');
    const label=element('span',title(p));
    label.append(element('small',[p[3],xy(p)].filter(Boolean).join(' · ')));
    btn.append(icon(p[6]||g.icon),label);
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
function search(){
  const tokens=searchable($('query').value.trim()).split(/[\s,·]+/).filter(Boolean);
  results=points.filter((p,i)=>(!$('selectedOnly').checked||selected.has(p[0])||selected.has(p[7]))&&tokens.every(t=>pointText[i].includes(t)));
  shown=0;$('results').replaceChildren();$('results').scrollTop=0;
  $('count').textContent=format(results.length)+'곳';
  if(!results.length)$('results').append(element('p','일치하는 장소가 없습니다.','empty'));
  addResults();
}
function updateSearch(){search();refreshVisible()}
$('query').oninput=updateSearch;
$('selectedOnly').onchange=updateSearch;
updateFilters();refreshVisible();
