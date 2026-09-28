// Mirrors AdminOverview in backend/app/models/schemas.py.

export type AdminCount = { key: string; count: number };

export type AdminUser = {
  id: number;
  email: string | null;
  display_name: string | null;
  has_auth: boolean;
  created_at: string | null;
  reads: number;
  stars: number;
  jobs: number;
};

export type AdminJob = {
  id: string;
  status: string;
  language: string;
  level: string;
  topic: string;
  user_id: number | null;
  error: string | null;
  created_at: string | null;
  finished_at: string | null;
};

export type FunnelMetrics = {
  window_days: number;
  landing_devices: number;
  steps: { step: string; devices: number; rate: number }[];
  returns: { window_days: number; eligible: number; returned: number; rate: number }[];
  sticky_test: { arm: "sticky" | "control"; devices: number; placement_done: number; rate: number }[];
};

export type TrialMetrics = {
  window_days: number;
  learners_with_reads: number;
  second_text_completion: number;
  second_text_pass: boolean;
  too_hard_rate: number;
  calibration_trust_pass: boolean;
  unsolicited_wtp: number;
  wtp_pass: boolean;
  go: boolean;
  funnel?: FunnelMetrics;
};

export type AdminOverview = {
  api: {
    ok: boolean;
    name: string;
    env: string;
    db: string;
    require_auth: boolean;
    generate_workers: number;
    show_russian: boolean;
    show_italian: boolean;
    show_arabic: boolean;
  };
  totals: Record<string, number>;
  passages_by_language: AdminCount[];
  passages_by_level: AdminCount[];
  passages_by_shelf: AdminCount[];
  jobs_by_status: AdminCount[];
  activity_7d: Record<string, number>;
  trial: TrialMetrics;
  recent_users: AdminUser[];
  recent_jobs: AdminJob[];
};
