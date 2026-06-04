import * as Haptics from 'expo-haptics';
import { playErrorSound } from './sound';

export type ToastType = 'success' | 'error';

export interface ToastData {
  message: string;
  type: ToastType;
}

// Handler stack: multiple ToastContainers can be mounted (e.g. one at the
// root and another inside a presented formSheet). The most-recently-mounted
// handler wins — that's the one visually closest to the user. When the
// in-sheet container unmounts, the root container takes over again.
const _handlers: Array<(data: ToastData) => void> = [];

export function registerToast(fn: (data: ToastData) => void): () => void {
  _handlers.push(fn);
  return () => {
    const i = _handlers.lastIndexOf(fn);
    if (i >= 0) _handlers.splice(i, 1);
  };
}

export function showToast(message: string, type: ToastType = 'success') {
  // Error toasts get a tactile + audible nudge so the user notices them even
  // if their eyes are elsewhere on the screen.
  if (type === 'error') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    playErrorSound();
  }
  _handlers[_handlers.length - 1]?.({ message, type });
}
