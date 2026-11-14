import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'release-manifest.json'), 'utf8'));
const packages = [];
const errors = [];
if (typeof manifest.dshCompatibility !== 'string' || !manifest.dshCompatibility.trim()) errors.push('Missing DSH compatibility range');
for (const directory of manifest.packages) {
  const location = path.join(root, directory);
  const pkg = JSON.parse(await fs.readFile(path.join(location, 'package.json'), 'utf8'));
  packages.push(pkg);
  if (pkg.private || pkg.name.startsWith('@local/')) errors.push(pkg.name + ': private or development-only package');
  if (pkg.engines?.dsh !== manifest.dshCompatibility) errors.push(pkg.name + ': incorrect compatibility range');
  if (!pkg.exports?.['./package.json'] || !pkg.dsh?.bundle?.patch) errors.push(pkg.name + ': missing DSH exports/patch');
  for (const value of Object.values(pkg.exports || {})) {
    if (typeof value !== 'string' || value.includes('*')) continue;
    try { await fs.access(path.join(location, value)); } catch { errors.push(pkg.name + ': missing export ' + value); }
  }
  const patch = await fs.readFile(path.join(location, 'cordis.patch.yml'), 'utf8');
  if (!patch.includes(pkg.name)) errors.push(pkg.name + ': patch does not activate its own entry');
  const clientPath = pkg.exports?.['./client'];
  if (clientPath) {
    const registrations = [];
    try {
      vm.runInNewContext(await fs.readFile(path.join(location, clientPath), 'utf8'), {
        window: { __ModuleLoader__: { load: item => registrations.push(item) } },
      }, { timeout: 10000, filename: pkg.name });
      if (registrations.length !== 1 || registrations[0].id !== pkg.name) errors.push(pkg.name + ': client registration id mismatch');
    } catch (error) { errors.push(pkg.name + ': client registration failed: ' + error.message); }
  }
  for (const [name, spec] of Object.entries(pkg.dependencies || {})) {
    if (name.startsWith('@local/') || /^(file|link|workspace):/.test(spec)) errors.push(pkg.name + ': nonportable runtime dependency ' + name);
    if (name.startsWith('@deepseek-ai/dsh-')) errors.push(pkg.name + ': host dependency must use peers: ' + name);
  }
}
const suite = packages.find(pkg => pkg.name === manifest.suite);
if (!suite || manifest.features.length !== 18) errors.push('Expected a suite containing all 18 features');
const patch = await fs.readFile(path.join(root, 'packages/suite/cordis.patch.yml'), 'utf8');
const rowIds = [...patch.matchAll(/^\s*- id:\s*([^\s#]+)\s*$/gm)].map(match => match[1]);
if (rowIds.length !== 19 || new Set(rowIds).size !== 19) errors.push('Suite must declare 18 independent rows plus its own manager');
for (const feature of manifest.features) {
  const pkg = packages.find(pkg => pkg.name === feature.name);
  if (!pkg || suite?.dependencies[feature.name] !== pkg.version) errors.push('Missing or unpinned suite dependency: ' + feature.name);
  if (!patch.includes(feature.name) || !rowIds.includes(feature.rowId)) errors.push('Missing suite row: ' + feature.name);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Verified 19 package manifests, 18 independent feature rows, browser module IDs and portable dependencies.');
  console.log('This is structural validation; runtime acceptance and licensing are tracked in RELEASE_STATUS.md.');
}
