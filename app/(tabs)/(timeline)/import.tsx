import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';
import { FloatingBubbles } from '../../../components/FloatingBubbles';
import { Flag } from '../../../components/Flag';
import { showToast } from '../../../lib/toast';
import { useTranslation } from '../../../contexts/LanguageContext';
import {
  commitImport,
  getExistingTripsForDedup,
  importFromImage,
  takePendingImportImages,
  type ImportCandidate,
  type ImportResult,
} from '../../../lib/tripImport';
import { track } from '../../../lib/analytics';
import { EmptyState } from '../../../components/EmptyState';
import { appLocale } from '../../../lib/i18n/locale';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

type Step = 'parsing' | 'review' | 'committing';

interface PickedImage {
  uri: string;
  base64: string;
}

interface ParseProgress {
  index: number;
  status: 'pending' | 'ok' | 'empty' | 'error';
}

export default function ImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>('parsing');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [progress, setProgress] = useState<ParseProgress[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);

  // Swiping the sheet down unmounts the screen without going through
  // handleClose, so the parsing loop checks this flag instead. Without it the
  // remaining images would still be sent to the AI (and billed) and state
  // would be set on an unmounted component.
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const cancelAndClose = useCallback(() => {
    cancelledRef.current = true;
    router.back();
  }, [router]);

  const handleClose = useCallback(() => {
    if (step === 'parsing' || step === 'committing') {
      Alert.alert(t('tlImport.cancelImportTitle'), t('tlImport.cancelImportBody'), [
        { text: t('tlImport.keepGoing'), style: 'cancel' },
        { text: t('common.cancel'), style: 'destructive', onPress: cancelAndClose },
      ]);
      return;
    }
    cancelAndClose();
  }, [step, cancelAndClose]);

  const runParsing = useCallback(async (picked: PickedImage[]) => {
    setStep('parsing');
    setProgress(picked.map((_, i) => ({ index: i, status: 'pending' })));
    setCandidates([]);
    setResults([]);

    const existing = await getExistingTripsForDedup();
    if (cancelledRef.current) return;

    const allCandidates: ImportCandidate[] = [];
    const allResults: ImportResult[] = [];

    // Sequential parsing to give a clear per-image progress feel and avoid rate limits
    for (let i = 0; i < picked.length; i++) {
      const { result, candidates: cs } = await importFromImage(picked[i].base64, i, existing);
      // The request itself cannot be aborted, but once the sheet is gone its
      // result is dropped and no further images are sent.
      if (cancelledRef.current) return;
      allCandidates.push(...cs);
      allResults.push(result);
      setProgress((prev) =>
        prev.map((p) =>
          p.index === i
            ? {
                ...p,
                status: result.status,
              }
            : p,
        ),
      );
      setCandidates([...allCandidates]);
      setResults([...allResults]);
    }

    // Small breath, then transition
    await new Promise((r) => setTimeout(r, 400));
    if (cancelledRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep('review');
  }, []);

  const toggleCandidate = useCallback((id: string) => {
    Haptics.selectionAsync();
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    );
  }, []);

  const removeCandidate = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleAllCandidates = useCallback((selected: boolean) => {
    Haptics.selectionAsync();
    setCandidates((prev) => prev.map((c) => ({ ...c, selected })));
  }, []);

  const handleConfirm = useCallback(async () => {
    const toInsert = candidates.filter((c) => c.selected);
    if (toInsert.length === 0) {
      showToast(t('tlImport.pickAtLeastOne'), 'error');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('committing');
    try {
      const inserted = await commitImport(toInsert);
      if (inserted > 0) track({ name: 'trip_added', props: { method: 'import', count: inserted } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // brief success then close. If the sheet was already swiped away,
      // router.back() would pop the screen underneath it instead.
      setTimeout(() => {
        if (!cancelledRef.current) router.back();
        setTimeout(() => {
          showToast(inserted === 1 ? t('comp.importAddedOne') : t('comp.importAdded', { n: inserted }));
        }, 300);
      }, 600);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(t('comp.importFailed', { msg: err?.message ?? String(err) }), 'error');
      if (!cancelledRef.current) setStep('review');
    }
  }, [candidates, router]);

  const selectedCount = useMemo(() => candidates.filter((c) => c.selected).length, [candidates]);

  // Pick up images that were chosen before the sheet was opened, kick off parsing.
  useEffect(() => {
    const pending = takePendingImportImages();
    if (!pending || pending.length === 0) {
      // No images, shouldn't normally happen. Just close the sheet.
      router.back();
      return;
    }
    setImages(pending);
    runParsing(pending);
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('tlImport.close')}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          ),
        }}
      />

      {/* Content */}
      {step === 'parsing' && <ParsingStep images={images} progress={progress} />}
      {step === 'review' && (
        <ReviewStep
          candidates={candidates}
          results={results}
          imageCount={images.length}
          onToggle={toggleCandidate}
          onRemove={removeCandidate}
          onToggleAll={toggleAllCandidates}
        />
      )}
      {step === 'committing' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.committingText}>{t('tlImport.savingTimeline')}</Text>
        </View>
      )}

      {/* Bottom action */}
      {step === 'review' && (
        <Glass
          {...glassProps}
          style={[styles.bottomBar, !hasGlass && styles.bottomBarFallback]}
        >
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomCount}>{selectedCount}</Text>
            <Text style={styles.bottomLabel}>
              {selectedCount === 1 ? t('tlImport.tripSelected') : t('tlImport.tripsSelected')}
            </Text>
          </View>
          <Pressable
            onPress={handleConfirm}
            disabled={selectedCount === 0}
            style={({ pressed }) => [
              styles.confirmBtn,
              selectedCount === 0 && styles.confirmBtnDisabled,
              pressed && styles.confirmBtnPressed,
            ]}
          >
            <Text style={styles.confirmBtnText}>{t('tlImport.addToTimeline')}</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </Pressable>
        </Glass>
      )}
    </View>
  );
}

