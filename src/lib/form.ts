import type { Needs } from "./domain";
// Only actively edited controls override a new natural-language request.
export function selectFormOverrides(values: Partial<Needs>, message: string, touched: string[]): Partial<Needs> {
  if (!message.trim()) return values;
  return Object.fromEntries(Object.entries(values).filter(([key]) => touched.includes(key)));
}
