CREATE TABLE account_records (
  account TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (account, kind, id)
);
--> statement-breakpoint
CREATE TABLE featured_products (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);
