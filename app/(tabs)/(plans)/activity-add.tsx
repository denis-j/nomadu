import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { categoryIcon } from '../../../components/activities/visuals';
import { TextArea, TextRow } from '../../../components/accommodationForm';
import { FormField } from '../../../components/FormField';
import { CloudyButton } from '../../../components/CloudyButton';
import { GlassPill } from '../../../components/GlassPill';
import { MissingRoute } from '../../../components/MissingRoute';
import { Card, ChoiceRow, Hint, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { addActivity, getActivity, moveActivity, updateActivity, type LocalActivity } from '../../../lib/activities';
import { ACTIVITY_CATEGORIES, firstUrl, type ActivityCategory } from '../../../lib/activityModel';
import { importActivityLink, type ImportedActivity, type LinkImport } from '../../../lib/ai';
import { getJourneyWithLegs, parseDate, type JourneyLeg } from '../../../lib/database';
import { showToast } from '../../../lib/toast';
import { track } from '../../../lib/analytics';
import { useTranslation } from '../../../contexts/LanguageContext';

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
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={{ opacity: disabled ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel={t('common.save')}>
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
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const [legs, setLegs] = useState<JourneyLeg[]>([]);
  const [existing, setExisting] = useState<LocalActivity | null | undefined>(params.id ? undefined : null);

  useEffect(() => {
    if (params.journeyId) getJourneyWithLegs(Number(params.journeyId)).then((j) => setLegs(j?.legs ?? []));
  }, [params.journeyId]);
  useEffect(() => {
    if (params.id) getActivity(params.id).then((a) => setExisting(a && !a.deleted ? a : null));
  }, [params.id]);

  if (!params.journeySyncId) return <MissingRoute title={t('nav.thingsToDo')} message={t('documents.tripGone')} />;
  if (params.id && existing === null) return <MissingRoute title={t('nav.thingsToDo')} message={t('activities.notHere')} />;
  if (existing === undefined) return <Stack.Screen options={{ title: t('nav.edit') }} />;

  const defaultStop = params.stopSyncId ?? null;
  return params.mode === 'manual' || existing
    ? <ManualForm journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} existing={existing} />
    : <LinkAdd journeySyncId={params.journeySyncId} legs={legs} defaultStop={defaultStop} />;
}

// ─── Which stop ──────────────────────────────────────────────────────────────

/** The stops as choice rows, and "not placed yet" last. */
function StopChoices({ legs, value, onPick }: { legs: JourneyLeg[]; value: string | null; onPick: (id: string | null) => void }) {
  const { t } = useTranslation();
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
      <ChoiceRow title={t('activities.notPlacedYet')} subtitle={t('activities.somewhereDecide')} selected={value === null} onPress={() => onPick(null)} last />
    </Card>
  );
}

// ─── By hand, and editing ────────────────────────────────────────────────────

function ManualForm({ journeySyncId, legs, defaultStop, existing }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null; existing: LocalActivity | null }) {
  const { t } = useTranslation();
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
      showToast(t('plans.saved'));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('nav.edit') : t('activities.addSomething'), headerRight: () => <SaveButton onPress={save} disabled={saving || !title.trim()} /> }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={visaFormStyles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>{t('activities.what')}</SectionLabel>
        <Card>
          <FormField
            value={title}
            onChangeText={setTitle}
            placeholder={t('activities.whatPlaceholder')}
            autoFocus={!existing}
            returnKeyType="done"
          />
        </Card>

        {/* One row to swipe through, not a wall of twelve. */}
        <SectionLabel>{t('activities.kind')}</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindsScroll} contentContainerStyle={styles.kinds} keyboardShouldPersistTaps="handled">
          {ACTIVITY_CATEGORIES.map((c) => {
            const on = c === category;
            return (
              <GlassPill key={c} active={on} onPress={() => { Haptics.selectionAsync(); setCategory(c); }}>
                <View style={styles.pillInner}>
                  <Ionicons name={categoryIcon(c)} size={14} color={on ? Colors.white : Colors.text} />
                  <Text style={[styles.pillLabel, on && styles.pillLabelActive]}>{t(`activityCat.${c}`)}</Text>
                </View>
              </GlassPill>
            );
          })}
        </ScrollView>

        {legs.length > 1 && (
          <>
            <SectionLabel>{t('activities.onTheTrip')}</SectionLabel>
            <StopChoices legs={legs} value={stop} onPick={setStop} />
          </>
        )}

        <SectionLabel>{t('activities.where')}</SectionLabel>
        <Card>
          <TextRow label={t('plans.place')} value={place} onCommit={setPlace} live autoCapitalize="words" />
          <TextRow label={t('plans.address')} value={address} onCommit={setAddress} live />
          <TextRow label={t('activities.website')} value={url} onCommit={setUrl} live keyboardType="url" autoCapitalize="none" last />
        </Card>

        <SectionLabel>{t('plans.notes')}</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder={t('activities.notesPlaceholder')} last />
        </Card>
      </ScrollView>
    </>
  );
}

// ─── From a post ─────────────────────────────────────────────────────────────

