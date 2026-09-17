// Bundles the functions with esbuild so they can share the app's own logic
// (visa, tax, stats, date chaining) instead of a copy that drifts. Expo-only
// modules that those files import are replaced with stubs; none of them is
// called on the server, they are just in the import graph.
import * as esbuild from 'esbuild';

const STUBS = {
  'expo-location': 'export async function reverseGeocodeAsync(){return []} export async function geocodeAsync(){return []} export const Accuracy={};',
  'expo-crypto': 'import {randomUUID as r} from "node:crypto"; export function randomUUID(){return r()}',
  'expo-sqlite': 'export async function openDatabaseAsync(){throw new Error("no database on the server")}',
  'react-native': 'export const Platform={OS:"web"};',
  '@react-native-async-storage/async-storage': 'export default {getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{},multiGet:async()=>[],multiSet:async()=>{}};',
  'expo-notifications': 'export const SchedulableTriggerInputTypes={}; export async function getAllScheduledNotificationsAsync(){return []} export async function cancelScheduledNotificationAsync(){} export async function scheduleNotificationAsync(){return ""} export async function getPermissionsAsync(){return {status:"denied"}}',
};

const stubPlugin = {
  name: 'expo-stubs',
  setup(build) {
    const filter = new RegExp('^(' + Object.keys(STUBS).map((k) => k.replace(/[/@\-]/g, '\\$&')).join('|') + ')$');
    build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: STUBS[args.path], loader: 'js' }));
  },
};

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'lib/index.js',
  sourcemap: true,
  plugins: [stubPlugin],
  external: ['firebase-admin', 'firebase-functions', 'express'],
  logLevel: 'info',
});
