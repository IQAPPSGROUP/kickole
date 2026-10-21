# Rob's music

Gameplay and the menu play these files when they load. The generated bed in `src/game/musicBed.ts` is only the fallback, used when a file is missing or the browser cannot decode it.

Put the four files in this folder:

- `gameplay-instrumental.m4a`
- `gameplay-instrumental.ogg`
- `menu-song.m4a`
- `menu-song.ogg`

The game requests `.m4a` first and falls back to `.ogg`.

The gameplay instrumental plays once per run. At about 145.5 seconds it crossfades for 2.5 seconds into the main song. The main song then loops from 0.6 seconds to 146.0 seconds with a 1.5–2 second crossfade. The menu loops that same region. Switching between the menu and play crossfades as well.

These are Rob's own songs for Kickolé.
