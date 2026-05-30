import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface ColorSet {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

interface AnimatedGradientBackgroundProps {
  colorSets: ColorSet[];
  duration?: number;
  style?: any;
}

export default function AnimatedGradientBackground({
  colorSets,
  duration = 4000,
  style,
}: AnimatedGradientBackgroundProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration,
          useNativeDriver: false,
        }),
      ]).start(() => animate());
    };
    animate();
  }, [duration]);

  if (colorSets.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      {colorSets.map((colorSet, index) => (
        <Animated.View
          key={index}
          style={[
            styles.gradientLayer,
            index > 0 && styles.overlayLayer,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 1],
                outputRange: index === 0 ? [1, 0.8] : [0, 0.6],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={colorSet.colors}
            style={styles.gradient}
            start={colorSet.start || { x: 0, y: 0 }}
            end={colorSet.end || { x: 1, y: 1 }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientLayer: {
    flex: 1,
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
});
