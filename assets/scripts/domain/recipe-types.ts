import type { RecipeId, ToolId } from './types';
export interface RecipeProduct {
  kind: string;
  label: string;
  amount: number;
}
export interface RecipeDefinition {
  id: RecipeId;
  title: string;
  category: 'gather' | 'build' | 'evolve' | 'grow' | 'process';
  availability: 'active' | 'legacy';
  hint: string;
  ingredients: RecipeProduct[];
  tool?: ToolId;
  result: RecipeProduct;
  byproducts?: RecipeProduct[];
  description: string;
}
