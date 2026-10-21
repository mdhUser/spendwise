import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import pkg from "../package.json";
it("operator commands accept container-provided environment without an .env file", () => {
  const dir = mkdtempSync(join(tmpdir(), "spendwise-ops-"));
  const require = createRequire(import.meta.url);
  const args = pkg.scripts["invite:create"].split(" ").slice(1);
  args[args.indexOf("tsx")] = require.resolve("tsx");
  args[args.length - 1] = resolve("scripts/invite.ts");
  try {
    const result = spawnSync(process.execPath, [...args, "0"], {
      cwd: dir, encoding: "utf8", env: { ...process.env, INVITE_PEPPER: "test-only-pepper-longer-than-32-characters" },
    });
    // Invalid usage exits before DB access, proving the command reached its argument validation.
    expect(result.stderr).toContain("Usage: npm run invite:create");
    expect(result.status).toBe(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
