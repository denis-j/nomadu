// The shared app modules import Expo packages that never run on the server
// (see build.mjs for the runtime stubs). These keep the type checker quiet.
declare module 'expo-location' {
  export const Accuracy: Record<string, number>;
  export function reverseGeocodeAsync(coords: { latitude: number; longitude: number }): Promise<any[]>;
  export function geocodeAsync(address: string): Promise<any[]>;
}
declare module 'expo-crypto' {
  export function randomUUID(): string;
}
declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params?: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>;
    getAllAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    getFirstAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
    withExclusiveTransactionAsync(task: (tx: SQLiteDatabase) => Promise<void>): Promise<void>;
  }
  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
declare module 'react-native' {
  export const Platform: { OS: string };
}
declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys(): Promise<string[]>;
    multiGet(keys: string[]): Promise<[string, string | null][]>;
    multiSet(pairs: [string, string][]): Promise<void>;
    multiRemove(keys: string[]): Promise<void>;
  };
  export default AsyncStorage;
}
declare module 'expo-notifications' {
  export const SchedulableTriggerInputTypes: any;
  export function getAllScheduledNotificationsAsync(): Promise<any[]>;
  export function cancelScheduledNotificationAsync(id: string): Promise<void>;
  export function scheduleNotificationAsync(req: any): Promise<string>;
  export function getPermissionsAsync(): Promise<any>;
  export function requestPermissionsAsync(): Promise<any>;
  export function setNotificationChannelAsync(...args: any[]): Promise<any>;
  export function setNotificationHandler(handler: any): void;
  export function getPresentedNotificationsAsync(): Promise<any[]>;
  export function dismissNotificationAsync(id: string): Promise<void>;
  export const AndroidImportance: any;
}
