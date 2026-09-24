import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { httpsCallable } from 'firebase/functions';
import { CloudyButton } from '../../../components/CloudyButton';
import { Card, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { auth, functions } from '../../../lib/firebase';
import { showToast } from '../../../lib/toast';

interface AgentToken {
  id: string;
  label: string;
  prefix: string;
  edit_timeline: boolean;
  created_at: string | null;
  last_used_at: string | null;
}

const cacheKey = () => `@agent_tokens_${auth.currentUser?.uid ?? 'anon'}`;

/**
 * Who is connected and what they can do. Connecting happens in a sheet of
 * its own, so this screen never holds a key; it only lists what the server
 * knows and refreshes when the sheet closes.
 */
export default function AgentAccessScreen() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentToken[] | null>(null);

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

  // The last known list renders straight away, so coming back to this screen
  // does not flash a spinner and then reflow. The network refreshes it after,
  // and again every time the connect sheet closes.
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(cacheKey()).then((raw) => {
        if (raw) setAgents((prev) => prev ?? JSON.parse(raw));
      }).catch(() => {});
      load();
    }, [load]),
  );

  const connect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(settings)/agent-connect' as any);
  };

  const remove = (t: AgentToken) => {
    Haptics.selectionAsync();
    Alert.alert(`Remove "${t.label}"?`, 'It loses access immediately. To connect it again, it needs a new key.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const fn = httpsCallable<{ id: string }, { ok: boolean }>(functions, 'revokeAgentToken');
            await fn({ id: t.id });
            load();
          } catch {
            showToast('Could not remove the agent', 'error');
          }
        },
      },
    ]);
  };

  const when = (iso: string) => {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return 'today';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const hasAgents = agents !== null && agents.length > 0;

  const connectButton = (
    <CloudyButton onPress={connect} style={{ width: '100%' }} innerStyle={{ justifyContent: 'center' }}>
      <Text style={styles.ctaText}>{hasAgents ? 'Connect another agent' : 'Connect an agent'}</Text>
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
                  <Text style={styles.agentMeta} numberOfLines={1}>
                    {[t.edit_timeline ? 'edits timeline' : 'read only', t.last_used_at ? `last used ${when(t.last_used_at)}` : 'not used yet'].join('  ·  ')}
                  </Text>
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
        <Can icon="create-outline" title="Fix your timeline, if you allow it" text="Add a stay the tracker missed, correct dates, remove a wrong one. You choose this when connecting." />
        <View style={styles.separator} />
        <Can icon="lock-closed-outline" title="Not your documents" text="Tickets, visas and bookings stay on this phone." muted />
      </Card>
    </>
  );

  // With nobody connected yet the screen explains first and asks last. Once
  // an agent is there, it and the button to add another sit at the top.
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content}>
      {hasAgents || agents === null ? (
        <>
          {agentList}
          {connectButton}
          {canDo}
        </>
      ) : (
        <>
          {canDo}
          {connectButton}
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
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
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
