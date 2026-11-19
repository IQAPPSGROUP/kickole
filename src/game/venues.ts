export interface StageVenue {
  id: string;
  name: string;
  subtitle: string;
  image: string;
}

const base = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const STAGE_VENUES: readonly StageVenue[] = [
  {
    id: 'neon-cage',
    name: 'Neon Cage',
    subtitle: 'Eye-Level Court · Dusk',
    image: base('backdrops/neon-cage.png'),
  },
  {
    id: 'urban-concrete',
    name: 'Urban Concrete',
    subtitle: 'Rio Terrace · Street',
    image: base('backdrops/urban-concrete.png'),
  },
  {
    id: 'helipad-vista',
    name: 'Helipad Vista',
    subtitle: 'Skyline Deck · Golden Hour',
    image: base('backdrops/helipad-vista.png'),
  },
] as const;

export const DEFAULT_VENUE_ID = STAGE_VENUES[0].id;
const VENUE_STORAGE_KEY = 'kickole.venue.v2';

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
