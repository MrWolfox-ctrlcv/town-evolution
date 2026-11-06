import type { AssetCategory } from './AssetTypes';
/** Public model taxonomy. Classification never grants resource or collision behavior. */
export const ASSET_CATEGORIES: ReadonlyArray<{
  id: AssetCategory;
  label: string;
  description: string;
}> = [
  {
    id: 'natural-plants',
    label: '自然植物',
    description: '树木与自然植被；采集由存档中的树木实体决定。',
  },
  {
    id: 'natural-inorganic',
    label: '自然无机物',
    description: '草皮土块、石块、土丘、沙岸；资源量以自然资源实体为准。',
  },
  { id: 'buildings', label: '建筑', description: '建筑、结构模块、围栏与人工铺装。' },
  { id: 'crops', label: '作物', description: '种植中的作物、收获物与加工农产品。' },
];
export function categorizeAsset(id: string): AssetCategory {
  if (
    id === 'tree' ||
    id === 'sapling' ||
    id.startsWith('pile-sapling-') ||
    id.startsWith('tree-') ||
    id.startsWith('pile-wood-') ||
    id.startsWith('pile-treeSeed-')
  )
    return 'natural-plants';
  if (
    id === 'rock' ||
    id.startsWith('natural-block-') ||
    id.startsWith('pile-stone-') ||
    id.startsWith('pile-soil-') ||
    id.startsWith('pile-mud-')
  )
    return 'natural-inorganic';
  if (id === 'roasted-carrot') return 'crops';
  if (id.startsWith('crop-cell-') || id.startsWith('pile-')) return 'crops';
  return 'buildings';
}
