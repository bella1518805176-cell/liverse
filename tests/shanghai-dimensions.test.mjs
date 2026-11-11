import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDimensions, evidence, seatCsv } from '../scripts/build-shanghai-dimensions.mjs';

const data = buildDimensions();
const fact = (id) => data.facts.find((f) => f.id === id).value;
const near = (a, b, tolerance = 0.00001) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('1208 seat identities preserve each source cell and uninterrupted numbering', () => {
  assert.equal(data.seating.seats.length, 1208);
  assert.equal(new Set(data.seating.seats.map((s) => s.id)).size, 1208);
  assert.equal(new Set(data.seating.seats.map((s) => s.source_cell)).size, 1208);
  const cells = new Map(evidence.seating.rows.flatMap((r) => r.cells.map((c) => [c.cell, { floor: r.floor, row: r.row, number: c.number }])));
  for (const seat of data.seating.seats) {
    assert.deepEqual(cells.get(seat.source_cell), { floor: seat.floor, row: seat.row, number: seat.number });
    assert.equal(seat.position_m, null);
    assert.equal(seat.yaw_rad, null);
    assert.equal(seat.tread_surface_index, null);
  }
  for (const row of data.seating.rows) {
    const seats = data.seating.seats.filter((s) => s.floor === row.floor && s.row === row.row);
    assert.deepEqual(seats.map((s) => s.number), Array.from({ length: row.count }, (_, i) => i + 1));
    assert.equal(row.blocks.reduce((sum, b) => sum + b.count, 0), row.count);
  }
  const csv = seatCsv(data).trim().split('\r\n');
  assert.equal(csv.length, 1209);
  for (const line of csv.slice(1)) assert.deepEqual(line.split(',').slice(6, 10), ['', '', '', '']);
});

test('1F and 2F preserve layout-specific block topology and totals', () => {
  const one = data.seating.rows.filter((r) => r.floor === '1F');
  const two = data.seating.rows.filter((r) => r.floor === '2F');
  assert.equal(one.length, 23);
  assert.equal(two.length, 12);
  assert.equal(one.reduce((n, r) => n + r.count, 0), 800);
  assert.equal(two.reduce((n, r) => n + r.count, 0), 408);
  assert.deepEqual(one.map((r) => r.blocks.map((b) => b.count)), [
    ...Array.from({ length: 12 }, () => [40]), ...Array.from({ length: 7 }, () => [16, 16]), ...Array.from({ length: 4 }, () => [12, 12]),
  ]);
  assert.deepEqual(two.map((r) => r.blocks.map((b) => b.count)), [
    [6, 17, 6], [9, 17, 8], [10, 17, 10], [10, 17, 10],
    ...Array.from({ length: 5 }, () => [11, 17, 11]), [10, 17, 10], [6, 17, 6], [5, 5],
  ]);
  const sums = two.reduce((totals, row) => {
    const groups = row.blocks.length === 2 ? [row.blocks[0].count, 0, row.blocks[1].count] : row.blocks.map((b) => b.count);
    return totals.map((n, i) => n + groups[i]);
  }, [0, 0, 0]);
  assert.deepEqual(sums, [111, 187, 110]);
});

test('model dimensions come from selected geometry and preserve coordinate handedness', () => {
  near(data.units.skp_native_to_m * 12, 0.3048);
  near(fact('stage.relative_height'), fact('stage_backstage.elevation') - fact('audience.elevation'));
  const bounds = data.geometry.assembled_bounds_native_m;
  for (const node of data.geometry.primary_roots) for (let axis = 0; axis < 3; axis++) {
    assert.ok(node.bounds.min_m[axis] >= bounds.min_m[axis]);
    assert.ok(node.bounds.max_m[axis] <= bounds.max_m[axis]);
  }
  assert.ok(bounds.size_m[1] < 50);
  assert.ok(data.geometry.whole_file_bounds_excluded.size_m[1] > 1000);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  assert.deepEqual(cross([0, 0, 1], [1, 0, 0]), [0, 1, 0]); // nativeX/nativeY mapped into web space
});

test('tread calculations distinguish walking substeps, surface levels and seat rows', () => {
  for (let i = 1; i < data.tier_surfaces.length; i++) near(data.tier_surfaces[i].native_elevation_m - data.tier_surfaces[i - 1].native_elevation_m, fact('tiers.rise'));
  near(fact('stairs.rise') * 3, fact('tiers.rise'));
  near(fact('stairs.tread') * 3, fact('tiers.nominal_depth'));
  near(Math.tan(fact('tiers.nominal_slope') * Math.PI / 180), fact('tiers.rise') / fact('tiers.nominal_depth'));
  for (const tier of data.tier_surfaces) {
    assert.equal(tier.seat_row, null);
    assert.equal(tier.verified_seat_assignment, false);
    near(tier.native_elevation_m - fact('audience.elevation'), tier.relative_to_1f_m);
  }
});

test('screen pixel calculations agree while conflicting source dimensions remain explicit', () => {
  const [w, h] = fact('screen.resolution');
  near(w * fact('screen.pixel_pitch'), fact('screen.unfolded_width'));
  near(h * fact('screen.pixel_pitch'), fact('screen.visible_height'));
  near(fact('screen.box_grid_height') - fact('screen.visible_height'), 0.48);
  near(fact('screen.bottom_native') + fact('screen.visible_height'), fact('screen.top_native'));
  assert.ok(data.conflicts.some((c) => c.id === 'screen-revisions'));
  const stageConflict = data.conflicts.find((c) => c.id === 'stage-outline').values;
  near(stageConflict.simple_trapezoid_area_m2, (evidence.brochure.stage_front_width_m + evidence.brochure.stage_rear_width_m) / 2 * evidence.brochure.stage_depth_m);
  assert.notEqual(stageConflict.brochure_area_m2, stageConflict.simple_trapezoid_area_m2);
  assert.equal(data.physical_model_complete, false);
  assert.ok(data.unresolved_parameters.every((p) => p.value === null && p.status === 'unresolved'));
});

test('provenance resolves and generated outputs stay synchronized', () => {
  const sources = new Set(data.sources.map((s) => s.id));
  for (const f of data.facts) for (const p of f.provenance) assert.ok(sources.has(p.source), `${f.id}: missing ${p.source}`);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../docs/data/shanghai-3d-dimensions.json', import.meta.url), 'utf8')), data);
  assert.equal(readFileSync(new URL('../docs/data/shanghai-1208-seats.csv', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), seatCsv(data).replaceAll('\r\n', '\n'));
});

test('available local source files still match the captured evidence hashes', (t) => {
  let checked = 0;
  for (const source of data.sources) {
    const path = new URL(`../${source.path}`, import.meta.url);
    if (!existsSync(path)) { t.diagnostic(`Local source not distributed: ${source.path}`); continue; }
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), source.sha256, source.path);
    checked++;
  }
  if (!checked) t.skip('Native source files are local reference material; not included in the repository.');
});
