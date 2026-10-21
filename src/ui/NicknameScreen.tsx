import { useEffect, useRef, useState } from 'react';
import { countryByCode, countryFlag, searchCountries, suggestedCountry } from '../game/countries';
import { ADJECTIVES, NOUNS } from '../game/nicknameWords';
import { composeNickname, parseNickname, wordIndex } from '../game/nickname';
import type { PeekOutcome } from '../game/supabaseLeaderboard';
import { GraffitiText } from './Hud';

export function OptInCard({
  onJoin,
  onNotNow,
  onData,
}: {
  onJoin: () => void;
  onNotNow: () => void;
  onData: () => void;
}) {
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">LEADERBOARD</p>
        <h2 className="nick-title">JOIN IN?</h2>
        <p className="shop-lead">The leaderboard is off until you join. Other players would see a nickname picked from our word lists, your score, and a country if you choose one. The game works either way.</p>
        <button type="button" className="btn primary" onClick={onJoin}>Join leaderboard</button>
        <button type="button" className="btn ghost" onClick={onNotNow}>Not now</button>
        <button type="button" className="btn ghost" onClick={onData}>Leaderboard &amp; your data</button>
      </div>
    </div>
  );
}

export function NicknameForm({
  initial = '',
  initialCountry = null,
  submitLabel,
  onSubmit,
  onPeek,
}: {
  initial?: string;
  initialCountry?: string | null;
  submitLabel: string;
  onSubmit: (adjective: string, noun: string, country: string | null) => void | string | Promise<void | string | undefined>;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
}) {
  const parsed = parseNickname(initial);
  const [adj, setAdj] = useState(() => wordIndex(ADJECTIVES, parsed?.adjective ?? ADJECTIVES[0] ?? 'Turbo'));
  const [noun, setNoun] = useState(() => wordIndex(NOUNS, parsed?.noun ?? NOUNS[0] ?? 'Striker'));
  const [country, setCountry] = useState<string | null>(() => countryByCode(initialCountry)?.code ?? null);
  const [preview, setPreview] = useState(() => parsed?.nickname ?? composeNickname(ADJECTIVES[0] ?? 'Turbo', NOUNS[0] ?? 'Striker') ?? '');
  const [taken, setTaken] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [serverIssue, setServerIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const adjective = ADJECTIVES[adj] ?? 'Turbo';
  const nounWord = NOUNS[noun] ?? 'Striker';

  const showPair = (left: string, right: string) => {
    setPreview(composeNickname(left, right) ?? `${left} ${right}`);
    setTaken(null);
    setAcked(false);
    setServerIssue(null);
  };

  const peekPair = async (left: string, right: string): Promise<boolean> => {
    if (!onPeek) {
      setPreview(composeNickname(left, right) ?? `${left} ${right}`);
      setTaken(null);
      setAcked(true);
      return false;
    }
    const result = await onPeek(left, right);
    const base = composeNickname(left, right) ?? `${left} ${right}`;
    if (result.taken && result.nickname) {
      setPreview(result.nickname);
      setTaken(`${base} is taken. You'll be ${result.nickname}.`);
      setAcked(true);
      return true;
    }
    setPreview(result.nickname || base);
    setTaken(null);
    setAcked(true);
    return false;
  };

  return (
    <form
      className="nick-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setServerIssue(null);
        void (async () => {
          if (!acked) {
            const wasTaken = await peekPair(adjective, nounWord);
            if (wasTaken) {
              setBusy(false);
              return;
            }
          }
          const message = await onSubmit(adjective, nounWord, country);
          if (message) setServerIssue(message);
          setBusy(false);
        })();
      }}
    >
      <div className="nick-preview" aria-live="polite">
        <GraffitiText text={preview} className="graffiti nick-preview-tag" />
      </div>
      {taken && <p className="nick-error" role="alert">{taken}</p>}
      {serverIssue && <p className="nick-error" role="alert">{serverIssue}</p>}
      <div className="nick-wheels">
        <WordWheel
          label="First word"
          words={ADJECTIVES}
          index={adj}
          onChange={(index) => {
            setAdj(index);
            showPair(ADJECTIVES[index] ?? adjective, nounWord);
          }}
        />
        <WordWheel
          label="Second word"
          words={NOUNS}
          index={noun}
          onChange={(index) => {
            setNoun(index);
            showPair(adjective, NOUNS[index] ?? nounWord);
          }}
        />
      </div>
      <button
        type="button"
        className="btn primary nick-shuffle"
        onClick={() => {
          const left = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? 'Turbo';
          const right = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? 'Striker';
          setAdj(wordIndex(ADJECTIVES, left));
          setNoun(wordIndex(NOUNS, right));
          setServerIssue(null);
          void peekPair(left, right);
        }}
      >
        Pick one for me
      </button>
      <CountryPicker country={country} onChange={setCountry} />
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'SAVING' : submitLabel}</button>
    </form>
  );
}

