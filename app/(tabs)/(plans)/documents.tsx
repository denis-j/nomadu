import { useEffect, useLayoutEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PillRow } from '../../../components/PillRow';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useJourneyDocuments } from '../../../hooks/useJourneyDocuments';
import {
  addJourneyTraveller,
  deleteJourneyTraveller,
  JourneyDocument,
  JourneyTraveller,
  renameJourneyTraveller,
} from '../../../lib/database';
import { DocumentKind, documentUri, isImageMime, isPdfMime, kindMeta } from '../../../lib/documents';
import { parseDate } from '../../../lib/database';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

/** What a border desk usually asks for, offered as ready-made empty slots. */
const STARTER_KINDS: DocumentKind[] = ['ticket', 'visa', 'arrival', 'booking'];

/** 'all' or a traveller id. */
type Filter = 'all' | number;

/**
 * The wallet for one trip.
 *
 * Tiles, not rows: at a border desk you find "Anna's arrival card" by what it
 * looks like, and a boarding pass thumbnail is recognised faster than a line
 * of text. The pills at the top filter by traveller because that is the
 * question being asked at the desk: "and yours?"
 */
export default function DocumentsScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ journeyId: string; travellerId?: string }>();
  const journeyId = Number(params.journeyId);
  const { travellers, documents, loaded, refresh } = useJourneyDocuments(journeyId, { ensureSelf: true });
  const [filter, setFilter] = useState<Filter>(params.travellerId ? Number(params.travellerId) : 'all');

  // The first traveller is the user; ensureSelf creates it at sort order 0.
  const self = travellers[0];
  const current = filter === 'all' ? null : travellers.find((t) => t.id === filter) ?? null;
  useEffect(() => {
    if (filter !== 'all' && loaded && !current) setFilter('all');
  }, [filter, loaded, current]);

  const addDocument = (kind?: DocumentKind, travellerId?: number | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const preset = travellerId === undefined ? (current?.id ?? self?.id ?? null) : travellerId;
    router.push({
      pathname: '/(tabs)/(plans)/add-document',
      params: {
        journeyId: String(journeyId),
        ...(kind ? { kind } : {}),
        ...(preset !== null ? { travellerId: String(preset) } : {}),
      },
    });
  };

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <Pressable hitSlop={12} onPress={() => addDocument()}>
          <Ionicons name="add" size={26} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [nav, journeyId, filter, travellers]);

  const addTraveller = () => {
    Alert.prompt(
      'Who else is travelling?',
      'Their tickets and visas get their own tab.',
      async (name) => {
        const trimmed = (name ?? '').trim();
        if (!trimmed) return;
        const id = await addJourneyTraveller(journeyId, trimmed);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await refresh();
        setFilter(id);
      },
      'plain-text',
      undefined,
      'default',
    );
  };

  const renameTraveller = (t: JourneyTraveller) => {
    Alert.prompt(
      'Rename',
      undefined,
      async (name) => {
        const trimmed = (name ?? '').trim();
        if (!trimmed || trimmed === t.name) return;
        await renameJourneyTraveller(t.id, trimmed);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
      },
      'plain-text',
      t.name,
    );
  };

  const removeTraveller = (t: JourneyTraveller) => {
    Alert.alert(`Remove ${t.name}?`, 'Their documents stay, just without a name on them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteJourneyTraveller(t.id);
          setFilter('all');
          refresh();
        },
      },
    ]);
  };

  // Long press on a pill, like on a trip card. "You" can be renamed to your
  // actual name but never removed: it is your trip.
  const travellerMenu = (t: JourneyTraveller) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const removable = t.id !== self?.id;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t.name,
        options: removable ? ['Rename', 'Remove from trip', 'Cancel'] : ['Rename', 'Cancel'],
        destructiveButtonIndex: removable ? 1 : undefined,
        cancelButtonIndex: removable ? 2 : 1,
      },
      (i) => {
        if (i === 0) renameTraveller(t);
        else if (removable && i === 1) removeTraveller(t);
      },
    );
  };

  const openDocument = (d: JourneyDocument) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/(tabs)/(plans)/document', params: { id: String(d.id) } });
  };

  const isShared = (d: JourneyDocument) => !travellers.some((t) => t.id === d.traveller_id);

  // "All": one section per traveller, shared documents last.
  const groups: { key: string; title: string | null; docs: JourneyDocument[] }[] = [];
  if (current) {
    const docs = documents.filter((d) => d.traveller_id === current.id || isShared(d));
    if (docs.length) groups.push({ key: `t${current.id}`, title: null, docs });
  } else {
    for (const t of travellers) {
      const docs = documents.filter((d) => d.traveller_id === t.id);
      if (docs.length) groups.push({ key: `t${t.id}`, title: t.name, docs });
    }
    const shared = documents.filter(isShared);
    if (shared.length) groups.push({ key: 'shared', title: 'Everyone', docs: shared });
  }
  const empty = loaded && groups.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Documents' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <PillRow
          options={[
            { key: 'all', label: 'All', active: filter === 'all', onPress: () => setFilter('all') },
            ...travellers.map((t) => ({
              key: `t${t.id}`,
              label: t.name,
              active: filter === t.id,
              onPress: () => setFilter(t.id),
              onLongPress: () => travellerMenu(t),
            })),
            { key: 'add', label: 'Add', icon: 'person-add-outline', onPress: addTraveller },
          ]}
        />

        {empty ? (
          <Starter traveller={current} onPick={(kind) => addDocument(kind)} />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.group}>
              {g.title && (
                <View style={styles.groupHead}>
                  <View style={[styles.groupAvatar, g.key === 'shared' && styles.groupAvatarShared]}>
                    {g.key === 'shared'
                      ? <Ionicons name="people" size={11} color={Colors.text} />
                      : <Text style={styles.groupAvatarText}>{g.title.trim().charAt(0).toUpperCase()}</Text>}
                  </View>
                  <Text style={styles.groupTitle}>{g.title}</Text>
                </View>
              )}
              <View style={styles.grid}>
                {g.docs.map((d, i) => (
                  <DocumentTile
                    key={d.id}
                    doc={d}
                    // In a traveller's tab a group booking needs saying so.
                    note={current && isShared(d) ? 'Everyone' : null}
                    // Live PDF previews are web views; a handful is fine, a wall is not.
                    preview={i < 8}
                    onPress={() => openDocument(d)}
                  />
                ))}
              </View>
            </View>
          ))
        )}

      </ScrollView>
    </>
  );
}

