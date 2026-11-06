import { listUsers, requireAdmin } from "@/lib/auth";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  return <UsersClient users={listUsers()} meId={me.id} />;
}
