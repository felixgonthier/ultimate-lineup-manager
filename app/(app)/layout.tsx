import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-20">{children}</main>
      <Nav isAdmin={user?.type === "ADMIN"} />
    </div>
  );
}
