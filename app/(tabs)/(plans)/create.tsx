import { useRef, useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Card } from '../../../components/visaForm';
import { GlassPill } from '../../../components/GlassPill';
import { insertJourney } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';

const SUGGESTIONS = ['Thailand 2026', 'Summer Vacation', 'City Break', 'Road Trip', 'Beach Holiday'];

/** A trip starts with a name: one field in the app's card, a few names to tap as a start. */
export default function CreateJourneyScreen() {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // One navigation update: the sheet goes, the trip comes. Dismissing and
      // pushing on a timer raced the sheet's dismissal and crashed the stack.
      router.replace(`/(tabs)/(plans)/${id}` as any);
      showToast('Journey created');
    } catch (err) {
      console.error('Failed to create journey:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleCreate} disabled={!canSave} hitSlop={8} style={{ opacity: canSave ? 1 : 0.3 }}>
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Card>
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Name your trip"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              maxLength={80}
            />
          </Pressable>
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
  inputRow: { paddingVertical: 16 },
  input: { ...Typography.titleSmall, fontWeight: '400' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillLabel: { ...Typography.label, fontWeight: '600', color: Colors.text },
  pillLabelActive: { color: Colors.white },
});
