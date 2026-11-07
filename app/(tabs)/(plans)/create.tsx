import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card } from '../../../components/visaForm';
import { GlassPill } from '../../../components/GlassPill';
import { insertJourney } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { track } from '../../../lib/analytics';
import { useTranslation } from '../../../contexts/LanguageContext';
import { FormField } from '../../../components/FormField';
import { HeaderAction } from '../../../components/HeaderAction';

/** A trip starts with a name: one field in the app's card, a few names to tap as a start. */
export default function CreateJourneyScreen() {
  const { t } = useTranslation();
  const SUGGESTIONS = [t('plans.sugg1'), t('plans.sugg2'), t('plans.sugg3'), t('plans.sugg4'), t('plans.sugg5')];
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await insertJourney(title.trim());
      track({ name: 'journey_created', props: { from_guide: false } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // One navigation update: the sheet goes, the trip comes. Dismissing and
      // pushing on a timer raced the sheet's dismissal and crashed the stack.
      router.replace(`/(tabs)/(plans)/${id}` as any);
      showToast(t('plans.createToast'));
    } catch (err) {
      console.error('Failed to create journey:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <HeaderAction onPress={handleCreate} label={t('plans.createTrip')} disabled={!canSave} />,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Card>
          <FormField
            ref={inputRef}
            value={title}
            onChangeText={setTitle}
            placeholder={t('plans.nameYourTrip')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            maxLength={80}
          />
        </Card>
        <View style={styles.pillRow}>
          {SUGGESTIONS.map((name) => {
            const active = title === name;
            return (
              <GlassPill
                key={name}
                active={active}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTitle(name);
                }}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{name}</Text>
              </GlassPill>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillLabel: { ...Typography.label, fontWeight: '600', color: Colors.text },
  pillLabelActive: { color: Colors.white },
});
