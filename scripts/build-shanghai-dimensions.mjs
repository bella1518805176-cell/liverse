import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
export const evidence = JSON.parse(readFileSync(new URL('docs/data/shanghai-3d-evidence.json', root), 'utf8'), (_key, value) => Object.is(value, -0) ? 0 : value);
const round = (n) => Number(n.toFixed(6));
const ref = (source, locator) => ({ source, locator });
const cad = (source, handle) => evidence.cad.find((r) => r.source === source && r.handle === handle);
const node = (prefix) => evidence.model.primary_roots.find((n) => n.path[0].startsWith(prefix));
const floorFace = (z, area) => evidence.model.horizontal_faces.find((f) => f.path[0].startsWith('Group:0:') && Math.abs(f.bounds.min_m[2] - z) < 0.00001 && Math.abs(f.local_area_m2 - area) < 0.01);

export function buildDimensions() {
  const facts = [];
  const add = (id, label, value, unit, status, provenance, note = '') => {
    facts.push({ id, label, value, unit, status, provenance, note });
  };
  const skpFact = (id, label, value, unit, n, note = '') => add(id, label, value, unit, 'measured_in_model', [ref('skp', n.path.join('/'))], note);
  const shell = node('Group:62:');
  const base = floorFace(0, 1219.063180);
  const audience = floorFace(0.6, 730.479812);
  const stage = floorFace(2.1, 425.228518);
  const tierNode = node('Group:11:');
  const assembledBounds = {
    min_m: [0, 1, 2].map((axis) => Math.min(...evidence.model.primary_roots.map((n) => n.bounds.min_m[axis]))),
    max_m: [0, 1, 2].map((axis) => Math.max(...evidence.model.primary_roots.map((n) => n.bounds.max_m[axis]))),
  };
  assembledBounds.size_m = assembledBounds.max_m.map((v, i) => round(v - assembledBounds.min_m[i]));
  add('assembly.aabb', '29个主体根组件联合包围盒 XYZ', assembledBounds.size_m, 'm', 'derived', evidence.model.primary_roots.map((n) => ref('skp', n.path.join('/'))), '包括附属结构；用于模型取景，不代表厅内净尺寸。');
  skpFact('shell.aabb', '主体外壳原生 XYZ 包围盒', shell.bounds.size_m, 'm', shell, '包含附属空间；不是观众厅净宽深。原生 X 为纵深，Y 为横向，Z 向上。');
  skpFact('audience.floor_aabb', '观众地面面片原生 XY 包围范围', audience.bounds.size_m.slice(0, 2), 'm', node('Group:0:'), '非矩形净可用座席区；含边缘和看台下方范围。');
  for (const [name, face] of [['base', base], ['audience', audience], ['stage_backstage', stage]]) {
    skpFact(`${name}.elevation`, `${name} 原生标高`, face.bounds.min_m[2], 'm', node('Group:0:'));
    skpFact(`${name}.surface_area`, `${name} 面片面积`, face.local_area_m2, 'm2', node('Group:0:'), '该根组变换仅平移，局部面积等于世界面积；不能套用于缩放组件。');
  }
  add('stage.relative_height', '舞台及后台面片高出一楼地面', round(stage.bounds.min_m[2] - audience.bounds.min_m[2]), 'm', 'derived', [ref('skp', 'Group:0:组#11; Z=2.1 和 Z=0.6 的水平面')]);
  skpFact('tiers.aabb', '阶梯结构包围盒 XYZ', tierNode.bounds.size_m, 'm', tierNode, '下界含结构底板，不是第一排脚下标高。');
  const tierFaces = evidence.model.horizontal_faces.filter((f) => f.path[0].startsWith('Group:11:') && f.normal_world[2] > 0.99 && Math.abs(f.bounds.min_m[2] - f.bounds.max_m[2]) < 0.00001);
  const tierElevations = Array.from({ length: 12 }, (_, i) => round(4.9 + i * 0.495));
  const tiers = tierElevations.map((height, i) => {
    const candidates = tierFaces.filter((f) => Math.abs(f.bounds.min_m[2] - height) < 0.00001);
    // At 5.395 m the model also has a separate rear slab. Keep the narrow tread.
    const face = candidates.sort((a, b) => a.local_area_m2 - b.local_area_m2)[0];
    if (!face) throw new Error(`Missing tread ${height}`);
    return { surface_index: i + 1, seat_row: null, native_elevation_m: height, relative_to_1f_m: round(height - 0.6), source: ref('skp', 'Group:11:差别'), bounds_native_m: face.bounds, surface_area_m2: face.local_area_m2, role: i === 0 || i === 11 ? 'wide_surface_or_landing_unassigned' : 'tread_unassigned', verified_seat_assignment: false };
  });
  add('tiers.rise', '相邻主要踏面标高差', round(tiers[1].native_elevation_m - tiers[0].native_elevation_m), 'm', 'derived', [ref('skp', 'Group:11:差别')], '12 个主要水平面不等于已确认 12 排座位对应面。另有 Z=5.450 平台。');
  add('tiers.nominal_depth', '中段踏面纵向递进', round(tiers[2].bounds_native_m.max_m[0] - tiers[1].bounds_native_m.max_m[0]), 'm', 'derived', [ref('skp', 'Group:11:差别，中段相邻踏面 maxX')], '曲面中段的名义步距，不代表所有弧段座位排距。');
  add('tiers.nominal_slope', '中段名义坡度', round(Math.atan(0.495 / 0.9) * 180 / Math.PI), 'deg', 'derived', [ref('skp', 'Group:11:差别')]);
  add('stairs.tread', 'CAD 通行小踏步进深', cad('architecture', '27D3D').measurement / 32 / 1000, 'm', 'derived', [ref('architecture', 'DIMENSION 27D3D: 32x300=9600')]);
  add('stairs.rise', 'CAD 通行小踏步高度', cad('architecture', '27D59').measurement / 33 / 1000, 'm', 'derived', [ref('architecture', 'DIMENSION 27D59: 165x33=5445')]);
  for (const [prefix, label] of [['Group:13:', '上层走道板'], ['Group:15:', '下层走道板'], ['Group:17:', '局部屋面板']]) {
    const n = node(prefix);
    skpFact(`${prefix}.elevation_range`, `${label}上下标高`, [n.bounds.min_m[2], n.bounds.max_m[2]], 'm', n, '不是二楼座位地面标高，也不是整厅统一净高。');
    skpFact(`${prefix}.aabb`, `${label}包围盒 XYZ`, n.bounds.size_m, 'm', n);
  }
  const b = evidence.brochure;
  for (const key of ['stage_front_width_m', 'stage_middle_width_m', 'stage_rear_width_m', 'stage_depth_m', 'stage_area_m2', 'barrier_stage_distance_m', 'foh_stage_distance_m', 'foh_length_m', 'foh_width_m', 'foh_rear_to_junction_box_m']) {
    add(`brochure.${key}`, key, b[key], key.endsWith('m2') ? 'm2' : 'm', 'published_approximation', [ref('brochure', 'PDF 第7页（物理页码）')], '宣传资料；距离端点及与1208布局的对应关系待核定。');
  }
  add('stage.trapezoid_check', '假设简单梯形时面积', (b.stage_front_width_m + b.stage_rear_width_m) / 2 * b.stage_depth_m, 'm2', 'derived_conflict_check', [ref('brochure', '第7页')], '148.5 与宣称163不一致；禁止按简单梯形同时满足所有宣传尺寸。');
  const screenWidth = cad('screen', '6393136').measurement / 1000;
  const screenHeight = cad('screen', '65B1B92').measurement / 1000;
  for (const [id, label, value, handle, note] of [
    ['screen.unfolded_width', '屏体展开宽', screenWidth, '6393136', '展开长度，不是曲面屏两端直线距离。'],
    ['screen.visible_height', '屏体有效高度候选', screenHeight, '65B1B92', '同文件存在12.48m箱体排布版本；最终版本待确认。'],
    ['screen.box_grid_height', '13层箱体总高度', cad('screen', '6392AC8').measurement / 1000, '6392AC8', '960×13；不与12m有效高度混用。'],
    ['screen.stage_clearance', '屏体底边距舞台面', cad('screen', '65B1B77').measurement / 1000, '65B1B77', '与所选屏幕版本一起确认。'],
  ]) add(id, label, value, 'm', 'drawing_revision_unresolved', [ref('screen', `DIMENSION ${handle}`)], note);
  add('screen.pixel_pitch', '像素间距', 1.28 / 512, 'm', 'derived', [ref('screen', 'TEXT 6393132, 650623D')]);
  add('screen.resolution', '整屏分辨率候选', [13312, 4800], 'px', 'drawing_revision_unresolved', [ref('screen', 'TEXT 6506239')]);
  add('screen.bottom_native', '采用12m屏体时底标高', round(2.1 + 0.5), 'm', 'conditional', [ref('skp', 'Group:0:组#11'), ref('screen', '65B1B77')], '跨版本组合计算，尚非最终安装坐标。');
  add('screen.top_native', '采用12m屏体时顶标高', round(2.1 + 0.5 + screenHeight), 'm', 'conditional', [ref('skp', 'Group:0:组#11'), ref('screen', '65B1B77, 65B1B92')]);
  const exampleBarrier = evidence.model.barrier_instances[0];
  skpFact('barrier.example_aabb', '临时隔离栏单件旋转后包围盒', exampleBarrier.bounds.size_m, 'm', exampleBarrier, '模型中49件为临时布局；不能视作1208全坐席固定障碍物。');
  for (const prefix of ['Instance:8:', 'Instance:9:']) {
    const n = node(prefix);
    skpFact(`${prefix}.aabb`, '悬挂设备组件世界包围盒 XYZ', n.bounds.size_m, 'm', n, '疑似主扩音箱；语义及实际朝向需复核。原生 min/max 和变换矩阵见 geometry.primary_roots。');
  }
  const unknowns = [
    ['auditorium.clear_outline', '观众厅净轮廓及柱/墙/门洞分层轮廓', 'polygon'],
    ['stage.performance_outline', '实际可表演舞台边界及前沿折点', 'polygon'],
    ['stage.front_anchor', '正式舞台前沿中心锚点', 'm_xyz'],
    ['seats.1f.column_pitch', '一楼座椅中心距（含是否各区不同）', 'm'],
    ['seats.1f.row_pitch', '一楼各排中心距', 'm'],
    ['seats.1f.first_row_offset', '首排中心至舞台前沿距离', 'm'],
    ['seats.1f.block_anchors', '前中后区起止位置与控台两侧锚点', 'm_xyz'],
    ['seats.2f.row_to_tread', '二楼12排与踏面/平台逐排对应', 'mapping'],
    ['seats.2f.arc_parameters', '各排弧心、半径、起止角及侧区折线', 'm_rad'],
    ['seats.2f.pitch', '二楼各区座椅中心距及沿弧分配方式', 'm'],
    ['seats.2f.anchors', '二楼每区首末座中心与朝向', 'm_xyz_rad'],
    ['seats.numbering_handedness', '表格左侧座号对应模型原生Y哪一侧', 'mapping'],
    ['chair.width', '椅子外宽', 'm'], ['chair.depth', '椅子展开深度', 'm'],
    ['chair.height', '椅背总高', 'm'], ['chair.seat_height', '坐垫离脚下地面高', 'm'],
    ['chair.pivot', '座椅资产落地中心锚点与朝前轴', 'm_xyz_rad'],
    ['aisles.widths', '侧通道/中通道逐段净宽', 'm'],
    ['foh.anchor_orientation', '1208布局控台边界、位置、朝向与高度', 'm_xyz_rad'],
    ['railings.geometry', '看台前栏杆、立柱、扶手精确位置及截面', 'mesh'],
    ['screen.curve', '所选屏体曲线、弧心、半径、位置、厚度', 'm_rad'],
    ['rigging.anchors', '吊点逐点XYZ、梁底和设备最低点', 'm_xyz'],
    ['camera.eye_height', '观众机位相对脚下地面眼高', 'm'],
    ['camera.target', '舞台观察目标及机位水平朝向规则', 'm_xyz'],
    ['camera.fov', '预览相机视场角及画幅', 'deg'],
    ['materials', '地面/墙面/座椅/屏幕等材质与贴图', 'assets'],
  ].map(([id, label, unit]) => ({ id, label, value: null, unit, status: 'unresolved', note: '需要继续标定、明确的尺寸依据或产品约定；不得以示意图像素自动换算。' }));
  const rows = evidence.seating.rows.map((r) => {
    const blocks = [];
    for (const c of r.cells) {
      const previous = blocks.at(-1);
      if (!previous || c.column !== previous.last_column + 1) blocks.push({ first_number: c.number, last_number: c.number, count: 1, first_column: c.column, last_column: c.column });
      else { previous.last_number = c.number; previous.last_column = c.column; previous.count++; }
    }
    return { floor: r.floor, row: r.row, count: r.cells.length, blocks, source_label_cell: r.label_cell, physical_positions_verified: false };
  });
  const seats = evidence.seating.rows.flatMap((r) => r.cells.map((c) => ({ id: `${r.floor}-R${String(r.row).padStart(2, '0')}-S${String(c.number).padStart(2, '0')}`, floor: r.floor, row: r.row, number: c.number, source_cell: c.cell, position_m: null, yaw_rad: null, tread_surface_index: null, status: 'identity_verified_position_unresolved' })));
  return {
    schema_version: 1, date: evidence.captured_on, layout: '全坐席1208', purpose: '模型总览与座位落位的尺寸依据；不直接作为已标定模型加载', physical_model_complete: false,
    units: { length: 'm', area: 'm2', angle: 'rad unless deg stated', skp_native_to_m: evidence.model.inch_to_m },
    sources: evidence.sources,
    coordinates: { native: 'SketchUp: X纵深、Y横向、Z向上；舞台在较小X处', proposed_web: { status: 'provisional_anchor', anchor_native_m: [10.973863, 361.042760, 0.6], mapping: ['webX = nativeY - 361.042760', 'webY = nativeZ - 0.6', 'webZ = nativeX - 10.973863'], audience_looks_towards: '-webZ', note: '以面片边界与看台对称线暂定原点；正式舞台前沿中心与座号左右仍待标定。该轴变换保持右手系。' } },
    facts, tier_surfaces: tiers, unresolved_parameters: unknowns,
    seating: { source: 'seating', sheet: evidence.seating.sheet, totals: { '1F': 800, '2F': 408, all: seats.length }, rows, seats, ui_discrepancy: { floor: '2F', row: 1, website_groups: [6, 23], source_groups: [6, 17, 6], count_changed: false, ui_modified_in_this_delivery: false } },
    geometry: { primary_roots: evidence.model.primary_roots, assembled_bounds_native_m: assembledBounds, horizontal_faces: evidence.model.horizontal_faces, vertex_order: evidence.model.face_vertex_order, whole_file_bounds_excluded: evidence.model.whole_file_bounds_excluded, barrier_instances: evidence.model.barrier_instances, note: '包围盒用于核对尺寸，不等于网格。面点未核定环序且不包含完整孔洞拓扑，禁止直接按数组顺序三角化；正式模型沿用原SKP几何。' },
    conflicts: [
      { id: 'stage-outline', values: { brochure_area_m2: 163, simple_trapezoid_area_m2: 148.5, model_stage_backstage_face_m2: 425.228518 }, resolution: '不同边界/简化假设；不能混作同一舞台轮廓。' },
      { id: 'tier-elevations', values: { model_first_major_surface_m: 4.9, architecture_first_labeled_tread_m: 5.455, delta_m: 0.555, shared_upper_landing_m: 10.345 }, resolution: '模型和CAD各自保留；不可把整段统一抬高0.555m。未指定与座位排的关联。' },
      { id: 'screen-revisions', values: { brochure_m: [60, 15], drawing_unfolded_width_m: screenWidth, drawing_heights_m: [12, 12.48] }, resolution: '优先核定新屏图纸版本；12/12.48可能涉及有效显示区、箱体排布及裁切。' },
      { id: 'layout-revisions', values: { chosen_total: 1208, architecture_old_totals: [796, 790] }, resolution: '座号和数量依据指定工作表；建筑旧排座不覆盖现行拓扑。' },
    ],
  };
}

export function seatCsv(data) {
  return '\uFEFFid,floor,row,number,source_sheet,source_cell,x_m,y_m,z_m,yaw_rad,status\r\n' + data.seating.seats.map((s) => [s.id, s.floor, s.row, s.number, data.seating.sheet, s.source_cell, '', '', '', '', s.status].join(',')).join('\r\n') + '\r\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildDimensions();
  const outputs = [['docs/data/shanghai-3d-dimensions.json', JSON.stringify(data, null, 2) + '\n'], ['docs/data/shanghai-1208-seats.csv', seatCsv(data)]];
  for (const [path, content] of outputs) {
    const url = new URL(path, root);
    if (process.argv.includes('--check')) {
      if (readFileSync(url, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) throw new Error(`${path} is stale; run node scripts/build-shanghai-dimensions.mjs`);
    } else writeFileSync(url, content, 'utf8');
  }
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Built'} ${data.seating.seats.length} seats, ${data.facts.length} dimension records, ${data.unresolved_parameters.length} unresolved parameter groups.`);
}
