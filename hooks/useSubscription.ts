import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { ENTITLEMENT_ID, checkProEntitlement } from '../lib/revenueCat';

interface SubscriptionState {
  isPro: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const [isPro, setIsPro] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [productIdentifier, setProductIdentifier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await checkProEntitlement();
    setIsPro(result.isActive);
    setExpirationDate(result.expirationDate);
    setProductIdentifier(result.productIdentifier);
    setLoading(false);
  }, []);

  // Check on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-check when screen gains focus (e.g. after paywall or settings change)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Listen for real-time changes from RevenueCat
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      const entitlement = info.entitlements.active[ENTITLEMENT_ID];
      setIsPro(!!entitlement);
      setExpirationDate(entitlement?.expirationDate ?? null);
      setProductIdentifier(entitlement?.productIdentifier ?? null);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  }, []);

  return { isPro, expirationDate, productIdentifier, loading, refresh };
}
