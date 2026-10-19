// Development-only comparison, using the actual game character renderers and real kick/stall replays.
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { GameEngine } from '../src/engine/engine';
import { SKINS } from '../src/game/skins';
import { GlbCharacter } from '../src/scene/GlbCharacter';
import { Character } from '../src/scene/Character';
import { buildScenario } from '../src/scene/inspector';
import { computePlayerMotion } from '../src/scene/motion';
import { CHARACTER_MODEL_URL, UE_BONE_NAMES, rigKind } from '../src/scene/rig';

const scenarios = { idle:'Relaxed idle', ready:'Ready bounce', left:'Left touch', right:'Right touch', stall:'Foot-stall balance', fist:'One-arm pump', shimmy:'Shoulder shimmy', salute:'Two-hand salute', miss:'Miss & recovery' };
type Scenario = keyof typeof scenarios;
const review = { ready:false, error:'', scenario:'idle', time:0, motion:'', renderer:'glb', modelUrl:CHARACTER_MODEL_URL, rig:'', clips:0,
  joints:{base:[] as number[],expressive:[] as number[]},set: (_:any)=>{}, sample:()=>({}) };
(window as any).__movementReview=review;
const state={scenario:'idle' as Scenario,time:0,playing:true,renderer:'glb'};

function stage(e:GameEngine,scenario:Scenario,t:number){
  if(scenario==='left'||scenario==='right'||scenario==='stall'){
    buildScenario(e,scenario==='right'?'right':'left',scenario==='stall'?'stall':'kick',t%1.25-.10);return;
  }
  e.prepare('menu');e.time=10+t;
  if(scenario==='ready')e.phase='ready';
  if(scenario==='fist'||scenario==='shimmy'||scenario==='salute'){
    const age=t%1.18+.01;e.phase='playing';e.stats.kickUps={fist:0,shimmy:1,salute:2}[scenario];
    e.lastPerfectTime=e.time-.35-age;e.lastKick.left=e.time-.39-age;
    e.ball.y=1.25+Math.sin(age*Math.PI)*.6;e.ball.x=.10;
  }
  if(scenario==='miss'){e.phase='dropped';e.lastDropTime=e.time-(t%1.7);e.ball.y=.09;e.ball.x=.4;}
}

function Driver({engine}:{engine:GameEngine}){
  useFrame((_,dt)=>{
    if(state.playing)state.time+=Math.min(dt,.05);
    stage(engine,state.scenario,state.time);
    review.time=state.time;review.motion=computePlayerMotion(engine).name;
  },-2);return null;
}

function ReviewBall({engine}:{engine:GameEngine}){
  const position=useMemo(()=>new Vector3(),[]);const [mesh,setMesh]=useState<any>(null);
  useFrame(()=>{if(mesh){position.set(engine.ball.x,engine.ball.y,engine.ball.z);mesh.position.copy(position);
    mesh.visible=!['fist','shimmy','salute'].includes(state.scenario);}});
  return <mesh ref={setMesh}><sphereGeometry args={[engine.config.ballRadius,24,16]}/><meshStandardMaterial color="#fff8df" roughness={.5}/></mesh>;
}

function App(){
  const [scenario,setScenario]=useState<Scenario>('idle'),[playing,setPlaying]=useState(true),[renderer,setRenderer]=useState('glb');
  const engine=useMemo(()=>new GameEngine(),[]),[time,setTime]=useState(0);
  useEffect(()=>{
    review.set=(o:any)=>{
      if(o.scenario){state.scenario=o.scenario;setScenario(o.scenario);state.time=0;}
      if(o.time!==undefined){state.time=o.time;setTime(o.time);}
      if(o.playing!==undefined){state.playing=o.playing;setPlaying(o.playing);}
      if(o.renderer){state.renderer=o.renderer;setRenderer(o.renderer);}
      review.scenario=state.scenario;review.renderer=state.renderer;
    };
    const id=setInterval(()=>setTime(state.time),100);return()=>clearInterval(id);
  },[]);
  return <>
    <div className="labels"><span>V2 BASE MOVEMENT</span><span>V2 EXPRESSIVE</span></div>
    <Canvas shadows camera={{position:[2.6,2.4,7.2],fov:37}} onCreated={({camera})=>camera.lookAt(0,1.1,.0)}>
      <color attach="background" args={['#e9ddc4']}/><ambientLight intensity={1.2}/><hemisphereLight args={['#fff4dd','#738b80',1.4]}/>
      <directionalLight position={[-3,7,5]} intensity={2.5} castShadow shadow-mapSize={[1024,1024]}/>
      <Driver engine={engine}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.012,0]} receiveShadow><planeGeometry args={[100,100]}/><meshStandardMaterial color="#c8b78d" roughness={1}/></mesh>
      <Suspense fallback={null}>
        {[false,true].map(expressive=><Actor key={`${expressive}-${renderer}`} engine={engine} expressive={expressive} renderer={renderer}/>)}
      </Suspense>
    </Canvas>
    <div className="controls">
      <select aria-label="Movement" value={scenario} onChange={e=>review.set({scenario:e.target.value,playing:true})}>{Object.entries(scenarios).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>
      <button onClick={()=>review.set({playing:!playing})}>{playing?'Pause':'Play'}</button>
      <input aria-label="Movement time" type="range" min="0" max="2" step=".01" value={time%2} onChange={e=>review.set({time:Number(e.target.value),playing:false})}/>
      <select aria-label="Character renderer" value={renderer} onChange={e=>review.set({renderer:e.target.value})}><option value="glb">Quaternius v2 model</option><option value="primitive">Primitive fallback</option></select>
      <output>{scenarios[scenario]} · {(time%2).toFixed(2)}s</output>
    </div>
  </>;
}

function Actor({engine,expressive,renderer}:{engine:GameEngine;expressive:boolean;renderer:string}){
  const group=useRef<Group>(null);
  return <group ref={group} position={[expressive?1.05:-1.05,0,0]}>
    {renderer==='glb'?<GlbCharacter engine={engine} skin={SKINS[0]} expressive={expressive} onInvalid={()=>{review.error='Character rig failed validation';}}/>:<Character engine={engine} skin={SKINS[0]} expressive={expressive}/>}
    <ReviewBall engine={engine}/><Probe engine={engine} actor={group} expressive={expressive}/>
  </group>;
}

function Probe({engine,actor,expressive}:{engine:GameEngine;actor:RefObject<Group|null>;expressive:boolean}){
  const gltf=useGLTF(CHARACTER_MODEL_URL);
  const point=useMemo(()=>new Vector3(),[]),origin=useMemo(()=>new Vector3(),[]);
  useFrame(()=>{
    const group=actor.current;if(!group)return;
    group.updateWorldMatrix(true,true);group.getWorldPosition(origin);const joints:number[]=[];
    for(const key of ['head','armLeft','armRight','footLeft','footRight','root'] as const){
      const joint=group.getObjectByName(key==='armLeft'?'hand_r':key==='armRight'?'hand_l':UE_BONE_NAMES[key]);
      if(joint){joint.getWorldPosition(point).sub(origin);joints.push(point.x,point.y,point.z);}
    }
    review.joints[expressive?'expressive':'base']=joints;
  });
  useEffect(()=>{
    const names:string[]=[];gltf.scene.traverse(o=>names.push(o.name));
    review.rig=rigKind(names);review.clips=gltf.animations.length;review.ready=true;
  },[gltf]);
  review.sample=()=>({phase:engine.phase,ball:{...engine.ball},motion:computePlayerMotion(engine)});
  return null;
}

createRoot(document.querySelector('#root')!).render(<App/>);