/** 'guess' keeps what the post said per place; a stop id puts them all there; null leaves them unplaced. */
type Placement = 'guess' | string | null;

function LinkAdd({ journeySyncId, legs, defaultStop }: { journeySyncId: string; legs: JourneyLeg[]; defaultStop: string | null }) {
  const { t } = useTranslation();
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
    else showToast(t('activities.noLinkClipboard'), 'error');
  };

  const read = async () => {
    const link = firstUrl(url.trim());
    if (!link) {
      showToast(t('activities.pasteLinkError'), 'error');
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
      showToast(err?.message ?? t('activities.couldNotReadPost'), 'error');
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
      const city = cityOf(p.item.stop_id) ?? cityOf(defaultStop) ?? t('activities.notPlaced');
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return [...counts].map(([city, n]) => (picks.length > 1 ? `${city} · ${n}` : city)).join(', ');
  })();

  const save = async () => {
    if (!result || saving) return;
    const items = keepPost
      ? [{ title: result.caption?.split('\n')[0]?.slice(0, 100) || result.author || t('activities.savedPost'), category: 'other' as ActivityCategory, place: null, address: null, stop_id: null, notes: result.caption }]
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
      showToast(items.length === 1 ? t('plans.saved') : t('activities.countSaved', { count: items.length }));
    } catch (err: any) {
      showToast(err?.message ?? t('plans.couldNotSave'), 'error');
      setSaving(false);
    }
  };

  return (
    <>
      {/* A link needs half a screen; the places found need the whole one. */}
      <Stack.Screen options={{ title: result ? t('activities.foundInPost') : t('activities.fromPost'), sheetAllowedDetents: result ? [0.9, 1.0] : [0.46] }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={result ? visaFormStyles.content : styles.linkContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!result ? (
          <>
            <SectionLabel>{t('plans.link')}</SectionLabel>
            <Card>
              <FormField
                value={url}
                onChangeText={setUrl}
                placeholder={t('activities.linkPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={read}
                trailing={url ? (
                  <Pressable onPress={() => setUrl('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('activities.clear')}>
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
              />
            </Card>
            <Hint>{t('activities.linkHint')}</Hint>

            <View style={styles.footer}>
              <CloudyButton onPress={read} disabled={reading || !url.trim()} style={styles.cta} innerStyle={styles.ctaInner}>
                {reading ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
                <Text style={styles.ctaText}>{reading ? t('activities.readingPost') : t('activities.findPlaces')}</Text>
              </CloudyButton>
            </View>
          </>
        ) : (
          <>
            <SectionLabel>{t('activities.thePost')}</SectionLabel>
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
              <Hint>{t('activities.noPlacesHint')}</Hint>
            ) : (
              <>
                <SectionLabel>{picks.length === 1 ? t('activities.onePlaceFound') : t('activities.placesFound', { count: picks.length })}</SectionLabel>
                <Card>
                  {picks.map((p, i) => (
                    <ChoiceRow
                      key={`${p.item.title}-${i}`}
                      title={p.item.title}
                      subtitle={[t(`activityCat.${p.item.category}`), p.item.place && p.item.place !== p.item.title ? p.item.place : null].filter(Boolean).join(' · ')}
                      selected={p.on}
                      onPress={() => setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      last={i === picks.length - 1}
                    />
                  ))}
                </Card>
                <Hint>{t('activities.tapToLeaveOut')}</Hint>
              </>
            )}

            {legs.length > 0 && (
              <>
                <SectionLabel>{t('activities.onTheTrip')}</SectionLabel>
                <Card>
                  {!keepPost && picks.some((p) => p.item.stop_id) && (
                    <ChoiceRow title={t('activities.wherePostSays')} subtitle={guessLine} selected={placement === 'guess'} onPress={() => setPlacement('guess')} />
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
                  <ChoiceRow title={t('activities.notPlacedYet')} selected={placement === null} onPress={() => setPlacement(null)} last />
                </Card>
              </>
            )}

            <View style={styles.footer}>
              <CloudyButton onPress={save} disabled={saving || (!keepPost && chosen.length === 0)} style={styles.cta} innerStyle={styles.ctaInner}>
                {saving ? <ActivityIndicator color={Colors.cloudyButtonText} /> : null}
                <Text style={styles.ctaText}>{keepPost ? t('activities.keepAsIdea') : chosen.length === 1 ? t('activities.saveOnePlace') : t('activities.saveCountPlaces', { count: chosen.length })}</Text>
              </CloudyButton>
              <Pressable onPress={() => { setResult(null); setPicks([]); }} style={styles.secondary}>
                <Text style={styles.secondaryText}>{t('activities.anotherLink')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({

  kindsScroll: { marginHorizontal: -20 },
  kinds: { paddingHorizontal: 20, gap: 8 },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillLabel: { ...Typography.label, fontWeight: '600' },
  pillLabelActive: { color: Colors.white },

  // The link step alone: no room kept for a tab bar the half sheet never meets.
  linkContent: { padding: 20, gap: 14, paddingBottom: 28 },
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
