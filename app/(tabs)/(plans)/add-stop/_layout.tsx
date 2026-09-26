import { Stack } from 'expo-router/stack';
import { sheetBackground, headerTransparent } from '../../../../constants/colors';

export default function AddStopStack() {
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
