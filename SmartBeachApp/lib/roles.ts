import type { BeachInfo, Role, User } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  user: 'Πελάτης',
  staff: 'Προσωπικό',
  owner: 'Καταστηματάρχης',
  admin: 'Διαχειριστής',
};

/** Βλέπει την καρτέλα «Διαχείριση» */
export const isStaffLike = (u: User | null) => !!u && ['staff', 'owner', 'admin'].includes(u.role);
/** Διαχειρίζεται κατάστημα (στατιστικά, κρατήσεις, ξαπλώστρες, ωράριο) */
export const isManager = (u: User | null) => !!u && (u.role === 'admin' || u.role === 'owner');

/** Τα καταστήματα που διαχειρίζεται ο χρήστης (όλα για τον admin, τα δικά του για τον owner). */
export function managedBeaches<T extends BeachInfo>(u: User | null, beaches: T[]): T[] {
  if (!u) return [];
  if (u.role === 'admin') return beaches;
  if (u.role === 'owner') return beaches.filter((b) => b.owner_id === u.id);
  return beaches;
}
