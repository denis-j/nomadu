import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { categoryIcon } from '../../../components/activities/visuals';
import { TextArea, TextRow } from '../../../components/accommodationForm';
import { CloudyButton } from '../../../components/CloudyButton';
import { Card } from '../../../components/visaForm';
import { Dropdown } from '../../../components/Dropdown';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { addActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS, firstUrl, type ActivityCategory } from '../../../lib/activityModel';
import { importActivityLink, type ImportedActivity, type LinkImport } from '../../../lib/ai';
import { getJourneyWithLegs, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';

type Params = {
  mode: 'link' | 'manual';
  journeyId: string;
  journeySyncId: string;
  /** Opened from one stop: what is added lands there unless said otherwise. */
  stopSyncId?: string;
};

const NOT_PLACED = '__none__';

/**
 * The system's own paste button where there is one (iOS 16+). Reading the
 * clipboard from code makes iOS ask "Allow paste?" every time; the system
 * button is the user's own tap and never asks.
 */
const Clipboard = requireOptionalNativeModule('ExpoClipboard')
  ? (require('expo-clipboard') as typeof import('expo-clipboard'))
  : null;
const PasteButton = Clipboard?.isPasteButtonAvailable ? Clipboard.ClipboardPasteButton : null;

/**
 * Adding to the things to do, as a sheet: from a post (paste the link, see
 * the places found in its caption and cover, keep the ones you want) or by
 * hand (a title, what kind, where).
 */
export default function ActivityAddSheet() {
  const params = useLocalSearchParams<Params>();
  const [legs, setLegs] = useState<JourneyLeg[]>([]);

  useEffect(() => {
    if (params.journeyId) getJourneyWithLegs(Number(params.journeyId)).then((j) => setLegs(j?.legs ?? []));
  }, [params.journeyId]);

  const defaultStop = params.stopSyncId ?? null;
  return params.mode === 'manual'
    ? <ManualAdd journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} />
    : <LinkAdd journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} />;
}

// ─── Which stop ──────────────────────────────────────────────────────────────

function StopPicker({ legs, value, onPick, compact }: { legs: JourneyLeg[]; value: string | null; onPick: (id: string | null) => void; compact?: boolean }) {
  const name = legs.find((l) => l.sync_id === value)?.city ?? 'Not placed yet';
  return (
    <Dropdown
      right
      title="Which stop?"
      value={value ?? NOT_PLACED}
      options={[
        ...legs.filter((l) => l.sync_id).map((l) => ({ id: l.sync_id!, label: l.city })),
        { id: NOT_PLACED, label: 'Not placed yet' },
      ]}
      onPick={(id) => onPick(id === NOT_PLACED ? null : id)}
    >
      <View style={[styles.stopChip, compact && styles.stopChipCompact]}>
        <Ionicons name="location" size={compact ? 12 : 14} color={Colors.textSecondary} />
        <Text style={[styles.stopChipText, compact && styles.stopChipTextCompact]} numberOfLines={1}>{name}</Text>
        <Ionicons name="chevron-down" size={compact ? 11 : 13} color={Colors.textTertiary} />
      </View>
    </Dropdown>
  );
}

// ─── From a post ─────────────────────────────────────────────────────────────

