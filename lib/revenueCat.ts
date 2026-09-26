import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOffering,
} from 'react-native-purchases';

// Development uses RevenueCat's Test Store; releases talk to the store of
// the platform. The Apple key on Android left every release build without
// an entitlement, stuck on the paywall.
const API_KEY = __DEV__
  ? 'test_kXXfCMJCdwXmGftKoGShjPwOkJk'
  : Platform.OS === 'android'
    ? 'goog_ucEYNulBZUlUAoItzKHxyojtNpL'
    : 'appl_mKLVauyQAPTHccyWZkEDCYXRgaZ';

const ENTITLEMENT_ID = 'MMM 0 LLC Pro';

// Off only for Android test builds made with EXPO_PUBLIC_DISABLE_PAYWALL=1 on
// the command line (never in .env files): everyone counts as Pro there, so
// a sideloaded APK can be tried without the Play Store. iOS ignores it.
const REVENUECAT_ENABLED = !(Platform.OS === 'android' && process.env.EXPO_PUBLIC_DISABLE_PAYWALL === '1');

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

// ─── Entitlement, with an offline fallback ───────────────────────────────────

export interface Entitlement {
  isActive: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  /**
   * True when RevenueCat actually answered. False means this came from the
   * local snapshot because the network (or RevenueCat) was unreachable.
   *
   * Callers that gate access should still trust `isActive`: an unverified
   * `true` is a subscription we confirmed earlier and whose expiry has not
   * passed yet. The flag is for telling the user, not for gating.
   */
  verified: boolean;
}

const SNAPSHOT_KEY = '@entitlement_snapshot_v1';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ceiling for an active entitlement that carries neither an expiration date
 * nor the lifetime product id.
 *
 * That combination should not occur. It is treated as a data problem rather
 * than a licence: enough room to cover a brief outage, not enough to hand out
 * a free month should RevenueCat ever omit the expiry on a subscription.
 *
 * Note there is deliberately no equivalent ceiling for lifetime purchases.
 * A lifetime buyer paid once, outright, for something with no end date, and
 * expiring that offline after n days would contradict what they bought. The
 * only thing a ceiling would catch is an entitlement revoked after the fact
 * (refund, chargeback, family sharing) belonging to someone who then stays
 * offline forever, which costs almost nothing and cannot be exploited without
 * giving up sync, AI and geocoding along the way.
 */
const UNDATED_OFFLINE_CEILING_MS = 3 * DAY_MS;

interface Snapshot {
  isActive: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  cachedAt: number;
  /** The RevenueCat app user id (the Firebase uid once identified) it describes. */
  appUserId?: string | null;
}

async function currentAppUserId(): Promise<string | null> {
  try {
    return await Purchases.getAppUserID();
  } catch {
    return null;
  }
}

async function writeSnapshot(entitlement: Omit<Entitlement, 'verified'>): Promise<void> {
  const snapshot: Snapshot = { ...entitlement, cachedAt: Date.now(), appUserId: await currentAppUserId() };
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => {});
}

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.isActive === 'boolean' && typeof parsed?.cachedAt === 'number'
      ? (parsed as Snapshot)
      : null;
  } catch {
    return null;
  }
}

async function clearSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
}

/**
 * Decide whether a snapshot still describes a live entitlement.
 *
 * Nobody keeps offline access beyond what they paid for: a dated subscription
 * is trusted until its own expiry and not a day longer.
 */
function snapshotStillValid(snapshot: Snapshot): boolean {
  if (!snapshot.isActive) return false;

  if (snapshot.expirationDate) {
    const expiry = Date.parse(snapshot.expirationDate);
    // An unparseable date is not evidence of anything, so fall through to the
    // undated ceiling rather than trusting it indefinitely.
    if (!Number.isNaN(expiry)) return expiry > Date.now();
  }

  // Lifetime means lifetime, offline included.
  if (snapshot.productIdentifier === PRODUCT_IDS.lifetime) return true;

  return Date.now() - snapshot.cachedAt <= UNDATED_OFFLINE_CEILING_MS;
}

/**
 * The last confirmed Pro status of this account, if it still holds.
 *
 * What the app routes on at launch, before RevenueCat has answered: waiting
 * for `logIn` and `getCustomerInfo` held the first screen for as long as the
 * network took, and on a slow connection abroad that was many seconds. The
 * live answer follows and replaces it. Only a snapshot taken for this very
 * account counts; one without an owner (older builds) or from another
 * account on the same phone is ignored.
 */
export async function readValidSnapshotFor(uid: string): Promise<Entitlement | null> {
  if (!REVENUECAT_ENABLED) return null;
  const snapshot = await readSnapshot();
  if (!snapshot || snapshot.appUserId !== uid || !snapshotStillValid(snapshot)) return null;
  return {
    isActive: true,
    expirationDate: snapshot.expirationDate,
    productIdentifier: snapshot.productIdentifier,
    verified: false,
  };
}

/**
 * Current Pro status.
 *
 * The previous version returned `isActive: false` whenever the lookup threw,
 * which the router could not tell apart from a genuine "never paid" and turned
 * into a redirect to the paywall. For an app whose users are routinely offline
 * abroad, that locked paying customers out of their own local data.
 *
 * A failed lookup now falls back to the last confirmed entitlement, valid
 * until the subscription's own expiry date. Nothing is granted that was not
 * verified at some earlier point, so this cannot be used to skip paying.
 */
export async function checkProEntitlement(): Promise<Entitlement> {
  if (!REVENUECAT_ENABLED) {
    return { isActive: true, expirationDate: null, productIdentifier: null, verified: true };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    const fresh = {
      isActive: !!entitlement,
      expirationDate: entitlement?.expirationDate ?? null,
      productIdentifier: entitlement?.productIdentifier ?? null,
    };
    await writeSnapshot(fresh);
    return { ...fresh, verified: true };
  } catch {
    const snapshot = await readSnapshot();
    // Only the snapshot of the account RevenueCat is on now: a second account
    // on the same phone must not inherit the first one's Pro while offline.
    const owner = await currentAppUserId();
    if (snapshot && snapshotStillValid(snapshot) && (!snapshot.appUserId || snapshot.appUserId === owner)) {
      return {
        isActive: true,
        expirationDate: snapshot.expirationDate,
        productIdentifier: snapshot.productIdentifier,
        verified: false,
      };
    }
    return { isActive: false, expirationDate: null, productIdentifier: null, verified: false };
  }
}

/**
 * Record an entitlement pushed by RevenueCat's own listener, so the offline
 * snapshot keeps up with purchases and renewals that arrive without a check.
 */
export async function rememberEntitlement(
  entitlement: Omit<Entitlement, 'verified'>,
): Promise<void> {
  if (!REVENUECAT_ENABLED) return;
  await writeSnapshot(entitlement);
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
    // A network round trip at every launch otherwise; the SDK keeps the
    // identified user across launches.
    if ((await currentAppUserId()) === uid) return;
    await Purchases.logIn(uid);
  } catch {
    // Non-critical: app works without RevenueCat identification
  }
}

export async function logOutUser(): Promise<void> {
  if (!REVENUECAT_ENABLED) return;
  // Drop the offline snapshot first: it describes the account that is leaving,
  // and must never grant Pro to whoever signs in on this device next.
  await clearSnapshot();
  try {
    await Purchases.logOut();
  } catch {
    // Non-critical: ignore if already anonymous
  }
}

export { Purchases, ENTITLEMENT_ID };
export type { CustomerInfo, PurchasesOffering };
