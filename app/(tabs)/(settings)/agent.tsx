import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { httpsCallable } from 'firebase/functions';
import { CloudyButton } from '../../../components/CloudyButton';
import { Card, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { agentSetupText } from '../../../lib/agentSetup';
import { auth, functions } from '../../../lib/firebase';
import { showToast } from '../../../lib/toast';

interface AgentToken {
  id: string;
  label: string;
  prefix: string;
  created_at: string | null;
  last_used_at: string | null;
}

const cacheKey = () => `@agent_tokens_${auth.currentUser?.uid ?? 'anon'}`;

/**
 * Connecting an AI agent.
 *
 * One button. It makes a token and hands back a text that already has the
 * token, the address of the API and what every request does, so the only
 * thing left is pasting that into the agent. Nobody here needs to know the
 * word "token"; the server keeps a hash of it and the text is shown once.
 * Documents stay on the phone.
 */
export default function AgentAccessScreen() {
  const [agents, setAgents] = useState<AgentToken[] | null>(null);
  const [fresh, setFresh] = useState<{ token: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The last known list renders straight away, so coming back to this screen
  // does not flash a spinner and then reflow. The network refreshes it after.
  useEffect(() => {
    AsyncStorage.getItem(cacheKey()).then((raw) => {
      if (raw) setAgents((prev) => prev ?? JSON.parse(raw));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const fn = httpsCallable<unknown, { tokens: AgentToken[] }>(functions, 'listAgentTokens');
      const res = await fn({});
      setAgents(res.data.tokens);
      AsyncStorage.setItem(cacheKey(), JSON.stringify(res.data.tokens)).catch(() => {});
    } catch {
      setAgents((prev) => prev ?? []);
      showToast('Could not load your agents', 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (value: string, what: string) => {
    // The clipboard module is native. A build from before it was added must
    // still work here, so its presence is checked without throwing; without
    // it, the share sheet gets the value to the same places.
    if (requireOptionalNativeModule('ExpoClipboard')) {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`${what} copied`);
    } else {
      await Share.share({ message: value });
    }
  };

  const connect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.prompt(
      'Name the agent',
      'So you can tell them apart later.',
      async (label) => {
        const trimmed = (label ?? '').trim();
        if (!trimmed) return;
        setBusy(true);
        try {
          const fn = httpsCallable<{ label: string }, { id: string; token: string; label: string }>(functions, 'createAgentToken');
          const res = await fn({ label: trimmed });
          setFresh({ token: res.data.token, label: res.data.label });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          load();
        } catch (err: any) {
          showToast(err?.message ?? 'Could not connect the agent', 'error');
        } finally {
          setBusy(false);
        }
      },
      'plain-text',
      'Hermes',
    );
  };

  const remove = (t: AgentToken) => {
    Haptics.selectionAsync();
    Alert.alert(`Remove "${t.label}"?`, 'It loses access immediately. To connect it again, it needs a new text.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const fn = httpsCallable<{ id: string }, { ok: boolean }>(functions, 'revokeAgentToken');
            await fn({ id: t.id });
            if (fresh && t.label === fresh.label) setFresh(null);
            load();
          } catch {
            showToast('Could not remove the agent', 'error');
          }
        },
      },
    ]);
  };

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never';

  const hasAgents = agents !== null && agents.length > 0;

  const connectButton = (
    <CloudyButton onPress={connect} style={{ width: '100%' }} innerStyle={{ justifyContent: 'center' }}>
      <Text style={styles.ctaText}>{busy ? 'Connecting…' : hasAgents ? 'Connect another agent' : 'Connect an agent'}</Text>
    </CloudyButton>
  );

  const agentList = (
    <>
      <SectionLabel>Connected agents</SectionLabel>
      <Card>
        {agents === null ? (
          <AgentSkeleton />
        ) : (
          agents.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={styles.separator} />}
              <View style={styles.agentRow}>
                <View style={styles.agentText}>
                  <Text style={styles.agentLabel}>{t.label}</Text>
                  <Text style={styles.agentMeta}>connected {when(t.created_at)}  ·  last used {when(t.last_used_at)}</Text>
                </View>
                <Pressable onPress={() => remove(t)} hitSlop={10} accessibilityLabel={`Remove ${t.label}`}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );

  const canDo = (
    <>
      <SectionLabel>What it can do</SectionLabel>
      <Card>
        <Can icon="time-outline" title="Look up where you have been" text="Every tracked stay with city, country and dates, for any period you ask about." />
        <View style={styles.separator} />
        <Can icon="stats-chart-outline" title="Count your days" text="Days away from home, countries, cities and stops, per year or all time." />
        <View style={styles.separator} />
        <Can icon="shield-checkmark-outline" title="Check visa and tax standing" text="Days allowed, used and left per destination, and your tax exposure per country." />
        <View style={styles.separator} />
        <Can icon="map-outline" title="Plan trips" text="Read, create, change and delete your plans. They show up in Plan after the next sync." />
        <View style={styles.separator} />
        <Can icon="lock-closed-outline" title="Not your documents" text="Tickets, visas and bookings stay on this phone, and it cannot change your timeline." muted />
      </Card>
    </>
  );

  // With nobody connected yet the screen explains first and asks last. Once
  // an agent is there, it and the button to add another sit at the top.
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content}>
      {fresh && (
        <>
          <SectionLabel>{`${fresh.label} is ready`}</SectionLabel>
          <Card>
            <View style={styles.freshBody}>
              <Text style={styles.freshText}>
                Paste this into {fresh.label}'s instructions, memory or system prompt. It tells the agent where your data is, how to sign in and what it can do.
              </Text>
              <View style={styles.preview}>
                <Text style={styles.previewText} numberOfLines={7}>{agentSetupText(fresh.token)}</Text>
                <View style={styles.previewFade} />
              </View>
              <CloudyButton onPress={() => copy(agentSetupText(fresh.token), 'Text')} style={{ width: '100%' }} innerStyle={{ justifyContent: 'center' }}>
                <View style={styles.ctaRow}>
                  <Ionicons name="copy-outline" size={18} color={Colors.cloudyButtonText} />
                  <Text style={styles.ctaText}>Copy for {fresh.label}</Text>
                </View>
              </CloudyButton>
              <Text style={styles.freshWarn}>Shown once. If it gets lost, remove {fresh.label} below and connect it again.</Text>
            </View>
          </Card>
          <Pressable onPress={() => setFresh(null)} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}>
            <Text style={styles.linkText}>Done, I have pasted it</Text>
          </Pressable>
        </>
      )}

      {hasAgents || agents === null ? (
        <>
          {agentList}
          {!fresh && connectButton}
          {canDo}
        </>
      ) : (
        <>
          {canDo}
          {!fresh && connectButton}
        </>
      )}
    </ScrollView>
  );
}

