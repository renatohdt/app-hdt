import { AdminWorkoutModelsManager } from "@/components/admin-workout-models-manager";
import { SectionTitle } from "@/components/ui";

export default function AdminWorkoutModelsPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Modelos de treino"
        description="Monte os modelos do seu método. Cada modelo reúne os treinos A, B, C… do mesmo plano; só os marcados como Pronto entram no app."
      />
      <AdminWorkoutModelsManager />
    </section>
  );
}
