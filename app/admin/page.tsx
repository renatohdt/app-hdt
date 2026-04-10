import { AdminDashboardShell } from "@/components/admin-dashboard-shell";

export default function AdminPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">Administração</p>
        <h1 className="text-[2.35rem] font-semibold tracking-tight text-white sm:text-[2.8rem]">Dashboard</h1>
      </div>
      <AdminDashboardShell />
    </section>
  );
}
