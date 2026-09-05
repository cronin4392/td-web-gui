PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
PRAGMA user_version=4;
CREATE TABLE tabs (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      position INTEGER NOT NULL
    );
INSERT INTO "tabs" ("id", "name", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Lyrics', 1);
INSERT INTO "tabs" ("id", "name", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Elements', 0);
CREATE TABLE phrases (
      tab_id   TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
      phrase   TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (tab_id, phrase)
    );
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', '1234', 0);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Badman', 6);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Badman
Sound', 5);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Carbon
Fiber', 18);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Hands in
the air', 17);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Killers', 3);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Killers in
the Jungle', 4);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Lets
Rock', 16);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Lose
Control', 19);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Original', 8);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Original
Badman', 7);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Perfect', 1);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Ready
or not', 14);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Right
Here', 11);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Right
Now', 12);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Rude
Boy', 9);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Selecta', 10);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Trigger
Finger', 13);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'Want
Some
More', 2);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a30e81dd-9f9e-40d3-bc85-c48ef49511d2', 'or not', 15);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Cambridge', 3);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'DNB', 4);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Drum n Bass', 7);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Elements', 1);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Enter the Jungle', 5);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Junglist Massive', 6);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Lenore', 0);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Lets go
elements', 8);
INSERT INTO "phrases" ("tab_id", "phrase", "position") VALUES ('a480e270-b040-41c3-8ddb-20f43ebe4422', 'Phoenix
Landing', 2);
CREATE TABLE recent (
      phrase   TEXT PRIMARY KEY,
      position INTEGER NOT NULL
    );
INSERT INTO "recent" ("phrase", "position") VALUES ('Elements', 5);
INSERT INTO "recent" ("phrase", "position") VALUES ('Junglist
Massive', 2);
INSERT INTO "recent" ("phrase", "position") VALUES ('Perfect', 1);
INSERT INTO "recent" ("phrase", "position") VALUES ('Trigger
Finger', 3);
INSERT INTO "recent" ("phrase", "position") VALUES ('junglist', 6);
INSERT INTO "recent" ("phrase", "position") VALUES ('metalheadz', 0);
INSERT INTO "recent" ("phrase", "position") VALUES ('right', 4);
CREATE TABLE text_fields (
      id       TEXT PRIMARY KEY,
      value    TEXT NOT NULL,
      position INTEGER NOT NULL
    );
INSERT INTO "text_fields" ("id", "value", "position") VALUES ('3b7d048c-290f-4eb4-9b75-3ecb9f23e031', 'Hell
Yeah', 2);
INSERT INTO "text_fields" ("id", "value", "position") VALUES ('a979e644-05a3-45bf-92bf-acf288a825fc', 'Goldie', 0);
INSERT INTO "text_fields" ("id", "value", "position") VALUES ('eef1399f-470a-4170-a4fb-b06015ae170c', 'Metal
Heads', 1);
CREATE TABLE overrides (
      layer    TEXT NOT NULL,
      field_id TEXT NOT NULL REFERENCES text_fields(id) ON DELETE CASCADE,
      value    TEXT NOT NULL,
      PRIMARY KEY (layer, field_id)
    );
COMMIT;
