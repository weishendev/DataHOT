CREATE TABLE data_demand_reports (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  content jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
