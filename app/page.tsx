import AccessGate from "./access-gate";
import { hasValidAccess } from "./access-auth";
import VrayApp from "./vray-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasValidAccess())) {
    return <AccessGate />;
  }

  return <VrayApp />;
}
