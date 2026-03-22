import { createContext } from 'react';

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
  _show?.({ message, type });
}
