import type { MissionIcon } from './types';

/** Line drawings for the mission scenes, on a 48 by 48 grid, one path each. */
export const MISSION_ICONS: Record<MissionIcon, string> = {
  bakery: 'M8 22c0-6 7-10 16-10s16 4 16 10c0 3-1.800 5-4 5.500V36a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2v-8.500c-2.200-.500-4-2.500-4-5.500ZM18 19v5M24 18v5M30 19v5',
  train: 'M14 8h20a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4ZM10 21h28M17 28h.01M31 28h.01M17 34l-4 6M31 34l4 6M20 14h8',
  doctor: 'M14 8h20a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6ZM24 16v16M16 24h16',
  restaurant: 'M15 8v32M10 8v9a5 5 0 0 0 10 0V8M32 40V8c-4 3-6 8-6 14v5h6',
  home: 'M7 23 24 9l17 14M12 20v18h24V20M21 38V28h6v10',
  work: 'M10 16h28a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2ZM18 16v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M8 26h32M22 26v3h4v-3',
};
