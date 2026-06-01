import * as Haptics from 'expo-haptics';
import { playErrorSound } from './sound';

export type ToastType = 'success' | 'error';

export interface ToastData {
  message: string;
  type: ToastType;
}

let _show: ((data: ToastData) => void) | null = null;

export function registerToast(fn: (data: ToastData) => void) {
  _show = fn;
}

export function showToast(message: string, type: ToastType = 'success') {
  // Error toasts get a tactile + audible nudge so the user notices them even
  // if their eyes are elsewhere on the screen.
  if (type === 'error') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    playErrorSound();
  }
  _show?.({ message, type });
}
