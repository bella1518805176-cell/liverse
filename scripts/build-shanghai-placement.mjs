import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildDimensions, evidence } from './build-shanghai-dimensions.mjs';

const root = new URL('../', import.meta.url);
const round = (n) => Number(n.toFixed(6));
export const chairReference = JSON.parse(readFileSync(new URL('docs/data/shanghai-chair-reference.json', root), 'utf8'));

export function fitTierArc() {
  const face = evidence.model.horizontal_faces.find((f) => f.path[0].startsWith('Group:11:') && Math.abs(f.bounds.min_m[2] - 5.89) < 1e-6);
  const cy = 361.042760;
  const tip = face.vertices_m.find((p) => Math.abs(p[0] - face.bounds.max_m[0]) < 1e-6);
  const nearTip = face.vertices_m.find((p) => p[0] < tip[0] - 0.03 && p[0] > tip[0] - 0.04);
  const sag = tip[0] - nearTip[0];
  const radiusSeed = (sag ** 2 + (nearTip[1] - cy) ** 2) / (2 * sag);
  const cxSeed = tip[0] - radiusSeed;
  // Exclude aisle-cut intersections and clipped ends, which are not arc sample vertices.
  const points = face.vertices_m.filter((p) => Math.abs(Math.hypot(p[0] - cxSeed, p[1] - cy) - radiusSeed) < 0.0001);
  const meanX = points.reduce((s, p) => s + p[0], 0) / points.length;
  const values = points.map((p) => p[0] ** 2 + (p[1] - cy) ** 2);
  const meanV = values.reduce((a, b) => a + b, 0) / values.length;
  const cx = points.reduce((s, p, i) => s + (p[0] - meanX) * (values[i] - meanV), 0)
    / (2 * points.reduce((s, p) => s + (p[0] - meanX) ** 2, 0));
  const radius = Math.sqrt(meanV - 2 * cx * meanX + cx ** 2);
  return { source: { file_id: 'skp', group: 'Group:11:差别', surface_native_z_m: 5.89 }, center_native_xy_m: [round(cx), cy], row3_outer_radius_m: round(radius), points_native_m: points, max_radial_residual_m: round(Math.max(...points.map((p) => Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - radius)))) };
}

