// Development review page only; not an entry in the production build.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const base = `${import.meta.env.BASE_URL}models/environment/`;
const manifest = await fetch(`${base}manifest.json`).then(r => r.json());
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eee4ce');
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .05, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
scene.add(new THREE.HemisphereLight('#fff5df', '#657c72', 2.1));
const sun = new THREE.DirectionalLight('#fff0d1', 3.0); sun.position.set(-5, 12, 8); scene.add(sun);
const fill = new THREE.DirectionalLight('#b5dae1', .8); fill.position.set(8, 5, -5); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({color:'#d3c6a7',roughness:1}));
floor.rotation.x = -Math.PI/2; floor.position.y = -.46; scene.add(floor);
const select = document.querySelector<HTMLSelectElement>('#asset')!;
for(const asset of manifest.assets) select.add(new Option(asset.file.replace('.glb','').replaceAll('-',' '),asset.file));
select.value = new URLSearchParams(location.search).get('asset') ?? 'hillside-lod0.glb';
let model: THREE.Group | undefined;
let info: any;
let generation = 0;
const review = { loaded:false, error:'', file:'', triangles:0, draws:0, textures:0, bounds:{} };
(window as any).__environmentReview = review;
function frame(){
  if(!model) return;
  const box = new THREE.Box3().setFromObject(model), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x,size.y,size.z)*.67;
  camera.position.copy(center).add(new THREE.Vector3(.48,.38,1).normalize().multiplyScalar(radius/Math.tan(THREE.MathUtils.degToRad(19))));
  controls.target.copy(center); controls.update();
}
async function load(){
  const token=++generation; review.loaded=false;
  const file=select.value; info=manifest.assets.find((a:any)=>a.file===file);
  try {
    const gltf=await new GLTFLoader().loadAsync(base+file);
    if(token!==generation) return;
    if(model){scene.remove(model);model.traverse((o:any)=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});}
    model=gltf.scene; scene.add(model);
    const box=new THREE.Box3().setFromObject(model);
    review.file=file; review.bounds={min:box.min.toArray(),max:box.max.toArray()};
    frame(); review.loaded=true;
    document.querySelector('#status')!.textContent=`${info.triangles.toLocaleString()} triangles · ${(info.bytes/1024/1024).toFixed(2)} MiB · 1 atlas / 1 draw`;
  } catch(e){review.error=String(e);document.querySelector('#status')!.textContent=review.error;}
}
select.addEventListener('change',load);
document.querySelector('#reset')!.addEventListener('click',frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);review.triangles=renderer.info.render.triangles;review.draws=renderer.info.render.calls;review.textures=renderer.info.memory.textures;});
void load();
