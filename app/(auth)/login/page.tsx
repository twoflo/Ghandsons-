import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-3xl font-black text-white">
            G
          </div>
          <h1 className="text-2xl font-black text-white">Ghandsons</h1>
          <p className="mt-1 text-ink-300">Jobs, money and receipts in one place.</p>
        </div>

        <div className="card p-5">
          <LoginForm redirectTo={next} />
        </div>

        <p className="mt-6 text-center text-sm text-ink-400">
          Trouble getting in? Call the office and they can reset it for you.
        </p>
      </div>
    </main>
  );
}
