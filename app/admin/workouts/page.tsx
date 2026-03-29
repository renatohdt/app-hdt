import { AdminWorkoutsList } from "@/components/admin-workouts-list";
import { SectionTitle } from "@/components/ui";

export default function AdminWorkoutsPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Treinos gerados"
        description="Lista simples dos treinos criados para cada usuário."
      />
      <AdminWorkoutsList />
    </section>
  );
}
