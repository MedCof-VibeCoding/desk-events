const paths = {
  office: 'M3 21V7l9-4 9 4v14M3 21h18M8 9v2m8-2v2m-8 3v2m8-2v2m-6 5v-4h4v4',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2A8.5 8.5 0 0 1 21 11.5M7 9h9M7 13h6',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 10h2m4 0h2m-8 3h2',
  inbox: 'M3 4h18v16H3V4m0 10h5l2 3h4l2-3h5',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  plus: 'M12 5v14M5 12h14', search: 'M21 21l-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 12h6',
  grid: 'M3 3h7v7H3V3m11 0h7v7h-7V3M3 14h7v7H3v-7m11 0h7v7h-7v-7',
  exit: 'M9 3H3v18h6m6-5 5-4-5-4M8 12h12',
  arrow: 'M7 17 17 7M7 7h10v10', check: 'M5 12l4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  link: 'm10 13 4-4M8 15l-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m4 0 2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0',
  send: 'm22 2-7 20-4-9-9-4 20-7M11 13 22 2',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
