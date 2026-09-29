export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  apiMode: (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'real',
} as const;