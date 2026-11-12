import { Linking } from 'react-native';

import { MAP } from '@/constants/brand';

export type MapPin = {
  id: number;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  /** ok = έχει ελεύθερες, full = πλήρες, closed = κλειστό τις ώρες που ζητήθηκαν */
  tone?: 'ok' | 'full' | 'closed' | 'none';
};

export type BeachMapProps = {
  pins: MapPin[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  /** Αν δοθεί, το πάτημα πάνω στον χάρτη επιλέγει θέση (π.χ. για νέο κατάστημα). */
  onPick?: (lat: number, lng: number) => void;
  picked?: { lat: number; lng: number } | null;
  height?: number;
};

export const PIN_COLORS: Record<NonNullable<MapPin['tone']>, string> = {
  ok: MAP.normal,
  full: '#C62828',
  closed: '#898781',
  none: '#2F8FC4',
};

export function fitRegion(pins: MapPin[], picked?: { lat: number; lng: number } | null) {
  const pts = [...pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(picked ? [picked] : [])];
  if (!pts.length) return { latitude: 40.2583, longitude: 23.2025, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.006, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.006, (maxLng - minLng) * 1.6),
  };
}

/** Ανοίγει οδηγίες (Google Maps) προς το κατάστημα: στο κινητό την εφαρμογή χαρτών, στο PC νέα καρτέλα. */
export function openDirections(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}
