import { BrandFooter } from "@/components/brand-footer";
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
      <BrandFooter className="mt-6 pb-4" />
    </PageShell>
  );
}
