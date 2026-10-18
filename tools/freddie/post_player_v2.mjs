import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(process.argv[2]); const root=doc.getRoot();
for (const m of root.listMaterials()) {
  if (m.getName()==='Hair') m.setBaseColorFactor([0.09,0.05,0.028,1]);
  if (m.getName()==='Skin') { m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.75); }
  if (m.getName()==='Eyes') m.setNormalTexture(null);
}
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) for (const s of p.listSemantics()) if (/^(COLOR_|TEXCOORD_[1-9])/.test(s)) p.setAttribute(s,null);
{const sk=root.listSkins(); const s0=sk[0]; const a=s0.getInverseBindMatrices().getArray(); const n0=s0.listJoints().map(j=>j.getName()).join();
 for (const s of sk.slice(1)) { if (s.listJoints().map(j=>j.getName()).join()!==n0) throw 'joints'; const b=s.getInverseBindMatrices().getArray(); let md=0; for(let i=0;i<a.length;i++) md=Math.max(md,Math.abs(a[i]-b[i])); if(md>1e-4) throw 'ibm '+md; }
 for (const n of root.listNodes()) if (n.getSkin()) n.setSkin(s0);
 for (const n of root.listNodes()) if (n.getMesh()) n.getMesh().setName(n.getName()); }
await doc.transform(prune(), dedup({propertyTypes:['Accessor','Mesh','Texture','Skin']}),
  textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],pattern:/Hair|Eye/,quality:85}),
  textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],pattern:/Superhero/,quality:85}),
  meshopt({encoder:MeshoptEncoder,level:'medium',quantizationVolume:'scene'}), dedup({propertyTypes:['Accessor','Skin']}), prune());
let tris=0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) tris+=p.getIndices().getCount()/3;
console.log('tris',tris,'mats',root.listMaterials().map(m=>m.getName()).join(','),'skins',root.listSkins().map(s=>s.listJoints().length),'tex',root.listTextures().map(t=>t.getName()+':'+t.getSize()).join(' '));
await io.write(process.argv[3],doc);
