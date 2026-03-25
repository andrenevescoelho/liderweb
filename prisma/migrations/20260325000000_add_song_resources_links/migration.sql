-- Migration: add_song_resources_links
-- Vincula MultitracksAlbum e PadBoard a Song

ALTER TABLE "MultitracksAlbum" ADD COLUMN "songId" TEXT;
ALTER TABLE "PadBoard" ADD COLUMN "songId" TEXT;

ALTER TABLE "MultitracksAlbum"
  ADD CONSTRAINT "MultitracksAlbum_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PadBoard"
  ADD CONSTRAINT "PadBoard_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MultitracksAlbum_songId_idx" ON "MultitracksAlbum"("songId");
CREATE INDEX "PadBoard_songId_idx" ON "PadBoard"("songId");
