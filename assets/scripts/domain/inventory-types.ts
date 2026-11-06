export type Crop = 'vegetable' | 'wheat' | 'lettuce' | 'rice';
export type Item =
  | Crop
  | 'chilledVegetable'
  | 'wood'
  | 'stone'
  | 'soil'
  | 'mud'
  | 'treeSeed'
  | 'sapling'
  | 'milledRice'
  | 'flour'
  | 'bread'
  | 'roastedCarrot';
export type Stock = Record<Item, number>;
export interface ItemAmount {
  item: Item;
  amount: number;
}
