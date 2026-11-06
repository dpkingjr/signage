import { redirect } from "next/navigation";
import { getUser, hasUsers } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUser()) redirect("/library");
  return (
    <main className="login-wrap">
      <LoginForm setup={!hasUsers()} />
    </main>
  );
}
