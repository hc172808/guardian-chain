import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

interface ShimmerProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Shimmer({ width = "100%", height = 18, borderRadius = 6, style }: ShimmerProps) {
  const colors = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.4, 0.8]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: colors.muted,
        },
        animStyle,
        style,
      ]}
    />
  );
}

export function StatCardShimmer() {
  const colors = useColors();
  return (
    <View style={[shimmerStyles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Shimmer width={60} height={10} />
      <Shimmer width={80} height={22} style={{ marginTop: 8 }} />
    </View>
  );
}

export function RowShimmer() {
  const colors = useColors();
  return (
    <View style={[shimmerStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Shimmer width={48} height={32} borderRadius={6} />
      <View style={shimmerStyles.rowInfo}>
        <Shimmer width="70%" height={14} />
        <Shimmer width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const shimmerStyles = StyleSheet.create({
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
});
