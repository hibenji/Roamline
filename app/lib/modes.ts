export type ModeKey = 'drive' | 'walk' | 'cycle' | 'transit' | 'flight' | 'water' | 'other';

export type ModeDefinition = {
  key: ModeKey;
  label: string;
  short: string;
  uiColor: string;
};

export const MODE_DEFINITIONS: ModeDefinition[] = [
  { key: 'drive', label: 'Driving', short: 'Drive', uiColor: '#df563e' },
  { key: 'walk', label: 'Walking', short: 'Walk', uiColor: '#3c9b61' },
  { key: 'cycle', label: 'Cycling', short: 'Cycle', uiColor: '#dda11c' },
  { key: 'transit', label: 'Transit', short: 'Transit', uiColor: '#4387bb' },
  { key: 'flight', label: 'Flying', short: 'Flight', uiColor: '#8058b4' },
  { key: 'water', label: 'Water', short: 'Water', uiColor: '#299a98' },
  { key: 'other', label: 'Other', short: 'Other', uiColor: '#68727c' },
];

export const MODE_KEYS = MODE_DEFINITIONS.map(({ key }) => key);

export const MODE_LABELS: Record<ModeKey, string> = Object.fromEntries(
  MODE_DEFINITIONS.map(({ key, label }) => [key, label]),
) as Record<ModeKey, string>;

export const MODE_UI_COLORS: Record<ModeKey, string> = Object.fromEntries(
  MODE_DEFINITIONS.map(({ key, uiColor }) => [key, uiColor]),
) as Record<ModeKey, string>;
