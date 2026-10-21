import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Workspace demo={process.env.ALLOW_DEMO_DATA === "true"} />;
}
