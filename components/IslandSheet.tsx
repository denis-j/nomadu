import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Config ───

const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };
const SPRING_CLOSE = { damping: 22, stiffness: 260, mass: 0.8 };
const SPRING_STACK = { damping: 18, stiffness: 180, mass: 0.9 };
const ANIM_MS = 280;
const DEPTH_SCALE_STEP = 0.04;
const DEPTH_Y_STEP = -14;

// ─── SheetLayer ───

export interface SheetLayerProps {
  visible: boolean;
  onClose: () => void;
  onBack?: () => void;
  title?: string;
  children?: React.ReactNode | ((searchQuery: string) => React.ReactNode);

  searchEnabled?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (query: string) => void;

  backgroundColor?: string;
  borderRadius?: number;

  snapPoint?: number;
  depth?: number;
}

export function SheetLayer({
  visible,
  onClose,
  onBack,
  title,
  children,
  searchEnabled = false,
  searchPlaceholder = 'Search...',
  onSearchChange,
  backgroundColor = '#FFFFFF',
  borderRadius = 24,
  snapPoint = 0.45,
  depth = 0,
}: SheetLayerProps) {
  const insets = useSafeAreaInsets();
  const sheetHeight = SCREEN_HEIGHT * snapPoint;
  const hideY = SCREEN_HEIGHT;
  const [searchQuery, setSearchQuery] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    onSearchChange?.(searchQuery);
  }, [searchQuery]);

  const translateY = useSharedValue(hideY);
  const stackScale = useSharedValue(1);
  const stackOffsetY = useSharedValue(0);
  const ctx = useSharedValue({ y: 0 });

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING);
    } else {
      translateY.value = withSpring(hideY, SPRING_CLOSE);
      setSearchQuery('');
    }
  }, [visible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardOffset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardOffset(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    stackScale.value = withSpring(1 - depth * DEPTH_SCALE_STEP, SPRING_STACK);
    stackOffsetY.value = withSpring(depth * DEPTH_Y_STEP, SPRING_STACK);
  }, [depth]);

  const close = () => { try { onClose(); } catch {} };

  const pan = Gesture.Pan()
    .enabled(depth === 0 && visible)
    .onStart(() => { ctx.value = { y: translateY.value }; })
    .onUpdate((e) => {
      const ny = ctx.value.y + e.translationY;
      if (ny >= 0) translateY.value = ny;
    })
    .onEnd((e) => {
      if (e.velocityY > 400 || translateY.value > sheetHeight * 0.25) {
        translateY.value = withSpring(hideY, SPRING_CLOSE);
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetAS = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value + stackOffsetY.value },
      { scale: stackScale.value },
    ],
  }));

  const childContent =
    typeof children === 'function' ? children(searchQuery) : children;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.sheet,
          {
            marginBottom: keyboardOffset > 0 ? keyboardOffset - insets.bottom + 12 : insets.bottom + 8,
            height: sheetHeight,
            backgroundColor,
            borderRadius,
          },
          sheetAS,
        ]}
        pointerEvents={depth === 0 ? 'auto' : 'none'}
      >
        <View style={styles.handle} />

        {title && (
          <View style={styles.header}>
            {onBack ? (
              <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <Ionicons name="chevron-back" size={20} color="#007AFF" />
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.title, onBack && { marginLeft: 12 }]}>{title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={close}>
              <Ionicons name="close" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        )}

        {searchEnabled && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={searchPlaceholder}
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#C7C7CC" />
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {childContent}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── SheetBackdrop ───

export interface SheetBackdropProps {
  visible: boolean;
  onPress: () => void;
  blurIntensity?: number;
}

export function SheetBackdrop({
  visible,
  onPress,
  blurIntensity = 80,
}: SheetBackdropProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: ANIM_MS });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.backdrop, animStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <BlurView intensity={blurIntensity} style={styles.blurView}>
        <TouchableOpacity style={styles.backdropTouchable} onPress={onPress} activeOpacity={1} />
      </BlurView>
    </Animated.View>
  );
}

// ─── Standalone IslandSheet (single sheet with its own Modal) ───

export interface IslandSheetProps extends SheetLayerProps {
  blurIntensity?: number;
  /** Render inline (no Modal) so the tab bar stays visible */
  inline?: boolean;
}

export function IslandSheet({ blurIntensity = 80, inline = false, ...props }: IslandSheetProps) {
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (props.visible) {
      setModalVisible(true);
    } else if (modalVisible) {
      const timer = setTimeout(() => setModalVisible(false), 350);
      return () => clearTimeout(timer);
    }
  }, [props.visible]);

  if (inline) {
    if (!modalVisible) return null;
    return (
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <SheetBackdrop visible={props.visible} onPress={props.onClose} blurIntensity={blurIntensity} />
        <SheetLayer {...props} />
      </GestureHandlerRootView>
    );
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={props.onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" />
        <SheetBackdrop visible={props.visible} onPress={props.onClose} blurIntensity={blurIntensity} />
        <SheetLayer {...props} />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  blurView: { flex: 1 },
  backdropTouchable: { flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: '#C6C6C8',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    padding: 0,
  },
  body: {
    flex: 1,
    padding: 20,
  },
});
