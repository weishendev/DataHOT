CREATE TABLE data_demand_extractions (
  article_id text NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  prompt_version text NOT NULL,
  signals jsonb NOT NULL,
  rejected integer NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, revision, prompt_version)
);
