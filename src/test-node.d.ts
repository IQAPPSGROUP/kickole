// Minimal typing for the one Node API used by tests (avoids adding @types/node as a dependency).
declare module 'node:fs' {
  export function readFileSync(path: URL): { buffer: ArrayBuffer; byteOffset: number; byteLength: number; length: number };
}
