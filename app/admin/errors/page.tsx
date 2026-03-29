import { AdminErrorsList } from "@/components/admin-errors-list";
import { SectionTitle } from "@/components/ui";

export default function AdminErrorsPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Log de erros"
        description="Lista simples com os erros recentes do sistema."
      />
      <AdminErrorsList />
    </section>
  );
}
