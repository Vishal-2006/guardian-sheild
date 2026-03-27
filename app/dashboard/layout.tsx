import { CyberSidebar } from "@/components/cyber-sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <CyberSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
