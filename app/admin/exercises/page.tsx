import { AdminExercisesManager } from "@/components/admin-exercises-manager";
import { SectionTitle } from "@/components/ui";

export default function AdminExercisesPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administracao"
        title="Exercicios"
        description="Cadastro rapido e tabela simples para revisar a biblioteca."
      />

      <AdminExercisesManager initialExercises={[]} />
    </section>
  );
}
