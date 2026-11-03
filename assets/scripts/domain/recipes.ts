import type { RecipeId, ToolId } from './types';
import { FOUNDATION } from './foundation';
export type { RecipeId } from './types';
export interface RecipeDefinition {
  id: RecipeId;
  title: string;
  category: 'gather' | 'build' | 'evolve';
  hint: string;
  ingredients: Array<{ kind: string; label: string; amount: number }>;
  tool?: ToolId;
  result: { kind: string; label: string; amount: number };
  description: string;
}
export const FUSION = { attachmentLimit: 5, expansionWood: 2 };
export const RECIPE_DEFINITIONS: RecipeDefinition[] = [
  {
    id: 'gather-wood',
    title: '林间采集',
    category: 'gather',
    hint: '林间的树木，也许藏着建造的第一份材料。',
    ingredients: [{ kind: 'tree', label: '树木', amount: 1 }],
    tool: 'axe',
    result: { kind: 'wood', label: '木材', amount: FOUNDATION.treeYield },
    description: '把斧子拖到树上松手。消耗1耐久，木材进入库存；满仓不会砍伐。',
  },
  {
    id: 'build-warehouse',
    title: '木作仓房',
    category: 'build',
    hint: '把几份木材堆到一起，试试能够切割它们的工具。',
    ingredients: [{ kind: 'wood', label: '木材', amount: FOUNDATION.warehouseWood }],
    tool: 'saw',
    result: { kind: 'warehouse', label: '基础仓房', amount: 1 },
    description: '在同一地块叠放3份木材，再拖入锯子。需2×2空地，消耗1耐久，多余木材退回库存。',
  },
  {
    id: 'expand-warehouse',
    title: '添木扩建',
    category: 'evolve',
    hint: '给基础仓房添些木材，再用敲击的工具试着扩建。',
    ingredients: [
      { kind: 'warehouse', label: '基础仓房', amount: 1 },
      { kind: 'wood', label: '木材', amount: FUSION.expansionWood },
    ],
    tool: 'hammer',
    result: { kind: 'expandedWarehouse', label: '扩容仓房', amount: 1 },
    description:
      '把2份木材拖到同一座基础仓房，再使用锤子。消耗1耐久，容量16→32，保留库存与其余挂载材料。',
  },
  {
    id: 'merge-cold',
    title: '冷藏融合',
    category: 'evolve',
    hint: '基础仓房与制冷设施之间，也存在一种连接。',
    ingredients: [
      { kind: 'warehouse', label: '基础仓房', amount: 1 },
      { kind: 'cooler', label: '制冷设施', amount: 1 },
    ],
    result: { kind: 'coldWarehouse', label: '冷藏库', amount: 1 },
    description: '将两座建筑拖叠融合，花费20金币。保留旧配方记录；当前版本不开放新的冷藏生产。',
  },
];
