import { useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { insertJourney } from '../../../lib/database';
import { showToast } from '../../../lib/toast';

export default function CreateJourneyScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await insertJourney(title.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismiss();
      showToast('Journey created');
      // Navigate to the new journey after dismissing
      setTimeout(() => {
        router.push(`/(tabs)/(plans)/${id}?add=1` as any);
      }, 350);
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
              <SymbolView
                name="checkmark"
                tintColor={PlatformColor('label')}
                weight="semibold"
                size={22}
              />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Name your trip.."
          placeholderTextColor={PlatformColor('placeholderText')}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
          maxLength={80}
        />
        <View style={styles.chipsContainer}>
          {['Thailand 2026', 'Summer Vacation', 'City Break', 'Road Trip', 'Beach Holiday'].map((suggestion) => (
            <Pressable
              key={suggestion}
              style={styles.chip}
              onPress={() => setTitle(suggestion)}
            >
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  input: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: PlatformColor('label'),
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
    color: PlatformColor('label'),
  },
});
