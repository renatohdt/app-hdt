import { ConfigAlert } from "@/components/config-alert";
import { LoginForm } from "@/components/login-form";
import { Container, PageShell } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  return (
    <PageShell>
      <Container className="py-12">
        {isSupabaseConfigured() ? <LoginForm /> : <ConfigAlert />}
      </Container>
    </PageShell>
  );
}
