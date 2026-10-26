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

test('delivery packages cover all P0 requirements without unknown references', () => {
  const requirements = rows
    .filter((line) => /^\| FR-\d+ \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const knownIds = new Set(requirements.map(([id]) => id));
  const packages = rows.filter((line) => /^\| PK-[A-Z]+ \|/.test(line));
  assert.ok(packages.length > 0, 'No delivery packages found');
  const covered = new Set();
  const packageIds = new Set();
  for (const line of packages) {
    const [, id, references, deliverables, dependencies] = line.split('|').map((cell) => cell.trim());
    assert.ok(!packageIds.has(id), `Duplicate package ${id}`);
    packageIds.add(id);
    assert.ok(deliverables && dependencies, `${id}: missing scope or dependencies`);
    const ids = references.match(/FR-\d+/g) ?? [];
    assert.ok(ids.length > 0, `${id}: no requirements`);
    for (const reference of ids) {
      assert.ok(knownIds.has(reference), `${id}: unknown requirement ${reference}`);
      covered.add(reference);
    }
  }
  for (const [id, priority] of requirements) {
    if (priority === 'P0') assert.ok(covered.has(id), `${id}: missing delivery package`);
  }
});

test('identity and product metrics matrices have unique IDs and complete rules', () => {
  for (const prefix of ['AU', 'KPI']) {
    const matrixRows = rows.filter((line) => new RegExp(`^\\| ${prefix}-\\d+ \\|`).test(line));
    assert.ok(matrixRows.length > 0, `${prefix}: no rules found`);
    const ids = new Set();
    for (const line of matrixRows) {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      assert.ok(cells.every(Boolean), `${prefix}: missing rule or measurement definition`);
      assert.ok(!ids.has(cells[0]), `Duplicate rule ${cells[0]}`);
      ids.add(cells[0]);
    }
  }
});

test('unconfirmed venue measurements remain blank in the material register', () => {
  const register = document.split('### 15.1 场馆资料登记')[1]?.split('### 15.2')[0];
  assert.ok(register, 'Missing venue material register');
  const materials = register.split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.startsWith('|---') && !line.startsWith('| 资料项'));
  assert.ok(materials.length > 0, 'No material entries found');
  for (const line of materials) {
    const [material, ...pending] = line.split('|').slice(1, -1).map((cell) => cell.trim());
    assert.ok(material);
    assert.equal(pending.length, 3);
    assert.ok(pending.every((cell) => cell === ''), `${material}: unconfirmed value filled in`);
  }
});
