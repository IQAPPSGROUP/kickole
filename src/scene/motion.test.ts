// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Group, Quaternion, Texture, Vector3, type Bone } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GameEngine } from '../engine/engine';
import { buildScenario } from './inspector';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import { animationSampleTime, BONE_NAMES, KICK_CLIP_CONTACT_TIME, type BoneKey } from './rig';

describe('expressive motion policy', () => {
  it('adds visible idle / ready motion without large root travel', () => {
    const e = new GameEngine();
    const samples = [0,.4,.8,1.2].map(t => { e.time=t; return computePlayerMotion(e); });
    expect(new Set(samples.map(s=>s.rootX)).size).toBeGreaterThan(2);
    for (const s of samples) { expect(Math.abs(s.rootX)).toBeLessThan(.03); expect(s.rootY).toBeLessThan(.02); }
    e.phase='ready'; expect(computePlayerMotion(e).name).toBe('ready-bounce');
  });

  it('never adds root or foot motion during live play, including repeated kicks and stalls', () => {
    const e = new GameEngine();
    for (const side of ['left','right'] as const) for (const mode of ['kick','stall'] as const) for (let t=-.1;t<.9;t+=.025) {
      buildScenario(e,side,mode,t); const m=computePlayerMotion(e);
      expect([m.rootX,m.rootY,m.rootYaw,m.leftFoot,m.rightFoot]).toEqual([0,0,0,0,0]);
      expect(Object.entries(m).filter(([k])=>k!=='name').every(([,v])=>Number.isFinite(v))).toBe(true);
    }
  });

  it('tracks the ball with the GLB head and produces three distinct touch gestures', () => {
    const e = new GameEngine(); e.phase='playing';e.time=4;e.lastKick.left=3.8;
    e.ball.x=.2;expect(computePlayerMotion(e).headY).toBeGreaterThan(0);
    e.ball.x=-.2;expect(computePlayerMotion(e).headY).toBeLessThan(0);
    const names=[];for(let i=0;i<3;i++){e.stats.kickUps=i;names.push(computePlayerMotion(e).name);}
    expect(names).toEqual(['open-touch','counter-touch','compact-touch']);
  });

  it('balances a stall, offers three celebrations, and reacts to a drop', () => {
    const e = new GameEngine();buildScenario(e,'left','stall',.5);
    expect(computePlayerMotion(e).name).toBe('stall-balance');
    e.contact=null;e.phase='playing';e.time=5;e.lastKick.left=4.3;e.lastPerfectTime=4.6;
    const names=[];for(let i=0;i<3;i++){e.stats.kickUps=i;names.push(computePlayerMotion(e).name);}
    expect(names).toEqual(['fist-pump','shoulder-shimmy','salute']);
    e.phase='dropped';e.lastDropTime=4.8;expect(computePlayerMotion(e).name).toBe('miss-recovery');
  });

  it('retains the same touch variant when the engine awards points at contact',()=>{
    const e=new GameEngine();buildScenario(e,'left','kick',.02);const before=computePlayerMotion(e).name;
    buildScenario(e,'left','kick',.06);expect(e.stats.kickUps).toBe(1);
    expect(computePlayerMotion(e).name).toBe(before);
  });

  it('is deterministic, resets reused output, and does not alter the simulation', () => {
    const e=new GameEngine();buildScenario(e,'right','stall',.5);
    const before=JSON.stringify(e),out=createPlayerMotion(),first=computePlayerMotion(e);
    computePlayerMotion(e,out);expect(out).toEqual(first);expect(JSON.stringify(e)).toBe(before);
    e.phase='ready';e.time=4;computePlayerMotion(e,out);expect(out).toEqual(computePlayerMotion(e));
  });

  it('samples idle and reactions from simulation time, keeping paused frames stable', () => {
    const e=new GameEngine();e.time=4.6;
    expect(animationSampleTime(e,'Idle',2)).toBeCloseTo(.6);
    e.lastDropTime=4.2;expect(animationSampleTime(e,'Miss',1.5)).toBeCloseTo(.4);
    e.lastPerfectTime=3.8;expect(animationSampleTime(e,'Celebrate',1.2)).toBeCloseTo(.45);
    const frozen=animationSampleTime(e,'Celebrate',1.2);
    for(let i=0;i<100;i++)expect(animationSampleTime(e,'Celebrate',1.2)).toBe(frozen);
    e.time=8;expect(animationSampleTime(e,'Celebrate',1.2)).toBe(1.2);
  });
});

describe('motion rig',()=>{
  it('restores the authored pose exactly and never accumulates offsets on a frozen frame',()=>{
    const root=new Group(),head=new Group();root.add(head);head.position.y=1.62;
    head.rotation.set(.1,.2,.3);const original=head.quaternion.clone();
    const rig=createMotionRig({root,head}),e=new GameEngine();e.time=.4;const motion=computePlayerMotion(e);
    rig.apply(motion);const once=head.quaternion.clone(),position=root.position.clone();
    for(let i=0;i<1000;i++)rig.apply(motion);
    expect(head.quaternion.angleTo(once)).toBeLessThan(1e-7);expect(root.position.distanceTo(position)).toBe(0);
    rig.restore();expect(head.quaternion.angleTo(original)).toBeLessThan(1e-7);expect(root.position.length()).toBe(0);
    rig.restore();expect(root.position.length()).toBe(0);
  });

  it('keeps both authored GLB boots exactly fixed while upper-body accents move through a stall',async()=>{
    (globalThis as { self?: typeof globalThis }).self ??= globalThis;
    await MeshoptDecoder.ready;
    const b=readFileSync(new URL('../../public/models/kickole_player_v4.glb',import.meta.url));
    const loader=new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(()=>({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new Texture()) }));
    const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    const bones:Partial<Record<BoneKey,Bone>>={};gltf.scene.traverse(o=>{for(const key of Object.keys(BONE_NAMES) as (keyof typeof BONE_NAMES)[])if(o.name===BONE_NAMES[key])bones[key]=o as Bone;});
    const rig=createMotionRig({root:gltf.scene,spine:bones.spine,head:bones.head,armLeft:bones.armLeft,armRight:bones.armRight,footLeft:bones.footLeft,footRight:bones.footRight});
    const mixer=new AnimationMixer(gltf.scene),e=new GameEngine();
    for(const side of ['left','right'] as const){
      rig.restore();mixer.stopAllAction();
      const action=mixer.clipAction(gltf.animations.find(a=>a.name===(side==='left'?'KickLeft':'KickRight'))!);
      action.reset().play();action.paused=true;action.time=KICK_CLIP_CONTACT_TIME;mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const left=bones.footLeft!.matrixWorld.clone(),right=bones.footRight!.matrixWorld.clone();
      const baseArm=bones.armLeft!.getWorldQuaternion(new Quaternion());
      let armMovement=0;
      for(const t of [.04,.3,.5,.58]){
        buildScenario(e,side,'stall',t);rig.apply(computePlayerMotion(e));gltf.scene.updateMatrixWorld(true);
        expect(bones.footLeft!.matrixWorld.elements).toEqual(left.elements);
        expect(bones.footRight!.matrixWorld.elements).toEqual(right.elements);
        armMovement=Math.max(armMovement,baseArm.angleTo(bones.armLeft!.getWorldQuaternion(new Quaternion())));
      }
      expect(armMovement).toBeGreaterThan(.1);
      // Toe-at-ball contract remains exactly the authored model; no root/foot displacement.
      expect(bones[side==='left'?'footLeft':'footRight']!.getWorldPosition(new Vector3()).y).toBeGreaterThan(.5);
    }
  });
});
