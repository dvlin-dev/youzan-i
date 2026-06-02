import { requireUser } from "@/lib/session";
import { pendingDocs } from "@/lib/db/queries";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = Object.keys(await pendingDocs()).length;
  return (
    <Shell user={user} pendingCount={pending}>
      {children}
    </Shell>
  );
}
