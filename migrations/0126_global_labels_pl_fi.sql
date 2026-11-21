-- Polish and Finnish versions of the global sales-sheet labels (the field
-- names printed on every sheet). Without these rows a PL/FI sheet shows the
-- English label. Editable afterwards under Translations.
--
-- INSERT OR IGNORE: never overwrites a label someone has already typed in.
-- App DB (DB binding): apply to portal-db-dev and portal-db.
INSERT OR IGNORE INTO global_labels (key, lang, label) VALUES
  ('sku',         'pl', 'SKU'),
  ('sku',         'fi', 'SKU'),
  ('ean',         'pl', 'EAN'),
  ('ean',         'fi', 'EAN'),
  ('height',      'pl', 'Wysokość'),
  ('height',      'fi', 'Korkeus'),
  ('width',       'pl', 'Szerokość'),
  ('width',       'fi', 'Leveys'),
  ('depth',       'pl', 'Głębokość'),
  ('depth',       'fi', 'Syvyys'),
  ('weight',      'pl', 'Waga'),
  ('weight',      'fi', 'Paino'),
  ('stock_date',  'pl', 'Przewidywana data dostawy'),
  ('stock_date',  'fi', 'Arvioitu varastopäivä'),
  ('watch_video', 'pl', 'Zobacz wideo'),
  ('watch_video', 'fi', 'Katso video'),
  ('cta',         'pl', 'Nowy produkt, zamów w przedsprzedaży'),
  ('cta',         'fi', 'Uusi tuote, ennakkotilaa nyt');
