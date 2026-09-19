import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { signUpWithPassword } from "@/lib/services/auth.service";
import { signUpSchema } from "@/lib/schemas/auth.schema";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
  head: () => ({ meta: [{ title: "Create your account — Settle Swiftly" }] }),
});

function SignUpPage() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <AuthForm
      mode="sign-up"
      notice={notice}
      onSubmit={async (values) => {
        const parsed = signUpSchema.safeParse(values);
        if (!parsed.success) {
          return parsed.error.issues[0]?.message ?? "Check your details and try again.";
        }

        const result = await signUpWithPassword({ data: parsed.data });

        if (result.status === "error") return result.message;

        if (result.status === "confirm-email") {
          // Email confirmation is on in the project, so there is no session yet.
          setNotice(
            `Check ${parsed.data.email} for a confirmation link. Once you've clicked it, sign in to finish setting up.`,
          );
          return null;
        }

        await navigate({ to: "/onboarding" });
        return null;
      }}
    />
  );
}
