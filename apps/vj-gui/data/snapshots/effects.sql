PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE effects (
    -- NOT NULL is what makes the name truly unique: SQLite lets a PRIMARY
    -- KEY column hold NULL, and any number of them.
    name   TEXT PRIMARY KEY NOT NULL,
    folder TEXT NOT NULL
  , hidden INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('0Normal', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/0 Normal/0Normal', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Ascii', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/Ascii', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('AudioBars', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/AudioBars', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Blur', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Blur', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('CameraPanning', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/CameraPanning', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('CirclesEffect', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/CirclesEffect', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Dissolve', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Dissolve', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('DistortBlur', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/DistortBlur', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Edge', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Edge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FallingNoise', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/FallingNoise', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Feedback', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Feedback', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackAudio', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/FeedbackAudio', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackFluid', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/FeedbackFluid', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FeedbackGrow', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/FeedbackGrow', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Flashing', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/Flashing', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingBar', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingBar', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingCircles', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingCircles', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingCircles2', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingCircles2', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingDynamic', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingDynamic', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingFlip', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingFlip', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingRadial', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingRadial', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('FlashingSquares', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/FlashingSquares', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Fluid', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Fluid', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GlitchSquares', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/GlitchSquares', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GlitchSquares2', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Flashing/GlitchSquares2', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GraffitiSpray', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/GraffitiSpray', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('GrowingRectangles', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/GrowingRectangles', 1, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Hacker', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Hacker', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Kaleidoscope', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/Kaleidoscope', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('KaleidoscopeStatic', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/KaleidoscopeStatic', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('LightTrails', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/LightTrails', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('LogorithmicGrowing', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/LogorithmicGrowing', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('MiddleSplit', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/MiddleSplit', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('MovingThroughSpace', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/MovingThroughSpace', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('NoiseBlur', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/NoiseBlur', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Panning', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/Panning', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('PanningMirror', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/PanningMirror', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ParticleBlaster', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/ParticleBlaster', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ParticleBlasterEdge', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/ParticleBlasterEdge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Pixelated', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Pixelated', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('PixelatedNoise', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/PixelatedNoise', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('ScanLines', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/ScanLines', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SizeShifting', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/SizeShifting', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SlidingLines', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/SlidingLines', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('SpaceCubes', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/SpaceCubes', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Stars', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/Stars', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Swipe', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/1 Remap/Swipe', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Tube', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/Tube', 0, 1);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('TubeDouble', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/4 3D/TubeDouble', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('TunnelTwister', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/2 Overlay/TunnelTwister', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('Voronoi', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/Voronoi', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiEdge', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/VoronoiEdge', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiPartial', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/VoronoiPartial', 0, 0);
INSERT INTO "effects" ("name", "folder", "hidden", "favorite") VALUES ('VoronoiRadiate', 'C:/Users/croni/Projects/Touchdesigner/Touchdesigner-VJ-v2/Effects-35280/3 Effect/VoronoiRadiate', 0, 0);
CREATE TABLE hidden (
    name TEXT PRIMARY KEY NOT NULL
  );
COMMIT;
