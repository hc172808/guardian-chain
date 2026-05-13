import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useBlock, useTransactions } from "@/hooks/useApi";
import { TxRow } from "@/components/TxRow";
import { Shimmer } from "@/components/Shimmer";
import { GlowBadge } from "@/components/GlowBadge";
import { formatDistanceToNow } from "@/lib/utils";

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  return (
    <View style={[dr.row, { borderColor: colors.border }]}>
      <Text style={[dr.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[dr.value, { color: colors.foreground, fontFamily: mono ? "Inter_400Regular" : "Inter_500Medium" }]}
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 0.42 },
  value: { fontSize: 13, flex: 0.58, textAlign: "right" },
});

export default function BlockDetailScreen() {
  const { hash: rawId } = useLocalSearchParams<{ hash: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const block = useBlock(rawId ?? "");
  const txs = useTransactions(20);
  const blockTxs = txs.data?.filter((tx) => tx.blockNumber === block.data?.number) ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.navHeader, { paddingTop: topPad + 6, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Block Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {block.isLoading ? (
          <View style={{ gap: 12 }}>
            <Shimmer height={32} width="50%" />
            <Shimmer height={200} />
          </View>
        ) : !block.data ? (
          <View style={styles.notFound}>
            <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Block not found</Text>
          </View>
        ) : (
          <>
            <View style={styles.blockHeader}>
              <Text style={[styles.blockNum, { color: colors.primary }]}>
                #{block.data.number?.toLocaleString() ?? "—"}
              </Text>
              <GlowBadge label="Confirmed" variant="accent" />
            </View>

            <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DetailRow label="Hash" value={block.data.hash ?? "—"} mono />
              <DetailRow label="Parent Hash" value={block.data.parentHash ?? "—"} mono />
              <DetailRow label="Validator" value={block.data.validator ?? "—"} />
              <DetailRow label="Transactions" value={String(block.data.transactions ?? 0)} />
              <DetailRow label="Gas Used" value={block.data.gasUsed?.toLocaleString() ?? "—"} />
              <DetailRow label="Gas Limit" value={block.data.gasLimit?.toLocaleString() ?? "—"} />
              <DetailRow label="Size" value={block.data.size ? `${block.data.size.toLocaleString()} bytes` : "—"} />
              <DetailRow
                label="Time"
                value={block.data.timestamp ? formatDistanceToNow(block.data.timestamp * 1000) : "—"}
              />
            </View>

            {blockTxs.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Transactions ({blockTxs.length})
                </Text>
                {blockTxs.map((tx) => (
                  <TxRow key={tx.hash} tx={tx} onPress={() => router.push(`/tx/${tx.hash}`)} />
                ))}
              </>
            ) : null}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  blockNum: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  detailCard: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, overflow: "hidden" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  notFound: { paddingTop: 80, alignItems: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
