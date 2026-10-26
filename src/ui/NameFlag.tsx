import { countryByCode, countryFlag } from '../game/countries';

/** Flag of the country the player chose. Nothing is drawn for International or an unknown code. */
export function NameFlag({ country }: { country: string | null | undefined }) {
  if (!country) return null;
  const flag = countryFlag(country);
  if (!flag) return null;
  const name = countryByCode(country)?.name;
  return (
    <span className="country-flag" title={name} aria-hidden="true">{flag}</span>
  );
}