function Can({ icon, title, text, muted }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; muted?: boolean }) {
  return (
    <View style={styles.can}>
      <View style={[styles.canIcon, muted && styles.canIconMuted]}>
        <Ionicons name={icon} size={17} color={muted ? Colors.textTertiary : Colors.text} />
      </View>
      <View style={styles.canBody}>
        <Text style={[styles.rowTitle, muted && { color: Colors.textSecondary }]}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
    </View>
  );
}

/** Same height as an agent row, so the list does not jump when it arrives. */
function AgentSkeleton() {
  return (
    <View style={styles.agentRow}>
      <View style={[styles.agentText, { gap: 8 }]}>
        <View style={[styles.skeletonBar, { width: '40%', height: 14 }]} />
        <View style={[styles.skeletonBar, { width: '75%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  freshBody: { paddingVertical: 14, gap: 12 },
  freshText: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 19 },
  preview: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    padding: 12,
    overflow: 'hidden',
  },
  previewText: { fontFamily: 'Menlo', fontSize: 11, lineHeight: 15, color: Colors.text },
  previewFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 36,
    backgroundColor: Colors.surfaceSecondary, opacity: 0.85,
  },
  freshWarn: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  linkRow: { alignItems: 'center', paddingVertical: 4 },
  linkText: { ...Typography.label, fontWeight: '600', color: Colors.textSecondary },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 66 },
  agentText: { flex: 1, gap: 2 },
  agentLabel: { ...Typography.titleSmall, fontWeight: '500' },
  agentMeta: { ...Typography.caption, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  skeletonBar: { height: 10, borderRadius: 5, backgroundColor: Colors.border },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: -20 },
  can: { flexDirection: 'row', gap: 14, paddingVertical: 14, alignItems: 'flex-start' },
  canIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  canIconMuted: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  canBody: { flex: 1, gap: 3 },
  rowTitle: { ...Typography.titleSmall, fontWeight: '600' },
  rowText: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 19 },
});
