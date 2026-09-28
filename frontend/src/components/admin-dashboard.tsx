"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { fetchAdminOverview, fetchMe } from "@/lib/api";
import type { AdminCount, AdminOverview, FunnelMetrics, MeResponse } from "@/lib/types";

function n(value: number | undefined): string {
  return (value ?? 0).toLocaleString();
}

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Counts({ title, rows }: { title: string; rows: AdminCount[] }) {
  return (
    <section>
      <h2 className="text-[14px] font-medium text-ink/55">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink/45">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {rows.map((row) => (
            <li key={`${title}-${row.key}`} className="flex justify-between py-1.5 text-sm">
              <span>{row.key}</span>
              <span className="tnum text-ink/55">{n(row.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STEP_LABELS: Record<string, string> = {
  landing_view: "Viewed the landing page",
  demo_tap: "Tapped a word in the demo",
  start_click: "Clicked Start reading",
  placement_start: "Opened the placement read",
  placement_done: "Finished placement",
  first_rating: "Rated a passage",
  account_linked: "Linked an account",
};

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Funnel({ funnel }: { funnel: FunnelMetrics }) {
  return (
    <section>
      <h2 className="text-[14px] font-medium text-ink/55">
        Landing funnel, last {funnel.window_days} days
      </h2>
      <p className="mt-1 text-sm text-ink/45">
        Browsers that viewed the landing page, and how many of them reached each step.
      </p>
      {funnel.landing_devices === 0 ? (
        <p className="mt-3 text-sm text-ink/45">No landing views yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {funnel.steps.map((step) => (
            <li key={step.step} className="flex justify-between gap-4 py-1.5 text-sm">
              <span>{STEP_LABELS[step.step] ?? step.step}</span>
              <span className="tnum text-ink/55">
                {n(step.devices)} · {pct(step.rate)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {funnel.returns.map((ret) => (
          <li key={ret.window_days}>
            <p className="text-ink/45">Came back within {ret.window_days} days</p>
            <p className="tnum mt-0.5 text-xl text-ink">
              {ret.eligible ? pct(ret.rate) : "—"}
            </p>
            <p className="tnum text-ink/45">
              {n(ret.returned)} of {n(ret.eligible)} browsers
            </p>
          </li>
        ))}
      </ul>
      {funnel.sticky_test.length > 0 ? (
        <div className="mt-6">
          <p className="text-ink/45 text-sm">Sticky Start reading bar on phones, judged on placement</p>
          <ul className="mt-2 divide-y divide-rule">
            {funnel.sticky_test.map((arm) => (
              <li key={arm.arm} className="flex justify-between gap-4 py-1.5 text-sm">
                <span>{arm.arm === "sticky" ? "With the bar" : "Without the bar"}</span>
                <span className="tnum text-ink/55">
                  {n(arm.placement_done)} of {n(arm.devices)} · {pct(arm.rate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function AdminDashboard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(() => {
    void fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (!me?.admin) {
      setData(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void fetchAdminOverview()
      .then((overview) => {
        if (!cancelled) setData(overview);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load admin data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me?.admin]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[56rem] flex-col px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <Link href="/library" className="t-quiet">
        ← Library
      </Link>
      <h1 className="t-heading mt-10 text-[2rem] text-ink">Admin</h1>
      <p className="mt-2 max-w-[32rem] text-sm text-ink/55">
        Signed-in users, generation jobs, and API health. This page is limited to the allowlist on
        the FastAPI host.
      </p>

      <div className="mt-8">
        <AuthPanel me={me} onRefresh={refreshMe} nextPath="/admin" layout="hero" initialMode="signin" />
      </div>

      {me && !me.authenticated ? (
        <p className="mt-8 text-sm text-ink/55">Sign in with the admin account to continue.</p>
      ) : null}

      {me?.authenticated && !me.admin ? (
        <p className="mt-8 text-sm text-ink/55">This account cannot open admin.</p>
      ) : null}

      {error ? <p className="mt-8 text-sm text-terracotta">{error}</p> : null}

      {data ? (
        <div className="mt-10 flex flex-col gap-12">
          <section>
            <h2 className="text-[14px] font-medium text-ink/55">API</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-ink/45">Status</dt>
                <dd>{data.api.ok ? "Up" : "Down"}</dd>
              </div>
              <div>
                <dt className="text-ink/45">Env</dt>
                <dd>{data.api.env}</dd>
              </div>
              <div>
                <dt className="text-ink/45">Database</dt>
                <dd>{data.api.db}</dd>
              </div>
              <div>
                <dt className="text-ink/45">Workers</dt>
                <dd className="tnum">{data.api.generate_workers}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-[14px] font-medium text-ink/55">Totals</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
              {Object.entries(data.totals).map(([key, value]) => (
                <li key={key}>
                  <p className="text-ink/45">{key.replace(/_/g, " ")}</p>
                  <p className="tnum mt-0.5 text-xl text-ink">{n(value)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-[14px] font-medium text-ink/55">
              Last 7 days
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {Object.entries(data.activity_7d).map(([key, value]) => (
                <li key={key} className="flex justify-between border-b border-rule py-1.5">
                  <span>{key.replace(/_/g, " ")}</span>
                  <span className="tnum text-ink/55">{n(value)}</span>
                </li>
              ))}
            </ul>
          </section>

          {data.trial.funnel ? <Funnel funnel={data.trial.funnel} /> : null}

          <div className="grid gap-10 sm:grid-cols-3">
            <Counts title="Passages by language" rows={data.passages_by_language} />
            <Counts title="Passages by level" rows={data.passages_by_level} />
            <Counts title="Jobs by status" rows={data.jobs_by_status} />
          </div>

          <section>
            <h2 className="text-[14px] font-medium text-ink/55">Users</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-ink/45">
                  <tr className="border-b border-rule">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Auth</th>
                    <th className="py-2 pr-4 font-medium">Reads</th>
                    <th className="py-2 pr-4 font-medium">Stars</th>
                    <th className="py-2 pr-4 font-medium">Jobs</th>
                    <th className="py-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_users.map((user) => (
                    <tr key={user.id} className="border-b border-rule/70">
                      <td className="py-2 pr-4">{user.email || user.display_name || `user ${user.id}`}</td>
                      <td className="py-2 pr-4 text-ink/55">{user.has_auth ? "Supabase" : "—"}</td>
                      <td className="tnum py-2 pr-4">{n(user.reads)}</td>
                      <td className="tnum py-2 pr-4">{n(user.stars)}</td>
                      <td className="tnum py-2 pr-4">{n(user.jobs)}</td>
                      <td className="py-2 text-ink/55">{when(user.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-[14px] font-medium text-ink/55">
              Recent jobs
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-ink/45">
                  <tr className="border-b border-rule">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Lang</th>
                    <th className="py-2 pr-4 font-medium">Level</th>
                    <th className="py-2 pr-4 font-medium">Topic</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_jobs.map((job) => (
                    <tr key={job.id} className="border-b border-rule/70">
                      <td className="py-2 pr-4">{job.status}</td>
                      <td className="py-2 pr-4">{job.language}</td>
                      <td className="py-2 pr-4">{job.level}</td>
                      <td className="max-w-[18rem] truncate py-2 pr-4" title={job.error || job.topic}>
                        {job.topic}
                        {job.error ? <span className="block text-terracotta">{job.error}</span> : null}
                      </td>
                      <td className="py-2 text-ink/55">{when(job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
