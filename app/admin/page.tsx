import { AdminDashboardShell } from "@/components/admin-dashboard-shell";
import { SectionTitle } from "@/components/ui";

export default function AdminPage() {
  return (
    <section className="space-y-8">
      <SectionTitle eyebrow="Administração" title="Dashboard" />
      <AdminDashboardShell />
    </section>
  );
}
