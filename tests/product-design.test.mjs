import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const documentPath = path.join(projectRoot, 'docs/product-design.md');
const document = readFileSync(documentPath, 'utf8');
const rows = document.split(/\r?\n/).filter((line) => line.startsWith('|'));

test('each P0 requirement has unique acceptance coverage and no unknown references', () => {
  const requirements = rows
    .filter((line) => /^\| FR-\d+ \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.ok(requirements.length > 0, 'No requirements found');
  const requirementIds = requirements.map(([id]) => id);
  assert.equal(new Set(requirementIds).size, requirementIds.length);

  const acceptance = rows
    .filter((line) => /^\| AC-\d+ \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const acceptanceIds = acceptance.map(([id]) => id);
  assert.equal(new Set(acceptanceIds).size, acceptanceIds.length);
  for (const [id, requirement, scenario] of acceptance) {
    assert.ok(requirementIds.includes(requirement), `${id}: unknown requirement`);
    assert.ok(scenario.length > 0, `${id}: missing acceptance scenario`);
  }
  const p0 = requirements.filter(([, priority]) => priority === 'P0');
  assert.ok(p0.length > 0, 'No P0 requirements found');
  for (const [id] of p0) {
    assert.ok(acceptance.some(([, reference]) => reference === id), `${id}: missing acceptance`);
  }
});

test('new document and README local links resolve within the project', () => {
  for (const file of [documentPath, path.join(projectRoot, 'README.md')]) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:https?:|#)/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
      const relative = path.relative(projectRoot, resolved);
      assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
      assert.ok(existsSync(resolved), `${file}: broken link ${target}`);
    }
  }
});
