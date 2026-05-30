import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOffering,
} from 'react-native-purchases';

const API_KEY = __DEV__
  ? 'test_kXXfCMJCdwXmGftKoGShjPwOkJk'
  : 'appl_mKLVauyQAPTHccyWZkEDCYXRgaZ';

const ENTITLEMENT_ID = 'MMM 0 LLC Pro';

const REVENUECAT_ENABLED = true;

export const PRODUCT_IDS = {
  monthly: 'nomadu_monthly',
  yearly: 'nomadu_yearly',
  lifetime: 'lifetime',
} as const;

let isConfigured = false;

export async function configureRevenueCat(): Promise<void> {
  if (!REVENUECAT_ENABLED) return;
  if (isConfigured) return;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: API_KEY });
  isConfigured = true;
}

export async function checkProEntitlement(): Promise<{
  isActive: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
}> {
  if (!REVENUECAT_ENABLED) {
    return { isActive: true, expirationDate: null, productIdentifier: null };
  }
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    return {
      isActive: !!entitlement,
      expirationDate: entitlement?.expirationDate ?? null,
      productIdentifier: entitlement?.productIdentifier ?? null,
    };
  } catch {
    return { isActive: false, expirationDate: null, productIdentifier: null };
  }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!REVENUECAT_ENABLED) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!REVENUECAT_ENABLED) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function identifyUser(uid: string): Promise<void> {
  if (!REVENUECAT_ENABLED) return;
  try {
    await Purchases.logIn(uid);
  } catch {
    // Non-critical: app works without RevenueCat identification
  }
}

export async function logOutUser(): Promise<void> {
  if (!REVENUECAT_ENABLED) return;
  try {
    await Purchases.logOut();
  } catch {
    // Non-critical: ignore if already anonymous
  }
}

export { Purchases, ENTITLEMENT_ID };
export type { CustomerInfo, PurchasesOffering };
