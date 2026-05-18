import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex">
      <Sidebar />
      <main className="flex-1 p-8 flex flex-col h-screen overflow-y-auto">
        <Topbar />
        {children}
      </main>
    </div>
  );
}
