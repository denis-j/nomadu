import { useCallback, useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { ENTITLEMENT_ID, checkProEntitlement, configureRevenueCat, identifyUser, rememberEntitlement } from '../lib/revenueCat';

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

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await checkProEntitlement();
    setIsPro(result.isActive);
    setExpirationDate(result.expirationDate);
    setProductIdentifier(result.productIdentifier);
    setVerified(result.verified);
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
      if (uid) await identifyUser(uid);
      const result = await checkProEntitlement();
      if (cancelled) return;
      setIsPro(result.isActive);
      setExpirationDate(result.expirationDate);
      setProductIdentifier(result.productIdentifier);
      setVerified(result.verified);
      setCheckedFor(uid);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  // There is deliberately no refresh-on-focus here. This hook sits in the root
  // layout, so a focus refresh fired on every screen change and asked
  // RevenueCat again each time. The listener below already receives every
  // entitlement change the SDK learns about, and the paywall calls `refresh()`
  // itself right after a purchase, which is the one moment the answer really
  // has to be current.

  // Listen for real-time changes from RevenueCat
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      const entitlement = info.entitlements.active[ENTITLEMENT_ID];
      const next = {
        isActive: !!entitlement,
        expirationDate: entitlement?.expirationDate ?? null,
        productIdentifier: entitlement?.productIdentifier ?? null,
      };

      setIsPro(next.isActive);
      setExpirationDate(next.expirationDate);
      setProductIdentifier(next.productIdentifier);
      // The SDK only pushes this after talking to RevenueCat, so it counts as
      // verified and is worth keeping for the next offline start.
      setVerified(true);
      rememberEntitlement(next);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    // Braces matter: the remover returns a boolean, and returning it from an
    // effect makes React treat it as an invalid cleanup function.
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return { isPro, expirationDate, productIdentifier, verified, loading, checkedFor, refresh };
}
