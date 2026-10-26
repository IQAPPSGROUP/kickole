import { useRef, useState, useSyncExternalStore } from 'react';
import {
  MUSIC_DEBUG_TAP_COUNT,
  musicDebugRequested,
  musicDebugState,
  nextMusicDebugTaps,
  subscribeMusicDebug,
} from '../game/musicDebug';
import { trackTitle } from '../game/tracks';

/**
 * Hidden song-load report for a device check.
 * Five taps in the top-left corner, or ?debug / ?musicdebug. No network.
 */
export function MusicDebug() {
  const [open, setOpen] = useState(() => (
    typeof window !== 'undefined' && musicDebugRequested(window.location.search)
  ));
  const taps = useRef(0);
  const lastTap = useRef(0);
  const report = useSyncExternalStore(subscribeMusicDebug, musicDebugState);
  const title = report.track ? trackTitle(report.track) : 'no track';

  const unlock = () => {
    const now = Date.now();
    taps.current = nextMusicDebugTaps(taps.current, now - lastTap.current);
    lastTap.current = now;
    if (taps.current >= MUSIC_DEBUG_TAP_COUNT) setOpen(true);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          className="music-debug-unlock"
          aria-hidden="true"
          tabIndex={-1}
          onPointerUp={unlock}
        />
      )}
      {open && (
        <aside className="music-debug" aria-hidden="true">
          <p>{title}</p>
          <p>{report.phase}{report.httpStatus == null ? '' : ` · status ${report.httpStatus}`}</p>
          <p>{report.error ?? 'no error'}</p>
          <p>{report.url ?? 'no url'}</p>
        </aside>
      )}
    </>
  );
}
