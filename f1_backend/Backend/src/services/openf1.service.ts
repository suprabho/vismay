// DEPRECATED — data ingestion now handled by AI Worker via Fast-F1 (POST /ingest/session).
// This file is dead code and can be removed once the admin session-discovery UI
// is updated to use GET /sessions/available on the AI Worker.
import axios from 'axios';

const BASE = 'https://api.openf1.org/v1';
const RATE_LIMIT_DELAY_MS = 400; // stay under 3 req/s free tier

async function get<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await axios.get<T>(`${BASE}${endpoint}`, { params });
  await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
  return res.data;
}

export const openf1 = {
  getMeetings:    (year: number) =>
    get<unknown[]>('/meetings', { year }),

  getSessions:    (meetingKey: string) =>
    get<unknown[]>('/sessions', { meeting_key: meetingKey }),

  getDrivers:     (sessionKey: string) =>
    get<unknown[]>('/drivers', { session_key: sessionKey }),

  getLaps:        (sessionKey: string, driverNumber?: number) =>
    get<unknown[]>('/laps', { session_key: sessionKey, ...(driverNumber ? { driver_number: driverNumber } : {}) }),

  getCarData:     (sessionKey: string, driverNumber: number) =>
    get<unknown[]>('/car_data', { session_key: sessionKey, driver_number: driverNumber }),

  getStints:      (sessionKey: string) =>
    get<unknown[]>('/stints', { session_key: sessionKey }),

  getPit:         (sessionKey: string) =>
    get<unknown[]>('/pit', { session_key: sessionKey }),

  getRaceControl: (sessionKey: string) =>
    get<unknown[]>('/race_control', { session_key: sessionKey }),

  getWeather:     (sessionKey: string) =>
    get<unknown[]>('/weather', { session_key: sessionKey }),

  getIntervals:   (sessionKey: string) =>
    get<unknown[]>('/intervals', { session_key: sessionKey }),

  getPosition:    (sessionKey: string) =>
    get<unknown[]>('/position', { session_key: sessionKey }),
};
