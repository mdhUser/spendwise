import type { Needs } from '../domain';
import { shoppingNeedsSchema, shoppingNeedsPatchSchema, type ShoppingNeeds, type ShoppingNeedsPatch } from './contracts';
export function upgradeNeeds(legacy:Needs):ShoppingNeeds {
  const { member, firstOrder, ...rest }=legacy;
  void member;void firstOrder;
  return shoppingNeedsSchema.parse(rest);
}
export function mergeShoppingNeeds(current:ShoppingNeeds,patch:ShoppingNeedsPatch):ShoppingNeeds {
  return shoppingNeedsSchema.parse({...current,...shoppingNeedsPatchSchema.parse(patch)});
}
