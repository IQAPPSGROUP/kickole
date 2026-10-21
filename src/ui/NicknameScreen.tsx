import { useEffect, useRef, useState } from 'react';
import { countryByCode, countryFlag, searchCountries, suggestedCountry } from '../game/countries';
import { checkNickname, nicknameMessage, suggestNickname, type NicknameIssue } from '../game/nickname';

export function NicknameForm({
  initial = '',
  initialCountry = null,
  submitLabel,
  onSubmit,
}: {
  initial?: string;
  initialCountry?: string | null;
  submitLabel: string;
  onSubmit: (nickname: string, country: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [country, setCountry] = useState<string | null>(() => countryByCode(initialCountry)?.code ?? null);
  const [tried, setTried] = useState(false);
  const check = checkNickname(value);
  const issue: NicknameIssue | null = !check.ok && (tried || value.trim().length > 0) ? check.issue : null;
  return (
    <form
      className="nick-form"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!check.ok) return;
        onSubmit(check.nickname, country);
      }}
    >
      <input
        className="nick-input"
        value={value}
        maxLength={16}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="Nickname"
        placeholder="StreetKick42"
        onChange={(event) => setValue(event.target.value)}
      />
      {issue && <p className="nick-error" role="alert">{nicknameMessage(issue)}</p>}
      <CountryPicker country={country} onChange={setCountry} />
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setValue(suggestNickname());
          setTried(false);
        }}
      >
        SUGGEST
      </button>
      <button type="submit" className="btn primary" disabled={!check.ok}>{submitLabel}</button>
    </form>
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

export function NicknameScreen({ onSave }: { onSave: (nickname: string, country: string | null) => void }) {
  const [suggestion] = useState(() => suggestedCountry());
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">WORLD BOARD</p>
        <h2 className="nick-title">YOUR TAG</h2>
        <p className="shop-lead">Pick a nickname for the world board. Letters, numbers and underscore. No real name, email or phone. Country is your choice, not your location. Prefer not to say and you stay off country boards.</p>
        <NicknameForm initialCountry={suggestion} submitLabel="LOCK IT IN" onSubmit={onSave} />
      </div>
    </div>
  );
}
