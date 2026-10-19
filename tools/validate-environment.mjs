// Optional Khronos validator: npm install --prefix .validation --no-save gltf-validator
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const require = createRequire(new URL('../.validation/package.json', import.meta.url));
const { validateBytes } = require('gltf-validator');
const root = new URL('../public/models/environment/', import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const report=[];
for(const asset of manifest.assets){
  const bytes=readFileSync(new URL(asset.file,root));
  const validation=await validateBytes(new Uint8Array(bytes),{uri:asset.file,maxIssues:100});
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==asset.sha256) throw new Error(`Manifest hash mismatch: ${asset.file}`);
  report.push({file:asset.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,triangles:asset.triangles,
    errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,messages:validation.issues.messages});
}
mkdirSync(new URL('../environment-shots/',import.meta.url),{recursive:true});
writeFileSync(new URL('../environment-shots/gltf-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.some(r=>r.errors||r.warnings)) process.exitCode=1;
