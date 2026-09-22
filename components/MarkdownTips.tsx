import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { getCityTips } from '../lib/ai';

/**
 * The three tips for a city, as the model writes them: a bullet list with
 * a bold title on each line. The renderer understands just enough Markdown
 * for that (bold, italic, bullets, numbers, a heading or two) and nothing
 * more, so a stray token cannot turn into layout.
 */

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) {
      parts.push(<Text key={key++} style={styles.bold}>{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(<Text key={key++} style={styles.italic}>{match[3]}</Text>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownTips({ text }: { text: string }) {
  const elements = useMemo(() => {
    const result: React.ReactNode[] = [];
    let key = 0;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('### ')) {
        result.push(<Text key={key++} style={styles.h3}>{renderInline(trimmed.slice(4))}</Text>);
      } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        const slice = trimmed.startsWith('## ') ? 3 : 2;
        result.push(<Text key={key++} style={styles.h2}>{renderInline(trimmed.slice(slice))}</Text>);
      } else if (/^[-*•]\s/.test(trimmed)) {
        result.push(
          <View key={key++} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.body}>{renderInline(trimmed.slice(2))}</Text>
          </View>
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\.\s/)![1];
        result.push(
          <View key={key++} style={styles.bulletRow}>
            <Text style={styles.num}>{num}.</Text>
            <Text style={styles.body}>{renderInline(trimmed.replace(/^\d+\.\s/, ''))}</Text>
          </View>
        );
      } else {
        result.push(<Text key={key++} style={styles.body}>{renderInline(trimmed)}</Text>);
      }
    }
    return result;
  }, [text]);
  return <View style={styles.container}>{elements}</View>;
}

/** The tips for a city, fetched (or read from the cache) while a spinner holds the place. */
export function CityTips({ city, country }: { city: string; country: string }) {
  const [tips, setTips] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!city || !country) return;
    let live = true;
    setLoading(true);
    getCityTips(city, country)
      .then((t) => { if (live) setTips(t); })
      .catch(() => { if (live) setTips(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [city, country]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>Getting tips…</Text>
      </View>
    );
  }
  if (!tips) return <Text style={[styles.muted, styles.empty]}>No tips available</Text>;
  return <MarkdownTips text={tips} />;
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  h2: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 4 },
  h3: { fontSize: 14, fontWeight: '600', color: Colors.text, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20, color: Colors.text, flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bullet: { fontSize: 14, lineHeight: 20, color: Colors.textTertiary },
  num: { fontSize: 14, lineHeight: 20, color: Colors.textTertiary, fontVariant: ['tabular-nums'], width: 18 },
  centered: { paddingVertical: 8, alignItems: 'center', gap: 8 },
  muted: { ...Typography.bodySmall, color: Colors.textSecondary },
  empty: { ...Typography.body, color: Colors.textTertiary, textAlign: 'center' },
});
