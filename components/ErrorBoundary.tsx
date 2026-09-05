import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { reportError } from '../lib/monitoring';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a single bad screen does not take the whole app
 * down to a white screen.
 *
 * Deliberately placed above the navigator: anything thrown while rendering a
 * route lands here rather than unmounting the tree with no way back. The
 * error is reported first, then the user gets a restart they can actually
 * press. Nothing about the error is shown to them; the message can contain
 * internals, and there is nothing they could do with it anyway.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, `render:${info.componentStack?.split('\n')[1]?.trim() ?? 'unknown'}`);
  }

  private restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // reloadAsync is unavailable in Expo Go and bare dev clients without
      // expo-updates. Clearing the error at least re-renders the tree, which
      // recovers from a transient failure.
      this.setState({ error: null });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.iconBubble}>
          <Ionicons name="cloud-offline-outline" size={30} color={Colors.textSecondary} />
        </View>

        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Nomadu ran into an unexpected problem and needs to restart. Your trips are stored on
          this device and are safe.
        </Text>

        <Pressable
          onPress={this.restart}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Restart Nomadu"
        >
          <Text style={styles.buttonText}>Restart</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 14,
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    ...Typography.titleMedium,
    color: Colors.text,
    textAlign: 'center',
  },
  body: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 10,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontWeight: '700',
  },
});
