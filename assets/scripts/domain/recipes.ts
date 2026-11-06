import type { BuildingKind } from './types';
import { FOUNDATION, UNLIMITED_TOOL_DURABILITY } from './foundation';
export type { RecipeId } from './types';
export type { RecipeProduct, RecipeDefinition } from './recipe-types';
import type { RecipeDefinition } from './recipe-types';
import { ROUTE_RECIPES } from './route-recipes';
import { TOOL_CRAFT_RECIPES } from './craft-recipes';
export const FUSION = { attachmentLimit: 5, expansionWood: 2 };
export const SAW_RECIPES = TOOL_CRAFT_RECIPES.filter((recipe) => recipe.tool === 'saw');
/** Shared by drag hit-testing and the atomic command, in either direction. */
export function canMergeBuildings(left: BuildingKind, right: BuildingKind): boolean {
  return (
    (left === 'woodenPier' && right === 'woodenPier') ||
    (left === 'farm' && right === 'farm') ||
    (left === 'house' && (right === 'stoneMill' || right === 'stoneOven')) ||
    (right === 'house' && (left === 'stoneMill' || left === 'stoneOven')) ||
    (left === 'warehouse' && right === 'cooler') ||
    (right === 'warehouse' && left === 'cooler')
  );
}
const TOOL_WEAR_DESCRIPTION = UNLIMITED_TOOL_DURABILITY ? '工具无限耐久' : '消耗1耐久';
/** Full registry, including records still accepted from older saves. */
export const RECIPE_DEFINITIONS: ReadonlyArray<RecipeDefinition> = [
  {
    id: 'gather-wood',
    title: '伐木留种',
    category: 'gather',
    availability: 'active',
    hint: '树木既能提供建材，也能留下新的种子。',
    ingredients: [{ kind: 'tree', label: '树木', amount: 1 }],
    tool: 'axe',
    result: { kind: 'wood', label: '木材', amount: FOUNDATION.treeYield },
    byproducts: [{ kind: 'treeSeed', label: '树种', amount: FOUNDATION.treeSeedYield }],
    description: `把斧子拖到树上松手，获得2份木材和2份树种。${TOOL_WEAR_DESCRIPTION}，产物进入库存；需留出4份空间，空间不足时树木保留。`,
  },
  {
    id: 'build-order-board',
    title: '木制公告牌',
    category: 'build',
    availability: 'active',
    hint: '少量木材也能让小镇传递消息。',
    ingredients: [{ kind: 'wood', label: '木材', amount: 1 }],
    tool: 'hammer',
    result: { kind: 'orderBoard', label: '公告牌', amount: 1 },
    description: `在地上放1份木材，再拖入锤子，制成可接订单的公告牌。需1格空地，${TOOL_WEAR_DESCRIPTION}。`,
  },
  {
    id: 'build-crate',
    title: '木制箱子',
    category: 'build',
    availability: 'active',
    hint: '两份木材可以拼成一个新部件。',
    ingredients: [{ kind: 'wood', label: '木材', amount: 2 }],
    tool: 'hammer',
    result: { kind: 'crate', label: '箱子', amount: 1 },
    description: `在同一地块叠放2份木材，再拖入锤子。需1格空地，${TOOL_WEAR_DESCRIPTION}；将箱子拖到基础房屋上可合成库房。`,
  },
  {
    id: 'build-house',
    title: '基础房屋',
    category: 'build',
    availability: 'active',
    hint: '更多木材能够搭起建筑的基础。',
    ingredients: [{ kind: 'wood', label: '木材', amount: 4 }],
    tool: 'hammer',
    result: { kind: 'house', label: '基础房屋', amount: 1 },
    description: `在同一地块叠放4份木材，再拖入锤子。需2×2空地，${TOOL_WEAR_DESCRIPTION}；可与箱子或公告牌继续合成。`,
  },
  {
    id: 'build-warehouse',
    title: '房屋改库房',
    category: 'evolve',
    availability: 'active',
    hint: '给基础房屋添置箱子，让它成为存放货物的地方。',
    ingredients: [
      { kind: 'house', label: '基础房屋', amount: 1 },
      { kind: 'crate', label: '箱子', amount: 1 },
    ],
    tool: 'hammer',
    result: { kind: 'warehouse', label: '库房', amount: 1 },
    description:
      '明确选择地上的基础房屋与箱子，再用锤子装配。合成后房屋原地成为16容量库房，保留两者挂载材料，不花费金币。',
  },
  {
    id: 'build-shop',
    title: '房屋改商店',
    category: 'evolve',
    availability: 'active',
    hint: '房屋和公告牌组合，也许能打开买卖的大门。',
    ingredients: [
      { kind: 'house', label: '基础房屋', amount: 1 },
      { kind: 'orderBoard', label: '公告牌', amount: 1 },
    ],
    tool: 'hammer',
    result: { kind: 'shop', label: '商店', amount: 1 },
    description:
      '明确选择地上的基础房屋与公告牌，再用锤子装配。合成后房屋原地成为商店，保留两者挂载材料，不花费金币。',
  },
  {
    id: 'expand-warehouse',
    title: '添木扩建',
    category: 'evolve',
    availability: 'active',
    hint: '给基础仓房添些木材，再用敲击的工具试着扩建。',
    ingredients: [
      { kind: 'warehouse', label: '基础仓房', amount: 1 },
      { kind: 'wood', label: '木材', amount: FUSION.expansionWood },
    ],
    tool: 'hammer',
    result: { kind: 'expandedWarehouse', label: '扩容仓房', amount: 1 },
    description: `把2份木材拖到同一座基础仓房，再使用锤子。${TOOL_WEAR_DESCRIPTION}，容量16→32，保留库存与其余挂载材料。`,
  },
  {
    id: 'merge-cold',
    title: '冷藏融合',
    category: 'evolve',
    availability: 'legacy',
    hint: '基础仓房与制冷设施之间，也存在一种连接。',
    ingredients: [
      { kind: 'warehouse', label: '基础仓房', amount: 1 },
      { kind: 'cooler', label: '制冷设施', amount: 1 },
    ],
    result: { kind: 'coldWarehouse', label: '冷藏库', amount: 1 },
    description: '将两座建筑拖叠融合，花费20金币。保留旧配方记录；当前版本不开放新的冷藏生产。',
  },
  {
    id: 'dig-farm',
    title: '开垦田地',
    category: 'build',
    availability: 'active',
    hint: '平地也能长出收获。',
    ingredients: [{ kind: 'flatLand', label: '平地', amount: 1 }],
    tool: 'diggingTool',
    result: { kind: 'farm', label: '田地', amount: 1 },
    description: '挖掘工具拖到平地，需2×2完整空地，开出3×3独立种植格。',
  },
  {
    id: 'merge-farms',
    title: '连田成片',
    category: 'evolve',
    availability: 'active',
    hint: '相邻的田垄能够连成更大的片区。',
    ingredients: [{ kind: 'farm', label: '田地', amount: 3 }],
    result: { kind: 'largeFarm', label: '大田地', amount: 1 },
    description:
      '三块同为旱田或水田的小田摆成2×2缺一角，长按一块拖叠另一块。完整4×4占地无阻挡时合成6×6种植格，原27格作物与位置不变，奖励9个空格。',
  },
  {
    id: 'irrigate-farm',
    title: '引水入田',
    category: 'evolve',
    availability: 'active',
    hint: '水可以改变田地的样貌。',
    ingredients: [{ kind: 'farm', label: '田地或大田地', amount: 1 }],
    tool: 'wateringCan',
    result: { kind: 'waterFarm', label: '水田', amount: 1 },
    description:
      '把水壶拖到空田地或空大田地灌成水田；有旱作物时须先收获。胡萝卜、小麦、生菜只能种在旱田，稻谷只能种在水田。旧档水田已有作物保留原计时和产量，可正常收获。',
  },
  {
    id: 'gather-soil',
    title: '挖土成料',
    category: 'gather',
    availability: 'active',
    hint: '挖掘工具能把土丘变成可用的材料。',
    ingredients: [{ kind: 'soilMound', label: '土丘', amount: 1 }],
    tool: 'diggingTool',
    result: { kind: 'soil', label: '土料', amount: 9 },
    description: `把挖掘工具拖到土丘上松手，整格土丘变成9份土料，分堆落在附近，手动拾取后才进库存。${TOOL_WEAR_DESCRIPTION}；附近掉落空间不足时土丘保留。`,
  },
  {
    id: 'gather-stone',
    title: '开采石料',
    category: 'gather',
    availability: 'active',
    hint: '石矿可以逐块开采。',
    ingredients: [{ kind: 'stoneDeposit', label: '石矿', amount: 1 }],
    tool: 'diggingTool',
    result: { kind: 'stone', label: '石料', amount: 1 },
    description: `把挖掘工具拖到石矿上松手，每次采出1份石料落在附近，手动拾取后才进入库存，剩余矿柱保留。${TOOL_WEAR_DESCRIPTION}；附近没有掉落空间时不消耗矿石。`,
  },
  {
    id: 'water-soil',
    title: '和土成泥',
    category: 'build',
    availability: 'active',
    hint: '水能让土料成为新的材料。',
    ingredients: [{ kind: 'soil', label: '土料', amount: 9 }],
    tool: 'wateringCan',
    result: { kind: 'mud', label: '泥', amount: 1 },
    description: `拖动水壶依次划过地上至少两堆土料，选满9份后松手，在第一堆的位置生成1份泥。最后一堆多余的土料保留，${TOOL_WEAR_DESCRIPTION}。`,
  },
  {
    id: 'expand-land',
    title: '填海造陆',
    category: 'build',
    availability: 'active',
    hint: '岸边的水域可以变成新的土地。',
    ingredients: [{ kind: 'mud', label: '泥', amount: 9 }],
    result: { kind: 'reclaimedLand', label: '新土地', amount: 1 },
    description:
      '把9份泥的整堆拖到紧邻陆地的海格，消耗整堆并新增1格平地。须保留船坞出口，不合适的位置不会消耗泥。',
  },
  {
    id: 'build-residence',
    title: '房屋改住宅',
    category: 'evolve',
    availability: 'active',
    hint: '给基础房屋添些泥，可以成为新的居所。',
    ingredients: [
      { kind: 'house', label: '基础房屋', amount: 1 },
      { kind: 'mud', label: '泥', amount: 1 },
    ],
    tool: 'hammer',
    result: { kind: 'residence', label: '住宅', amount: 1 },
    description:
      '把库存或地上的1份泥放到基础房屋，再用锤子原地改成住宅。保留建筑位置、朝向和其他挂载材料，不花费金币。',
  },
  ...ROUTE_RECIPES,
];

/** Current discovery goals. Legacy commands and save validation use the full registry above. */
export const ACTIVE_RECIPE_DEFINITIONS = RECIPE_DEFINITIONS.filter(
  (recipe) => recipe.availability === 'active',
);
