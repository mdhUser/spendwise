import { expect, it } from "vitest";
import { selectFormOverrides } from "../src/lib/form";
it("does not let untouched form defaults override a natural-language request", () => {
  expect(selectFormOverrides({ category: "tissue", budgetFen: 5000, minLayers: null, quantity: 1, fragranceFree: false }, "预算改成 30 元，要 4 层", [])).toEqual({});
});
it("explicitly changed form values override natural-language extraction", () => {
  expect(selectFormOverrides({ category: "tissue", budgetFen: 5000, quantity: 1 }, "预算 30 元", ["budgetFen"])).toEqual({ budgetFen: 5000 });
});
it("form-only submission uses the complete form", () => {
  expect(selectFormOverrides({ category: "tissue", budgetFen: 5000, quantity: 2 }, "", [])).toEqual({ category: "tissue", budgetFen: 5000, quantity: 2 });
});
