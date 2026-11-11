PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
PRAGMA user_version=3;
CREATE TABLE show_rows (
      id       TEXT PRIMARY KEY,
      position INTEGER NOT NULL,
      alias    TEXT,
      text     TEXT NOT NULL,
      is_on    INTEGER NOT NULL
    );
INSERT INTO "show_rows" ("id", "position", "alias", "text", "is_on") VALUES ('2bcd8423-474e-476e-9d17-3dbc84da3a5f', 3, 'venue', '', 0);
INSERT INTO "show_rows" ("id", "position", "alias", "text", "is_on") VALUES ('426e0692-feff-460e-b940-eaa69ad7073f', 1, 'event', 'Cambridge', 1);
INSERT INTO "show_rows" ("id", "position", "alias", "text", "is_on") VALUES ('4befc760-7ccf-4570-b7df-dc4f0de0530a', 0, 'artist', 'ArtisT\nYOLO', 1);
INSERT INTO "show_rows" ("id", "position", "alias", "text", "is_on") VALUES ('b3b40ac6-71b1-4241-8719-63657ac75267', 2, 'city', '', 0);
INSERT INTO "show_rows" ("id", "position", "alias", "text", "is_on") VALUES ('eb67920c-bf89-4fcd-aa59-b0adff4dc57b', 4, NULL, '', 1);
CREATE TABLE layer_overrides (
      layer TEXT NOT NULL,
      slot  INTEGER NOT NULL,
      text  TEXT NOT NULL,
      PRIMARY KEY (layer, slot)
    );
INSERT INTO "layer_overrides" ("layer", "slot", "text") VALUES ('B', 0, '');
COMMIT;
