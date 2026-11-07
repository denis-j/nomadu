import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { httpsCallable } from 'firebase/functions';
import { Card, SectionLabel } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';
import { TOKEN_ENV_NAME, agentSetupText } from '../../../lib/agentSetup';
import { functions } from '../../../lib/firebase';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';
import { FormField } from '../../../components/FormField';
import { HeaderAction } from '../../../components/HeaderAction';

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
  const { t } = useTranslation();
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
      showToast(err?.message ?? t('agent.couldNotConnect'), 'error');
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
      showToast(t('agent.copied', { what }));
    } else {
      await Share.share({ message: value });
    }
  };

  if (ready) {
    return (
      <>
        <Stack.Screen options={{ title: t('agent.isReady', { label: ready.label }), headerRight: () => <HeaderAction onPress={() => router.back()} label={t('agent.done')} /> }} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.hand}>
              <Text style={styles.rowTitle}>{t('agent.instructions')}</Text>
              <Text style={styles.rowText}>{t('agent.instructionsText', { label: ready.label })}</Text>
              <SecondaryButton icon="document-text-outline" label={t('agent.copyInstructions')} onPress={() => copy(agentSetupText(ready.editTimeline), t('agent.instructions'))} />
            </View>
            <View style={styles.separator} />
            <View style={styles.hand}>
              <Text style={styles.rowTitle}>{t('agent.key')}</Text>
              <Text style={styles.rowText}>
                {t('agent.keyTextBefore', { label: ready.label })}<Text style={styles.mono}>{TOKEN_ENV_NAME}</Text>{t('agent.keyTextAfter')}
              </Text>
              <SecondaryButton icon="key-outline" label={t('agent.copyKey')} onPress={() => copy(ready.token, t('agent.key'))} />
            </View>
          </Card>
          <Text style={styles.caption}>{t('agent.keyCaption', { label: ready.label })}</Text>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('nav.connectAgent'), headerRight: () => <HeaderAction onPress={connect} label={t('agent.connect')} disabled={!label.trim()} busy={busy} /> }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <SectionLabel>{t('agent.name')}</SectionLabel>
        <Card>
          <FormField
            value={label}
            onChangeText={setLabel}
            placeholder={t('agent.namePlaceholder')}
            returnKeyType="done"
            maxLength={40}
          />
        </Card>
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

        <SectionLabel>{t('agent.canChange')}</SectionLabel>
        <Card>
          <Choice
            on={!editTimeline}
            icon="eye-outline"
            title={t('agent.readOnlyTitle')}
            text={t('agent.readOnlyText')}
            onPress={() => setEditTimeline(false)}
          />
          <View style={styles.separator} />
          <Choice
            on={editTimeline}
            icon="create-outline"
            title={t('agent.readEditTitle')}
            text={t('agent.readEditText')}
            onPress={() => setEditTimeline(true)}
          />
        </Card>
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
  mono: { fontFamily: 'Menlo', fontSize: FontSize.caption1, color: Colors.text },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    marginTop: 8,
  },
  secondaryText: { ...Typography.label, fontWeight: '600' },
  caption: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
});
