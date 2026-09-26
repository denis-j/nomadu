import { Stack } from 'expo-router/stack';
import { sheetBackground, headerTransparent } from '../../../../constants/colors';

/**
 * Adding a visa asks three questions, one screen each: which country, which
 * visa and how long, and what it limits. Same shape as the trip-create stack,
 * which is presented as a form sheet with its own inner headers.
 *
 * Editing does NOT go through here. Correcting one field should not mean
 * walking a wizard, so `visa-edit.tsx` keeps everything on one screen.
 */
export default function AddVisaStack() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerTransparent,
        contentStyle: { backgroundColor: sheetBackground },
      }}
    />
  );
}
