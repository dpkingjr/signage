import { getProfile, requireUser } from "@/lib/auth";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  return <AccountClient username={me.username} isAdmin={me.isAdmin} profile={await getProfile(me.id)} />;
}
