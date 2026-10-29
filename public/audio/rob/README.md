# Kickolé music

Four instrumental tracks made for Kickolé in ElevenLabs, on a paid plan.

Shuffle is the default. A shuffle run always starts with Alley Beat (`gameplay-instrumental`). When that track hands off, the run continues through We Rise, Keep It in the Air, and Don't Let It Drop in a shuffle, without playing the same song twice in a row. The next shuffle run starts on Alley Beat again.

A tap on the song pill pins that song. The run starts on the pin, the pill label matches the song that is playing, and the pin plays again when the file hands off, including while the menu is open. Alley Beat stays the default when the player has not chosen. Choosing Shuffle again returns a run to the Alley Beat rotation and the menu to We Rise.

Playlist:

- `gameplay-instrumental.m4a` / `.ogg` — Alley Beat, the default opener
- `menu-song.m4a` / `.ogg` — We Rise
- `game-song-2.m4a` / `.ogg` — Keep It in the Air
- `game-song-3.m4a` / `.ogg` — Don't Let It Drop

The game requests `.m4a` first and falls back to `.ogg`. Web and Android ship both. The iOS sync step removes the `.ogg` copies from `ios/App/App/public/audio/rob` because the WebView uses the `.m4a` files. The `.ogg` files stay in this folder.

A track that is missing or cannot be decoded is skipped for the rest of that run. The app warns once: `Kickolé music: "<name>" did not load and will be skipped until the next run.` The next run tries the file again. Pinning that song also tries it again.

Alley Beat and We Rise start about 0.6s in, so the lead-in is trimmed. The next track starts about 3.5s before those files end and the two crossfade for 2.5s. Keep It in the Air and Don't Let It Drop have no fade-in, so they start at the top of the file. Keep It in the Air ends abruptly, so the next track starts at 155.5s and the crossfade is 2s. Don't Let It Drop starts its crossfade at 152s for 2.5s. A song change cuts the previous buffer only after the next file has decoded, so the old song keeps playing during the download. Only the audible track is decoded, plus the next one just before a shuffle crossfade.

The menu loop of We Rise runs from 0.6s to 146.0s when shuffle is selected. A pinned song uses that song on the menu as well, and hands off back to itself. Switching between the menu and play crossfades.

Display titles live in `src/game/tracks.ts`. Pause can pin one track or return to shuffle. That choice is saved on the device.

These four instrumental songs were created for Kickolé in ElevenLabs on a paid plan, under an account in Rob's name, and are used under that licence. The generated bed in `src/game/musicBed.ts` plays only when a mode has no usable file.
