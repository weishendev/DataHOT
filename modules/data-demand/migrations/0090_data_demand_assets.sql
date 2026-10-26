CREATE TABLE data_demand_assets (
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  metadata jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (source_id, asset_id)
);
