import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { categoryIcon } from '../../../components/activities/visuals';
import { TextArea, TextRow } from '../../../components/accommodationForm';
import { CloudyButton } from '../../../components/CloudyButton';
import { GlassPill } from '../../../components/GlassPill';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, ChoiceRow, Hint, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { addActivity, getActivity, moveActivity, updateActivity, type LocalActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS, firstUrl, type ActivityCategory } from '../../../lib/activityModel';
import { importActivityLink, type ImportedActivity, type LinkImport } from '../../../lib/ai';
import { getJourneyWithLegs, parseDate, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';

type Params = {
  mode: 'link' | 'manual';
  journeyId: string;
  journeySyncId: string;
  /** Opened from one stop: what is added lands there unless said otherwise. */
  stopSyncId?: string;
  /** An existing activity: the same form, filled in, and "Edit" on top. */
  id?: string;
};

const fmtShort = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * The system's own paste button where there is one (iOS 16+). Reading the
 * clipboard from code makes iOS ask "Allow paste?" every time; the system
 * button is the user's own tap and never asks.
 */
const Clipboard = requireOptionalNativeModule('ExpoClipboard')
  ? (require('expo-clipboard') as typeof import('expo-clipboard'))
  : null;
const PasteButton = Clipboard?.isPasteButtonAvailable ? Clipboard.ClipboardPasteButton : null;

/** The checkmark every form in the app saves with. */
function SaveButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={{ opacity: disabled ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel="Save">
      <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={systemColor('label')} weight="semibold" size={22} />
    </Pressable>
  );
}

/**
 * Adding to the things to do, as the other forms in the app: grey labels
 * over glass cards, a checkmark to save. From a post (paste the link, see
 * the places found in it, keep the ones you want) or by hand (a name, what
 * kind, where). Editing is the same form with the fields filled in.
 */
export default function ActivityAddSheet() {
  const params = useLocalSearchParams<Params>();
  const [legs, setLegs] = useState<JourneyLeg[]>([]);
  const [existing, setExisting] = useState<LocalActivity | null | undefined>(params.id ? undefined : null);

  useEffect(() => {
    if (params.journeyId) getJourneyWithLegs(Number(params.journeyId)).then((j) => setLegs(j?.legs ?? []));
  }, [params.journeyId]);
  useEffect(() => {
    if (params.id) getActivity(params.id).then((a) => setExisting(a && !a.deleted ? a : null));
  }, [params.id]);

  if (!params.journeySyncId) return <MissingRoute title="Things to do" message="This trip is no longer here." />;
  if (params.id && existing === null) return <MissingRoute title="Things to do" message="This is no longer here." />;
  if (existing === undefined) return <Stack.Screen options={{ title: 'Edit' }} />;

  const defaultStop = params.stopSyncId ?? null;
  return params.mode === 'manual' || existing
    ? <ManualForm journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} existing={existing} />
    : <LinkAdd journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} />;
}

// ─── Which stop ──────────────────────────────────────────────────────────────

/** The stops as choice rows, and "not placed yet" last. */
function StopChoices({ legs, value, onPick }: { legs: JourneyLeg[]; value: string | null; onPick: (id: string | null) => void }) {
  return (
    <Card>
      {legs.filter((l) => l.sync_id).map((l) => (
        <ChoiceRow
          key={l.sync_id}
          title={l.city}
          subtitle={`${fmtShort(l.start_date)} – ${fmtShort(l.end_date)}`}
          selected={value === l.sync_id}
          onPress={() => onPick(l.sync_id!)}
        />
      ))}
      <ChoiceRow title="Not placed yet" subtitle="Somewhere on this trip, to be decided" selected={value === null} onPress={() => onPick(null)} last />
    </Card>
  );
}

// ─── By hand, and editing ────────────────────────────────────────────────────

