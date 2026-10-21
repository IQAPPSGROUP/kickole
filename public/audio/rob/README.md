# Rob's music

The menu loops `menu-song`. A shuffle run always starts with Alley Beat (`gameplay-instrumental`). When that track hands off, the run continues through We Rise, Keep It in the Air, and Don't Let It Drop in a shuffle, without playing the same song twice in a row. The next run starts on Alley Beat again. Change song and skip still jump mid-run. A pinned track still opens on that track.

Playlist:

- `gameplay-instrumental.m4a` / `.ogg` — Alley Beat, the default opener
- `menu-song.m4a` / `.ogg`
- `game-song-2.m4a` / `.ogg`
- `game-song-3.m4a` / `.ogg`

The game requests `.m4a` first and falls back to `.ogg`. A track that is missing or cannot be decoded is skipped for the rest of the page session.

Alley Beat and We Rise start about 0.6s in, so the lead-in is trimmed. The next track starts about 3.5s before those files end and the two crossfade for 2.5s. Keep It in the Air and Don't Let It Drop have no fade-in, so they start at the top of the file. Keep It in the Air ends abruptly, so the next track starts at 155.5s and the crossfade is 2s. Don't Let It Drop starts its crossfade at 152s for 2.5s. The same track is not played twice in a row when another track loaded. Only the audible track is decoded, plus the next one just before the crossfade. The menu buffer is released before the run's first decode, so four songs are never in memory together.

The menu still loops `menu-song` from 0.6s to 146.0s with a 1.5–2s crossfade. The first pass can include the opening. Switching between the menu and play crossfades as well.

Display titles live in `src/game/tracks.ts`: Alley Beat, We Rise, Keep It in the Air, and Don't Let It Drop. Alley Beat and We Rise are provisional names. Shuffle is the default. Settings lists every track with a tick, and at least one stays on. A track that is ticked off is skipped until it is turned back on. Pause can pin one track or return to shuffle. That choice is saved on the device. Next song crossfades to the next track that is still on.

These are Rob's own songs for Kickolé. The generated bed in `src/game/musicBed.ts` plays only when a mode has no usable file.
