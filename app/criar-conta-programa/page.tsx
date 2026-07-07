"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProgramSignupForm } from "@/components/program-signup-form";

function ProgramSignupContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("program") ?? "";
  return <ProgramSignupForm slug={slug} />;
}

export default function ProgramSignupPage() {
  return (
    <Suspense fallback={null}>
      <ProgramSignupContent />
    </Suspense>
  );
}
