import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "帮你省 · SpendWise AI", description: "把钱花在真正需要的地方。日用品选购、规格比较与透明价格。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
