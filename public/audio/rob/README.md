# Rob's music

The menu loops `menu-song`. Gameplay rotates a shuffled playlist and keeps its place for the rest of the page session, so a new run does not start the same song from the top.

Playlist, in no fixed play order:

- `gameplay-instrumental.m4a` / `.ogg`
- `menu-song.m4a` / `.ogg`
- `game-song-2.m4a` / `.ogg`
- `game-song-3.m4a` / `.ogg`

The game requests `.m4a` first and falls back to `.ogg`. A track that is missing or cannot be decoded is skipped. `game-song-2` and `game-song-3` can be added here later.

Each playlist track starts about 0.6s in, so the lead-in is trimmed. The next track starts about 3.5s before the current file ends and the two crossfade for 2.5s. The same track is not played twice in a row when another track loaded. Only the current track is decoded, and the next one is decoded just before that crossfade.

The menu still loops `menu-song` from 0.6s to 146.0s with a 1.5–2s crossfade. The first pass can include the opening. Switching between the menu and play crossfades as well.

These are Rob's own songs for Kickolé. The generated bed in `src/game/musicBed.ts` plays only when a mode has no usable file.
