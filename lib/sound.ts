import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const COLLECT_SOUND = require('../assets/sounds/collect-badge.mp3');
const SUCCESS_SOUND = require('../assets/sounds/success.mp3');
const TAP_SOUND = require('../assets/sounds/swoosh.mp3');
const ERROR_SOUND = require('../assets/sounds/error.mp3');
const CARD_TAP_SOUND = require('../assets/sounds/tap.mp3');
const AIR_HORN_SOUND = require('../assets/sounds/air-horn.mp3');

let collectPlayer: AudioPlayer | null = null;
let successPlayer: AudioPlayer | null = null;
let tapPlayer: AudioPlayer | null = null;
let errorPlayer: AudioPlayer | null = null;
let cardTapPlayer: AudioPlayer | null = null;
let airHornPlayer: AudioPlayer | null = null;
let audioModeConfigured = false;

function ensureAudioMode(): void {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
}

/**
 * Plays the badge-collect sound effect. Also reused by the welcome → citizenship
 * transition as the "Get started" tap confirmation.
 *
 * Uses a module-level player (not a component hook) so the sound is NOT tied to
 * any screen's lifecycle. Tapping "Collect" usually closes the rewards screen
 * immediately, which would dispose a component-bound player before it can play.
 *
 * Also enables `playsInSilentMode` so the effect is audible even when the iOS
 * ringer switch is set to silent (expected for a reward sound).
 */
export function playCollectSound(): void {
  try {
    ensureAudioMode();
    if (collectPlayer == null) collectPlayer = createAudioPlayer(COLLECT_SOUND);
    collectPlayer.seekTo(0);
    collectPlayer.play();
  } catch {
    // Sound must never block the collect action.
  }
}

/**
 * Plays a soft success chime. Used when the user confirms a choice (e.g.
 * picking their country on the citizenship screen) so the moment feels
 * rewarding.
 */
export function playSuccessSound(): void {
  try {
    ensureAudioMode();
    if (successPlayer == null) successPlayer = createAudioPlayer(SUCCESS_SOUND);
    successPlayer.seekTo(0);
    successPlayer.play();
  } catch {
    // Sound must never block the user action.
  }
}

/**
 * Plays a subtle tap blip. Used for lightweight selections (tapping a flag
 * pin on the citizenship map, etc.) where Haptics alone feel too quiet.
 */
export function playTapSound(): void {
  try {
    ensureAudioMode();
    if (tapPlayer == null) tapPlayer = createAudioPlayer(TAP_SOUND);
    tapPlayer.seekTo(0);
    tapPlayer.play();
  } catch {
    // Sound must never block the user action.
  }
}

/**
 * Plays the error chime. Triggered automatically by the toast system whenever
 * an `error`-type toast is shown.
 */
export function playErrorSound(): void {
  try {
    ensureAudioMode();
    if (errorPlayer == null) errorPlayer = createAudioPlayer(ERROR_SOUND);
    errorPlayer.seekTo(0);
    errorPlayer.play();
  } catch {
    // Sound must never block the user feedback.
  }
}

/**
 * Plays a soft "tap" sound for selecting an answer card on the onboarding
 * question screens (goal, residence, …).
 */
export function playCardTapSound(): void {
  try {
    ensureAudioMode();
    if (cardTapPlayer == null) cardTapPlayer = createAudioPlayer(CARD_TAP_SOUND);
    cardTapPlayer.seekTo(0);
    cardTapPlayer.play();
  } catch {
    // Sound must never block the user action.
  }
}

/**
 * Plays a celebratory air-horn blast. Used on the post-purchase celebrate
 * screen for the "you're in" moment.
 */
export function playAirHornSound(): void {
  try {
    ensureAudioMode();
    if (airHornPlayer == null) airHornPlayer = createAudioPlayer(AIR_HORN_SOUND);
    airHornPlayer.seekTo(0);
    airHornPlayer.play();
  } catch {
    // Sound must never block the celebration.
  }
}
