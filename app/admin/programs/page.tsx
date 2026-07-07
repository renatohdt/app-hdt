import { AdminProgramsManager } from "@/components/admin-programs-manager";
import { SectionTitle } from "@/components/ui";

export default function AdminProgramsPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Programas"
        description="Monte e publique programas de treino de compra única. Cada semana é salva por inteiro — use 'copiar semana' para progredir com rapidez."
      />

      <AdminProgramsManager />
    </section>
  );
}
