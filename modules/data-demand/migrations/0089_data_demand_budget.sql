CREATE TABLE data_demand_budget (
  month text PRIMARY KEY,
  reserved_cny numeric(12,6) NOT NULL CHECK (reserved_cny >= 0),
  calls integer NOT NULL CHECK (calls > 0)
);
