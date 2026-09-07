PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE effects (
    -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
    -- KEY column hold NULL, and any number of them.
    name   TEXT PRIMARY KEY NOT NULL,
    folder TEXT NOT NULL
  , hidden INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('0Normal', '0 Normal/0Normal', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Ascii', '2 Overlay/Ascii', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('AudioBars', '2 Overlay/AudioBars', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Blur', '3 Effect/Blur', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('CameraPanning', '4 3D/CameraPanning', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('CirclesEffect', '1 Remap/CirclesEffect', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Dissolve', '3 Effect/Dissolve', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('DistortBlur', '3 Effect/DistortBlur', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Edge', '3 Effect/Edge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FallingNoise', '2 Overlay/FallingNoise', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Feedback', '3 Effect/Feedback', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackAudio', '3 Effect/FeedbackAudio', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackFluid', '3 Effect/FeedbackFluid', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackGrow', '3 Effect/FeedbackGrow', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Flashing', '1 Flashing/Flashing', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingBar', '1 Flashing/FlashingBar', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingCircles', '1 Flashing/FlashingCircles', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingCircles2', '1 Flashing/FlashingCircles2', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingDynamic', '1 Flashing/FlashingDynamic', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingFlip', '1 Flashing/FlashingFlip', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingRadial', '1 Flashing/FlashingRadial', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingSquares', '1 Flashing/FlashingSquares', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Fluid', '3 Effect/Fluid', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GlitchSquares', '1 Flashing/GlitchSquares', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GlitchSquares2', '1 Flashing/GlitchSquares2', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GraffitiSpray', '2 Overlay/GraffitiSpray', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GrowingRectangles', '1 Remap/GrowingRectangles', 1, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Hacker', '3 Effect/Hacker', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Kaleidoscope', '1 Remap/Kaleidoscope', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('KaleidoscopeStatic', '1 Remap/KaleidoscopeStatic', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('LightTrails', '4 3D/LightTrails', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('LogorithmicGrowing', '1 Remap/LogorithmicGrowing', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('MiddleSplit', '1 Remap/MiddleSplit', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('MovingThroughSpace', '4 3D/MovingThroughSpace', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('NoiseBlur', '1 Remap/NoiseBlur', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Panning', '1 Remap/Panning', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('PanningMirror', '1 Remap/PanningMirror', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ParticleBlaster', '3 Effect/ParticleBlaster', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ParticleBlasterEdge', '3 Effect/ParticleBlasterEdge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Pixelated', '3 Effect/Pixelated', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('PixelatedNoise', '3 Effect/PixelatedNoise', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ScanLines', '3 Effect/ScanLines', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SizeShifting', '1 Remap/SizeShifting', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SlidingLines', '1 Remap/SlidingLines', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SpaceCubes', '4 3D/SpaceCubes', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Stars', '2 Overlay/Stars', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Swipe', '1 Remap/Swipe', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Tube', '4 3D/Tube', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('TubeDouble', '4 3D/TubeDouble', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('TunnelTwister', '2 Overlay/TunnelTwister', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Voronoi', '3 Effect/Voronoi', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiEdge', '3 Effect/VoronoiEdge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiPartial', '3 Effect/VoronoiPartial', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiRadiate', '3 Effect/VoronoiRadiate', 0, 0);
CREATE TABLE hidden (
    name TEXT PRIMARY KEY NOT NULL
  );
COMMIT;
