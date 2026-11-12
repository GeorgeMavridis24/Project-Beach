import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Διεύθυνση του backend.
 * 1. Αν υπάρχει EXPO_PUBLIC_API_URL (αρχείο SmartBeachApp/.env), χρησιμοποιείται αυτή.
 * 2. Αλλιώς μαντεύουμε: ο server τρέχει στον ίδιο υπολογιστή με το Expo,
 *    στη θύρα 8000. Έτσι ΔΕΝ χρειάζεται να γράφεις την IP σου με το χέρι.
 */
function guessApiUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri; // π.χ. "192.168.1.36:8081"
  if (hostUri && !hostUri.includes('exp.direct')) {
    return `http://${hostUri.split(':')[0]}:8000`;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || guessApiUrl()).replace(/\/$/, '');
