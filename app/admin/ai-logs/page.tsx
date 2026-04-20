import { AdminAiLogsDashboard } from "@/components/admin-ai-logs-dashboard";
import { SectionTitle } from "@/components/ui";

export default function AdminAiLogsPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administração"
        title="Observabilidade da IA"
        description="Gerações de treino pela OpenAI nos últimos 15 dias: tokens, custo, duração e payload completo."
      />
      <AdminAiLogsDashboard />
    </section>
  );
}
