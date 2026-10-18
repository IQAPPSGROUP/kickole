import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const W='/workspace/kickole/work/';
const HAIR=process.argv[2]||'Hair_SimpleParted';
const doc = await io.read(W+'Superhero_Male_FullBody.gltf');
const hairDoc = await io.read(W+HAIR+'.gltf');
const root=doc.getRoot();
const bodySkin=root.listSkins()[0];
const bodyNames=bodySkin.listJoints().map(j=>j.getName());
const map = mergeDocuments(doc, hairDoc);
const hairSkinSrc=hairDoc.getRoot().listSkins()[0];
const hairSkin=map.get(hairSkinSrc);
const hairNames=hairSkin.listJoints().map(j=>j.getName());
if (JSON.stringify(hairNames)!==JSON.stringify(bodyNames)) throw new Error('joint mismatch');
// compare IBMs
const a=bodySkin.getInverseBindMatrices().getArray(), b=hairSkin.getInverseBindMatrices().getArray();
let md=0; for(let i=0;i<a.length;i++) md=Math.max(md,Math.abs(a[i]-b[i])); console.log('IBM max diff',md);
{const hp=hairDoc.getRoot().listMeshes()[0].listPrimitives()[0];const j=hp.getAttribute('JOINTS_0'),w=hp.getAttribute('WEIGHTS_0');const used=new Set();const e1=[],e2=[];for(let i=0;i<j.getCount();i++){j.getElement(i,e1);w.getElement(i,e2);e1.forEach((x,k)=>{if(e2[k]>0)used.add(hairNames[x])});}console.log('hair joints used',[...used]);}
const hairNodeSrc=hairDoc.getRoot().listNodes().find(n=>n.getMesh());
const hairNode=map.get(hairNodeSrc);
const bodyMeshNode=root.listNodes().find(n=>n.getName()==='SuperHero_Male');
const bodyParent=bodyMeshNode.getParentNode();
hairNode.detach?.(); 
for (const p of root.listNodes()) if (p.listChildren().includes(hairNode)) p.removeChild(hairNode);
(bodyParent||root.listScenes()[0]).addChild(hairNode);
hairNode.setSkin(bodySkin).setName('Hair');
// remove merged scene + hair armature
const scenes=root.listScenes(); const mainScene=scenes[0];
for (const s of scenes.slice(1)) { for (const c of s.listChildren()) { c.traverse(n=>{ if(n!==hairNode) n.dispose(); }); } s.dispose(); }
hairSkin.dispose();
for (const s of root.listScenes()) console.log('scene',s.getName());
root.setDefaultScene(mainScene);
// materials
const mats=Object.fromEntries(root.listMaterials().map(m=>[m.getName()+'#'+root.listMaterials().indexOf(m),m]));
const hairMatBody=root.listMaterials().find(m=>m.getName()==='MI_Hair_1');
for (const m of hairNode.getMesh().listPrimitives()) { const old=m.getMaterial(); m.setMaterial(hairMatBody); if(old!==hairMatBody) old.dispose(); }
const srgb=h=>{const v=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255).map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));return [...v,1];};
hairMatBody.setName('Hair').setBaseColorFactor([0.09,0.05,0.028,1]);
const eyes=root.listMaterials().find(m=>m.getName()==='MI_Eyes').setName('Eyes');
const skin=root.listMaterials().find(m=>m.getName()==='MI_Superhero_Male').setName('Skin');
skin.setMetallicRoughnessTexture(null).setRoughnessFactor(0.75).setMetallicFactor(0);
eyes.setNormalTexture(null);
// strip unused attributes
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const s of p.listSemantics()) if (/^(COLOR_|TEXCOORD_[1-9])/.test(s)) p.setAttribute(s,null);
// name meshes
for (const n of root.listNodes()) if (n.getMesh()) n.getMesh().setName(n.getName());
// split body into kit primitives by dominant joint
const groups={Kit_Shirt:/^(spine_0[123]|clavicle_|upperarm_)/, Kit_Shorts:/^(pelvis|thigh_)/, Kit_Socks:/^calf_/, Boots:/^(foot_|ball)/};
const kitCols={Kit_Shirt:'#FFD93D',Kit_Shorts:'#1E2A5A',Kit_Socks:'#FFD93D',Boots:'#FF4F9A'};
const bodyMesh=bodyMeshNode.getMesh(); const prim=bodyMesh.listPrimitives()[0];
const J=prim.getAttribute('JOINTS_0'), Wt=prim.getAttribute('WEIGHTS_0'), idx=prim.getIndices().getArray();
const vgroupW=[]; const ej=[],ew=[];
const gnames=['Skin',...Object.keys(groups)];
const jointGroup=bodyNames.map(n=>{for(const [g,r] of Object.entries(groups)) if(r.test(n)) return gnames.indexOf(g); return 0;});
const buckets=gnames.map(()=>[]);
for(let t=0;t<idx.length;t+=3){ const acc=new Float32Array(gnames.length);
  for(let k=0;k<3;k++){ J.getElement(idx[t+k],ej); Wt.getElement(idx[t+k],ew); for(let q=0;q<4;q++) acc[jointGroup[ej[q]]]+=ew[q]; }
  let best=0; for(let g=1;g<acc.length;g++) if(acc[g]>acc[best]) best=g; buckets[best].push(idx[t],idx[t+1],idx[t+2]); }
const buf=root.listBuffers()[0];
gnames.forEach((g,gi)=>{ console.log(g,'tris',buckets[gi].length/3); });
prim.getIndices().setArray(new Uint16Array(buckets[0]));
for (let gi=1;gi<gnames.length;gi++){ const g=gnames[gi];
  const mat=doc.createMaterial(g).setBaseColorFactor(srgb(kitCols[g])).setMetallicFactor(0).setRoughnessFactor(g==='Boots'?0.45:0.8).setNormalTexture(skin.getNormalTexture()).setNormalScale(0.35).setDoubleSided(false);
  const np=doc.createPrimitive().setMaterial(mat).setIndices(doc.createAccessor(g+'_idx').setType('SCALAR').setArray(new Uint16Array(buckets[gi])).setBuffer(buf));
  for (const s of prim.listSemantics()) np.setAttribute(s,prim.getAttribute(s));
  bodyMesh.addPrimitive(np);
}
bodyMeshNode.setName('Player_Body'); bodyMesh.setName('Player_Body');
const bufs=root.listBuffers();for(const a of root.listAccessors()) a.setBuffer(bufs[0]);for(const b of bufs.slice(1)) b.dispose();
await doc.transform(prune(), dedup({propertyTypes:['Accessor','Mesh','Texture','Skin']}));
// textures
for (const t of root.listTextures()) console.log('tex',t.getName(),t.getURI(),t.getSize());
await doc.transform(
  textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],pattern:/Hair|Eye/,quality:85}),
  textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],pattern:/Superhero/,quality:85}),
  meshopt({encoder:MeshoptEncoder,level:'medium'}),
);
await io.write('/workspace/kickole/out/kickole_player.glb', doc);
console.log('done');
