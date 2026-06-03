import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { currentUser } from "@/lib/session";

export default async function LoginPage() {
  const u = await currentUser();
  if (u) redirect("/dashboard");
  return <LoginForm />;
}
