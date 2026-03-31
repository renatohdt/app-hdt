import { Card } from "@/components/ui";

export function ConfigAlert() {
  return (
    <Card className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Configuração</p>
      <h2 className="mt-3 text-2xl font-semibold">Erro de configuração. Tente novamente mais tarde.</h2>
      <p className="mt-3 text-sm text-white/64">
        O app não conseguiu carregar as credenciais necessárias neste ambiente.
      </p>
    </Card>
  );
}