function ManualForm({ journeySyncId, legs, defaultStop, existing }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null; existing: LocalActivity | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<ActivityCategory>(existing?.category ?? 'sight');
  const [place, setPlace] = useState(existing?.place ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [stop, setStop] = useState<string | null>(existing ? existing.stop_id : defaultStop);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving || !title.trim()) return;
    setSaving(true);
    try {
      if (existing) {
        // A place renamed is looked up again: the old point was for the old name.
        const placeChanged = (place || null) !== existing.place || (address || null) !== existing.address;
        await updateActivity(existing.id, {
          title,
          category,
          place: place || null,
          address: address || null,
          url: url || null,
          notes: notes.trim() || null,
          ...(placeChanged && { latitude: null, longitude: null }),
        });
        if (stop !== existing.stop_id) await moveActivity(existing.id, stop);
      } else {
        await addActivity(journeySyncId, stop, { title, category, place: place || null, address: address || null, url: url || null, notes: notes.trim() || null, source: 'manual' });
        track({ name: 'activity_added', props: { source: 'manual' } });
      }
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
      <Stack.Screen options={{ title: existing ? 'Edit' : 'Add something to do', headerRight: () => <SaveButton onPress={save} disabled={saving || !title.trim()} /> }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>What</SectionLabel>
        <Card>
          <View style={styles.nameRow}>
            <View style={styles.nameBadge}>
              <Ionicons name={categoryIcon(category)} size={20} color={Colors.text} />
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What do you want to do?"
              placeholderTextColor={Colors.textTertiary}
              style={styles.nameInput}
              autoFocus={!existing}
              returnKeyType="done"
            />
          </View>
        </Card>

        {/* One row to swipe through, not a wall of twelve. */}
        <SectionLabel>Kind</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindsScroll} contentContainerStyle={styles.kinds} keyboardShouldPersistTaps="handled">
          {ACTIVITY_CATEGORIES.map((c) => {
            const on = c === category;
            return (
              <GlassPill key={c} active={on} onPress={() => { Haptics.selectionAsync(); setCategory(c); }}>
                <View style={styles.pillInner}>
                  <Ionicons name={categoryIcon(c)} size={14} color={on ? Colors.white : Colors.text} />
                  <Text style={[styles.pillLabel, on && styles.pillLabelActive]}>{ACTIVITY_CATEGORY_LABELS[c]}</Text>
                </View>
              </GlassPill>
            );
          })}
        </ScrollView>

        {legs.length > 1 && (
          <>
            <SectionLabel>On the trip</SectionLabel>
            <StopChoices legs={legs} value={stop} onPick={setStop} />
          </>
        )}

        <SectionLabel>Where</SectionLabel>
        <Card>
          <TextRow label="Place" value={place} onCommit={setPlace} live placeholder="Name of the place" autoCapitalize="words" />
          <TextRow label="Address" value={address} onCommit={setAddress} live placeholder="Street, area" />
          <TextRow label="Website" value={url} onCommit={setUrl} live placeholder="https://" keyboardType="url" autoCapitalize="none" last />
        </Card>

        <SectionLabel>Notes</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder="Opening hours, what to order, who told you" last />
        </Card>
      </ScrollView>
    </>
  );
}

// ─── From a post ─────────────────────────────────────────────────────────────

/** 'guess' keeps what the post said per place; a stop id puts them all there; null leaves them unplaced. */
type Placement = 'guess' | string | null;

