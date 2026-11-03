const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function safeName(value) {
  const name = String(value || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 140);
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) ? `_${name}` : (name || 'Untitled');
}
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function saveManaged(root, relative, bytes, state, key, sourceUpdated) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), {recursive:true});
  const previous = state[key];
  let existing = null;
  try { existing = await fs.readFile(target); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  const currentHash = existing && sha(existing);
  const newHash = sha(bytes);
  if (existing && currentHash !== newHash && (!previous || previous.hash !== currentHash)) {
    return {status:'local-change', path:relative};
  }
  if (!existing || currentHash !== newHash) {
    const temporary = `${target}.partial`;
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, target);
  }
  state[key] = {path:relative, hash:newHash, updated:sourceUpdated || null};
  return {status: existing && currentHash === newHash ? 'unchanged' : 'saved', path:relative};
}
function links(html, origin) {
  const refs = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  for (const match of (html || '').matchAll(re)) {
    const raw = match[1].replace(/&amp;/g, '&');
    try { const url = new URL(raw, origin); if (['http:','https:'].includes(url.protocol)) refs.push(url.toString()); } catch {}
  }
  return [...new Set(refs)];
}
function extractFileId(url, canvasOrigin) {
  const u = new URL(url);
  if (u.origin !== canvasOrigin) return null;
  const m = u.pathname.match(/\/(?:courses\/\d+\/)?files\/(\d+)/);
  return m ? Number(m[1]) : null;
}
module.exports = {safeName, sha, saveManaged, links, extractFileId};