function WordWheel({
  label,
  words,
  index,
  onChange,
}: {
  label: string;
  words: readonly string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = ref.current?.querySelector('[aria-selected="true"]');
    current?.scrollIntoView({ block: 'center' });
  }, [index]);
  return (
    <div className="nick-wheel-col">
      <span className="country-label">{label}</span>
      <div ref={ref} className="nick-wheel" role="listbox" aria-label={label}>
        {words.map((word, wordIndex) => (
          <button
            key={word}
            type="button"
            role="option"
            aria-selected={wordIndex === index}
            className={wordIndex === index ? 'on' : ''}
            onClick={() => onChange(wordIndex)}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

function CountryPicker({
  country,
  onChange,
}: {
  country: string | null;
  onChange: (country: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const selected = countryByCode(country);
  const matches = searchCountries(query);
  useEffect(() => {
    if (!open) return;
    const current = listRef.current?.querySelector('[aria-selected="true"]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [open, query]);
  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };
  return (
    <div className="country-picker">
      <span className="country-label" id="country-label">Country</span>
      <button
        type="button"
        className="country-toggle"
        aria-labelledby="country-label country-value"
        aria-expanded={open}
        aria-controls="country-list"
        onClick={() => setOpen((value) => !value)}
      >
        {selected && <span className="country-flag" aria-hidden="true">{countryFlag(selected.code)}</span>}
        <span id="country-value">{selected ? selected.name : 'Prefer not to say'}</span>
      </button>
      {open && (
        <div className="country-panel">
          <input
            className="nick-input country-search"
            value={query}
            aria-label="Search countries"
            placeholder="Search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
          <button
            type="button"
            className="country-option"
            aria-pressed={country == null}
            onClick={() => choose(null)}
          >
            Prefer not to say
          </button>
          <ul id="country-list" ref={listRef} className="country-list" role="listbox" aria-label="Countries">
            {matches.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className="country-option"
                  role="option"
                  aria-selected={item.code === country}
                  onClick={() => choose(item.code)}
                >
                  <span className="country-flag" aria-hidden="true">{countryFlag(item.code)}</span>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p className="nick-error">No country matches.</p>}
        </div>
      )}
    </div>
  );
}

export function NicknameScreen({
  onSave,
  onPeek,
}: {
  onSave: (adjective: string, noun: string, country: string | null) => void | string | Promise<void | string | undefined>;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
}) {
  const [suggestion] = useState(() => suggestedCountry());
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">WORLD BOARD</p>
        <h2 className="nick-title">YOUR TAG</h2>
        <p className="shop-lead">Pick two words from the lists. That nickname goes on the board. Country is your choice, not your location. Prefer not to say and you stay off country boards.</p>
        <NicknameForm initialCountry={suggestion} submitLabel="LOCK IT IN" onSubmit={onSave} onPeek={onPeek} />
      </div>
    </div>
  );
}
