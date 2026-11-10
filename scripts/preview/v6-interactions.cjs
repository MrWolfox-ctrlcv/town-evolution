/** Bounded, real-input v6 acceptance. Inspection/preview never commits a game command. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, ready, driver, worldPoint } = require('./ui-driver.cjs');
const { drag, pinch, frame } = require('./pointer-input.cjs');
const { withDeadline } = require('./acceptance-deadline.cjs');
const { V6_GENERATOR_REVISION, V6_SIZE } = require('../../.domain-build/domain/v6-contracts');
const { V6_EDIT_MAX_LEVEL, v6EditPlane } = require('../../.domain-build/domain/v6-material-volume');
const { SAVE_KEY } = require('../../.domain-build/domain/storage');
const PLANES = Array.from({ length: V6_EDIT_MAX_LEVEL + 1 }, (_, level) => v6EditPlane(level));
const progressByPage = new WeakMap();
const SAVE = `town-evolution.v6-preview.${V6_GENERATOR_REVISION}.${SAVE_KEY}`;
const STATE_KEYS = [
  'schemaVersion',
  'mapSeed',
  'terrainVersion',
  'terrainRevision',
  'terrain6',
  'inventory',
  'coins',
  'tools',
  'naturalResources',
  'trees',
  'looseDrops',
  'groundStacks',
  'landExtensions',
  'buildings',
  'nextId',
  'fusion',
];
const relevant = (state) => Object.fromEntries(STATE_KEYS.map((key) => [key, state[key]]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function sameCamera(actual, expected, label) {
  assert.ok(Math.abs(actual.height - expected.height) < 0.0001, `${label}: zoom retained`);
  assert.ok(distance(actual.focus, expected.focus) < 0.0001, `${label}: focus retained`);
}

function assertExplicitSave(before, snapshot) {
  assert.equal(
    snapshot.flowMessage,
    '自动存档已更新。',
    'Save control reports successful persistence',
  );
  assert.ok(Number.isSafeInteger(before.lastSeenAt), 'Post-settings persisted clock is valid');
  assert.ok(
    Number.isSafeInteger(snapshot.saved?.lastSeenAt) &&
      snapshot.saved.lastSeenAt > before.lastSeenAt,
    'Explicit save advances the persisted clock beyond the settings autosave',
  );
  assert.deepEqual(
    relevant(snapshot.saved),
    relevant(before),
    'Explicit save preserves gameplay state',
  );
  assert.deepEqual(
    relevant(snapshot.saved),
    relevant(snapshot.live),
    'Explicit save matches live gameplay state',
  );
}

// Only published geometry, immutable state and advisory GameSession.preview are read here.
// In particular: no run/save/reset, event-handler invocation, localStorage write or clock edit.
async function scene(page, request = {}) {
  return page.evaluate(
    async ({ request, planes, saveKey }) => {
      const cc = await System.import('cc');
      const root = cc.director.getScene();
      const boot = root?.getChildByName('Town')?.getComponent('TownBootstrap');
      const control = boot?.controller;
      const canvas = document.querySelector('#GameCanvas');
      const rect = canvas.getBoundingClientRect();
      const css = (p) => ({
        x: rect.left + (p.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - p.y) * rect.height) / canvas.height,
      });
      const native = (p) => ({
        x: ((p.x - rect.left) * canvas.width) / rect.width,
        y: canvas.height - ((p.y - rect.top) * canvas.height) / rect.height,
        touch: request.touch === true,
      });
      const state = control?.session.state;
      const town = control?.town;
      const map = control?.map;
      const surface = town?.island.v6?.source;
      const status = {
        page: boot?.flow.page ?? null,
        overhead: map?.overhead ?? false,
        profile: boot?.flow.profile ?? null,
        frames: window.__townPreview?.frames ?? 0,
        warning: boot?.flow.storageWarning ?? '',
        message: control?.session.statusMessage ?? boot?.flow.message ?? '',
        flowMessage: boot?.flow.message ?? '',
        surface: town?.surfaceStatus ?? null,
        homeReady: town?.isGroundReady(6, 6) ?? false,
        focusReady: map
          ? town.isGroundReady(Math.floor(map.focus.x), Math.floor(map.focus.z))
          : false,
        problem: town?.surfaceProblem ?? null,
        camera: map
          ? { height: map.camera.orthoHeight, focus: { x: map.focus.x, y: map.focus.z } }
          : null,
        awaitingOverview: control?.v6Navigation?.navigation.awaitingOverview ?? null,
        mode: control?.ui.terrainMode ?? null,
        material: control?.ui.terrainMaterial ?? null,
        selection: control?.ui.selectedResource ?? null,
        operation: state?.terrain6?.nextOperation ?? null,
        ...(request.snapshot
          ? { live: state, saved: JSON.parse(localStorage.getItem(saveKey) || 'null') }
          : {}),
      };
      if (!surface || !map || boot.flow.page !== 'game') return status;
      const project = (p) => css(map.project(p));
      const point = (x, z) =>
        project({ x: x + 0.5, z: z + 0.5, y: surface.heightInCell(x + 0.5, z + 0.5, x, z) });
      const clear = (p, expected) => {
        const screen = native(p);
        if (!map.contains(screen)) return false;
        const ray = map.screenRay(screen),
          hit = town.pickTerrain(ray);
        return (
          !!hit &&
          (!expected || (hit.x === expected.x && hit.z === expected.z)) &&
          !town.pickBuilding(ray) &&
          !town.pickTree(ray) &&
          !town.pickDrop(ray) &&
          !town.pickStack(ray)
        );
      };
      const advisory = (snapshot, command) => {
        // Isolated receiver: preview remains pure; never assign to the live session.
        const planning = Object.create(control.session);
        planning.state = snapshot;
        return planning.preview(command);
      };
      const preview = (x, z, kind, material = 'soil', snapshot = state) => {
        const edited = snapshot.terrain6.cells.find((c) => c.x === x && c.z === z);
        const range = edited ? [planes[edited.level], planes[edited.level]] : surface.range(x, z);
        const levels = planes.map((height, level) => ({ height, level }));
        const found =
          kind === 'dig'
            ? levels.reverse().find((p) => p.height <= range[0] && p.height < range[1])
            : levels.find((p) => p.height >= range[1] && p.height > range[0]);
        if (!found) return { allowed: false, reason: 'No next terrain layer' };
        const command = {
          type: 'editTerrain6',
          kind,
          x,
          z,
          level: found.level,
          expectedOperation: snapshot.terrain6.nextOperation,
          ...(kind === 'fill'
            ? {
                material,
                source: { type: 'inventory', item: material, amount: snapshot.inventory[material] },
              }
            : {}),
        };
        const result = advisory(snapshot, command);
        if (!result.ok) return { allowed: false, reason: result.error };
        const drops = result.state.looseDrops.filter(
          (d) =>
            d.source.type === 'terrain6' &&
            d.source.operation === command.expectedOperation &&
            d.source.x === x &&
            d.source.z === z,
        );
        return {
          allowed: true,
          command,
          expected: result.state,
          drops,
          yield: {
            soil: drops.filter((d) => d.item === 'soil').reduce((n, d) => n + d.amount, 0),
            stone: drops.filter((d) => d.item === 'stone').reduce((n, d) => n + d.amount, 0),
          },
          cost: snapshot.inventory[material] - result.state.inventory[material],
        };
      };
      if (request.candidates) {
        // Only the starter neighbourhood, never a full-island generation or coordinate sweep.
        const candidates = state.naturalResources
          .filter((r) => Math.hypot(r.x - 6, r.z - 6) <= 32)
          .sort((a, b) => Math.hypot(a.x - 6, a.z - 6) - Math.hypot(b.x - 6, b.z - 6))
          .slice(0, 128);
        const allowed = [],
          rejected = [];
        for (const cell of candidates) {
          const result = preview(cell.x, cell.z, 'dig');
          if (!result.allowed) {
            rejected.push({ x: cell.x, z: cell.z, reason: result.reason });
            continue;
          }
          const amount = result.yield.soil + result.yield.stone;
          if (amount <= 0 || amount > 4 || result.drops.length > 8) continue;
          let simulated = state,
            funded = false;
          const gathered = { soil: 0, stone: 0 };
          for (let attempt = 0; attempt < 3 && !funded; attempt++) {
            const dig = preview(cell.x, cell.z, 'dig', 'soil', simulated);
            if (!dig.allowed || dig.drops.length > 8) break;
            simulated = dig.expected;
            for (const drop of dig.drops) {
              const pickup = advisory(simulated, { type: 'pickupDrop', dropId: drop.id });
              if (!pickup.ok) break;
              simulated = pickup.state;
              gathered[drop.item] += drop.amount;
            }
            for (const material of ['soil', 'stone']) {
              const fill = preview(cell.x, cell.z, 'fill', material, simulated);
              if (fill.allowed && fill.cost > 0 && fill.cost <= gathered[material]) funded = true;
            }
          }
          if (funded) allowed.push({ x: cell.x, z: cell.z, yield: result.yield });
          if (allowed.length === 8) break;
        }
        allowed.sort(
          (a, b) =>
            Number(Math.max(b.yield.soil, b.yield.stone) >= 1) -
            Number(Math.max(a.yield.soil, a.yield.stone) >= 1),
        );
        return { ...status, candidates: allowed, rejected };
      }
      if (request.cell) {
        const { x, z } = request.cell;
        const p = point(x, z);
        return {
          ...status,
          point: p,
          groundReady: town.isGroundReady(x, z),
          clear: clear(p, { x, z }),
          ...(request.kind ? { plan: preview(x, z, request.kind, request.material) } : {}),
          cell: state.terrain6.cells.find((c) => c.x === x && c.z === z) ?? null,
          height: surface.heightInCell(x + 0.5, z + 0.5, x, z),
        };
      }
      if (request.drop) {
        const bounds = town.objectBounds({ kind: 'drop', id: request.drop });
        const origin = bounds
          ? {
              x: (bounds.min[0] + bounds.max[0]) / 2,
              y: (bounds.min[1] + bounds.max[1]) / 2,
              z: (bounds.min[2] + bounds.max[2]) / 2,
            }
          : town.dropOrigin(request.drop);
        if (!origin) return { ...status, dropPoint: null };
        const p = project(origin);
        // Read the same tolerant visible-object picker used by a real touch/mouse release.
        for (const [dx, dy] of [
          [0, 0],
          [0, -3],
          [3, 0],
          [-3, 0],
          [0, 3],
        ]) {
          const candidate = { x: p.x + dx, y: p.y + dy },
            screen = native(candidate);
          if (map.contains(screen) && town.pickDrop(map.screenRay(screen)) === request.drop)
            return { ...status, dropPoint: candidate };
        }
        return { ...status, dropPoint: null };
      }
      if (request.gesture) {
        // Choose a safe map point through the live viewport/HUD gate, not fixed phone coordinates.
        for (const fy of [0.45, 0.55, 0.35, 0.65])
          for (const fx of [0.5, 0.4, 0.6]) {
            const p = { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
            const offsets = [
              { x: -48, y: 0 },
              { x: 48, y: 0 },
              { x: 28, y: -20 },
              { x: 0, y: 0 },
            ];
            if (offsets.every((d) => map.contains(native({ x: p.x + d.x, y: p.y + d.y }))))
              return { ...status, gesture: p };
          }
        return { ...status, gesture: null };
      }
      return status;
    },
    { request, planes: PLANES, saveKey: SAVE },
  );
}

async function waitScene(page, predicate, label, request = {}, timeout = 90000) {
  const deadline = Date.now() + timeout;
  const progress = progressByPage.get(page);
  const activity = progress?.begin('wait', label, { request, timeoutMs: timeout });
  let last;
  try {
    do {
      last = await scene(page, request);
      progress?.sample(activity, last);
      assert.equal(last.problem, null, `${label}: terrain publication failed: ${last.problem}`);
      assert.equal(last.warning, '', `${label}: storage unavailable: ${last.warning}`);
      if (predicate(last)) {
        progress?.end(activity);
        return last;
      }
      await page.waitForTimeout(150);
    } while (Date.now() < deadline);
    throw new Error(`V6 acceptance timed out: ${label}; ${JSON.stringify(last)}`);
  } catch (error) {
    progress?.end(activity, error);
    throw error;
  }
}

module.exports = async function v6Interactions(page, evidence, name, touch) {
  fs.mkdirSync(evidence, { recursive: true });
  const report = {
    passed: false,
    input: touch ? 'touch' : 'mouse',
    saveKey: SAVE,
    stages: [],
    digs: [],
    checks: [],
  };
  const file = path.join(evidence, `${name}-v6.json`);
  const progress = require('./v6-progress.cjs')(path.join(evidence, `${name}-v6-progress.json`));
  progressByPage.set(page, progress);
  const ui = driver(page, touch);
  let stage = 'fresh title';
  const checkpoint = (label, data = {}) => {
    stage = label;
    progress.stage(label);
    report.stages.push({ stage, ...data });
  };
  const shot = (suffix) =>
    progress.run('screenshot', suffix, () =>
      page.screenshot({ path: path.join(evidence, `${name}-v6-${suffix}.png`), timeout: 10000 }),
    );
  const closeDetails = async () => {
    if ((await inspect(page)).targets.some((t) => t.name === 'ContextClose'))
      await ui.named('ContextClose');
    await page.waitForTimeout(300); // Real 240ms shelf animation/layout, no game-time injection.
  };
  const savedState = async () => {
    const snapshot = await scene(page, { snapshot: true });
    assert.ok(snapshot.live && snapshot.saved, 'Real v6 session and revision-scoped save exist');
    assert.deepEqual(
      relevant(snapshot.saved),
      relevant(snapshot.live),
      'Saved state matches live authoritative state',
    );
    const shared = await inspect(page);
    assert.equal(
      shared.saveKey,
      SAVE,
      'Shared driver routes v6 to its actual revision-scoped save',
    );
    assert.deepEqual(relevant(shared.save), relevant(snapshot.live));
    return snapshot.saved;
  };
  const showTool = async () => {
    for (let i = 0; i < 7; i++) {
      const view = await inspect(page);
      const tool = view.tools.find((t) => t.name === 'diggingToolTool');
      if (tool) return tool;
      await ui.named('ToolsLeftNext');
    }
    throw new Error('V6 digging tool is not visible after one bounded tray cycle');
  };
  const mode = async (kind, material) => {
    await ui.townActions();
    await ui.pagedButton(kind === 'dig' ? '挖地' : '填地');
    if (material && (await scene(page)).material !== material) await ui.pagedButton('填料：');
    assert.equal((await scene(page)).mode, kind);
    if (material) assert.equal((await scene(page)).material, material);
    await closeDetails();
  };
  const focusCell = async (cell) => {
    // Pan toward the real projected target in at most eight short gestures. No camera setters.
    for (let i = 0; i < 8; i++) {
      const current = await scene(page, { cell, touch });
      const { gesture } = await scene(page, { gesture: true, touch });
      assert.ok(gesture, 'An uncovered map gesture region exists');
      if (current.clear && distance(gesture, current.point) < 45) return current;
      const dx = gesture.x - current.point.x,
        dy = gesture.y - current.point.y;
      if (Math.hypot(dx, dy) < 8) break;
      const scale = Math.min(1, 65 / Math.max(Math.abs(dx), Math.abs(dy)));
      const from = { x: gesture.x - (dx * scale) / 2, y: gesture.y - (dy * scale) / 2 };
      const to = { x: gesture.x + (dx * scale) / 2, y: gesture.y + (dy * scale) / 2 };
      await drag(page, from, to, touch);
    }
    return waitScene(page, (s) => s.groundReady, 'local target surface published', { cell, touch });
  };
  try {
    await ready(page);
    const title = await scene(page, { snapshot: true });
    assert.equal(title.page, 'title', 'Run v6 acceptance in its own fresh browser context');
    assert.equal(
      title.saved,
      null,
      'Fresh v6 acceptance must not overwrite an existing experimental save',
    );
    checkpoint('enter through visible menu');
    await ui.button('自然挖填实验');
    const entered = await waitScene(
      page,
      (s) => s.page === 'game' && s.profile === 'v6-preview',
      'v6 preparation and real session',
      {},
      120000,
    );
    checkpoint('first real overview publication', { entry: entered });
    const overview = await waitScene(
      page,
      (s) =>
        s.surface?.overviewVisible &&
        !s.awaitingOverview &&
        s.frames > entered.frames &&
        s.camera?.focus.x === V6_SIZE / 2 &&
        s.camera?.focus.y === V6_SIZE / 2,
      'published first-load overview',
    );
    assert.ok(
      overview.frames > entered.frames,
      'Actual engine frames continue during first-load publication',
    );
    await shot('first-overview');
    const initial = await savedState();
    assert.equal(initial.terrainVersion, 6);
    assert.equal(initial.terrainRevision, V6_GENERATOR_REVISION);
    assert.equal(initial.terrain6.nextOperation, 1);
    assert.deepEqual(initial.terrain6.cells, []);
    report.checks.push('visible v6 entry, real first terrain publication and default overview');

    checkpoint('home and real camera input');
    await ui.named('TerrainView:回家');
    const firstHome = await scene(page);
    await ui.named('TerrainView:全岛');
    sameCamera((await scene(page)).camera, overview.camera, 'Visible overview control');
    await ui.named('TerrainView:回家');
    const home = await scene(page);
    sameCamera(home.camera, firstHome.camera, 'Home after manual overview');
    assert.deepEqual(home.camera.focus, { x: 6, y: 6 });
    assert.ok(home.camera.height < overview.camera.height * 0.2, 'Home is a usable close view');
    await ui.named('TerrainView:＋');
    assert.ok(
      (await scene(page)).camera.height < home.camera.height,
      'Visible zoom-in control works',
    );
    await ui.named('TerrainView:−');
    sameCamera((await scene(page)).camera, home.camera, 'Paired zoom controls');
    const { gesture } = await scene(page, { gesture: true, touch });
    assert.ok(gesture, 'Real map input is accessible');
    const anchorWorld = { x: 6, y: 0, z: 6 };
    const beforePan = await worldPoint(page, anchorWorld);
    await drag(page, gesture, { x: gesture.x + 28, y: gesture.y - 20 }, touch);
    const afterPan = await worldPoint(page, anchorWorld);
    assert.ok(
      distance(afterPan, { x: beforePan.x + 28, y: beforePan.y - 20 }) < 6,
      'Map follows real pointer pan',
    );
    const panned = await scene(page);
    if (touch) await pinch(page, gesture);
    else {
      await page.mouse.move(gesture.x, gesture.y);
      await page.mouse.wheel(0, -180);
      await frame(page);
    }
    const zoomed = await scene(page);
    assert.ok(zoomed.camera.height < panned.camera.height * 0.95, 'Real pinch/wheel zoom works');
    await waitScene(page, (s) => s.focusReady, 'local detail publication after user camera input');
    await page.waitForTimeout(600);
    sameCamera(
      (await scene(page)).camera,
      zoomed.camera,
      'Publication never overrides user camera input',
    );
    assert.deepEqual(
      relevant(await savedState()),
      relevant(initial),
      'All view navigation leaves game state unchanged',
    );
    report.checks.push(
      'home and zoom controls, pointer pan and pinch/wheel, camera retained across streaming',
    );
    await shot('camera');

    checkpoint('find one local legal dig route');
    await ui.named('TerrainView:回家');
    // Two ordinary zoom-out steps show the nearby starter resources, not the full island.
    await ui.named('TerrainView:−');
    await ui.named('TerrainView:−');
    const options = await scene(page, { candidates: true });
    report.candidates = options.candidates;
    report.rejectedCandidates = options.rejected;
    assert.ok(options.candidates.length, 'A domain-valid starter-neighbourhood dig exists');
    let target;
    for (const candidate of options.candidates.slice(0, 3)) {
      const positioned = await focusCell(candidate);
      if (positioned.clear) {
        target = { x: candidate.x, z: candidate.z };
        break;
      }
    }
    assert.ok(target, 'Actual published terrain has an unobstructed mouse/touch target');
    report.target = target;
    const collected = { soil: 0, stone: 0 };
    let fillPlan;
    // Normally one dig; at most two extra layers may fund a genuine one-layer fill.
    for (let attempt = 0; attempt < 3; attempt++) {
      checkpoint(`real dig ${attempt + 1}`);
      await mode('dig');
      await waitScene(page, (s) => s.groundReady && s.clear, 'unobstructed dig target', {
        cell: target,
        touch,
      });
      const before = await savedState();
      const planned = await scene(page, { cell: target, kind: 'dig', touch });
      assert.ok(
        planned.clear && planned.plan.allowed,
        `Real target supports dig: ${planned.plan?.reason}`,
      );
      assert.deepEqual(
        relevant(await savedState()),
        relevant(before),
        'Advisory planning never mutates game/save state',
      );
      await drag(page, await showTool(), planned.point, touch);
      await waitScene(
        page,
        (s) => s.operation === before.terrain6.nextOperation + 1,
        'one real dig command committed',
      );
      const dug = await savedState();
      assert.deepEqual(
        relevant(dug),
        relevant(planned.plan.expected),
        'Real dig exactly matches advisory domain result',
      );
      assert.deepEqual(dug.inventory, before.inventory, 'Dig output stays on ground until pickup');
      const drops = planned.plan.drops;
      assert.ok(drops.length > 0 && drops.length <= 8, 'One bounded real soil/stone drop set');
      report.digs.push({ cell: target, command: planned.plan.command, drops });
      await shot(`dig-${attempt + 1}`);
      for (const drop of drops) {
        checkpoint(`pick up ${drop.item} ${drop.id}`);
        const pickup = await waitScene(
          page,
          (s) => !!s.dropPoint,
          'published unobstructed actual drop',
          { drop: drop.id, touch },
        );
        const inventoryBefore = (await savedState()).inventory;
        await ui.click(pickup.dropPoint);
        assert.deepEqual(
          (await scene(page)).selection,
          { kind: 'drop', id: drop.id },
          'Pointer selects the exact actual drop',
        );
        await ui.button('拾取 ');
        await waitScene(
          page,
          (s) => !s.saved.looseDrops.some((d) => d.id === drop.id),
          'actual drop picked up',
          { snapshot: true },
          10000,
        );
        const picked = await savedState();
        assert.deepEqual(
          picked.inventory,
          { ...inventoryBefore, [drop.item]: inventoryBefore[drop.item] + drop.amount },
          'Only this actual drop enters inventory',
        );
        collected[drop.item] += drop.amount;
        await closeDetails();
      }
      // A deep cut may be entirely behind the near slope in the default view.
      // Use the player's real camera control, never pick through opaque terrain.
      if (!(await scene(page)).overhead) {
        await ui.named('TerrainView:视角');
        assert.equal((await scene(page)).overhead, true, 'Visible control enters overhead view');
      }
      await focusCell(target);
      await waitScene(
        page,
        (s) => s.groundReady && s.clear,
        'edited surface published and cleared',
        { cell: target, touch },
      );
      for (const material of ['soil', 'stone']) {
        if (collected[material] <= 0) continue;
        const fill = await scene(page, { cell: target, kind: 'fill', material, touch });
        if (fill.plan.allowed && fill.plan.cost > 0 && fill.plan.cost <= collected[material]) {
          fillPlan = { material, cost: fill.plan.cost };
          break;
        }
      }
      if (fillPlan) break;
    }
    assert.ok(
      fillPlan,
      'A real fill must be funded entirely by these digs; no skipped success or injected materials',
    );
    checkpoint('real fill with collected material', { collected, fill: fillPlan });
    await mode('fill', fillPlan.material);
    const beforeFill = await savedState();
    const fill = await scene(page, {
      cell: target,
      kind: 'fill',
      material: fillPlan.material,
      touch,
    });
    assert.ok(
      fill.clear && fill.plan.allowed,
      `Actual fill target remains valid: ${fill.plan?.reason}`,
    );
    assert.ok(
      fill.plan.cost <= collected[fillPlan.material],
      'No pre-existing stock is needed for fill',
    );
    await drag(page, await showTool(), fill.point, touch);
    await waitScene(
      page,
      (s) => s.operation === beforeFill.terrain6.nextOperation + 1,
      'one real fill command committed',
    );
    const filled = await savedState();
    assert.deepEqual(
      relevant(filled),
      relevant(fill.plan.expected),
      'Real fill matches exact advisory cost and checkpoint',
    );
    await waitScene(page, (s) => s.groundReady, 'filled geometry publication', {
      cell: target,
      touch,
    });
    await shot('filled');
    await ui.named('TerrainView:视角');
    assert.equal(
      (await scene(page)).overhead,
      false,
      'Visible control restores default isometric view',
    );
    assert.deepEqual(
      relevant(await savedState()),
      relevant(filled),
      'View switching never alters gameplay',
    );
    report.checks.push(
      'unobstructed published target, real dig, explicit actual-drop pickup, real fill from collected materials',
    );

    checkpoint('explicit save and reload/resume');
    await ui.named('Menu-settings');
    // Opening settings already suspends/saves. Baseline AFTER that autosave so
    // a no-op explicit-save button cannot pass by relying on earlier persistence.
    const beforeExplicitSave = await savedState();
    assert.equal((await scene(page)).page, 'settings');
    await page.waitForTimeout(50); // Let the real millisecond clock advance; never inject time.
    await ui.button('立即保存');
    const explicitSave = await waitScene(
      page,
      (s) =>
        s.flowMessage === '自动存档已更新。' && s.saved?.lastSeenAt > beforeExplicitSave.lastSeenAt,
      'explicit save feedback and newer persisted clock',
      { snapshot: true },
      10000,
    );
    assertExplicitSave(beforeExplicitSave, explicitSave);
    report.explicitSave = {
      beforeLastSeenAt: beforeExplicitSave.lastSeenAt,
      afterLastSeenAt: explicitSave.saved.lastSeenAt,
      feedback: explicitSave.flowMessage,
    };
    const saved = await savedState();
    assert.deepEqual(relevant(saved), relevant(filled));
    await progress.run('navigation', 'reload', () =>
      page.reload({ waitUntil: 'domcontentloaded' }),
    );
    await ready(page);
    assert.equal((await scene(page)).page, 'title', 'Reload follows the real title lifecycle');
    await ui.button('自然挖填实验');
    const resumed = await waitScene(
      page,
      (s) => s.page === 'game' && s.profile === 'v6-preview',
      'saved v6 session resumes through menu',
      {},
      120000,
    );
    // An early explicit home choice must survive any still-pending first-publication overview.
    checkpoint('resume home publication');
    report.resumeHadPendingOverview = resumed.awaitingOverview;
    await ui.named('TerrainView:回家');
    const requestedHome = (await scene(page)).camera;
    await waitScene(
      page,
      (s) => s.surface?.overviewVisible && s.homeReady,
      'resumed home surface publication',
    );
    sameCamera(
      (await scene(page)).camera,
      requestedHome,
      'Resume publication respects user home choice',
    );
    checkpoint('resume exact saved state');
    const restored = await savedState();
    assert.deepEqual(
      relevant(restored),
      relevant(saved),
      'Reload preserves exact terrain checkpoints, inventory, drops, resources, tools and world entities',
    );
    await focusCell(target);
    checkpoint('resume edited cell publication');
    const finalCell = await waitScene(
      page,
      (s) => s.groundReady,
      'saved edited geometry is published',
      { cell: target, touch },
    );
    assert.deepEqual(
      finalCell.cell,
      saved.terrain6.cells.find((c) => c.x === target.x && c.z === target.z),
    );
    assert.equal(
      finalCell.height,
      PLANES[finalCell.cell.level],
      'Reload publishes the saved edited plane',
    );
    await shot('resumed');
    report.checks.push(
      'explicit save, real reload/menu resume, exact persisted state and published edited plane',
    );
    report.finalState = relevant(restored);
    report.passed = true;
    checkpoint('complete');
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    report.failure = { stage, error: String(error), stack: error.stack };
    try {
      report.failure.scene = await withDeadline(
        () => scene(page, { snapshot: true }),
        5000,
        'v6 failure scene inspection',
      );
    } catch (inspectionError) {
      report.failure.inspectionError = String(inspectionError);
    }
    try {
      await shot('FAILED');
    } catch (screenshotError) {
      report.failure.screenshotError = String(screenshotError);
    }
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    throw error;
  } finally {
    progressByPage.delete(page);
  }
};
// Focused isolated checks use these helpers; they are not runtime acceptance evidence.
module.exports.relevant = relevant;
module.exports.sameCamera = sameCamera;
module.exports.inspectScene = scene;
module.exports.assertExplicitSave = assertExplicitSave;
