import { Stack } from 'expo-router/stack';
import { sheetBackground, sheetWithHeader } from '../../../constants/colors';
import { useTranslation } from '../../../contexts/LanguageContext';

export default function TimelineStack() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('nav.timeline'),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          presentation: sheetWithHeader,
          title: t('nav.importTrips'),
          sheetGrabberVisible: true,
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: sheetBackground },
        }}
      />
    </Stack>
  );
}
