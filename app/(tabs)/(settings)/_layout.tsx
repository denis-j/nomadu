import { Stack } from 'expo-router/stack';
import { headerTransparent, sheetWithHeader } from '../../../constants/colors';
import { useTranslation } from '../../../contexts/LanguageContext';

export default function SettingsStack() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('nav.settings'),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="passport"
        options={{
          title: t('nav.passport'),
          headerTransparent,
          headerBlurEffect: 'systemMaterial',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75, 1.0],
        }}
      />
      <Stack.Screen
        name="agent"
        options={{
          title: t('nav.aiAgent'),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="agent-connect"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.72, 1.0],
        }}
      />
      <Stack.Screen
        name="debug"
        options={{
          title: 'Debug',
        }}
      />
    </Stack>
  );
}
