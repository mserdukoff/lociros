import type { AdminCount, AdminOverview, BillingMetrics, FunnelMetrics, LlmUsage } from "@/lib/types";

const TIME_ZONE = process.env.ADMIN_TIME_ZONE || "America/New_York";

function n(value: number | undefined): string {
  return (value ?? 0).toLocaleString("en-US");
}

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[14px] font-medium text-ink/55">{children}</h2>;
}

function Counts({ title, rows }: { title: string; rows: AdminCount[] }) {
  return (
    <section>
      <Heading>{title}</Heading>
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

function Funnel({ funnel }: { funnel: FunnelMetrics }) {
  return (
    <section>
      <Heading>Landing funnel, last {funnel.window_days} days</Heading>
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
            <p className="tnum mt-0.5 text-xl text-ink">{ret.eligible ? pct(ret.rate) : "—"}</p>
            <p className="tnum text-ink/45">
              {n(ret.returned)} of {n(ret.eligible)} browsers
            </p>
          </li>
        ))}
      </ul>
      {funnel.sticky_test.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm text-ink/45">Sticky Start reading bar on phones, judged on placement</p>
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

const PRICE_MONTHLY = Number(process.env.ADMIN_PRICE_MONTHLY || "9.99");
const PRICE_ANNUAL = Number(process.env.ADMIN_PRICE_ANNUAL || "79.99");

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Revenue({ billing }: { billing: BillingMetrics }) {
  const monthly = billing.subscribers_by_plan.monthly ?? 0;
  const annual = billing.subscribers_by_plan.annual ?? 0;
  const mrr = monthly * PRICE_MONTHLY + (annual * PRICE_ANNUAL) / 12;
  const stats: [string, string][] = [
    ["Paying subscribers", n(billing.subscribers)],
    ["Estimated monthly revenue", money(mrr)],
    ["In free week", n(billing.in_trial)],
    ["Payment failing", n(billing.past_due)],
    ["Trial to paid", pct(billing.trial_to_paid)],
  ];
  const flow: [string, number][] = [
    ["Started a free week", billing.trial_start],
    ["Opened checkout", billing.checkout_start],
    ["Subscribed", billing.subscribed],
    ["Cancelled", billing.churned],
  ];
  return (
    <section>
      <Heading>Revenue</Heading>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <li key={label}>
            <p className="text-ink/45">{label}</p>
            <p className="tnum mt-0.5 text-xl text-ink">{value}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink/45">
        Accounts in the last {billing.window_days} days. Monthly revenue uses list prices: {monthly} monthly, {annual}{" "}
        annual.
      </p>
      <ul className="mt-2 divide-y divide-rule">
        {flow.map(([label, value]) => (
          <li key={label} className="flex justify-between py-1.5 text-sm">
            <span>{label}</span>
            <span className="tnum text-ink/55">{n(value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LlmSpend({ rows }: { rows: LlmUsage[] }) {
  return (
    <section>
      <Heading>Model usage this month</Heading>
      <p className="mt-1 text-sm text-ink/45">Accounts with the most OpenRouter tokens.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink/45">No model calls yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {rows.map((row) => (
            <li key={row.account} className="flex justify-between gap-4 py-1.5 text-sm">
              <span className="truncate">{row.account}</span>
              <span className="tnum shrink-0 text-ink/55">
                {n(row.calls)} calls · {n(row.prompt_tokens + row.completion_tokens)} tokens
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard({ data }: { data: AdminOverview }) {
  const publicLanguages = [
    "Japanese",
    data.api.show_russian ? "Russian" : null,
    data.api.show_italian ? "Italian" : null,
    data.api.show_arabic ? "Arabic" : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <Heading>API</Heading>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
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
          <div>
            <dt className="text-ink/45">Public languages</dt>
            <dd>{publicLanguages.join(", ")}</dd>
          </div>
        </dl>
      </section>

      <section>
        <Heading>Totals</Heading>
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
        <Heading>Last 7 days</Heading>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {Object.entries(data.activity_7d).map(([key, value]) => (
            <li key={key} className="flex justify-between border-b border-rule py-1.5">
              <span>{key.replace(/_/g, " ")}</span>
              <span className="tnum text-ink/55">{n(value)}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.trial.billing ? <Revenue billing={data.trial.billing} /> : null}

      {data.trial.funnel ? <Funnel funnel={data.trial.funnel} /> : null}

      <LlmSpend rows={data.llm_usage ?? []} />

      <div className="grid gap-10 sm:grid-cols-3">
        <Counts title="Passages by language" rows={data.passages_by_language} />
        <Counts title="Passages by level" rows={data.passages_by_level} />
        <Counts title="Jobs by status" rows={data.jobs_by_status} />
      </div>

      <section>
        <Heading>Users</Heading>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-ink/45">
              <tr className="border-b border-rule">
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Auth</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
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
                  <td className="py-2 pr-4 text-ink/55">{user.plan ?? "—"}</td>
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
        <Heading>Recent jobs</Heading>
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
  );
}
