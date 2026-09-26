import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { CloudyButton } from '../../../components/CloudyButton';
import { Card, ChoiceRow, SectionLabel, visaFormStyles } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import {
  addJourneyDocument,
  addJourneyTraveller,
  ensureSelfTraveller,
  getJourneyWithLegs,
  JourneyTraveller,
  travellerLabel,
} from '../../../lib/database';
import { useAuth } from '../../../hooks/useAuth';
import { DOCUMENT_KINDS, DocumentKind, importDocumentFile, isImageMime, kindMeta } from '../../../lib/documents';
import { showToast } from '../../../lib/toast';
import { MissingRoute } from '../../../components/MissingRoute';
import { useJourneyExists } from '../../../hooks/useJourneyExists';

interface Picked {
  uri: string;
  name: string | null;
  mime: string | null;
}

/**
 * Add one document to a journey: where it comes from, what it is, whose it is.
 *
 * The file is copied into the app's own storage the moment it is saved, never
 * before: pickers hand out temporary URIs and a cancelled sheet should leave
 * nothing behind.
 */
/** Reachable by link: without a real trip there is nothing to show or add to. */
export default function AddDocumentScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const exists = useJourneyExists(Number(journeyId));
  if (exists === false) return <MissingRoute title="Add document" message="This trip is no longer here." />;
  return <AddDocumentScreenContent />;
}

