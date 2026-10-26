import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path.join(root, 'docs/technical-design.md');
const document = readFileSync(file, 'utf8');
const product = readFileSync(path.join(root, 'docs/product-design.md'), 'utf8');
const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const table = (contents, pattern) => contents.split(/\r?\n/).filter((line) => pattern.test(line)).map(cells);

test('technical modules cover all P0 requirements and reference known requirements', () => {
  const requirements = table(product, /^\| FR-\d+ \|/);
  const known = new Set(requirements.map(([id]) => id));
  const modules = table(document, /^\| MOD-\d+ \|/);
  assert.ok(modules.length > 0, 'Missing technical modules');
  assert.equal(new Set(modules.map(([id]) => id)).size, modules.length);
  const covered = new Set();
  for (const [id, name, references, responsibility] of modules) {
    assert.ok(name && responsibility, `${id}: incomplete responsibility`);
    const ids = references.match(/FR-\d+/g) ?? [];
    assert.ok(ids.length > 0, `${id}: no requirements`);
    for (const reference of ids) {
      assert.ok(known.has(reference), `${id}: unknown requirement ${reference}`);
      covered.add(reference);
    }
  }
  for (const [id, priority] of requirements) {
    if (priority === 'P0') assert.ok(covered.has(id), `${id}: no technical owner`);
  }
});

test('technical verification maps to every product acceptance scenario', () => {
  const acceptance = table(product, /^\| AC-\d+ \|/).map(([id]) => id);
  assert.ok(acceptance.length > 0);
  const verification = table(document, /^\| TV-\d+ \|/);
  assert.ok(verification.length > 0);
  assert.equal(new Set(verification.map(([id]) => id)).size, verification.length);
  const covered = new Set();
  for (const [id, references, scenario] of verification) {
    assert.ok(scenario, `${id}: missing verification`);
    const ids = references.match(/AC-\d+/g) ?? [];
    assert.ok(ids.length > 0, `${id}: no acceptance references`);
    for (const reference of ids) {
      assert.ok(acceptance.includes(reference), `${id}: unknown acceptance ${reference}`);
      covered.add(reference);
    }
  }
  for (const id of acceptance) assert.ok(covered.has(id), `${id}: missing technical verification`);
});

test('technical document relative links resolve inside the repository', () => {
  for (const match of document.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
    const relative = path.relative(root, resolved);
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    assert.ok(existsSync(resolved), `Broken technical source: ${target}`);
  }
});
