export const dynamic = "force-dynamic";

import { SectionTitle } from "@/components/ui";
import { AdminFeedbacksList } from "@/components/admin-feedbacks-list";

export default function AdminFeedbacksPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Feedbacks"
        description="Avaliações e comentários enviados pelos usuários pelo app."
      />
      <AdminFeedbacksList />
    </section>
  );
}