function LinkAdd({ journeySyncId, legs, defaultStop }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<LinkImport | null>(null);
  const [picks, setPicks] = useState<{ item: ImportedActivity; on: boolean }[]>([]);
  const [placement, setPlacement] = useState<Placement>(defaultStop);
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
      setPicks(res.activities.map((item) => ({ item, on: true })));
      // Where the post put them, when it could; else where the page was opened from.
      setPlacement(res.activities.some((x) => x.stop_id) ? 'guess' : defaultStop);
    } catch (err: any) {
      showToast(err?.message ?? 'Could not read that post', 'error');
    } finally {
      setReading(false);
    }
  };

  const chosen = picks.filter((p) => p.on);
  const keepPost = picks.length === 0;
  const cityOf = (id: string | null) => legs.find((l) => l.sync_id === id)?.city ?? null;
  const stopFor = (item: ImportedActivity) => (placement === 'guess' ? item.stop_id ?? defaultStop : placement);
  // "Hamburg · 2, Lisbon · 1": what the post said, summed up for its choice row.
  const guessLine = (() => {
    const counts = new Map<string, number>();
    for (const p of picks) {
      const city = cityOf(p.item.stop_id) ?? cityOf(defaultStop) ?? 'Not placed';
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return [...counts].map(([city, n]) => (picks.length > 1 ? `${city} · ${n}` : city)).join(', ');
  })();

  const save = async () => {
    if (!result || saving) return;
    const items = keepPost
      ? [{ title: result.caption?.split('\n')[0]?.slice(0, 100) || result.author || 'Saved post', category: 'other' as ActivityCategory, place: null, address: null, stop_id: null, notes: result.caption }]
      : chosen.map((p) => p.item);
    if (items.length === 0) return;
    setSaving(true);
    try {
      for (const item of items) {
        await addActivity(journeySyncId, stopFor(item), {
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
      {/* A link needs half a screen; the places found need the whole one. */}
      <Stack.Screen options={{ title: result ? 'Found in the post' : 'From a post', sheetAllowedDetents: result ? [0.9, 1.0] : [0.46] }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={result ? visaFormStyles.content : styles.linkContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!result ? (
          <>
            <SectionLabel>Link</SectionLabel>
            <Card>
              <View style={styles.linkRow}>
                <Ionicons name="link" size={18} color={Colors.textTertiary} />
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="tiktok.com/@…"
                  placeholderTextColor={Colors.textTertiary}
                  style={styles.linkInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={read}
                />
                {url ? (
                  <Pressable onPress={() => setUrl('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
                    <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                  </Pressable>
                ) : PasteButton ? (
                  <PasteButton
                    onPress={(data) => { if (data.type === 'text') pasted(data.text); }}
                    acceptedContentTypes={['plain-text', 'url']}
                    displayMode="iconAndLabel"
                    cornerStyle="capsule"
                    backgroundColor={Colors.text}
                    foregroundColor={Colors.white}
                    style={styles.pasteSystem}
                  />
                ) : null}
              </View>
            </Card>
            <Hint>Copy the link in TikTok, Instagram or YouTube. Only the caption and the cover are read, never the video, and the places in it land on your stops.</Hint>

            <View style={styles.footer}>
              <CloudyButton onPress={read} disabled={reading || !url.trim()} style={styles.cta} innerStyle={styles.ctaInner}>
                {reading ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
                <Text style={styles.ctaText}>{reading ? 'Reading the post…' : 'Find the places'}</Text>
              </CloudyButton>
            </View>
          </>
        ) : (
          <>
            <SectionLabel>The post</SectionLabel>
            <Card>
              <View style={styles.postRow}>
                {result.image_url ? (
                  <Image source={{ uri: result.image_url }} style={styles.postCover} contentFit="cover" />
                ) : (
                  <View style={styles.postCoverEmpty}>
                    <Ionicons name="link" size={18} color={Colors.text} />
                  </View>
                )}
                <View style={styles.postText}>
                  {result.author ? <Text style={styles.postAuthor} numberOfLines={1}>{result.author}</Text> : null}
                  <Text style={styles.postCaption} numberOfLines={3}>{result.caption ?? result.source_url}</Text>
                </View>
              </View>
            </Card>

            {keepPost ? (
              <Hint>No places in the caption. Keep the post as an idea and fill it in later.</Hint>
            ) : (
              <>
                <SectionLabel>{picks.length === 1 ? 'One place found' : `${picks.length} places found`}</SectionLabel>
                <Card>
                  {picks.map((p, i) => (
                    <ChoiceRow
                      key={`${p.item.title}-${i}`}
                      title={p.item.title}
                      subtitle={[ACTIVITY_CATEGORY_LABELS[p.item.category], p.item.place && p.item.place !== p.item.title ? p.item.place : null].filter(Boolean).join(' · ')}
                      selected={p.on}
                      onPress={() => setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      last={i === picks.length - 1}
                    />
                  ))}
                </Card>
                <Hint>Tap one to leave it out.</Hint>
              </>
            )}

            {legs.length > 0 && (
              <>
                <SectionLabel>On the trip</SectionLabel>
                <Card>
                  {!keepPost && picks.some((p) => p.item.stop_id) && (
                    <ChoiceRow title="Where the post says" subtitle={guessLine} selected={placement === 'guess'} onPress={() => setPlacement('guess')} />
                  )}
                  {legs.filter((l) => l.sync_id).map((l) => (
                    <ChoiceRow
                      key={l.sync_id}
                      title={l.city}
                      subtitle={`${fmtShort(l.start_date)} – ${fmtShort(l.end_date)}`}
                      selected={placement === l.sync_id}
                      onPress={() => setPlacement(l.sync_id!)}
                    />
                  ))}
                  <ChoiceRow title="Not placed yet" selected={placement === null} onPress={() => setPlacement(null)} last />
                </Card>
              </>
            )}

            <View style={styles.footer}>
              <CloudyButton onPress={save} disabled={saving || (!keepPost && chosen.length === 0)} style={styles.cta} innerStyle={styles.ctaInner}>
                {saving ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
                <Text style={styles.ctaText}>{keepPost ? 'Keep as idea' : chosen.length === 1 ? 'Save 1 place' : `Save ${chosen.length} places`}</Text>
              </CloudyButton>
              <Pressable onPress={() => { setResult(null); setPicks([]); }} style={styles.secondary}>
                <Text style={styles.secondaryText}>Another link</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  nameBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: { ...Typography.titleSmall, fontWeight: '500', flex: 1, color: Colors.text, paddingVertical: 4 },

  kindsScroll: { marginHorizontal: -20 },
  kinds: { paddingHorizontal: 20, gap: 8 },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },

  // The link step alone: no room kept for a tab bar the half sheet never meets.
  linkContent: { padding: 20, gap: 14, paddingBottom: 28 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 56 },
  linkInput: { ...Typography.titleSmall, fontWeight: '400', flex: 1, color: Colors.text },
  // The system control needs room for its icon and word; squeezed, it draws a blank.
  pasteSystem: { width: 118, height: 36 },

  footer: { marginTop: 10, gap: 10 },
  cta: { width: '100%' },
  ctaInner: { justifyContent: 'center', flexDirection: 'row', gap: 8 },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  secondary: { alignSelf: 'center', paddingVertical: 6 },
  secondaryText: { ...Typography.titleSmall, color: Colors.textSecondary, fontWeight: '500' },

  postRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  postCover: { width: 44, height: 56, borderRadius: 10, backgroundColor: Colors.surfaceSecondary },
  postCoverEmpty: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postText: { flex: 1, gap: 2 },
  postAuthor: { ...Typography.titleSmall, fontWeight: '500' },
  postCaption: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
});
