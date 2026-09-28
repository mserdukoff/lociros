import { Dashboard } from "@/components/dashboard";
import { Refresh, SignOut } from "@/components/session-actions";
import { SignIn } from "@/components/sign-in";
import { viewer } from "@/lib/admin";
import { fetchOverview } from "@/lib/backend";

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="sheet w-full max-w-[24rem] px-6 py-8 sm:px-8">
        <p className="t-eyebrow">Lociros admin</p>
        <h1 className="t-heading mt-3 text-[1.75rem] text-ink">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export default async function AdminPage() {
  const who = await viewer();

  if (who.state === "unconfigured") {
    return (
      <Gate title="Not configured">
        <p className="text-sm text-ink/60">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for this app.
        </p>
      </Gate>
    );
  }

  if (who.state === "signed-out") {
    return (
      <Gate title="Sign in">
        <SignIn />
      </Gate>
    );
  }

  if (who.state === "denied") {
    return (
      <Gate title="Not allowed">
        <p className="text-sm text-ink/60">
          {who.email} cannot open the admin dashboard.
        </p>
        <SignOut className="btn-primary mt-6 w-full" />
      </Gate>
    );
  }

  const overview = await fetchOverview(who.token);

  return (
    <main className="mx-auto w-full max-w-[60rem] px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex items-center justify-between gap-4">
        <p className="t-eyebrow">Lociros admin</p>
        <div className="flex items-center gap-5">
          <span className="hidden text-[13px] text-ink/45 sm:inline">{who.email}</span>
          <Refresh />
          <SignOut />
        </div>
      </header>
      <h1 className="t-heading mt-10 text-[2rem] text-ink">Dashboard</h1>
      <p className="mt-2 max-w-[34rem] text-sm text-ink/55">
        Users, generation jobs, the landing funnel, and API health.
      </p>
      <div className="mt-10">
        {overview.ok ? (
          <Dashboard data={overview.data} />
        ) : (
          <p role="alert" className="text-sm text-terracotta">
            {overview.message}
          </p>
        )}
      </div>
    </main>
  );
}
