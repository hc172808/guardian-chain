import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBlocks, useTransactions } from "@/hooks/useApi";
import { SearchBar } from "@/components/SearchBar";
import { BlockRow } from "@/components/BlockRow";
import { TxRow } from "@/components/TxRow";
import { RowShimmer } from "@/components/Shimmer";
import type { Block, Transaction } from "@/hooks/useApi";

type Tab = "blocks" | "transactions";

export default function ExplorerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("blocks");

  const blocks = useBlocks(40);
  const txs = useTransactions(40);

  const onRefresh = useCallback(() => {
    blocks.refetch();
    txs.refetch();
  }, [blocks, txs]);

  const filteredBlocks = query
    ? (blocks.data ?? []).filter(
        (b) =>
          b.hash?.toLowerCase().includes(query.toLowerCase()) ||
          String(b.number).includes(query)
      )
    : (blocks.data ?? []);

  const filteredTxs = query
    ? (txs.data ?? []).filter(
        (t) =>
          t.hash?.toLowerCase().includes(query.toLowerCase()) ||
          t.from?.toLowerCase().includes(query.toLowerCase()) ||
          t.to?.toLowerCase().includes(query.toLowerCase())
      )
    : (txs.data ?? []);

  const isLoading = activeTab === "blocks" ? blocks.isLoading : txs.isLoading;
  const isFetching = activeTab === "blocks" ? blocks.isFetching : txs.isFetching;

  const renderBlock = ({ item }: { item: Block }) => (
    <BlockRow block={item} onPress={() => router.push(`/block/${item.number}`)} />
  );

  const renderTx = ({ item }: { item: Transaction }) => (
    <TxRow tx={item} onPress={() => router.push(`/tx/${item.hash}`)} />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Explorer</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Block number, hash, address..."
        />
        <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(["blocks", "transactions"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, activeTab === t && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === t ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {t === "blocks" ? "Blocks" : "Transactions"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "blocks" ? (
        <FlatList<Block>
          data={filteredBlocks}
          keyExtractor={(b) => String(b.number)}
          renderItem={renderBlock}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filteredBlocks.length > 0}
          onRefresh={onRefresh}
          refreshing={isFetching}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ gap: 8 }}>
                <RowShimmer /><RowShimmer /><RowShimmer /><RowShimmer />
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {query ? "No blocks match your search" : "No blocks yet"}
                </Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList<Transaction>
          data={filteredTxs}
          keyExtractor={(tx) => tx.hash}
          renderItem={renderTx}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filteredTxs.length > 0}
          onRefresh={onRefresh}
          refreshing={isFetching}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ gap: 8 }}>
                <RowShimmer /><RowShimmer /><RowShimmer /><RowShimmer />
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {query ? "No transactions match" : "No transactions yet"}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  tabRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  emptyBox: { paddingVertical: 40, alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
