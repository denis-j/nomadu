import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { httpsCallable } from 'firebase/functions';
import { CloudyButton } from '../../../components/CloudyButton';
import { Card, SectionLabel } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { TOKEN_ENV_NAME, agentSetupText } from '../../../lib/agentSetup';
import { functions } from '../../../lib/firebase';
import { showToast } from '../../../lib/toast';

const NAME_SUGGESTIONS = ['Hermes', 'Claude', 'ChatGPT'];

/**
 * Connecting one agent, in a sheet.
 *
 * Two questions, one button, then the two things to copy. The key exists
 * only in this sheet's state and is never drawn on screen: it goes from the
 * server to the clipboard and nowhere else, and closing the sheet forgets it.
 * Losing it costs a remove and a reconnect, which is cheap.
 */
export default function ConnectAgentSheet() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [editTimeline, setEditTimeline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ token: string; label: string; editTimeline: boolean } | null>(null);

  const canConnect = label.trim().length > 0 && !busy;

  const connect = async () => {
    if (!canConnect) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const fn = httpsCallable<{ label: string; editTimeline: boolean }, { id: string; token: string; label: string; edit_timeline: boolean }>(functions, 'createAgentToken');
      const res = await fn({ label: label.trim(), editTimeline });
      setReady({ token: res.data.token, label: res.data.label, editTimeline: res.data.edit_timeline });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not connect the agent', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string, what: string) => {
    // The clipboard module is native; a build from before it existed falls
    // back to the share sheet, which reaches the same places.
    if (requireOptionalNativeModule('ExpoClipboard')) {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`${what} copied`);
    } else {
      await Share.share({ message: value });
    }
  };

  if (ready) {
    return (
      <>
        <Stack.Screen options={{ title: `${ready.label} is ready` }} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.hand}>
              <Text style={styles.rowTitle}>Instructions</Text>
              <Text style={styles.rowText}>Go into {ready.label}&apos;s prompt or memory. They explain what the data is and what it can do.</Text>
              <SecondaryButton icon="document-text-outline" label="Copy instructions" onPress={() => copy(agentSetupText(ready.editTimeline), 'Instructions')} />
            </View>
            <View style={styles.separator} />
            <View style={styles.hand}>
              <Text style={styles.rowTitle}>Key</Text>
              <Text style={styles.rowText}>
                Goes into {ready.label}&apos;s secrets or environment as <Text style={styles.mono}>{TOKEN_ENV_NAME}</Text>, never into the prompt. It is a password.
              </Text>
              <SecondaryButton icon="key-outline" label="Copy key" onPress={() => copy(ready.token, 'Key')} />
            </View>
          </Card>
          <Text style={styles.caption}>The key can be copied only while this sheet is open. Lost it? Remove {ready.label} and connect again.</Text>
          <CloudyButton onPress={() => router.back()} style={{ width: '100%' }} innerStyle={{ justifyContent: 'center' }}>
            <Text style={styles.ctaText}>Done</Text>
          </CloudyButton>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Connect an agent' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <SectionLabel>Name</SectionLabel>
        <Card>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Name the agent"
              placeholderTextColor={systemColor('placeholderText')}
              returnKeyType="done"
              maxLength={40}
            />
            <View style={styles.chips}>
              {NAME_SUGGESTIONS.map((name) => (
                <Pressable
                  key={name}
                  style={[styles.chip, label === name && styles.chipOn]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLabel(name); }}
                >
                  <Text style={[styles.chipText, label === name && styles.chipTextOn]}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>

        <SectionLabel>Can it change your timeline?</SectionLabel>
        <Card>
          <Choice
            on={!editTimeline}
            icon="eye-outline"
            title="Read only"
            text="Sees where you have been, your visa and tax days, and can plan trips."
            onPress={() => setEditTimeline(false)}
          />
          <View style={styles.separator} />
          <Choice
            on={editTimeline}
            icon="create-outline"
            title="Read and edit"
            text="Can also add stays the tracker missed, fix dates and remove wrong ones. That moves your visa and tax days."
            onPress={() => setEditTimeline(true)}
          />
        </Card>

        <CloudyButton onPress={connect} style={{ width: '100%', opacity: canConnect ? 1 : 0.5 }} innerStyle={{ justifyContent: 'center' }}>
          <Text style={styles.ctaText}>{busy ? 'Connecting…' : 'Connect'}</Text>
        </CloudyButton>
      </ScrollView>
    </>
  );
}

function Choice({ on, icon, title, text, onPress }: { on: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [styles.choice, pressed && { opacity: 0.6 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <View style={styles.choiceIcon}>
        <Ionicons name={icon} size={17} color={Colors.text} />
      </View>
      <View style={styles.choiceBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? Colors.text : Colors.border} />
    </Pressable>
  );
}

function SecondaryButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={17} color={Colors.text} />
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  field: { paddingVertical: 14, gap: 10 },
  input: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: Colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: Colors.primary + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: Colors.primary },
  chipText: { ...Typography.bodySmall, fontWeight: '700', color: Colors.primary },
  chipTextOn: { color: Colors.white },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  choiceIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceBody: { flex: 1, gap: 3 },
  rowTitle: { ...Typography.titleSmall, fontWeight: '600' },
  rowText: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 19 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: -20 },
  hand: { paddingVertical: 16, gap: 6 },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: Colors.text },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    marginTop: 8,
  },
  secondaryText: { ...Typography.label, fontWeight: '600' },
  caption: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
});
