import { useEffect, useRef, useState } from 'react';
import { countryByCode, searchCountries } from '../game/countries';
import { COUNTRY_BOARD_MIN } from '../game/leaderboard';
import { ADJECTIVES, NOUNS } from '../game/nicknameWords';
import { composeNickname, isBlockedPair, parseNickname, pickFreePair, unblockIndex, wordIndex, type FreePair } from '../game/nickname';
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
        <p className="panel-lead">The leaderboard is off until you join. Other players would see a nickname picked from our word lists and your score. Country is a separate optional question. If you choose one, its flag is shown beside your nickname. International shows no flag. The game works either way.</p>
        <button type="button" className="btn primary" onClick={onJoin}>Join leaderboard</button>
        <button type="button" className="btn ghost" onClick={onNotNow}>Not now</button>
        <button type="button" className="btn ghost" onClick={onData}>How it works</button>
      </div>
    </div>
  );
}

export function NicknameForm({
  initial = '',
  submitLabel,
  onSubmit,
  onPeek,
  onSuggest,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (adjective: string, noun: string) => void | string | Promise<void | string | undefined>;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
  onSuggest?: (request: { count: number; adjective: string | null; noun: string | null }) => Promise<FreePair[]>;
}) {
  const parsed = parseNickname(initial);
  const [adj, setAdj] = useState(() => wordIndex(ADJECTIVES, parsed?.adjective ?? ADJECTIVES[0] ?? 'Turbo'));
  const [noun, setNoun] = useState(() => wordIndex(NOUNS, parsed?.noun ?? NOUNS[0] ?? 'Striker'));
  const [preview, setPreview] = useState(() => parsed?.nickname ?? composeNickname(ADJECTIVES[0] ?? 'Turbo', NOUNS[0] ?? 'Striker') ?? '');
  const [taken, setTaken] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const [serverIssue, setServerIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockAdj, setLockAdj] = useState(false);
  const [lockNoun, setLockNoun] = useState(false);
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

  const showFree = (name: FreePair): boolean => {
    const nextAdj = wordIndex(ADJECTIVES, name.adjective);
    const nextNoun = wordIndex(NOUNS, name.noun);
    const left = ADJECTIVES[nextAdj];
    const right = NOUNS[nextNoun];
    if (!left || !right || left.toLowerCase() !== name.adjective.toLowerCase() || right.toLowerCase() !== name.noun.toLowerCase()) {
      return false;
    }
    if (isBlockedPair(left, right)) return false;
    setAdj(nextAdj);
    setNoun(nextNoun);
    setPreview(composeNickname(left, right) ?? `${left} ${right}`);
    setTaken(null);
    setAcked(true);
    setServerIssue(null);
    return true;
  };

  const applyPair = (nextAdj: number, nextNoun: number) => {
    setAdj(nextAdj);
    setNoun(nextNoun);
    setServerIssue(null);
    void peekPair(ADJECTIVES[nextAdj] ?? adjective, NOUNS[nextNoun] ?? nounWord);
  };

  const roll = (side: 'first' | 'second' | 'both') => {
    let changeAdj = false;
    let changeNoun = false;
    switch (side) {
      case 'first':
        changeAdj = !lockAdj;
        break;
      case 'second':
        changeNoun = !lockNoun;
        break;
      case 'both':
        changeAdj = !lockAdj;
        changeNoun = !lockNoun;
        break;
      default: {
        const neverSide: never = side;
        return neverSide;
      }
    }
    if (!changeAdj && !changeNoun) return;
    void (async () => {
      if (onSuggest) {
        try {
          const names = await onSuggest({
            count: 8,
            adjective: changeAdj ? null : adjective,
            noun: changeNoun ? null : nounWord,
          });
          const choice = pickFreePair(names.filter((name) => (
            !isBlockedPair(name.adjective, name.noun)
            && (changeAdj || name.adjective.toLowerCase() === adjective.toLowerCase())
            && (changeNoun || name.noun.toLowerCase() === nounWord.toLowerCase())
          )), { adjective, noun: nounWord });
          const unchanged = choice
            && choice.adjective.toLowerCase() === adjective.toLowerCase()
            && choice.noun.toLowerCase() === nounWord.toLowerCase();
          if (choice && !unchanged && showFree(choice)) return;
        } catch {
          /* a local roll still moves the wheels */
        }
      }
      let nextAdj = changeAdj ? otherIndex(ADJECTIVES.length, adj) : adj;
      let nextNoun = changeNoun ? otherIndex(NOUNS.length, noun) : noun;
      let guard = 0;
      while (isBlockedPair(ADJECTIVES[nextAdj] ?? '', NOUNS[nextNoun] ?? '') && guard < 40) {
        guard += 1;
        if (changeAdj) nextAdj = otherIndex(ADJECTIVES.length, nextAdj);
        if (changeNoun) nextNoun = otherIndex(NOUNS.length, nextNoun);
      }
      if (nextAdj === adj && nextNoun === noun) return;
      if (isBlockedPair(ADJECTIVES[nextAdj] ?? '', NOUNS[nextNoun] ?? '')) return;
      applyPair(nextAdj, nextNoun);
    })();
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
          const initialPair = parsed?.adjective === adjective && parsed?.noun === nounWord;
          if (!initialPair && isBlockedPair(adjective, nounWord)) {
            setServerIssue('Those two words can\'t go together.');
            setBusy(false);
            return;
          }
          if (!acked) {
            const wasTaken = await peekPair(adjective, nounWord);
            if (wasTaken) {
              setBusy(false);
              return;
            }
          }
          const message = await onSubmit(adjective, nounWord);
          if (message) setServerIssue(message);
          setBusy(false);
        })();
      }}
    >
      <div className="nick-preview" aria-live="polite">
        <svg className="prompt-filters" aria-hidden width="0" height="0">
          <filter id="prompt-spray" x="-8%" y="-20%" width="116%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.4 -0.55" result="speck" />
            <feComposite in="speck" in2="SourceAlpha" operator="in" />
          </filter>
        </svg>
        <GraffitiText text={preview} className="graffiti nick-preview-tag" />
      </div>
      {taken && <p className="nick-error" role="alert">{taken}</p>}
      {serverIssue && <p className="nick-error" role="alert">{serverIssue}</p>}
      <div className="nick-wheels">
        <WordWheel
          label="First word"
          words={ADJECTIVES}
          index={adj}
          locked={lockAdj}
          onToggleLock={() => setLockAdj((value) => !value)}
          onShuffle={() => roll('first')}
          onChange={(index) => {
            const next = unblockIndex('adjective', index, noun);
            setAdj(next);
            showPair(ADJECTIVES[next] ?? adjective, nounWord);
          }}
        />
        <WordWheel
          label="Second word"
          words={NOUNS}
          index={noun}
          locked={lockNoun}
          onToggleLock={() => setLockNoun((value) => !value)}
          onShuffle={() => roll('second')}
          onChange={(index) => {
            const next = unblockIndex('noun', adj, index);
            setNoun(next);
            showPair(adjective, NOUNS[next] ?? nounWord);
          }}
        />
      </div>
      <p className="nick-real-name">Don&apos;t use your real name</p>
      <button
        type="button"
        className="btn primary nick-shuffle"
        disabled={lockAdj && lockNoun}
        onClick={() => roll('both')}
      >
        <span aria-hidden="true">🎲</span> Pick one for me
      </button>
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'SAVING' : submitLabel}</button>
    </form>
  );
}

