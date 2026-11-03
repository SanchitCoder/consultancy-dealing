/** Safe for client and server. NEXT_PUBLIC_DATA_MODE is inlined at build time. Default = mock. */
export type DataMode = 'mock' | 'live';
export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === 'live' ? 'live' : 'mock';
export const IS_MOCK = DATA_MODE === 'mock';
export const TIMEZONE = 'Asia/Kolkata';
