# Rob's music

The menu loops `menu-song`. Gameplay rotates a shuffled playlist and keeps its place for the rest of the page session, so a new run does not start the same song from the top.

Playlist, in no fixed play order:

- `gameplay-instrumental.m4a` / `.ogg`
- `menu-song.m4a` / `.ogg`
- `game-song-2.m4a` / `.ogg`
- `game-song-3.m4a` / `.ogg`

The game requests `.m4a` first and falls back to `.ogg`. A track that is missing or cannot be decoded is skipped for the rest of the page session.

Alley Beat and We Rise start about 0.6s in, so the lead-in is trimmed. The next track starts about 3.5s before those files end and the two crossfade for 2.5s. Keep It in the Air and Don't Let It Drop have no fade-in, so they start at the top of the file. Keep It in the Air ends abruptly, so the next track starts at 155.5s and the crossfade is 2s. Don't Let It Drop starts its crossfade at 152s for 2.5s. The same track is not played twice in a row when another track loaded. Only the current track is decoded, and the next one is decoded just before that crossfade.

The menu still loops `menu-song` from 0.6s to 146.0s with a 1.5–2s crossfade. The first pass can include the opening. Switching between the menu and play crossfades as well.

Display titles live in `src/game/tracks.ts`: Alley Beat, We Rise, Keep It in the Air, and Don't Let It Drop. Alley Beat and We Rise are provisional names. Shuffle is the default. Settings lists every track with a tick, and at least one stays on. A track that is ticked off is skipped until it is turned back on. Pause can pin one track or return to shuffle. That choice is saved on the device. Next song crossfades to the next track that is still on.

These are Rob's own songs for Kickolé. The generated bed in `src/game/musicBed.ts` plays only when a mode has no usable file.
