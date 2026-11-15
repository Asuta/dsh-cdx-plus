import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'https://registry.npmjs.org';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'release-manifest.json'), 'utf8'));
const artifacts = JSON.parse(await fs.readFile(path.join(root, 'artifacts/manifest.json'), 'utf8'));
const suite = JSON.parse(await fs.readFile(path.join(root, 'packages/suite/package.json'), 'utf8'));
const dryRun = process.env.RELEASE_DRY_RUN !== 'false';
if (process.env.RELEASE_VERSION !== suite.version) throw Error('RELEASE_VERSION must match the suite version.');
if (!dryRun && (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== manifest.repository || process.env.GITHUB_REF !== 'refs/heads/main')) {
  throw Error('Real publishing is restricted to the main branch GitHub Actions workflow.');
}
if (!dryRun && !process.env.npm_execpath) throw Error('Run via npm run publish:ci.');

async function get(url, missingAllowed = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404 && missingAllowed) return null;
  if (!response.ok) throw Error('Registry request failed: ' + response.status + ' ' + url);
  return response;
}
function versionParts(version) {
  if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version)) throw Error('Only stable x.y.z releases are supported: ' + version);
  return version.split('.').map(Number);
}
function newer(a, b) {
  const aa = versionParts(a), bb = versionParts(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i];
  return false;
}
async function available(item) {
  const response = await get(registry + '/' + encodeURIComponent(item.name) + '/' + item.version, true);
  if (!response) return false;
  const pkg = await response.json();
  if (pkg.name !== item.name || pkg.version !== item.version || pkg.dist?.integrity !== item.integrity) {
    throw Error('Published version differs from local artifact: ' + item.name + '@' + item.version + '. Bump the version instead of overwriting.');
  }
  const tarballUrl = new URL(pkg.dist.tarball);
  if (tarballUrl.origin !== registry) throw Error('Unexpected registry tarball origin.');
  const tarball = await get(tarballUrl, true);
  if (!tarball) return false;
  const integrity = 'sha512-' + createHash('sha512').update(Buffer.from(await tarball.arrayBuffer())).digest('base64');
  if (integrity !== item.integrity) throw Error('Downloaded tarball checksum mismatch: ' + item.name);
  return true;
}

// Complete the preflight for every package before changing any registry state.
const packages = [];
for (const directory of manifest.packages) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, directory, 'package.json'), 'utf8'));
  versionParts(pkg.version);
  const matches = artifacts.filter(item => item.name === pkg.name && item.version === pkg.version);
  if (matches.length !== 1) throw Error('Missing or duplicate artifact: ' + pkg.name);
  const item = matches[0];
  if (path.basename(item.filename) !== item.filename) throw Error('Invalid artifact filename.');
  item.tarball = path.join(root, 'artifacts', item.filename);
  const integrity = 'sha512-' + createHash('sha512').update(await fs.readFile(item.tarball)).digest('base64');
  if (integrity !== item.integrity) throw Error('Local tarball checksum mismatch: ' + pkg.name);
  item.published = await available(item);
  if (!item.published) {
    const current = await get(registry + '/' + encodeURIComponent(item.name) + '/latest', true);
    if (current && !newer(item.version, (await current.json()).version)) throw Error('Refusing to move latest backwards: ' + item.name);
  }
  packages.push(item);
  console.log((item.published ? 'SKIP ' : 'PUBLISH ') + item.name + '@' + item.version);
}
if (packages.length !== artifacts.length || new Set(packages.map(item => item.name)).size !== packages.length) throw Error('Unexpected artifact set.');
for (const [name, version] of Object.entries(suite.dependencies)) {
  if (!packages.some(item => item.name === name && item.version === version)) throw Error('Suite dependency missing from release plan: ' + name);
}
packages.sort((a, b) => Number(a.name === manifest.suite) - Number(b.name === manifest.suite));
if (dryRun) {
  console.log('Dry run complete; no packages uploaded.');
} else {
  for (const item of packages) {
    if (item.published) continue;
    // Existing staged versions require approval first. A publish error stops the job.
    execFileSync(process.execPath, [process.env.npm_execpath, 'publish', item.tarball, '--access', 'public', '--tag', 'latest', '--ignore-scripts', '--provenance', '--registry=' + registry], { cwd: root, stdio: 'inherit' });
    let ready = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      if (await available(item)) { ready = true; break; }
      await delay(5000);
    }
    if (!ready) throw Error('Published but not downloadable yet. Check registry before rerunning: ' + item.name);
    const latest = await (await get(registry + '/' + encodeURIComponent(item.name) + '/latest')).json();
    if (latest.version !== item.version) throw Error('Unexpected latest version: ' + item.name);
    console.log('VERIFIED ' + item.name + '@' + item.version);
  }
}
