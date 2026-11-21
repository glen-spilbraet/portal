-- Polish and Finnish versions of the "List price" label shown next to the price
-- on sales sheets and catalogues (missed in 0126; those pages showed "List
-- price" in English). INSERT OR IGNORE: never overwrites an existing label.
-- App DB (DB binding): apply to portal-db-dev and portal-db.
INSERT OR IGNORE INTO global_labels (key, lang, label) VALUES
  ('listpris', 'pl', 'Cena katalogowa'),
  ('listpris', 'fi', 'Listahinta');
