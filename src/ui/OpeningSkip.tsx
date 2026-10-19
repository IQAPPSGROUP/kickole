/** Visible skip control during the opening environment pan. */
export function OpeningSkip({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="opening-skip">
      <button type="button" className="opening-skip-btn" onClick={onSkip}>
        SKIP INTRO
      </button>
    </div>
  );
}
