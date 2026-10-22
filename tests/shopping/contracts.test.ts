import { expect, it } from 'vitest';
import { needsSchema } from '../../src/lib/domain';
import { shoppingNeedsSchema, searchQuerySchema, normalizedOfferSchema } from '../../src/lib/shopping/contracts';
import { upgradeNeeds, mergeShoppingNeeds } from '../../src/lib/shopping/needs';
it('does not assign legacy generic membership to any platform', () => {
  const needs = upgradeNeeds(needsSchema.parse({category:'tissue',budgetFen:5000,member:true}));
  expect(needs.eligibility.jd.member).toBeNull();
  expect(needs.allowStockpile).toBe(false);
  expect(mergeShoppingNeeds(needs, {quantity:3}).budgetFen).toBe(5000);
});
it('rejects an unbounded or inconsistent shopping request', () => {
  expect(shoppingNeedsSchema.safeParse({category:'tissue',budgetFen:5000,quantity:51}).success).toBe(false);
  expect(searchQuerySchema.safeParse({text:'x'.repeat(121),category:'tissue',page:1}).success).toBe(false);
  expect(normalizedOfferSchema.safeParse({priceFen:-1,currency:'USD'}).success).toBe(false);
});
