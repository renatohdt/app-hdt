import { AdminUsersList } from "@/components/admin-users-list";
import { SectionTitle } from "@/components/ui";

export default function AdminUsersPage() {
  return (
    <section className="space-y-8">
      <SectionTitle
        eyebrow="Administracao"
        title="Usuários"
        description="Tabela simples com dados principais e acesso rapido ao detalhe de cada usuario."
      />

      <AdminUsersList />
    </section>
  );
}
