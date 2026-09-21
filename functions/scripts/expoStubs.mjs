// Expo-only modules that the app's shared logic (visa, tax, stats, dates,
// accommodation rules) imports but never calls on the server. Replaced with
// stubs at bundle time, by the build and by the tests alike.
export const STUBS = {
  'expo-location': 'export async function reverseGeocodeAsync(){return []} export async function geocodeAsync(){return []} export const Accuracy={};',
  'expo-crypto': 'import {randomUUID as r} from "node:crypto"; export function randomUUID(){return r()}',
  'expo-sqlite': 'export async function openDatabaseAsync(){throw new Error("no database on the server")}',
  'react-native': 'export const Platform={OS:"web"};',
  '@react-native-async-storage/async-storage': 'export default {getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{},multiGet:async()=>[],multiSet:async()=>{}};',
  'expo-notifications': 'export const SchedulableTriggerInputTypes={}; export async function getAllScheduledNotificationsAsync(){return []} export async function cancelScheduledNotificationAsync(){} export async function scheduleNotificationAsync(){return ""} export async function getPermissionsAsync(){return {status:"denied"}}',
};

export const stubPlugin = {
  name: 'expo-stubs',
  setup(build) {
    const filter = new RegExp('^(' + Object.keys(STUBS).map((k) => k.replace(/[/@\-]/g, '\\$&')).join('|') + ')$');
    build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: STUBS[args.path], loader: 'js' }));
  },
};
