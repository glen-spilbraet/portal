CREATE TABLE IF NOT EXISTS global_labels (
  key   TEXT NOT NULL,
  lang  TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);

INSERT OR IGNORE INTO global_labels (key, lang, label) VALUES
  ('sku',    'en', 'SKU'),
  ('sku',    'da', 'SKU'),
  ('sku',    'sv', 'SKU'),
  ('sku',    'no', 'SKU'),
  ('ean',    'en', 'EAN'),
  ('ean',    'da', 'EAN'),
  ('ean',    'sv', 'EAN'),
  ('ean',    'no', 'EAN'),
  ('height', 'en', 'Height'),
  ('height', 'da', 'Højde'),
  ('height', 'sv', 'Höjd'),
  ('height', 'no', 'Høyde'),
  ('width',  'en', 'Width'),
  ('width',  'da', 'Bredde'),
  ('width',  'sv', 'Bredd'),
  ('width',  'no', 'Bredde'),
  ('depth',  'en', 'Depth'),
  ('depth',  'da', 'Dybde'),
  ('depth',  'sv', 'Djup'),
  ('depth',  'no', 'Dybde'),
  ('weight', 'en', 'Weight'),
  ('weight', 'da', 'Vægt'),
  ('weight', 'sv', 'Vikt'),
  ('weight', 'no', 'Vekt');
