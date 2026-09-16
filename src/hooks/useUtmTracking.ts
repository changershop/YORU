import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  captured_at?: number;
  landing_path?: string;
}

const STORAGE_KEY = 'yoru_utm_attribution';

export function useUtmTracking() {
  const location = useLocation();

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(location.search);
      const utm_source = searchParams.get('utm_source');
      const utm_medium = searchParams.get('utm_medium');
      const utm_campaign = searchParams.get('utm_campaign');
      const utm_term = searchParams.get('utm_term');
      const utm_content = searchParams.get('utm_content');

      // If any UTM parameter is present in current URL
      if (utm_source || utm_medium || utm_campaign || utm_term || utm_content) {
        const utmData: UtmParams = {
          utm_source: utm_source || undefined,
          utm_medium: utm_medium || undefined,
          utm_campaign: utm_campaign || undefined,
          utm_term: utm_term || undefined,
          utm_content: utm_content || undefined,
          captured_at: Date.now(),
          landing_path: location.pathname
        };

        // Persist in session for session-level attribution, and local for long-term referral attribution
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utmData));
        if (!localStorage.getItem(STORAGE_KEY)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(utmData));
        }
      }
    } catch (e) {
      // Storage or parsing safeguards
    }
  }, [location]);
}

export function getStoredUtm(): UtmParams | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