function DocumentTile({
  doc,
  note,
  preview,
  onPress,
}: {
  doc: JourneyDocument;
  note: string | null;
  preview: boolean;
  onPress: () => void;
}) {
  const meta = kindMeta(doc.kind);
  const uri = documentUri(doc.file_name);
  const image = isImageMime(doc.mime);
  const pdf = isPdfMime(doc.mime);
  const added = parseDate(doc.created_at.slice(0, 10)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tileWrap, pressed && { opacity: 0.7 }]}>
      <Glass {...glassProps} style={[styles.tile, !hasGlass && styles.tileFallback]}>
        <View style={styles.thumb}>
          {image ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : pdf && preview ? (
            // The first page, as iOS draws it. Touches pass through to the tile.
            <WebView
              source={{ uri }}
              style={styles.thumbWeb}
              pointerEvents="none"
              scrollEnabled={false}
              originWhitelist={['*']}
              allowFileAccess
              allowFileAccessFromFileURLs
              allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/'))}
            />
          ) : (
            <Paper icon={meta.icon} color={meta.color} />
          )}
          <View style={[styles.kindPill, { backgroundColor: meta.color }]}>
            <Ionicons name={meta.icon} size={11} color="#fff" />
            <Text style={styles.kindPillText}>{meta.short}</Text>
          </View>
        </View>
        <View style={styles.tileText}>
          <Text style={styles.tileTitle} numberOfLines={1}>{doc.title}</Text>
          <Text style={styles.tileSub} numberOfLines={1}>{note ? `${note} · ` : ''}Added {added}</Text>
        </View>
      </Glass>
    </Pressable>
  );
}

/** A sheet of paper with faint lines, for files that have no preview. */
function Paper({ icon, color }: { icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={styles.paper}>
      <View style={styles.paperSheet}>
        {[0.7, 0.5, 0.8, 0.45, 0.6].map((w, i) => (
          <View key={i} style={[styles.paperLine, { width: `${w * 100}%` }]} />
        ))}
        <View style={[styles.paperIcon, { backgroundColor: color + '1A' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      </View>
    </View>
  );
}

/**
 * The empty state is the checklist: four dashed slots for what a border desk
 * asks for. Tapping one opens the add sheet with that kind already chosen.
 */
function Starter({ traveller, onPick }: { traveller: JourneyTraveller | null; onPick: (kind: DocumentKind) => void }) {
  const who = traveller && traveller.name !== 'You' ? `What ${traveller.name} needs` : 'What you need';
  return (
    <View style={styles.starter}>
      <View style={styles.starterHead}>
        <Text style={styles.starterTitle}>{who}</Text>
        <Text style={styles.starterSub}>
          Tap a slot to fill it. Photos, screenshots and PDFs all work.
        </Text>
      </View>
      <View style={styles.grid}>
        {STARTER_KINDS.map((kind) => {
          const meta = kindMeta(kind);
          return (
            <Pressable
              key={kind}
              onPress={() => onPick(kind)}
              style={({ pressed }) => [styles.tileWrap, styles.slot, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.slotIcon}>
                <Ionicons name={meta.icon} size={22} color={Colors.text} />
              </View>
              <Text style={styles.slotTitle}>{meta.label}</Text>
              <View style={styles.slotAdd}>
                <Ionicons name="add" size={14} color={Colors.textSecondary} />
                <Text style={styles.slotAddText}>Add</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 100, gap: 20 },

  group: { gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  groupAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarShared: { backgroundColor: Colors.surfaceSecondary },
  groupAvatarText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  groupTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tileWrap: { width: '48%', flexGrow: 1, maxWidth: '48.5%' },
  tile: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  tileFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // Portrait: boarding passes, eVisas and phone screenshots are all taller
  // than wide, and a landscape box showed a strip of each.
  thumb: { width: '100%', aspectRatio: 4 / 5, backgroundColor: Colors.surfaceSecondary, overflow: 'hidden' },
  thumbWeb: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.surfaceSecondary, opacity: 0.99 },
  kindPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  kindPillText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  tileText: { padding: 12, gap: 2 },
  tileTitle: { ...Typography.titleSmall, fontWeight: '600' },
  tileSub: { ...Typography.caption, color: Colors.textSecondary },
  paper: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 22 },
  paperSheet: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 6,
    padding: 14,
    gap: 9,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  paperLine: { height: 4, borderRadius: 2, backgroundColor: Colors.border },
  paperIcon: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  starter: { gap: 16 },
  starterHead: { gap: 4, paddingHorizontal: 4 },
  starterTitle: { ...Typography.titleMedium },
  starterSub: { ...Typography.bodySmall, color: Colors.textSecondary },
  slot: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
    minHeight: 150,
  },
  slotIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTitle: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  slotAdd: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  slotAddText: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },
});
