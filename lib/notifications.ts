import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCodeToFlag } from './geocoding';
import { VisaStatus } from './visaCalculations';
import { TaxStatus } from './taxCalculations';

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ─── New city arrival ─────────────────────────────────────────────────────────

export async function sendNewCityNotification(
  city: string,
  country: string,
  countryCode: string,
): Promise<void> {
  const flag = countryCodeToFlag(countryCode);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Welcome to ${city}! ${flag}`,
      body: `You've arrived in ${country}. Have a great stay!`,
      sound: true,
    },
    trigger: null,
  });
}

// ─── Visa / Tax threshold warnings ───────────────────────────────────────────

const THRESHOLDS = [75, 90, 100] as const;

function notifKey(type: 'visa' | 'tax', code: string, threshold: number): string {
  const year = new Date().getFullYear();
  return `notif_${type}_${code}_${threshold}_${year}`;
}

async function alreadySent(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) === '1';
}

async function markSent(key: string): Promise<void> {
  await AsyncStorage.setItem(key, '1');
}

export async function checkAndNotifyVisaTax(
  visaStatuses: VisaStatus[],
  taxStatuses: TaxStatus[],
): Promise<void> {
  // Visa checks
  for (const visa of visaStatuses) {
    for (const threshold of THRESHOLDS) {
      if (visa.percentUsed < threshold) continue;
      const key = notifKey('visa', visa.destinationCode, threshold);
      if (await alreadySent(key)) continue;
      await markSent(key);

      const exceeded = threshold === 100;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: exceeded
            ? `Visa overstay — ${visa.destination} ${visa.flag}`
            : `Visa ${threshold >= 90 ? 'warning' : 'heads-up'} — ${visa.destination} ${visa.flag}`,
          body: exceeded
            ? `You've used all ${visa.daysAllowed} allowed days. Leave as soon as possible.`
            : `${visa.daysRemaining}d left of ${visa.daysAllowed}d.${threshold >= 90 ? ' Plan your exit soon.' : ''}`,
          sound: true,
        },
        trigger: null,
      });
    }
  }

  // Tax checks
  for (const tax of taxStatuses) {
    for (const threshold of THRESHOLDS) {
      if (tax.percentUsed < threshold) continue;
      const key = notifKey('tax', tax.countryCode, threshold);
      if (await alreadySent(key)) continue;
      await markSent(key);

      const isResident = threshold === 100;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: isResident
            ? `Tax residency reached — ${tax.country} ${tax.flag}`
            : `Tax residency alert — ${tax.country} ${tax.flag}`,
          body: isResident
            ? `You've hit ${tax.thresholdDays} days in ${tax.country}. You may now be considered a tax resident. Consult a tax advisor.`
            : `${tax.daysPresent} of ${tax.thresholdDays} days used (${Math.round(tax.percentUsed)}%).${threshold >= 90 ? ' Consider leaving soon.' : ''}`,
          sound: true,
        },
        trigger: null,
      });
    }
  }
}
