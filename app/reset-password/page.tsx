import { ResetPasswordForm } from "@/components/reset-password-form";
import { Container, PageShell } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <PageShell>
      <Container className="py-12">
        <ResetPasswordForm />
      </Container>
    </PageShell>
  );
}
