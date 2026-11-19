export interface StageVenue {
  id: string;
  name: string;
  subtitle: string;
  image: string;
}

const base = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const STAGE_VENUES: readonly StageVenue[] = [
  {
    id: 'urban-concrete',
    name: 'Urban Concrete',
    subtitle: 'Street Cage · Dusk',
    image: base('backdrops/urban-concrete.png'),
  },
  {
    id: 'favela-rooftop',
    name: 'Favela Rooftop',
    subtitle: 'Rio de Janeiro · Elevated',
    image: base('backdrops/favela-rooftop.png'),
  },
  {
    id: 'copacabana-beach',
    name: 'Copacabana Beach',
    subtitle: 'Rio Coast · Sunset',
    image: base('backdrops/copacabana-beach.png'),
  },
  {
    id: 'boardwalk-pier',
    name: 'Boardwalk Pier',
    subtitle: 'Ocean Deck · Golden Hour',
    image: base('backdrops/boardwalk-pier.png'),
  },
] as const;

export const DEFAULT_VENUE_ID = STAGE_VENUES[0].id;
const VENUE_STORAGE_KEY = 'kickole.venue.v1';

export function getVenue(id: string): StageVenue {
  return STAGE_VENUES.find((v) => v.id === id) ?? STAGE_VENUES[0];
}

export function nextVenueId(currentId: string): string {
  const idx = STAGE_VENUES.findIndex((v) => v.id === currentId);
  return STAGE_VENUES[(idx + 1) % STAGE_VENUES.length].id;
}

export function loadVenueId(): string {
  try {
    const saved = localStorage.getItem(VENUE_STORAGE_KEY);
    if (saved && STAGE_VENUES.some((v) => v.id === saved)) return saved;
  } catch {
    // Ignore storage access errors in restricted environments.
  }
  return DEFAULT_VENUE_ID;
}

export function saveVenueId(id: string): void {
  try {
    localStorage.setItem(VENUE_STORAGE_KEY, id);
  } catch {
    // Ignore storage access errors in restricted environments.
  }
}
