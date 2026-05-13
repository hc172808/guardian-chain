import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Block } from "@/hooks/useApi";
import { formatDistanceToNow } from "@/lib/utils";

interface BlockRowProps {
  block: Block;
  onPress?: () => void;
}

export function BlockRow({ block, onPress }: BlockRowProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.heightBadge, { backgroundColor: colors.primary + "20" }]}>
        <Feather name="box" size={11} color={colors.primary} />
        <Text style={[styles.heightText, { color: colors.primary }]}>
          {block.number?.toLocaleString() ?? "—"}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.hash, { color: colors.foreground }]} numberOfLines={1}>
          {block.hash ? `${block.hash.slice(0, 14)}...` : "—"}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {block.transactions ?? 0} txs
          {block.validator ? ` · ${block.validator.slice(0, 8)}...` : ""}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {block.timestamp ? formatDistanceToNow(block.timestamp * 1000) : "—"}
        </Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginBottom: 8,
  },
  heightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  heightText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  hash: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
