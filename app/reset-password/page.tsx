import { ResetPasswordForm } from "@/components/reset-password-form";
import { BrandFooter } from "@/components/brand-footer";
import { Container, PageShell } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <PageShell>
      <Container className="py-12">
        <ResetPasswordForm />
        <BrandFooter className="mt-10" />
      </Container>
    </PageShell>
  );
}
