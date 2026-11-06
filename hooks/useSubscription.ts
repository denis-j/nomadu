import { useCallback, useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { checkProEntitlement, configureRevenueCat, entitlementOf, identifyUser, readValidSnapshotFor, rememberEntitlement, type Entitlement } from '../lib/revenueCat';

interface SubscriptionState {
  isPro: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  /**
   * False when `isPro` came from the offline snapshot rather than a live
   * answer. Access decisions should still use `isPro`; this is for surfacing
   * "we could not reach the store" in the UI if you ever want to.
   */
  verified: boolean;
  loading: boolean;
  /**
   * The uid the current answer was checked for (`null` for anonymous,
   * `undefined` before the first check). Routing must compare this with the
   * signed-in uid: right after sign-in `isPro` still describes the anonymous
   * user, and acting on it sent paying customers to the paywall.
   */
  checkedFor: string | null | undefined;
  refresh: () => Promise<void>;
}

const instances = new Set<(entitlement: Entitlement) => void>();

/**
 * Hand a new answer to every mounted useSubscription. Each screen has its own
 * copy of the state and the root navigator routes on its own, so a refresh that
 * reached only the calling screen sent a customer back to the paywall.
 */
export function publishEntitlement(entitlement: Entitlement): void {
  instances.forEach((apply) => apply(entitlement));
}

/**
 * Pro entitlement for the given account. Pass the signed-in uid (or null):
 * every change identifies against RevenueCat first and re-checks, so the
 * answer always belongs to the account that is actually signed in.
 */
export function useSubscription(uid: string | null = null): SubscriptionState {
  const [isPro, setIsPro] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [productIdentifier, setProductIdentifier] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedFor, setCheckedFor] = useState<string | null | undefined>(undefined);

  const apply = useCallback((entitlement: Entitlement) => {
    setIsPro(entitlement.isActive);
    setExpirationDate(entitlement.expirationDate);
    setProductIdentifier(entitlement.productIdentifier);
    setVerified(entitlement.verified);
  }, []);

  useEffect(() => {
    instances.add(apply);
    return () => {
      instances.delete(apply);
    };
  }, [apply]);

  const refresh = useCallback(async () => {
    setLoading(true);
    publishEntitlement(await checkProEntitlement());
    setLoading(false);
  }, []);

  // Check on mount and whenever the account changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Child effects run before the root layout's, so make sure the SDK is
      // configured here rather than assuming it already is (idempotent).
      await configureRevenueCat();
      if (uid) {
        // Route on the last confirmed answer for this account right away;
        // the live check below confirms or revokes it.
        const known = await readValidSnapshotFor(uid);
        if (known && !cancelled) {
          apply(known);
          setCheckedFor(uid);
          setLoading(false);
        }
        const identified = await identifyUser(uid);
        // RevenueCat is still on the previous user, so a check now would
        // revoke a confirmed answer with someone else's.
        if (!identified && known) return;
      }
      const result = await checkProEntitlement();
      if (cancelled) return;
      apply(result);
      setCheckedFor(uid);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [uid, apply]);

  // There is deliberately no refresh-on-focus here. This hook sits in the root
  // layout, so a focus refresh fired on every screen change and asked
  // RevenueCat again each time. The listener below already receives every
  // entitlement change the SDK learns about, and the paywall calls `refresh()`
  // itself right after a purchase, which is the one moment the answer really
  // has to be current.

  // Listen for real-time changes from RevenueCat
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      const next = entitlementOf(info);
      // The SDK only pushes this after talking to RevenueCat, so it counts as
      // verified and is worth keeping for the next offline start.
      apply({ ...next, verified: true });
      rememberEntitlement(next);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    // Braces matter: the remover returns a boolean, and returning it from an
    // effect makes React treat it as an invalid cleanup function.
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apply]);

  return { isPro, expirationDate, productIdentifier, verified, loading, checkedFor, refresh };
}