export function buildPlacement() {
  const baseline = buildDimensions();
  const arc = fitTierArc();
  const params = {
    chair: { width_m: 0.52, depth_m: 0.6, height_m: 0.9, seat_height_m: 0.45, status: 'prototype_asset_assumption' },
    floor1: { column_pitch_m: 0.56, row_pitch_m: 0.9, first_row_z_m: 3, middle_first_row_z_m: 14.8, rear_first_row_z_m: 22.3, middle_inner_center_x_m: 2.52, rear_inner_center_x_m: 2.52, ground_y_m: 0, status: 'inferred_layout' },
    foh: { width_x_m: 3, depth_z_m: 7, height_y_m: 1.2, center_x_m: 0, front_z_m: 14, rear_z_m: 21, status: 'brochure_dimensions_with_inferred_orientation_and_anchor', note: '将长7m沿纵深，宽3m沿横向，约14m暂作前沿退距；高度1.2m只是概览占位值。' },
    floor2: { rise_m: 0.495, radial_tread_depth_m: 0.9, row_to_step: 'one_row_per_step', spacing_status: 'user_confirmed', first_native_elevation_m: 4.9, base_status: 'provisional_skp_anchor', chair_pitch_m: 0.56, pitch_definition: '横向投影中心距，不是严格沿弧等距', side_inner_center_abs_x_m: 6.16, center_web_xz_m: [0, round(arc.center_native_xy_m[0] - baseline.coordinates.proposed_web.anchor_native_m[0])], first_inner_radius_m: round(arc.row3_outer_radius_m - 3 * 0.9), seat_radial_offset_m: 0.45, horizontal_status: 'model_arc_fit_and_inferred_seat_distribution' },
  };
  const { chair, floor1: f1, floor2: f2 } = params;
  const anchor = baseline.coordinates.proposed_web.anchor_native_m;
  const rows = [];
  const seats = baseline.seating.seats.map((sourceSeat) => {
    const sourceRow = baseline.seating.rows.find((r) => r.floor === sourceSeat.floor && r.row === sourceSeat.row);
    let x, y, z, yaw = 0, block, radius = null;
    if (sourceSeat.floor === '1F') {
      y = f1.ground_y_m;
      if (sourceSeat.row <= 12) {
        block = 'front';
        x = (sourceSeat.number - 20.5) * f1.column_pitch_m;
        z = f1.first_row_z_m + (sourceSeat.row - 1) * f1.row_pitch_m;
      } else {
        const half = sourceSeat.row <= 19 ? 16 : 12;
        const inner = sourceSeat.row <= 19 ? f1.middle_inner_center_x_m : f1.rear_inner_center_x_m;
        const local = sourceSeat.number <= half ? sourceSeat.number - 1 : sourceSeat.number - half - 1;
        const side = sourceSeat.number <= half ? 'left' : 'right';
        x = side === 'left' ? -inner - (half - 1 - local) * f1.column_pitch_m : inner + local * f1.column_pitch_m;
        z = sourceSeat.row <= 19 ? f1.middle_first_row_z_m + (sourceSeat.row - 13) * f1.row_pitch_m : f1.rear_first_row_z_m + (sourceSeat.row - 20) * f1.row_pitch_m;
        block = `${sourceSeat.row <= 19 ? 'middle' : 'rear'}_${side}`;
      }
    } else {
      let index = sourceRow.blocks.findIndex((b) => sourceSeat.number >= b.first_number && sourceSeat.number <= b.last_number);
      const b = sourceRow.blocks[index];
      if (sourceSeat.row === 12 && index === 1) index = 2;
      const local = sourceSeat.number - b.first_number;
      block = ['left', 'middle', 'right'][index];
      x = index === 0 ? -f2.side_inner_center_abs_x_m - (b.count - 1 - local) * f2.chair_pitch_m
        : index === 1 ? (local - 8) * f2.chair_pitch_m : f2.side_inner_center_abs_x_m + local * f2.chair_pitch_m;
      radius = f2.first_inner_radius_m + (sourceSeat.row - 1) * f2.radial_tread_depth_m + f2.seat_radial_offset_m;
      z = f2.center_web_xz_m[1] + Math.sqrt(radius ** 2 - x ** 2);
      y = f2.first_native_elevation_m - anchor[2] + (sourceSeat.row - 1) * f2.rise_m;
      // A chair asset faces local -Z; yaw makes that direction point to the fitted arc center.
      yaw = Math.atan2(x, z - f2.center_web_xz_m[1]);
    }
    const obstructed = sourceSeat.floor === '2F' && ((sourceSeat.row >= 2 && sourceSeat.row <= 9 && sourceSeat.number === 1)
      || (sourceSeat.row >= 3 && sourceSeat.row <= 9 && sourceSeat.number === sourceRow.count));
    return { ...sourceSeat, block, position_m: [round(x), round(y), round(z)], position_native_m: [round(z + anchor[0]), round(x + anchor[1]), round(y + anchor[2])], yaw_rad: round(yaw), radius_m: radius === null ? null : round(radius), tread_surface_index: sourceSeat.floor === '2F' ? sourceSeat.row : null, obstructed_2f_source_mark: obstructed, status: 'estimated_for_model_review', field_status: { identity: 'source_verified', horizontal: sourceSeat.floor === '1F' ? 'inferred_from_constraints' : 'arc_fit_with_inferred_seat_pitch', vertical: sourceSeat.floor === '1F' ? 'skp_ground' : 'user_confirmed_rise_with_provisional_base' } };
  });
  for (const row of baseline.seating.rows) {
    const ss = seats.filter((s) => s.floor === row.floor && s.row === row.row);
    const record = { floor: row.floor, row: row.row, count: row.count, blocks: row.blocks.map((b) => b.count), ground_y_m: ss[0].position_m[1], native_elevation_m: ss[0].position_native_m[2], min_x_m: Math.min(...ss.map((s) => s.position_m[0])), max_x_m: Math.max(...ss.map((s) => s.position_m[0])), min_z_m: Math.min(...ss.map((s) => s.position_m[2])), max_z_m: Math.max(...ss.map((s) => s.position_m[2])), status: 'estimated_for_model_review' };
    if (row.floor === '2F') Object.assign(record, { inner_radius_m: round(f2.first_inner_radius_m + (row.row - 1) * f2.radial_tread_depth_m), outer_radius_m: round(f2.first_inner_radius_m + row.row * f2.radial_tread_depth_m), seat_center_radius_m: ss[0].radius_m, native_surface_index: row.row, exact_asset_mesh_contact_verified: false });
    rows.push(record);
  }
  const one = seats.filter((s) => s.floor === '1F');
  const envelope = {
    min_x_m: round(Math.min(...one.map((s) => s.position_m[0])) - chair.width_m / 2),
    max_x_m: round(Math.max(...one.map((s) => s.position_m[0])) + chair.width_m / 2),
    front_z_m: round(Math.min(...one.map((s) => s.position_m[2])) - chair.depth_m / 2),
    rear_z_m: round(Math.max(...one.map((s) => s.position_m[2])) + chair.depth_m / 2),
  };
  return { schema_version: 1, date: '2026-11-11', layout: '全坐席1208', purpose: '第一版3D模型总览与座位落位估算，不是实测竣工坐标', physical_positions_verified: false,
    coordinate_system: { unit: 'm', axes: 'X横向、Y向上、Z向观众席后方；座椅默认朝-Z', anchor_native_m: anchor, numbering_handedness: '暂按座号从webX负向到正向递增', mapping_status: 'provisional' },
    source_evidence: 'shanghai-3d-evidence.json', chair_reference: 'shanghai-chair-reference.json', user_confirmed: { floor2_one_row_per_step: true, floor2_rise_mm: 495, floor2_tread_depth_mm: 900 },
    parameters: params, arc_fit: arc, totals: baseline.seating.totals, rows, seats,
    checks: {
      floor1_chair_envelope_m: envelope, floor1_front_allocation_width_m: round(40 * f1.column_pitch_m), floor1_center_span_m: round(39 * f1.column_pitch_m),
      floor1_middle_clear_width_m: round(2 * f1.middle_inner_center_x_m - chair.width_m), floor1_foh_side_clearance_m: round(f1.middle_inner_center_x_m - chair.width_m / 2 - params.foh.width_x_m / 2),
      floor1_foh_front_clearance_from_row12_m: round(params.foh.front_z_m - (f1.first_row_z_m + 11 * f1.row_pitch_m + chair.depth_m / 2)),
      floor1_foh_rear_clearance_to_row20_m: round(f1.rear_first_row_z_m - chair.depth_m / 2 - params.foh.rear_z_m),
      floor1_same_block_fore_aft_gap_m: round(f1.row_pitch_m - chair.depth_m), floor1_same_row_side_gap_m: round(f1.column_pitch_m - chair.width_m),
      floor2_row1_to_row12_rise_m: round(11 * f2.rise_m), floor2_row1_to_row12_center_radial_span_m: round(11 * f2.radial_tread_depth_m), floor2_twelve_tread_radial_allocation_m: round(12 * f2.radial_tread_depth_m),
      gross_floor_bbox_containment_only: true, exact_polygon_walls_columns_railings_and_mesh_contact_checked: false,
    },
    limitations: [
      '560mm椅距来自旧排座图重复参考点统计，再用于1208现行拓扑；不能视作现行椅子实测。',
      '一楼900mm排距、3m首排、分区前沿和控台朝向是约束试排方案；不是Excel空白行/列的物理缩放。',
      '二楼一排一阶及495/900mm由用户确认；第一排原生标高4.9m暂沿用SKP。CAD5.455m差异仍保留。',
      '圆弧由第三个主要踏面外缘拟合；所有排以同心圆和900mm径向递进近似。二楼座距为横向投影560mm。',
      '解析900mm台面不同于分段折线原网格。未验证椅脚与原网格逐点贴合；首尾平台和通道切口需在建模时核对。',
      '一楼只核对观众地面总包围范围，未以包围盒代替净可用面积或宣称已检查柱墙障碍。',
      '二楼15个灰色标记来自对照表，未计算遮挡比例。一楼后区有遮挡属性另行保留，不从视线模拟得出。',
    ],
  };
}

