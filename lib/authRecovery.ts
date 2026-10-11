import { AppState, DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import { auth } from './firebase';
import { reportError } from './monitoring';
import { sessionReadFailed } from './secureAuthStorage';

/**
 * Back from a launch that could not read the session.
 *
 * iOS starts the app in the background for a location update, also before
 * the phone was first unlocked after a reboot. The keychain is closed then,
 * Firebase finds no session and stays signed out for as long as that
 * process lives, which can be days: the user opened the app, saw the
 * welcome screen and had to sign in again, and after that the paywall.
 * Firebase cannot re-read its session, so the app starts over once it is in
 * front, with the keychain open. Nothing was lost: the session was never
 * deleted (secureAuthStorage refuses to while it could not read it).
 */
let reloading = false;

async function recover(): Promise<void> {
  if (reloading || !sessionReadFailed || auth.currentUser) return;
  reloading = true;
  reportError(new Error('Session unreadable at launch, restarting'), 'auth:keychain-recovery');
  try {
    if (__DEV__) DevSettings.reload();
    else await Updates.reloadAsync();
  } catch (err) {
    reloading = false;
    reportError(err, 'auth:keychain-reload');
  }
}

export function startAuthRecovery(): void {
  // Opened by the user rather than woken for a location update: check once
  // Firebase has tried to read the session.
  auth.authStateReady().then(() => {
    if (AppState.currentState === 'active') recover();
  }).catch(() => {});
  AppState.addEventListener('change', (state) => {
    if (state === 'active') recover();
  });
}
