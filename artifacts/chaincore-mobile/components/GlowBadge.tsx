import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "accent" | "destructive" | "warning" | "muted";

interface GlowBadgeProps {
  label: string;
  variant?: Variant;
}

export function GlowBadge({ label, variant = "primary" }: GlowBadgeProps) {
  const colors = useColors();

  const colorMap: Record<Variant, { bg: string; text: string }> = {
    primary: { bg: colors.primary + "22", text: colors.primary },
    accent: { bg: colors.accent + "22", text: colors.accent },
    destructive: { bg: colors.destructive + "22", text: colors.destructive },
    warning: { bg: colors.warning + "22", text: colors.warning },
    muted: { bg: colors.muted, text: colors.mutedForeground },
  };

  const { bg, text } = colorMap[variant];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
