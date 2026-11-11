import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [path.join(root, 'scripts/verify.mjs')], { stdio: 'inherit' });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'release-manifest.json'), 'utf8'));
const npmCandidates = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].filter(Boolean);
if (process.platform === 'win32') {
  for (const entry of execFileSync('where.exe', ['npm.cmd'], { encoding: 'utf8' }).trim().split(/\r?\n/)) npmCandidates.push(path.join(path.dirname(entry), 'node_modules/npm/bin/npm-cli.js'));
}
const npm = npmCandidates.find(item => existsSync(item));
if (!npm) throw Error('Cannot find npm-cli.js. Run npm run pack from the release repository.');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const packages = [];
for (const directory of manifest.packages) {
  const location = path.join(root, directory);
  const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', location, '--ignore-scripts', '--json', '--pack-destination', artifacts], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))[0];
  for (const file of packed.files) {
    if (/(^|\/)(\.agents|AGENTS(?:\.override)?\.md|test|tests|\.tmp|node_modules)(\/|$)/.test(file.path)) throw Error('Unexpected development file in tarball: ' + file.path);
  }
  const shipped = new Set(packed.files.map(file => file.path));
  if (!shipped.has('cordis.patch.yml') || !shipped.has('package.json')) throw Error('Incomplete tarball: ' + packed.name);
  // Runtime files must not import a relative module excluded by files[].
  for (const file of packed.files.filter(item => /\.(js|mjs)$/.test(item.path))) {
    const code = await fs.readFile(path.join(location, file.path), 'utf8');
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[1].split(/[?#]/)[0]));
      if (!shipped.has(resolved)) throw Error(packed.name + ': packed import missing: ' + resolved);
    }
  }
  packages.push({ name: packed.name, version: packed.version, filename: packed.filename, files: packed.files.length, size: packed.size, integrity: packed.integrity });
  console.log(packed.filename + ' (' + packed.files.length + ' files)');
}
await fs.writeFile(path.join(artifacts, 'manifest.json'), JSON.stringify(packages, null, 2) + '\n');
console.log('Packed ' + packages.length + ' packages; no files were uploaded.');

if (process.argv.includes('--local-preview')) {
  // A fresh path avoids pnpm reusing a prior file: tarball with the same version.
  const preview = await fs.mkdtemp(path.join(artifacts, 'local-preview-'));
  const suitePath = path.join(preview, 'suite');
  await fs.cp(path.join(root, 'packages/suite'), suitePath, { recursive: true });
  const suite = JSON.parse(await fs.readFile(path.join(suitePath, 'package.json'), 'utf8'));
  suite.private = true; // This local-path package must never be published.
  for (const child of packages.filter(item => item.name !== manifest.suite)) {
    const target = path.join(preview, child.filename);
    await fs.copyFile(path.join(artifacts, child.filename), target);
    suite.dependencies[child.name] = 'file:' + target.replaceAll('\\', '/');
  }
  await fs.writeFile(path.join(suitePath, 'package.json'), JSON.stringify(suite, null, 2) + '\n');
  const [packed] = JSON.parse(execFileSync(process.execPath, [npm, 'pack', suitePath, '--ignore-scripts', '--json', '--pack-destination', preview], { cwd: root, encoding: 'utf8' }));
  console.log('LOCAL TEST ONLY (set an isolated DSH_HOME before installing): ' + path.join(preview, packed.filename));
}