export function placementCsv(data) {
  return '\uFEFFid,floor,row,number,block,x_m,y_m,z_m,native_x_m,native_y_m,native_z_m,yaw_rad,status,source_cell\r\n'
    + data.seats.map((s) => [s.id, s.floor, s.row, s.number, s.block, ...s.position_m, ...s.position_native_m, s.yaw_rad, s.status, s.source_cell].join(',')).join('\r\n') + '\r\n';
}

export function placementSvg(data) {
  const colors = { front: '#059669', middle: '#2563eb', rear: '#7c3aed' };
  const scale = 14, leftOrigin = 240, rightOrigin = 740;
  const to = (x, z, origin) => [origin + x * scale, 145 + z * scale];
  let shapes = '';
  for (const origin of [leftOrigin, rightOrigin]) {
    shapes += `<rect x="${origin - 10 * scale}" y="110" width="${20 * scale}" height="35" rx="4" fill="#334155"/><text x="${origin}" y="133" fill="white" text-anchor="middle">舞台前沿 Z=0（宽20m仅作参考）</text>`;
  }
  const foh = data.parameters.foh;
  const [fx, fz] = to(-foh.width_x_m / 2, foh.front_z_m, leftOrigin);
  shapes += `<rect x="${fx}" y="${fz}" width="${foh.width_x_m * scale}" height="${foh.depth_z_m * scale}" fill="#cbd5e1" stroke="#64748b"/><text x="${leftOrigin}" y="${fz + 48}" text-anchor="middle" font-size="11">控台</text>`;
  for (const row of data.rows.filter((r) => r.floor === '2F')) {
    const inner = row.inner_radius_m, outer = row.outer_radius_m;
    const cx = data.parameters.floor2.center_web_xz_m[1];
    const extent = Math.max(Math.abs(row.min_x_m), Math.abs(row.max_x_m)) + 0.4;
    for (const radius of [inner, outer]) {
      const points = Array.from({ length: 61 }, (_, i) => { const x = -extent + 2 * extent * i / 60; return to(x, cx + Math.sqrt(radius ** 2 - x ** 2), rightOrigin).join(','); });
      shapes += `<polyline points="${points.join(' ')}" fill="none" stroke="#dbe2e8" stroke-width="0.8"/>`;
    }
  }
  for (const s of data.seats) {
    const [x, y] = to(s.position_m[0], s.position_m[2], s.floor === '1F' ? leftOrigin : rightOrigin);
    const color = s.floor === '1F' ? colors[s.block.split('_')[0]] : s.obstructed_2f_source_mark ? '#334155' : '#d97706';
    shapes += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.25" fill="${color}"><title>${s.id}: ${s.position_m.join(', ')}m（估算）</title></circle>`;
  }
  for (const row of data.rows) {
    const origin = row.floor === '1F' ? leftOrigin : rightOrigin;
    const [, z] = to(0, (row.min_z_m + row.max_z_m) / 2, origin);
    shapes += `<text x="${origin - 185}" y="${z + 3}" font-size="10" fill="#475569">${row.row}排</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650" viewBox="0 0 1000 650"><rect width="1000" height="650" fill="#f8fafc"/><g font-family="Microsoft YaHei, sans-serif" font-size="12"><text x="40" y="35" font-size="22" fill="#0f172a">上海 LIVERSE · 1208座三维落位估算（俯视，非实测）</text><text x="240" y="70" text-anchor="middle" font-size="16">1F · 800座 · 椅距560 / 排距900 mm</text><text x="740" y="70" text-anchor="middle" font-size="16">2F · 408座 · 一排一阶 495 / 900 mm</text>${shapes}<text x="40" y="570" fill="#475569">两图等比例；X为横向，Z从舞台向后。二楼按原模型圆弧近似，保留左右区与末排中央留空。</text><text x="40" y="596" fill="#475569">绿色：1F前区；蓝色：中区；紫色：后区。二楼深灰为原表15个灰色标记。</text><text x="40" y="622" fill="#b45309">米制定位均为第一版试排；尚未逐点校验墙柱、栏杆及原模型踏面接触。</text></g></svg>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildPlacement();
  const files = [['docs/data/shanghai-3d-placement-estimate.json', JSON.stringify(data, null, 2) + '\n'], ['docs/data/shanghai-1208-estimated-positions.csv', placementCsv(data)], ['docs/figures/shanghai-estimated-placement.svg', placementSvg(data)]];
  for (const [name, content] of files) {
    const path = new URL(name, root);
    if (process.argv.includes('--check')) {
      if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) throw new Error(`Stale output: ${name}`);
    } else writeFileSync(path, content, 'utf8');
  }
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Built'} ${data.seats.length} estimated placements; first-floor envelope ${JSON.stringify(data.checks.floor1_chair_envelope_m)}; circle fit residual ${data.arc_fit.max_radial_residual_m}m`);
}
