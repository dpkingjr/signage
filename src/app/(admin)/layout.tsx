import { requireUser } from "@/lib/auth";
import Nav from "./Nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Nav username={user.username} isAdmin={user.isAdmin} />
      <main className="main">{children}</main>
    </>
  );
}
