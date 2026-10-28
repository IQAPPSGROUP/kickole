// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Quaternion, Texture, Vector3, type Bone, type Group as ObjectGroup } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GameEngine } from '../engine/engine';
import { buildScenario } from './inspector';
import { computePose } from './pose';
import { computePlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import { BONE_NAMES, CHARACTER_MODEL_URL, EXTRA_BONE_NAMES, type BoneKey } from './rig';
import { ueDeltaQuaternion } from './ue-pose';
import { ueMovementQuaternion } from './ue-motion';

/** Reconstruct the shipped Fab player's node transforms without decoding its textures. */
function rig() {
  const bytes=readFileSync(new URL('../../public/models/kickole_player_v4.glb',import.meta.url));
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.buffer,bytes.byteOffset+20,view.getUint32(12,true))));
  const nodes:Group[]=json.nodes.map((n:any)=>{
    const g=new Group();g.name=n.name??'';
    if(n.matrix)g.applyMatrix4(new Matrix4().fromArray(n.matrix));
    else{if(n.translation)g.position.fromArray(n.translation);if(n.rotation)g.quaternion.fromArray(n.rotation);if(n.scale)g.scale.fromArray(n.scale);}
    return g;
  });
  json.nodes.forEach((n:any,i:number)=>(n.children??[]).forEach((c:number)=>nodes[i].add(nodes[c])));
  const scene=new Group();for(const i of json.scenes[json.scene??0].nodes)scene.add(nodes[i]);
  const contract={...BONE_NAMES,...EXTRA_BONE_NAMES};
  const bones=Object.fromEntries(Object.entries(contract).map(([key,name])=>[key,nodes.find(n=>n.name===name)!])) as Record<BoneKey,Group>;
  const rest=Object.fromEntries(Object.entries(bones).map(([key,node])=>[key,node.quaternion.clone()])) as Record<BoneKey,Quaternion>;
  function apply(e:GameEngine,expressive:boolean){
    const pose=computePose(e),motion=computePlayerMotion(e);scene.position.set(expressive?motion.rootX:0,pose.bodyY+(expressive?motion.rootY:0),0);
    for(const key of Object.keys(bones) as BoneKey[])bones[key].quaternion.copy(rest[key]).multiply(expressive?ueMovementQuaternion(key,pose,motion,new Quaternion()):ueDeltaQuaternion(key,pose,new Quaternion()));
    scene.updateMatrixWorld(true);
  }
  return {scene,bones,apply};
}

describe('shipped Fab player movement',()=>{
  it('selects the realistic contract asset',()=>{
    expect(CHARACTER_MODEL_URL.endsWith('/models/kickole_player_v4.glb')).toBe(true);
  });

  it('retains the procedural leg transforms during both touches and held stalls',()=>{
    const r=rig(),e=new GameEngine();
    for(const side of ['left','right'] as const)for(const mode of ['kick','stall'] as const)for(const time of [.02,.04,.12,.3,.5,.58]){
      buildScenario(e,side,mode,time);r.apply(e,false);
      const left=r.bones.footLeft.matrixWorld.clone(),right=r.bones.footRight.matrixWorld.clone();
      r.apply(e,true);
      expect(r.bones.footLeft.matrixWorld.elements).toEqual(left.elements);
      expect(r.bones.footRight.matrixWorld.elements).toEqual(right.elements);
    }
  });

  it('creates distinct celebrations on the shipped player', async () => {
    (globalThis as { self?: typeof globalThis }).self ??= globalThis;
    await MeshoptDecoder.ready;
    const bytes = readFileSync(new URL('../../public/models/kickole_player_v4.glb', import.meta.url));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise<{ scene: ObjectGroup }>((res, rej) => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new Texture()) }));
      loader.parse(ab, '', (g) => res(g as { scene: ObjectGroup }), rej);
    });
    const bones: Partial<Record<BoneKey, Bone>> = {};
    gltf.scene.traverse((obj) => {
      for (const key of Object.keys(BONE_NAMES) as (keyof typeof BONE_NAMES)[]) {
        if (obj.name === BONE_NAMES[key]) bones[key] = obj as Bone;
      }
    });
    const motionRig = createMotionRig({
      root: gltf.scene,
      spine: bones.spine,
      head: bones.head,
      armLeft: bones.armLeft,
      armRight: bones.armRight,
      footLeft: bones.footLeft,
      footRight: bones.footRight,
    });
    const e = new GameEngine();
    e.phase = 'playing';
    e.time = 5;
    e.lastPerfectTime = 4.3;
    e.lastKick.left = 4.26;
    const poses = [];
    for (let variant = 0; variant < 3; variant++) {
      e.stats.kickUps = variant;
      motionRig.restore();
      motionRig.apply(computePlayerMotion(e));
      gltf.scene.updateMatrixWorld(true);
      const left = gltf.scene.getObjectByName('Hand_L')!.getWorldPosition(new Vector3());
      const right = gltf.scene.getObjectByName('Hand_R')!.getWorldPosition(new Vector3());
      poses.push({ left, right });
    }
    expect(poses[0].left.distanceTo(poses[1].left)).toBeGreaterThan(0.01);
    expect(poses[1].left.distanceTo(poses[2].left)).toBeGreaterThan(0.01);
    expect(poses[0].right.distanceTo(poses[2].right)).toBeGreaterThan(0.01);
  });
});
