import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const u = await currentUser();
  if (u) redirect("/dashboard");
  return <LoginForm />;
}
