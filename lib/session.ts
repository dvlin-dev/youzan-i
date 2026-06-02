import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { Role } from "./constants";

export type SessionUser = { id: string; name: string; role: Role };

export async function currentUser(): Promise<SessionUser | null> {
  const s = await auth();
  if (!s?.user) return null;
  const u = s.user as { id: string; name?: string | null; role: Role };
  return { id: u.id, name: u.name ?? "", role: u.role };
}

/** 服务端组件/动作里强制登录；未登录跳 /login。 */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
