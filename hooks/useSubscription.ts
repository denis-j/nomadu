import { useCallback, useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { ENTITLEMENT_ID, checkProEntitlement, rememberEntitlement } from '../lib/revenueCat';

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
  refresh: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const [isPro, setIsPro] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [productIdentifier, setProductIdentifier] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await checkProEntitlement();
    setIsPro(result.isActive);
    setExpirationDate(result.expirationDate);
    setProductIdentifier(result.productIdentifier);
    setVerified(result.verified);
    setLoading(false);
  }, []);

  // Check on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return { isPro, expirationDate, productIdentifier, verified, loading, refresh };
}
