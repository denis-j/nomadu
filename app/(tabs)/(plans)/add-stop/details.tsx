import { useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Card, SectionLabel } from '../../../../components/visaForm';
import { TextArea } from '../../../../components/accommodationForm';
import { CityTips } from '../../../../components/MarkdownTips';
import { StopSummary } from '../../../../components/StopSummary';
import { TransportPicker } from '../../../../components/TransportPicker';
import { insertJourneyLeg, updateJourneyLeg, parseDate, type TransportType } from '../../../../lib/database';
import { forwardGeocode } from '../../../../lib/geocoding';
import { getCountryCode } from '../../../../utils/geography';
import { showToast } from '../../../../lib/toast';

type Params = {
  journeyId: string;
  country: string;
  city: string;
  start: string;
  end: string;
  legId?: string;
  transport?: string;
  notes?: string;
};

/**
 * Last step of adding a stop: how you get there and anything to remember.
 * Place and dates were chosen on the steps before and are only recapped;
 * the tips at the end are the same ones the stop's sheet shows later.
 */
export default function AddStopDetailsScreen() {
  const parentNav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { country, city } = params;
  const isEditing = !!params.legId;

  const startDate = parseDate(params.start);
  const endDate = parseDate(params.end);

  const [transport, setTransport] = useState<TransportType>((params.transport as TransportType) || 'flight');
  const [notes, setNotes] = useState(params.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const code = getCountryCode(country);
      const coords = await forwardGeocode(`${city}, ${country}`);
      const notesVal = notes.trim() || null;
      if (isEditing && params.legId) {
        await updateJourneyLeg(Number(params.legId), city, country, code, params.start, params.end, transport, notesVal, coords?.latitude, coords?.longitude);
      } else {
        await insertJourneyLeg(Number(params.journeyId), city, country, code, params.start, params.end, transport, notesVal, coords?.latitude, coords?.longitude);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      parentNav.getParent()?.goBack();
      showToast(isEditing ? 'Stop updated' : 'Stop added');
    } catch (err) {
      console.error('Failed to save leg:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Stop' : 'Stop Details',
          headerRight: () => (
            <Pressable onPress={handleSave} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Recap of the steps before */}
        <StopSummary city={city} country={country} start={startDate} end={endDate} />

        <SectionLabel>Getting there</SectionLabel>
        <TransportPicker value={transport} onChange={setTransport} />

        <SectionLabel>Notes</SectionLabel>
        <Card>
          <TextArea value={notes} onCommit={setNotes} live placeholder="Anything to remember about this stop" last />
        </Card>

        <SectionLabel>{`Tips for ${city}`}</SectionLabel>
        <Card>
          <View style={styles.tips}>
            <CityTips city={city} country={country} />
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 120 },
  tips: { paddingVertical: 14 },
});
