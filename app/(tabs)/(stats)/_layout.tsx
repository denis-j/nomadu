import { Stack } from 'expo-router/stack';
import { sheetBackground, sheetWithHeader } from '../../../constants/colors';
import { useTranslation } from '../../../contexts/LanguageContext';

export default function StatsStack() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('nav.tracking'),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="visa"
        options={{
          title: t('nav.visa'),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen
        name="visa-edit"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      {/* Three-step add flow. Its own stack supplies the per-step headers,
          so the sheet itself shows none. Same setup as the trip-create sheet. */}
      <Stack.Screen
        name="visa-new"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="visa-country-picker"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="passport"
        options={{
          title: t('nav.passport'),
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.82, 1.0],
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="customize"
        options={{
          presentation: sheetWithHeader,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.85, 1.0],
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="tax"
        options={{
          title: t('nav.taxResidence'),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
