import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const COLLECT_SOUND = require('../assets/sounds/collect-badge.mp3');

let collectPlayer: AudioPlayer | null = null;
let audioModeConfigured = false;

/**
 * Plays the badge-collect sound effect.
 *
 * Uses a module-level player (not a component hook) so the sound is NOT tied to
 * any screen's lifecycle — tapping "Collect" usually closes the rewards screen
 * immediately, which would dispose a component-bound player before it can play.
 *
 * Also enables `playsInSilentMode` so the effect is audible even when the iOS
 * ringer switch is set to silent (expected for a reward sound).
 */
export function playCollectSound(): void {
  try {
    if (!audioModeConfigured) {
      audioModeConfigured = true;
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    if (collectPlayer == null) {
      collectPlayer = createAudioPlayer(COLLECT_SOUND);
    }
    collectPlayer.seekTo(0);
    collectPlayer.play();
  } catch {
    // Sound must never block the collect action.
  }
}
