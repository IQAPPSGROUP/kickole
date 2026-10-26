/**
 * Drop Vorbis copies from the iOS app bundle after `cap sync ios`.
 * WKWebView requests the .m4a files first and does not need .ogg.
 * Web and Android keep `public/audio/rob/*.ogg`. This script never deletes those.
 */
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IOS_OGG_DIR = path.join('ios', 'App', 'App', 'public', 'audio', 'rob');

export function isBundleOgg(name) {
  return /^[a-z0-9-]+\.ogg$/.test(name);
}

/**
 * Delete only `*.ogg` directly inside the synced iOS public audio folder.
 * Returns the removed file names. A missing folder (no sync yet) removes nothing.
 */
export async function stripIosOgg(root) {
  const base = path.resolve(root);
  const dir = path.resolve(base, IOS_OGG_DIR);
  if (path.relative(base, dir) !== IOS_OGG_DIR) {
    throw new Error('Refusing to strip ogg outside the iOS bundle copy.');
  }
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  const removed = [];
  for (const name of names) {
    if (!isBundleOgg(name)) continue;
    await unlink(path.join(dir, name));
    removed.push(name);
  }
  return removed;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const removed = await stripIosOgg(process.cwd());
  if (removed.length > 0) {
    console.log(`Removed ${removed.length} ogg file(s) from the iOS bundle.`);
  }
}
