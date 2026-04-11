import { AdminExercisesManager } from "@/components/admin-exercises-manager";
import { SectionTitle } from "@/components/ui";

export default function AdminExercisesPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Exercícios"
        description="Gerencie a biblioteca com cadastro protegido contra duplicidade, filtros úteis e visão clara de cobertura."
      />

      <AdminExercisesManager initialExercises={[]} />
    </section>
  );
}
