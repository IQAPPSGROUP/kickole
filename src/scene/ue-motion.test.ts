// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { GameEngine } from '../engine/engine';
import { buildScenario } from './inspector';
import { computePose } from './pose';
import { computePlayerMotion } from './motion';
import { CHARACTER_MODEL_URL, UE_BONE_NAMES, type BoneKey } from './rig';
import { ueDeltaQuaternion } from './ue-pose';
import { ueMovementQuaternion } from './ue-motion';

/** Reconstruct actual v2 node transforms without decoding its textures/compressed mesh in Node. */
function rig() {
  const bytes=readFileSync(new URL('../../public/models/kickole_player_v2.glb',import.meta.url));
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
  const bones=Object.fromEntries(Object.entries(UE_BONE_NAMES).map(([key,name])=>[key,nodes.find(n=>n.name===name)!])) as Record<BoneKey,Group>;
  const rest=Object.fromEntries(Object.entries(bones).map(([key,node])=>[key,node.quaternion.clone()])) as Record<BoneKey,Quaternion>;
  function apply(e:GameEngine,expressive:boolean){
    const pose=computePose(e),motion=computePlayerMotion(e);scene.position.set(expressive?motion.rootX:0,pose.bodyY+(expressive?motion.rootY:0),0);
    for(const key of Object.keys(bones) as BoneKey[])bones[key].quaternion.copy(rest[key]).multiply(expressive?ueMovementQuaternion(key,pose,motion,new Quaternion()):ueDeltaQuaternion(key,pose,new Quaternion()));
    scene.updateMatrixWorld(true);
  }
  return {scene,bones,apply};
}

describe('newer Quaternius v2 movement',()=>{
  it('selects the contract v3 asset derived from the Quaternius source',()=>{
    expect(CHARACTER_MODEL_URL.endsWith('/models/kickole_player_v3.glb')).toBe(true);
  });

  it('retains the procedural v2 leg transforms during both touches and held stalls',()=>{
    const r=rig(),e=new GameEngine();
    for(const side of ['left','right'] as const)for(const mode of ['kick','stall'] as const)for(const time of [.02,.04,.12,.3,.5,.58]){
      buildScenario(e,side,mode,time);r.apply(e,false);
      const left=r.bones.footLeft.matrixWorld.clone(),right=r.bones.footRight.matrixWorld.clone();
      r.apply(e,true);
      expect(r.bones.footLeft.matrixWorld.elements).toEqual(left.elements);
      expect(r.bones.footRight.matrixWorld.elements).toEqual(right.elements);
    }
  });

  it('creates distinct complete v2 celebrations even though the asset has no clips',()=>{
    const r=rig(),e=new GameEngine();e.phase='playing';e.time=5;e.lastPerfectTime=4.3;e.lastKick.left=4.26;
    const poses=[];
    for(let variant=0;variant<3;variant++){
      e.stats.kickUps=variant;r.apply(e,true);
      const left=r.scene.getObjectByName('hand_r')!.getWorldPosition(new Vector3());
      const right=r.scene.getObjectByName('hand_l')!.getWorldPosition(new Vector3());
      poses.push({left,right});
    }
    expect(poses[0].right.y-poses[0].left.y).toBeGreaterThan(.2);
    expect((poses[2].left.y+poses[2].right.y)-(poses[1].left.y+poses[1].right.y)).toBeGreaterThan(.4);
    expect(poses[1].left.distanceTo(poses[2].left)).toBeGreaterThan(.25);
  });
});
