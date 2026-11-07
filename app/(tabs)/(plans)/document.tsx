import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';
import { getJourneyDocument, getJourneyTravellers, getJourneyWithLegs, JourneyDocument } from '../../../lib/database';
import { documentExists, documentUri, isImageMime, kindMeta } from '../../../lib/documents';
import { deleteDocumentEverywhere } from '../../../lib/documentSync';
import { reportError } from '../../../lib/monitoring';
import { showToast } from '../../../lib/toast';
import { MissingRoute } from '../../../components/MissingRoute';
import { parseSyncStamp } from '../../../lib/syncTime';
import { useTranslation } from '../../../contexts/LanguageContext';

/**
 * One document, full screen.
 *
 * Images render through expo-image; everything else goes to a WebView, which
 * on iOS shows PDFs natively. Share hands the file to the system sheet, which
 * is also how it gets to a companion's phone or a printer at the hotel desk.
 */
export default function DocumentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<JourneyDocument | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  // No such document (a made-up id, or deleted meanwhile): the screen showed
  // an empty page with working share and delete buttons.
  const [gone, setGone] = useState(!Number.isFinite(Number(params.id)));

  useEffect(() => {
    if (!Number.isFinite(Number(params.id))) return;
    getJourneyDocument(Number(params.id)).then(async (d) => {
      setDoc(d);
      if (!d) {
        setGone(true);
        return;
      }
      if (!documentExists(d.file_name)) setMissing(true);
      const travellers = await getJourneyTravellers(d.journey_id);
      setOwner(travellers.find((tv) => tv.id === d.traveller_id)?.name ?? (travellers.length > 1 ? t('documents.everyone') : null));
    });
  }, [params.id]);

  const share = async () => {
    if (!doc) return;
    Haptics.selectionAsync();
    if (!(await Sharing.isAvailableAsync())) {
      showToast(t('document.sharingUnavailable'), 'error');
      return;
    }
    await Sharing.shareAsync(documentUri(doc.file_name), { mimeType: doc.mime ?? undefined });
  };

  const remove = () => {
    if (!doc) return;
    Haptics.selectionAsync();
    Alert.alert(t('document.deleteTitle'), t('document.deleteBody', { title: doc.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          // A shared document goes from the cloud too, so the others lose it as well.
          // Only the phone is waited for; the cloud catches up when there is signal.
          try {
            const journey = await getJourneyWithLegs(doc.journey_id);
            await deleteDocumentEverywhere(doc, journey?.sync_id ?? null);
          } catch (err) {
            reportError(err, 'documents:delete');
            showToast(t('document.couldNotDelete'), 'error');
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          showToast(t('document.deleted'));
        },
      },
    ]);
  };

  const uri = doc ? documentUri(doc.file_name) : null;
  const meta = doc ? kindMeta(doc.kind) : null;

  if (gone) return <MissingRoute title={t('document.title')} message={t('document.gone')} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: doc?.title ?? '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable onPress={share} hitSlop={8} disabled={!doc || missing} accessibilityRole="button" accessibilityLabel={t('document.shareDocument')}>
                <Ionicons name="share-outline" size={22} color={Colors.text} />
              </Pressable>
              <Pressable onPress={remove} hitSlop={8} disabled={!doc} accessibilityRole="button" accessibilityLabel={t('document.deleteDocument')}>
                <Ionicons name="trash-outline" size={21} color={Colors.error} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        {!doc ? null : missing ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={Colors.textTertiary} />
            <Text style={styles.missingTitle}>{t('document.fileGone')}</Text>
            <Text style={styles.missingSub}>
              {t('document.fileGoneSub')}
            </Text>
          </View>
        ) : isImageMime(doc.mime) ? (
          // Pinch to zoom: at the gate the QR code has to be big.
          <ScrollView
            style={styles.image}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image source={{ uri: uri! }} style={styles.image} contentFit="contain" />
          </ScrollView>
        ) : (
          <WebView
            source={{ uri: uri! }}
            style={styles.web}
            originWhitelist={['*']}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowingReadAccessToURL={uri!.slice(0, uri!.lastIndexOf('/'))}
          />
        )}
        {doc && meta && !missing && (
          <View style={styles.caption}>
            <View style={[styles.kindPill, { backgroundColor: meta.color }]}>
              <Ionicons name={meta.icon} size={12} color="#fff" />
              <Text style={styles.kindPillText}>{t(`docKind.${doc.kind}Short`)}</Text>
            </View>
            <Text style={styles.captionText} numberOfLines={1}>
              {owner ? `${owner} · ` : ''}{t('document.addedCaption', { date: parseSyncStamp(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  image: { flex: 1 },
  zoomContent: { flex: 1 },
  web: { flex: 1, backgroundColor: Colors.background },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 12,
    // Clears the floating tab bar.
    paddingBottom: 96,
  },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  kindPillText: { fontSize: FontSize.caption2, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  captionText: { ...Typography.bodySmall, color: Colors.textSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  missingTitle: { ...Typography.titleSmall },
  missingSub: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center' },
});