function AddDocumentScreenContent() {
  const nav = useNavigation();
  // The wallet passes what it already knows: the slot that was tapped and
  // whose tab was open. Both are just defaults, still changeable here.
  const params = useLocalSearchParams<{ journeyId: string; kind?: string; travellerId?: string }>();
  const journeyId = Number(params.journeyId);
  const presetKind = params.kind ? kindMeta(params.kind).kind : 'ticket';
  const presetTraveller = params.travellerId ? Number(params.travellerId) : null;

  const { user } = useAuth();
  const [travellers, setTravellers] = useState<JourneyTraveller[]>([]);
  const [owner, setOwner] = useState<{ shared_owner_uid: string | null; shared_owner_name: string | null } | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocumentKind>(presetKind);
  const [travellerId, setTravellerId] = useState<number | null>(presetTraveller);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([ensureSelfTraveller(journeyId, user?.uid ?? null), getJourneyWithLegs(journeyId)]).then(([t, j]) => {
      setTravellers(t);
      setOwner(j?.shared_owner_uid ? { shared_owner_uid: j.shared_owner_uid, shared_owner_name: j.shared_owner_name } : null);
      // Default to oneself: the first traveller on an own trip, the one with
      // our account on a friend's.
      const mine = j?.shared_owner_uid ? t.find((x) => x.uid === user?.uid) : t[0];
      if (presetTraveller === null || !t.some((x) => x.id === presetTraveller)) setTravellerId(mine?.id ?? null);
    });
  }, [journeyId, presetTraveller, user?.uid]);

  const addTraveller = () => {
    Alert.prompt(
      'Who else is travelling?',
      undefined,
      async (name) => {
        const trimmed = (name ?? '').trim();
        if (!trimmed) return;
        const id = await addJourneyTraveller(journeyId, trimmed);
        setTravellers((prev) => [...prev, { id, journey_id: journeyId, name: trimmed, sort_order: prev.length, sync_id: null, uid: null }]);
        setTravellerId(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      'plain-text',
    );
  };

  const takePicked = (p: Picked) => {
    setPicked(p);
    // A sensible name to start from, the extension is noise here. The
    // Android photo picker names files by their media id ("19.png"), which
    // is no name at all.
    const stem = p.name?.replace(/\.[a-z0-9]+$/i, '') ?? '';
    if (!title.trim() && stem && !/^\d+$/.test(stem)) setTitle(stem);
  };

  const fromPhotos = async () => {
    Haptics.selectionAsync();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    takePicked({ uri: a.uri, name: a.fileName ?? null, mime: a.mimeType ?? 'image/jpeg' });
  };

  const fromCamera = async () => {
    Haptics.selectionAsync();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('Camera access is off in Settings', 'error');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    takePicked({ uri: a.uri, name: a.fileName ?? null, mime: a.mimeType ?? 'image/jpeg' });
  };

  const fromFiles = async () => {
    Haptics.selectionAsync();
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    takePicked({ uri: a.uri, name: a.name ?? null, mime: a.mimeType ?? null });
  };

  const missing = !picked ? 'Pick a file first' : !title.trim() ? 'Give it a name' : null;

  const save = async () => {
    if (saving) return;
    if (missing || !picked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast(missing ?? 'Form is incomplete', 'error');
      return;
    }
    setSaving(true);
    try {
      const fileName = importDocumentFile(picked.uri, picked.name);
      await addJourneyDocument({
        journey_id: journeyId,
        traveller_id: travellerId,
        kind,
        title: title.trim(),
        file_name: fileName,
        mime: picked.mime,
        uploader_uid: user?.uid ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast('Document added');
    } catch (err) {
      console.error('Failed to add document:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Could not save the document', 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add document' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={visaFormStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>File</SectionLabel>
        {picked ? (
          <Card>
            <View style={styles.pickedRow}>
              {isImageMime(picked.mime) ? (
                <Image source={{ uri: picked.uri }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumbIcon}>
                  <Ionicons name="document-text-outline" size={22} color={Colors.text} />
                </View>
              )}
              <View style={styles.pickedText}>
                <Text style={styles.pickedName} numberOfLines={1}>{picked.name ?? 'Photo'}</Text>
                <Text style={styles.pickedMime} numberOfLines={1}>{picked.mime ?? 'file'}</Text>
              </View>
              <Pressable onPress={() => setPicked(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove file">
                <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </Card>
        ) : (
          <Card>
            <SourceRow icon="images-outline" title="From Photos" subtitle="A screenshot or a photo you already have" onPress={fromPhotos} />
            <View style={styles.separator} />
            <SourceRow icon="folder-open-outline" title="From Files" subtitle="A PDF from Mail, Files or a download" onPress={fromFiles} />
            <View style={styles.separator} />
            <SourceRow icon="camera-outline" title="Take a photo" subtitle="A paper ticket or a stamp" onPress={fromCamera} />
          </Card>
        )}

        <SectionLabel>Name</SectionLabel>
        <Card>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="BER to KUL, eVisa, Arrival card …"
              placeholderTextColor={Colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              returnKeyType="done"
            />
          </View>
        </Card>

        <SectionLabel>What is it</SectionLabel>
        <Card>
          {DOCUMENT_KINDS.map((k, i) => (
            <ChoiceRow
              key={k.kind}
              title={k.label}
              selected={kind === k.kind}
              onPress={() => setKind(k.kind)}
              last={i === DOCUMENT_KINDS.length - 1}
            />
          ))}
        </Card>

        <SectionLabel>Whose is it</SectionLabel>
        <Card>
          {/* On a friend's trip only oneself and everyone: what the owner's
              wallet shows of one's documents is exactly that. */}
          {(owner ? travellers.filter((t) => t.uid === user?.uid) : travellers).map((t) => (
            <ChoiceRow
              key={t.id}
              title={travellerLabel(t, user?.uid ?? null, owner)}
              selected={travellerId === t.id}
              onPress={() => setTravellerId(t.id)}
            />
          ))}
          <ChoiceRow
            title="Everyone"
            subtitle="A booking that covers the whole group"
            selected={travellerId === null}
            onPress={() => setTravellerId(null)}
            last={!!owner}
          />
          {!owner && (
            <ChoiceRow
              title="Someone else"
              subtitle="Add a travel companion"
              selected={false}
              onPress={addTraveller}
              last
            />
          )}
        </Card>

        <View style={styles.footer}>
          <CloudyButton onPress={save} style={styles.cta} innerStyle={styles.ctaInner}>
            <Text style={styles.ctaText}>{saving ? 'Adding…' : 'Add document'}</Text>
          </CloudyButton>
          {missing && <Text style={styles.missing}>{missing}</Text>}
        </View>
      </ScrollView>
    </>
  );
}

function SourceRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.55 }]}>
      <View style={styles.thumbIcon}>
        <Ionicons name={icon} size={20} color={Colors.text} />
      </View>
      <View style={styles.pickedText}>
        <Text style={styles.pickedName}>{title}</Text>
        <Text style={styles.pickedMime}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 60 },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickedText: { flex: 1, gap: 1 },
  pickedName: { ...Typography.titleSmall, fontWeight: '500' },
  pickedMime: { ...Typography.bodySmall, color: Colors.textSecondary },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: -20 },
  inputRow: { paddingVertical: 16 },
  input: { ...Typography.titleSmall, fontWeight: '400' },
  footer: { marginTop: 10, gap: 10 },
  cta: { width: '100%' },
  ctaInner: { justifyContent: 'center' },
  ctaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },
  missing: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center' },
});
