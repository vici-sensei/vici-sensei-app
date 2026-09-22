-- Backfills the 8 real users (all currently in the old live EU project) as "eu" in D1, so the
-- "Before User Created" hook (Phase 4) never has to guess about an account that already exists --
-- required by Decision 3 to run BEFORE either project's hook is activated.
INSERT INTO accounts (email_key, region) VALUES
  ('cezarateodorescu8@gmail.com', 'eu'),
  ('geo01ph@gmail.com', 'eu'),
  ('roteaandreigabriel@gmail.com', 'eu'),
  ('barbarasajoanna@gmail.com', 'eu'),
  ('artiomcaravai15@gmail.com', 'eu'),
  ('alexandruconstantin1980@gmail.com', 'eu'),
  ('vicentiuchesca@gmail.com', 'eu'),
  ('vici.sensei@gmail.com', 'eu')
ON CONFLICT(email_key) DO NOTHING;
