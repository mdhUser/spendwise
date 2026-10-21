import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";
loadEnvFile(".env");
const database = new URL(process.env.DATABASE_URL!);
database.pathname = "/spendwise_test";
process.env.DATABASE_URL = database.toString();
process.env.APP_ORIGIN = "http://localhost:3010";
process.env.COOKIE_SECURE = "false";
process.env.ALLOW_DEMO_DATA = "true";
process.env.TRUST_PROXY = "true";
process.env.LLM_API_KEY = "test-provider-key";
process.env.LLM_BASE_URL = "http://127.0.0.1:3011";
process.env.LLM_DAILY_BUDGET_FEN = "100000";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 45000,
  globalSetup: "./tests/e2e/setup.ts", reporter: "list",
  use: { baseURL: "http://localhost:3010", trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" } },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: [
    { command: "node tests/model-server.mjs", url: "http://127.0.0.1:3011", reuseExistingServer: false },
    { command: "npm run start -- --port 3010", url: "http://localhost:3010/api/health", reuseExistingServer: false, timeout: 60000 },
  ],
});
