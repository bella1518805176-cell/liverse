import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDimensions } from '../scripts/build-shanghai-dimensions.mjs';
import { buildPlacement, chairReference, placementCsv, placementSvg } from '../scripts/build-shanghai-placement.mjs';

const data = buildPlacement();
const near = (a, b, epsilon = 0.00001) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const findSeat = (floor, row, number) => data.seats.find((s) => s.floor === floor && s.row === row && s.number === number);

function corners(seat) {
  const [x, , z] = seat.position_m, a = seat.yaw_rad;
  const { width_m: w, depth_m: d } = data.parameters.chair;
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    .map(([u, v]) => [x + Math.cos(a) * u + Math.sin(a) * v, z - Math.sin(a) * u + Math.cos(a) * v]);
}

function overlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const q = poly[(i + 1) % poly.length], p = poly[i], axis = [p[1] - q[1], q[0] - p[0]];
    const pa = a.map(([x, z]) => x * axis[0] + z * axis[1]);
    const pb = b.map(([x, z]) => x * axis[0] + z * axis[1]);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-8 || Math.max(...pb) <= Math.min(...pa) + 1e-8) return false;
  }
  return true;
}

test('560mm inference is reproducible from old drawing reference marks', () => {
  const points = chairReference.reference_circles;
  assert.equal(points.length, 567);
  const distances = points.map((p, i) => Math.min(...points.filter((_, j) => i !== j).map((q) => Math.hypot(p.p[0] - q.p[0], p.p[1] - q.p[1])))).sort((a, b) => a - b);
  near(distances[283], chairReference.nearest_neighbor_summary_mm.median);
  assert.equal(distances.filter((d) => d >= 550 && d <= 570).length, 397);
  near(Math.round(distances[283] / 10) / 100, data.parameters.floor1.column_pitch_m);
  assert.equal(chairReference.source_is_older_layout, true);
});

test('estimated placements preserve 1208 identities, source references and provisional status', () => {
  const source = buildDimensions().seating.seats;
  assert.equal(data.seats.length, 1208);
  assert.equal(new Set(data.seats.map((s) => s.id)).size, 1208);
  for (const [i, seat] of data.seats.entries()) {
    assert.equal(seat.id, source[i].id);
    assert.equal(seat.source_cell, source[i].source_cell);
    assert.equal(seat.status, 'estimated_for_model_review');
    assert.ok(seat.position_m.every(Number.isFinite));
    assert.ok(Number.isFinite(seat.yaw_rad));
    const [x, y, z] = seat.position_m;
    const [nx, ny, nz] = seat.position_native_m;
    const anchor = data.coordinate_system.anchor_native_m;
    near(nx, z + anchor[0]); near(ny, x + anchor[1]); near(nz, y + anchor[2]);
  }
  assert.equal(data.physical_positions_verified, false);
  assert.equal(data.seats.filter((s) => s.obstructed_2f_source_mark).length, 15);
});

test('1F continuous front rows, split blocks, gaps and control booth remain geometrically consistent', () => {
  const seats = data.seats.filter((s) => s.floor === '1F');
  assert.equal(seats.length, 800);
  for (const row of data.rows.filter((r) => r.floor === '1F')) {
    const ss = seats.filter((s) => s.row === row.row);
    near(ss[0].position_m[0], -ss.at(-1).position_m[0]);
    for (const s of ss) { near(s.position_m[1], 0); near(s.yaw_rad, 0); }
    for (let i = 1; i < ss.length; i++) if (ss[i].block === ss[i - 1].block) near(ss[i].position_m[0] - ss[i - 1].position_m[0], 0.56);
    if (row.row > 12) assert.ok(ss.every((s) => Math.abs(s.position_m[0]) >= 2.52));
  }
  near(findSeat('1F', 1, 1).position_m[2], 3);
  near(findSeat('1F', 12, 1).position_m[2], 12.9);
  near(findSeat('1F', 13, 1).position_m[2], 14.8);
  near(findSeat('1F', 19, 1).position_m[2], 20.2);
  near(findSeat('1F', 20, 1).position_m[2], 22.3);
  near(findSeat('1F', 23, 1).position_m[2], 25);
  const { width_x_m: w, front_z_m: front, rear_z_m: rear } = data.parameters.foh;
  const foh = [[-w / 2, front], [w / 2, front], [w / 2, rear], [-w / 2, rear]];
  for (const seat of seats) {
    assert.equal(overlap(corners(seat), foh), false, `${seat.id} intersects FOH`);
    for (const [x, z] of corners(seat)) {
      assert.ok(x >= -13.55 && x <= 15.5, `${seat.id} outside gross floor width`);
      assert.ok(z >= 0 && z <= 29.58, `${seat.id} outside gross floor depth`);
    }
  }
  near(data.checks.floor1_foh_side_clearance_m, 0.76);
  near(data.checks.floor1_foh_front_clearance_from_row12_m, 0.8);
  near(data.checks.floor1_foh_rear_clearance_to_row20_m, 1);
});

