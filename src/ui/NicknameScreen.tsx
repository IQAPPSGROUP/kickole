import { useState } from 'react';
import { checkNickname, nicknameMessage, suggestNickname, type NicknameIssue } from '../game/nickname';

export function NicknameForm({
  initial = '',
  submitLabel,
  onSubmit,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (nickname: string) => void;
}) {
  const [value, setValue] = useState(initial);
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
        onSubmit(check.nickname);
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

export function NicknameScreen({ onSave }: { onSave: (nickname: string) => void }) {
  return (
    <div className="screen settings nick-screen">
      <div className="card nick-card">
        <p className="court-label">WORLD BOARD</p>
        <h2 className="nick-title">YOUR TAG</h2>
        <p className="shop-lead">Pick a nickname for the world board. Letters, numbers and underscore. No real name, email or phone.</p>
        <NicknameForm submitLabel="LOCK IT IN" onSubmit={onSave} />
      </div>
    </div>
  );
}