function LinkAdd({ journeySyncId, legs, defaultStop }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<LinkImport | null>(null);
  const [picks, setPicks] = useState<{ item: ImportedActivity; on: boolean; stop: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  const pasted = (text: string) => {
    const found = firstUrl(text);
    if (found) setUrl(found);
    else showToast('No link on the clipboard', 'error');
  };

  const read = async () => {
    const link = firstUrl(url.trim());
    if (!link) {
      showToast('Paste the link to a post', 'error');
      return;
    }
    setReading(true);
    try {
      const stops = legs
        .filter((l) => l.sync_id)
        .map((l) => ({ id: l.sync_id!, city: l.city, country: l.country, start_date: l.start_date, end_date: l.end_date }));
      const res = await importActivityLink(link, stops);
      track({ name: 'activity_link_imported', props: { source: res.source, found: res.activities.length } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(res);
      setPicks(res.activities.map((item) => ({ item, on: true, stop: item.stop_id ?? defaultStop })));
    } catch (err: any) {
      showToast(err?.message ?? 'Could not read that post', 'error');
    } finally {
      setReading(false);
    }
  };

  const chosen = picks.filter((p) => p.on);
  const keepPost = picks.length === 0;

  const save = async () => {
    if (!result) return;
    const items = keepPost
      ? [{ item: { title: result.caption?.split('\n')[0]?.slice(0, 100) || result.author || 'Saved post', category: 'other' as ActivityCategory, place: null, address: null, stop_id: defaultStop, notes: result.caption }, stop: defaultStop }]
      : chosen.map((p) => ({ item: p.item, stop: p.stop }));
    if (items.length === 0) return;
    setSaving(true);
    try {
      for (const { item, stop } of items) {
        await addActivity(journeySyncId, stop, {
          title: item.title,
          category: item.category,
          place: item.place,
          address: item.address,
          notes: item.notes,
          source: result.source,
          source_url: result.source_url,
          image_url: result.image_url,
        });
      }
      track({ name: 'activity_added', props: { source: result.source } });
      router.back();
      showToast(items.length === 1 ? 'Saved' : `${items.length} saved`);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: result ? 'Found in the post' : 'From a post' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!result ? (
          <>
            <View style={styles.intro}>
              <View style={styles.logos}>
                {(['logo-tiktok', 'logo-instagram', 'logo-youtube'] as const).map((icon) => (
                  <View key={icon} style={styles.logo}>
                    <Ionicons name={icon} size={22} color={Colors.text} />
                  </View>
                ))}
              </View>
              <Text style={styles.introTitle}>Saw a place in a video?</Text>
              <Text style={styles.introText}>Copy the link in TikTok, Instagram or YouTube and paste it here. The places in it land on your stops.</Text>
            </View>

            <View style={styles.field}>
              <Ionicons name="link" size={18} color={Colors.textTertiary} />
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="tiktok.com/@…"
                placeholderTextColor={Colors.textTertiary}
                style={styles.fieldInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={read}
              />
              {url ? (
                <Pressable onPress={() => setUrl('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                </Pressable>
              ) : PasteButton ? (
                <PasteButton
                  onPress={(data) => { if (data.type === 'text') pasted(data.text); }}
                  acceptedContentTypes={['plain-text', 'url']}
                  displayMode="iconOnly"
                  cornerStyle="capsule"
                  backgroundColor={Colors.text}
                  foregroundColor={Colors.white}
                  style={styles.pasteSystem}
                />
              ) : null}
            </View>

            <CloudyButton onPress={read} disabled={reading || !url.trim()} style={styles.cta} innerStyle={styles.ctaInner}>
              {reading ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
              <Text style={styles.ctaText}>{reading ? 'Reading the post…' : 'Find the places'}</Text>
            </CloudyButton>
            <Text style={styles.fine}>Only the caption and the cover are read, never the video.</Text>
          </>
        ) : (
          <>
            <View style={styles.post}>
              {result.image_url ? <Image source={{ uri: result.image_url }} style={styles.postCover} /> : null}
              <View style={styles.postText}>
                {result.author ? <Text style={styles.postAuthor} numberOfLines={1}>{result.author}</Text> : null}
                {result.caption ? <Text style={styles.postCaption} numberOfLines={5}>{result.caption}</Text> : null}
              </View>
            </View>

            {keepPost ? (
              <View style={styles.nothing}>
                <Text style={styles.nothingTitle}>No places in the caption</Text>
                <Text style={styles.nothingText}>Keep the post as an idea and fill it in later.</Text>
              </View>
            ) : (
              <View style={styles.found}>
                <Text style={styles.foundTitle}>{picks.length === 1 ? '1 place' : `${picks.length} places`}</Text>
                {picks.map((p, i) => {
                  return (
                    <Pressable
                      key={`${p.item.title}-${i}`}
                      onPress={() => { Haptics.selectionAsync(); setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, on: !x.on } : x))); }}
                      style={[styles.place, !p.on && styles.placeOff]}
                    >
                      <View style={styles.placeBadge}>
                        <Ionicons name={categoryIcon(p.item.category)} size={20} color={Colors.text} />
                      </View>
                      <View style={styles.placeText}>
                        <Text style={styles.placeTitle} numberOfLines={2}>{p.item.title}</Text>
                        <StopPicker compact legs={legs} value={p.stop} onPick={(id) => setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, stop: id } : x)))} />
                      </View>
                      <Ionicons name={p.on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={p.on ? Colors.text : Colors.textTertiary} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            <CloudyButton onPress={save} disabled={saving || (!keepPost && chosen.length === 0)} style={styles.cta} innerStyle={styles.ctaInner}>
              {saving ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
              <Text style={styles.ctaText}>{keepPost ? 'Keep as idea' : chosen.length === 1 ? 'Save 1 place' : `Save ${chosen.length} places`}</Text>
            </CloudyButton>
            <Pressable onPress={() => { setResult(null); setPicks([]); }} style={styles.secondary}>
              <Text style={styles.secondaryText}>Another link</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── By hand ─────────────────────────────────────────────────────────────────

function ManualAdd({ journeySyncId, legs, defaultStop }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('sight');
  const [place, setPlace] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [stop, setStop] = useState<string | null>(defaultStop);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      showToast('Give it a name', 'error');
      return;
    }
    setSaving(true);
    try {
      await addActivity(journeySyncId, stop, { title, category, place: place || null, url: url || null, notes: notes || null, source: 'manual' });
      track({ name: 'activity_added', props: { source: 'manual' } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      showToast('Saved');
    } catch (err: any) {
      showToast(err?.message ?? 'Could not save', 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add something to do' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.nameRow}>
          <View style={styles.nameBadge}>
            <Ionicons name={categoryIcon(category)} size={24} color={Colors.text} />
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What do you want to do?"
            placeholderTextColor={Colors.textTertiary}
            style={styles.nameInput}
            autoFocus
            multiline
            returnKeyType="done"
            blurOnSubmit
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindsScroll} contentContainerStyle={styles.kinds}>
          {ACTIVITY_CATEGORIES.map((c) => {
            const on = c === category;
            return (
              <Pressable key={c} onPress={() => { Haptics.selectionAsync(); setCategory(c); }} style={[styles.kind, on && styles.kindOn]}>
                <Ionicons name={categoryIcon(c)} size={15} color={on ? Colors.white : Colors.text} />
                <Text style={[styles.kindText, on && styles.kindTextOn]}>{ACTIVITY_CATEGORY_LABELS[c]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Card>
          <TextRow label="Place" value={place} onCommit={setPlace} live placeholder="Name of the place" autoCapitalize="words" />
          <TextRow label="Website" value={url} onCommit={setUrl} live placeholder="https://" keyboardType="url" autoCapitalize="none" />
          <TextArea value={notes} onCommit={setNotes} live placeholder="Notes" last />
        </Card>

        {legs.length > 0 && (
          <View style={styles.whereRow}>
            <Text style={styles.whereLabel}>On the trip</Text>
            <StopPicker legs={legs} value={stop} onPick={setStop} />
          </View>
        )}

        <CloudyButton onPress={save} disabled={saving || !title.trim()} style={styles.cta} innerStyle={styles.ctaInner}>
          {saving ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
          <Text style={styles.ctaText}>Save</Text>
        </CloudyButton>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 80 },

  intro: { alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 4 },
  logos: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  introTitle: { ...Typography.titleLarge, textAlign: 'center' },
  introText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
    height: 56,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  fieldInput: { ...Typography.bodyLarge, flex: 1, color: Colors.text },
  pasteSystem: { width: 44, height: 40 },

  cta: { width: '100%' },
  ctaInner: { justifyContent: 'center', flexDirection: 'row', gap: 8 },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  fine: { ...Typography.caption, color: Colors.textTertiary, textAlign: 'center' },
  secondary: { alignSelf: 'center', paddingVertical: 6 },
  secondaryText: { ...Typography.titleSmall, color: Colors.textSecondary, fontWeight: '500' },

  post: {
    flexDirection: 'row',
    gap: 14,
    padding: 12,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  postCover: { width: 84, height: 112, borderRadius: 14, backgroundColor: Colors.surfaceSecondary },
  postText: { flex: 1, gap: 4, paddingVertical: 2 },
  postAuthor: { ...Typography.titleSmall, fontWeight: '700' },
  postCaption: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },

  nothing: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  nothingTitle: { ...Typography.titleMedium },
  nothingText: { ...Typography.body, color: Colors.textSecondary },

  found: { gap: 10 },
  foundTitle: { ...Typography.titleMedium, paddingHorizontal: 4 },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  placeOff: { opacity: 0.5 },
  placeBadge: { width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  placeText: { flex: 1, gap: 6, alignItems: 'flex-start' },
  placeTitle: { ...Typography.titleSmall, fontWeight: '700' },

  stopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    maxWidth: 200,
  },
  stopChipCompact: { paddingVertical: 4, paddingHorizontal: 9, backgroundColor: Colors.surfaceSecondary, maxWidth: 170 },
  stopChipText: { ...Typography.label, fontWeight: '600', color: Colors.textSecondary, flexShrink: 1 },
  stopChipTextCompact: { ...Typography.caption, fontWeight: '600' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 },
  nameBadge: { width: 52, height: 52, borderRadius: 16, borderCurve: 'continuous', backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  nameInput: { ...Typography.titleLarge, flex: 1, color: Colors.text, paddingVertical: 4 },

  kindsScroll: { marginHorizontal: -20 },
  kinds: { paddingHorizontal: 20, gap: 8 },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: Colors.surface,
  },
  kindOn: { backgroundColor: Colors.text },
  kindText: { ...Typography.label, fontWeight: '600' },
  kindTextOn: { color: Colors.white },

  whereRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  whereLabel: { ...Typography.titleSmall, fontWeight: '500' },
});
