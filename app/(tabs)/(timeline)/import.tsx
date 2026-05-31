import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { FloatingBubbles } from '../../../components/FloatingBubbles';
import { Flag } from '../../../components/Flag';
import { showToast } from '../../../lib/toast';
import {
  commitImport,
  getExistingTripsForDedup,
  importFromImage,
  takePendingImportImages,
  type ImportCandidate,
  type ImportResult,
} from '../../../lib/tripImport';

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
  const router = useRouter();
  const [step, setStep] = useState<Step>('parsing');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [progress, setProgress] = useState<ParseProgress[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);

  const handleClose = useCallback(() => {
    if (step === 'parsing' || step === 'committing') {
      Alert.alert('Cancel import?', 'Your in-progress import will be discarded.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Cancel', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  }, [step, router]);

  const runParsing = useCallback(async (picked: PickedImage[]) => {
    setStep('parsing');
    setProgress(picked.map((_, i) => ({ index: i, status: 'pending' })));
    setCandidates([]);
    setResults([]);

    const existing = await getExistingTripsForDedup();

    const allCandidates: ImportCandidate[] = [];
    const allResults: ImportResult[] = [];

    // Sequential parsing to give a clear per-image progress feel and avoid rate limits
    for (let i = 0; i < picked.length; i++) {
      const { result, candidates: cs } = await importFromImage(picked[i].base64, i, existing);
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
      showToast('Pick at least one trip to import', 'error');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('committing');
    try {
      const inserted = await commitImport(toInsert);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // brief success then close
      setTimeout(() => {
        router.back();
        setTimeout(() => {
          showToast(`Added ${inserted} ${inserted === 1 ? 'trip' : 'trips'}`);
        }, 300);
      }, 600);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(`Import failed: ${err?.message ?? String(err)}`, 'error');
      setStep('review');
    }
  }, [candidates, router]);

  const selectedCount = useMemo(() => candidates.filter((c) => c.selected).length, [candidates]);

  // Pick up images that were chosen before the sheet was opened, kick off parsing.
  useEffect(() => {
    const pending = takePendingImportImages();
    if (!pending || pending.length === 0) {
      // No images — shouldn't normally happen. Just close the sheet.
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
            <Pressable onPress={handleClose} hitSlop={12}>
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
          <Text style={styles.committingText}>Saving to your timeline…</Text>
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
              {selectedCount === 1 ? 'trip selected' : 'trips selected'}
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
            <Text style={styles.confirmBtnText}>Add to Timeline</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </Pressable>
        </Glass>
      )}
    </View>
  );
}

// ─── Step 1: Parsing ──────────────────────────────────────────────────────────

function ParsingStep({ images, progress }: { images: PickedImage[]; progress: ParseProgress[] }) {
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
        <Text style={parsingStyles.title}>Reading your screenshots…</Text>
        <View style={parsingStyles.progressRow}>
          <ActivityIndicator size="small" color={Colors.textSecondary} />
          <Text style={parsingStyles.subtitle}>
            {doneCount} of {images.length} processed
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
  subtitle: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
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
      const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
      <ScrollView
        style={reviewStyles.scrollView}
        contentContainerStyle={reviewStyles.emptyContainer}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={reviewStyles.emptyIconWrap}>
          <Ionicons name="search" size={36} color={Colors.textTertiary} />
        </View>
        <Text style={reviewStyles.emptyTitle}>No trips found</Text>
        <Text style={reviewStyles.emptyText}>
          We couldn't read any trip information from {imageCount === 1 ? 'that screenshot' : 'those screenshots'}.
          Try clearer images, or add a trip manually.
        </Text>
      </ScrollView>
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
            {candidates.length} {candidates.length === 1 ? 'trip' : 'trips'} found
          </Text>
          <Text style={reviewStyles.headerSub}>
            across {imageCount} {imageCount === 1 ? 'screenshot' : 'screenshots'}
          </Text>
        </View>
        <Pressable
          onPress={() => onToggleAll(!allSelected)}
          hitSlop={8}
          style={({ pressed }) => [reviewStyles.toggleAllBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={reviewStyles.toggleAllText}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Text>
        </Pressable>
      </View>

      {(errored > 0 || empty > 0) && (
        <View style={reviewStyles.warnBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={reviewStyles.warnText}>
            {errored > 0 && `${errored} couldn't be read. `}
            {empty > 0 && `${empty} had no trip info.`}
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
  const start = new Date(candidate.startDate);
  const end = candidate.endDate ? new Date(candidate.endDate) : null;
  const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateRange = end ? `${fmtShort(start)} – ${fmtShort(end)}` : `${fmtShort(start)} – Present`;
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
      <View style={dup && rowStyles.dimmed}>
        <Flag code={candidate.countryCode} size={18} />
      </View>
      <View style={rowStyles.body}>
        <View style={rowStyles.titleRow}>
          <Text style={[rowStyles.city, dup && rowStyles.dimmed]} numberOfLines={1}>
            {candidate.city}
          </Text>
          {isActive && (
            <View style={rowStyles.nowPill}>
              <Text style={rowStyles.nowPillText}>Now</Text>
            </View>
          )}
        </View>
        <Text style={[rowStyles.meta, dup && rowStyles.dimmed]} numberOfLines={1}>
          {candidate.country} · {dateRange}
          {dup && ' · Already in timeline'}
        </Text>
      </View>
      {days !== null && (
        <View style={rowStyles.daysWrap}>
          <Text style={[rowStyles.daysValue, dup && rowStyles.dimmed]}>{days}</Text>
          <Text style={[rowStyles.daysUnit, dup && rowStyles.dimmed]}>d</Text>
        </View>
      )}
      <Pressable onPress={onRemove} hitSlop={10} style={rowStyles.removeBtn}>
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
  toggleAllText: { ...Typography.bodySmall, fontSize: 14, fontWeight: '600', color: Colors.primary },
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
  sectionTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    letterSpacing: 0.6,
  },
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { ...Typography.titleMedium, fontWeight: '600' },
  emptyText: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
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
  nowPillText: { fontSize: 11, fontWeight: '700', color: Colors.success, letterSpacing: 0.3 },
  daysWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
    minWidth: 36,
    justifyContent: 'flex-end',
  },
  daysValue: { fontSize: 19, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  daysUnit: { ...Typography.caption, fontWeight: '600' },
  removeBtn: { padding: 4, marginLeft: 2 },
});

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 14 : 18,
    paddingBottom: 4,
  },
  headerBtn: { padding: 4 },
  headerTitle: { ...Typography.buttonLarge },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  committingText: { ...Typography.bodySmall, fontSize: 14, color: Colors.textSecondary },
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
  bottomCount: { ...Typography.titleLarge, fontSize: 20 },
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