function otherIndex(length: number, current: number): number {
  if (length <= 1) return current;
  const offset = 1 + Math.floor(Math.random() * (length - 1));
  return (current + offset) % length;
}

function WordWheel({
  label,
  words,
  index,
  locked,
  onChange,
  onToggleLock,
  onShuffle,
}: {
  label: string;
  words: readonly string[];
  index: number;
  locked: boolean;
  onChange: (index: number) => void;
  onToggleLock: () => void;
  onShuffle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = ref.current?.querySelector('[aria-selected="true"]');
    current?.scrollIntoView({ block: 'center' });
  }, [index]);
  return (
    <div className="nick-wheel-col">
      <span className="country-label">{label}</span>
      <div className="nick-word-tools">
        <button
          type="button"
          aria-pressed={locked}
          aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
          onClick={onToggleLock}
        >
          {locked ? 'Locked' : 'Lock'}
        </button>
        <button
          type="button"
          aria-label={`Shuffle ${label}`}
          disabled={locked}
          onClick={onShuffle}
        >
          Shuffle
        </button>
      </div>
      <div ref={ref} className={`nick-wheel${locked ? ' is-locked' : ''}`} role="listbox" aria-label={label}>
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
        <span id="country-value">{selected ? selected.name : 'International'}</span>
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
            International
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
  onSuggest,
}: {
  onSave: (adjective: string, noun: string) => void | string | Promise<void | string | undefined>;
  onPeek?: (adjective: string, noun: string) => Promise<PeekOutcome>;
  onSuggest?: (request: { count: number; adjective: string | null; noun: string | null }) => Promise<FreePair[]>;
}) {
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">WORLD BOARD</p>
        <h2 className="nick-title">YOUR TAG</h2>
        <p className="panel-lead">Pick two words from the lists. That nickname goes on the board. Your kit does not choose a country.</p>
        <NicknameForm submitLabel="LOCK IT IN" onSubmit={onSave} onPeek={onPeek} onSuggest={onSuggest} />
      </div>
    </div>
  );
}

/** Optional country step. International is the selection until the player picks one. */
export function CountryChoice({
  initialCountry = null,
  submitLabel,
  onSubmit,
}: {
  initialCountry?: string | null;
  /** Settings uses SAVE. The country question uses Continue. */
  submitLabel?: string;
  onSubmit: (country: string | null) => void | string | Promise<void | string | undefined>;
}) {
  const [country, setCountry] = useState<string | null>(() => countryByCode(initialCountry)?.code ?? null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const label = submitLabel ?? 'Continue';
  return (
    <form
      className="nick-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setIssue(null);
        void (async () => {
          const message = await onSubmit(country);
          if (message) setIssue(message);
          setBusy(false);
        })();
      }}
    >
      <CountryPicker country={country} onChange={setCountry} />
      {issue && <p className="nick-error" role="alert">{issue}</p>}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'SAVING' : label}</button>
    </form>
  );
}

export function CountryScreen({
  onSave,
}: {
  onSave: (country: string | null) => void | string | Promise<void | string | undefined>;
}) {
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">OPTIONAL</p>
        <h2 className="nick-title">COUNTRY?</h2>
        <p className="panel-lead">
          International is the default. This only places you on that country&apos;s board.
          If you choose one, its flag is shown beside your nickname. International shows no flag. A country board appears once {COUNTRY_BOARD_MIN} players have joined.
          Your kit does not choose a country. You can change or remove this later.
        </p>
        <CountryChoice onSubmit={onSave} />
      </div>
    </div>
  );
}