test('2F user-confirmed 495/900 steps preserve relative levels and provisional absolute base', () => {
  const rows = data.rows.filter((r) => r.floor === '2F');
  assert.equal(rows.length, 12);
  for (let i = 0; i < rows.length; i++) {
    near(rows[i].ground_y_m, 4.3 + i * 0.495);
    near(rows[i].native_elevation_m, 4.9 + i * 0.495);
    near(rows[i].outer_radius_m - rows[i].inner_radius_m, 0.9);
    if (i) near(rows[i].seat_center_radius_m - rows[i - 1].seat_center_radius_m, 0.9);
    assert.equal(rows[i].exact_asset_mesh_contact_verified, false);
  }
  near(rows.at(-1).ground_y_m - rows[0].ground_y_m, 5.445);
  near(rows.at(-1).seat_center_radius_m - rows[0].seat_center_radius_m, 9.9);
  assert.equal(data.parameters.floor2.spacing_status, 'user_confirmed');
  assert.equal(data.parameters.floor2.base_status, 'provisional_skp_anchor');
});

test('2F chairs sit inside the analytic tread and face the arc center, retaining aisles and empty last middle', () => {
  const [cx, cz] = data.parameters.floor2.center_web_xz_m;
  assert.ok(data.arc_fit.points_native_m.length >= 10);
  assert.ok(data.arc_fit.max_radial_residual_m < 0.00001);
  for (const seat of data.seats.filter((s) => s.floor === '2F')) {
    const row = data.rows.find((r) => r.floor === seat.floor && r.row === seat.row);
    const [x, y, z] = seat.position_m;
    near(Math.hypot(x - cx, z - cz), row.seat_center_radius_m);
    near(y, row.ground_y_m);
    for (const [px, pz] of corners(seat)) {
      const radius = Math.hypot(px - cx, pz - cz);
      assert.ok(radius >= row.inner_radius_m && radius <= row.outer_radius_m, seat.id);
    }
    const vector = [cx - x, cz - z], length = Math.hypot(...vector);
    near(-Math.sin(seat.yaw_rad), vector[0] / length);
    near(-Math.cos(seat.yaw_rad), vector[1] / length);
  }
  for (const row of data.rows.filter((r) => r.floor === '2F')) {
    const seats = data.seats.filter((s) => s.floor === row.floor && s.row === row.row);
    assert.equal(seats.filter((s) => s.block === 'middle').length, row.row === 12 ? 0 : 17);
    assert.ok(seats.filter((s) => s.block === 'left').every((s) => s.position_m[0] <= -6.16));
    assert.ok(seats.filter((s) => s.block === 'right').every((s) => s.position_m[0] >= 6.16));
  }
});

test('chair footprints do not overlap within either floor', () => {
  for (const floor of ['1F', '2F']) {
    const seats = data.seats.filter((s) => s.floor === floor), polygons = seats.map(corners);
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
      if (Math.abs(seats[i].position_m[0] - seats[j].position_m[0]) > 1 || Math.abs(seats[i].position_m[2] - seats[j].position_m[2]) > 1) continue;
      assert.equal(overlap(polygons[i], polygons[j]), false, `${seats[i].id} overlaps ${seats[j].id}`);
    }
  }
});

test('committed estimate, CSV and figure match their reproducible calculation', () => {
  const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(read('apps/demo/src/mock/shanghai-3d-placement-estimate.json')), data);
  assert.equal(read('docs/data/shanghai-1208-estimated-positions.csv').replaceAll('\r\n', '\n'), placementCsv(data).replaceAll('\r\n', '\n'));
  assert.equal(read('docs/figures/shanghai-estimated-placement.svg').replaceAll('\r\n', '\n'), placementSvg(data));
  const doc = read('docs/shanghai-3d-placement-estimate.md');
  for (const [, target] of doc.matchAll(/\]\(([^)]+)\)/g)) assert.ok(read(`docs/${target}`).length > 0, target);
});