// ─── Step 1: Parsing ──────────────────────────────────────────────────────────

function ParsingStep({ images, progress }: { images: PickedImage[]; progress: ParseProgress[] }) {
  const { t } = useTranslation();
  const doneCount = progress.filter((p) => p.status !== 'pending').length;
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <View
      style={parsingStyles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
    >
      {size.w > 0 && <FloatingBubbles width={size.w} height={size.h} />}
      <View style={parsingStyles.foreground} pointerEvents="none">
        <Text style={parsingStyles.title}>{t('tlImport.readingScreenshots')}</Text>
        <View style={parsingStyles.progressRow}>
          <ActivityIndicator size="small" color={Colors.textSecondary} />
          <Text style={parsingStyles.subtitle}>
            {t('tlImport.processed', { done: doneCount, total: images.length })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const parsingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  foreground: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  title: {
    ...Typography.titleLarge,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: { ...Typography.bodySmall, fontSize: FontSize.subheadline, color: Colors.textSecondary, textAlign: 'center' },
});

// ─── Step 2: Review ───────────────────────────────────────────────────────────

function ReviewStep({
  candidates,
  results,
  imageCount,
  onToggle,
  onRemove,
  onToggleAll,
}: {
  candidates: ImportCandidate[];
  results: ImportResult[];
  imageCount: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
}) {
  const { t } = useTranslation();
  const errored = results.filter((r) => r.status === 'error').length;
  const empty = results.filter((r) => r.status === 'empty').length;
  const allSelected = candidates.length > 0 && candidates.every((c) => c.selected);

  // Group candidates by Month Year, sorted newest first
  const sections = useMemo(() => {
    const map = new Map<
      string,
      { title: string; sortKey: string; items: ImportCandidate[] }
    >();
    for (const c of candidates) {
      const d = new Date(c.startDate);
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const title = d.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' });
      if (!map.has(sortKey)) map.set(sortKey, { title, sortKey, items: [] });
      map.get(sortKey)!.items.push(c);
    }
    return Array.from(map.values())
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .map((s) => ({
        ...s,
        items: [...s.items].sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
        ),
      }));
  }, [candidates]);

  if (candidates.length === 0) {
    return (
      <EmptyState
        icons={[{ name: 'image', color: '#A6B4C2' }, { name: 'search', color: '#4DC1FF' }, { name: 'airplane', color: '#A6B4C2' }]}
        title={t('tlImport.noTripsFound')}
        subtitle={imageCount === 1 ? t('tlImport.noTripsBodyOne') : t('tlImport.noTripsBodyMany')}
      />
    );
  }

  return (
    <ScrollView
      style={reviewStyles.scrollView}
      contentContainerStyle={reviewStyles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={reviewStyles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={reviewStyles.headerTitle}>
            {candidates.length === 1 ? t('tlImport.tripsFoundOne', { count: candidates.length }) : t('tlImport.tripsFoundMany', { count: candidates.length })}
          </Text>
          <Text style={reviewStyles.headerSub}>
            {imageCount === 1 ? t('tlImport.acrossOne') : t('tlImport.acrossMany', { count: imageCount })}
          </Text>
        </View>
        <Pressable
          onPress={() => onToggleAll(!allSelected)}
          hitSlop={8}
          style={({ pressed }) => [reviewStyles.toggleAllBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={reviewStyles.toggleAllText}>
            {allSelected ? t('tlImport.deselectAll') : t('tlImport.selectAll')}
          </Text>
        </Pressable>
      </View>

      {(errored > 0 || empty > 0) && (
        <View style={reviewStyles.warnBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={reviewStyles.warnText}>
            {errored > 0 && t('tlImport.erroredCount', { count: errored })}
            {empty > 0 && t('tlImport.emptyCount', { count: empty })}
          </Text>
        </View>
      )}

      {sections.map((section) => (
        <View key={section.sortKey} style={reviewStyles.section}>
          <View style={reviewStyles.sectionHeader}>
            <Text style={reviewStyles.sectionTitle}>{section.title}</Text>
            <Text style={reviewStyles.sectionCount}>{section.items.length}</Text>
          </View>
          <View style={reviewStyles.sectionList}>
            {section.items.map((c, idx) => (
              <View key={c.id}>
                {idx > 0 && <View style={reviewStyles.divider} />}
                <CandidateRow
                  candidate={c}
                  onToggle={() => onToggle(c.id)}
                  onRemove={() => onRemove(c.id)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={reviewStyles.footHint}>
        Need to fix something? Add it now, then edit on the timeline.
      </Text>
    </ScrollView>
  );
}

function CandidateRow({
  candidate,
  onToggle,
  onRemove,
}: {
  candidate: ImportCandidate;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { t, countryName } = useTranslation();
  const start = new Date(candidate.startDate);
  const end = candidate.endDate ? new Date(candidate.endDate) : null;
  const fmtShort = (d: Date) => d.toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' });
  const dateRange = end ? `${fmtShort(start)} – ${fmtShort(end)}` : `${fmtShort(start)} – ${t('tlImport.present')}`;
  const days = end
    ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
    : null;
  const dup = candidate.duplicateOfTripId !== null;
  const isActive = !end;

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        rowStyles.row,
        candidate.selected && rowStyles.rowSelected,
        dup && rowStyles.rowDup,
        pressed && rowStyles.rowPressed,
      ]}
    >
      <View style={dup && rowStyles.dimmedFlag}>
        <Flag code={candidate.countryCode} size={18} />
      </View>
      <View style={rowStyles.body}>
        <View style={rowStyles.titleRow}>
          <Text style={[rowStyles.city, dup && rowStyles.dimmed]} numberOfLines={1}>
            {candidate.city}
          </Text>
          {isActive && (
            <View style={rowStyles.nowPill}>
              <Text style={rowStyles.nowPillText}>{t('tlImport.now')}</Text>
            </View>
          )}
        </View>
        <Text style={[rowStyles.meta, dup && rowStyles.dimmed]} numberOfLines={1}>
          {countryName(candidate.country)} · {dateRange}
          {dup && t('tlImport.alreadyInTimeline')}
        </Text>
      </View>
      {days !== null && (
        <View style={rowStyles.daysWrap}>
          <Text style={[rowStyles.daysValue, dup && rowStyles.dimmed]}>{days}</Text>
          <Text style={[rowStyles.daysUnit, dup && rowStyles.dimmed]}>d</Text>
        </View>
      )}
      <Pressable onPress={onRemove} hitSlop={10} style={rowStyles.removeBtn} accessibilityRole="button" accessibilityLabel={t('tlImport.removeTrip')}>
        <Ionicons name="close" size={18} color={Colors.textTertiary} />
      </Pressable>
    </Pressable>
  );
}

const reviewStyles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 140 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  headerTitle: {
    ...Typography.titleLarge,
    letterSpacing: -0.4,
  },
  headerSub: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  toggleAllBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  toggleAllText: { ...Typography.bodySmall, fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.primary },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '12',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  warnText: { ...Typography.bodySmall, color: Colors.warning, flex: 1 },
  section: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  sectionTitle: { ...Typography.sectionLabel },
  sectionCount: { ...Typography.bodySmall, color: Colors.textTertiary },
  sectionList: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 50,
  },
  footHint: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: Colors.primary + '08' },
  rowSelected: { backgroundColor: Colors.primary + '0E' },
  rowDup: { opacity: 0.6 },
  dimmed: { color: Colors.textTertiary },
  // The flag is an image inside a View, so it cannot be dimmed with `color`
  // the way the text rows are. It was set to `dimmed` too, which silently did
  // nothing: duplicates showed a full-strength flag next to greyed-out text.
  dimmedFlag: { opacity: 0.4 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  city: { ...Typography.titleSmall, flexShrink: 1 },
  meta: { ...Typography.bodySmall, color: Colors.textSecondary },
  nowPill: {
    backgroundColor: Colors.success + '22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  nowPillText: { fontSize: FontSize.caption2, fontWeight: '700', color: Colors.success, letterSpacing: 0.3 },
  daysWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
    minWidth: 36,
    justifyContent: 'flex-end',
  },
  daysValue: { fontSize: FontSize.title3, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  daysUnit: { ...Typography.caption, fontWeight: '600' },
  removeBtn: { padding: 4, marginLeft: 2 },
});

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  committingText: { ...Typography.bodySmall, fontSize: FontSize.subheadline, color: Colors.textSecondary },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderCurve: 'continuous',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  bottomBarFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bottomInfo: { paddingLeft: 6, flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  bottomCount: { ...Typography.titleLarge, fontSize: FontSize.title3 },
  bottomLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  confirmBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnPressed: { opacity: 0.85 },
  confirmBtnText: { ...Typography.button, color: Colors.white },
});
