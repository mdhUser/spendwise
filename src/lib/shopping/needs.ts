import type { Needs } from '../domain';
import { shoppingNeedsSchema, shoppingNeedsPatchSchema, type ShoppingNeeds, type ShoppingNeedsPatch } from './contracts';
export function upgradeNeeds(legacy:Needs):ShoppingNeeds {
  const { member, firstOrder, ...rest }=legacy;
  void member;void firstOrder;
  return shoppingNeedsSchema.parse(rest);
}
export function mergeShoppingNeeds(current:ShoppingNeeds,patch:ShoppingNeedsPatch):ShoppingNeeds {
  return shoppingNeedsSchema.parse(mergeShoppingPatches(current,patch));
}

export function mergeShoppingPatches(...patches:ShoppingNeedsPatch[]):ShoppingNeedsPatch {
  let merged:ShoppingNeedsPatch={};
  for(const raw of patches){
    const patch=shoppingNeedsPatchSchema.parse(raw);
    const previous=merged.eligibility;
    merged={...merged,...patch};
    if(patch.eligibility) merged.eligibility={
      taobao:{...previous?.taobao,...patch.eligibility.taobao},
      jd:{...previous?.jd,...patch.eligibility.jd},
      pdd:{...previous?.pdd,...patch.eligibility.pdd},
    };
  }
  return merged;
}
