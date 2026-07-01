import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, IS_DEMO_MODE } from '../lib/firebase';
import { loadUserRules, saveLocalRules, type UserRule } from '../utils/categorization/userRules';

/**
 * Firestore-synced persistence for user-taught category rules, so they follow the
 * logged-in user across browsers/devices. localStorage stays as an instant cache
 * and offline/demo fallback. Doc path: categoryRules/{uid} = { rules: UserRule[] }.
 */

const canUseCloud = (scope: string): boolean => !IS_DEMO_MODE && !!db && !!scope && scope !== 'default';

/** Load rules — Firestore first (and refresh the local cache), else localStorage. */
export async function fetchUserRules(scope: string): Promise<UserRule[]> {
  const local = loadUserRules(scope);
  if (!canUseCloud(scope)) return local;
  try {
    const snap = await getDoc(doc(db as any, 'categoryRules', scope));
    if (snap.exists()) {
      const rules = (snap.data()?.rules ?? []).filter((r: any) => r && r.key && r.category && r.level) as UserRule[];
      saveLocalRules(scope, rules); // refresh cache
      return rules;
    }
    // No cloud doc yet — seed it from whatever is cached locally.
    if (local.length) void persistUserRulesToCloud(scope, local);
    return local;
  } catch (e) {
    console.warn('[userRulesStore] cloud fetch failed, using local cache:', e);
    return local;
  }
}

/** Persist the full rules array to Firestore (and keep the local cache in sync). */
export async function persistUserRulesToCloud(scope: string, rules: UserRule[]): Promise<void> {
  saveLocalRules(scope, rules);
  if (!canUseCloud(scope)) return;
  try {
    await setDoc(doc(db as any, 'categoryRules', scope), { rules, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[userRulesStore] cloud save failed (kept locally):', e);
  }
}
