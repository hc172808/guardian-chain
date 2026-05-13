import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { GlowBadge } from "@/components/GlowBadge";
import { truncateAddress } from "@/lib/utils";

const WALLET_KEY = "@chaincore_wallet_address";

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [address, setAddress] = useState<string | null>(null);
  const [inputAddress, setInputAddress] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(WALLET_KEY).then((val) => {
      setAddress(val);
      setLoading(false);
    });
  }, []);

  const handleConnect = async () => {
    const trimmed = inputAddress.trim();
    if (!trimmed || trimmed.length < 10) {
      Alert.alert("Invalid Address", "Please enter a valid wallet address.");
      return;
    }
    await AsyncStorage.setItem(WALLET_KEY, trimmed);
    setAddress(trimmed);
    setInputAddress("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDisconnect = async () => {
    await AsyncStorage.removeItem(WALLET_KEY);
    setAddress(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="loader" size={24} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 12, paddingBottom: botPad + 80 }]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>

        {address ? (
          <>
            {/* Connected card */}
            <View style={[styles.walletCard, { backgroundColor: colors.card, borderColor: colors.primary + "44" }]}>
              <View style={styles.walletCardTop}>
                <GlowBadge label="Connected" variant="accent" />
                <TouchableOpacity onPress={handleDisconnect}>
                  <Feather name="log-out" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.addressLabel, { color: colors.mutedForeground }]}>Wallet Address</Text>
              <Text style={[styles.address, { color: colors.primary }]} numberOfLines={2}>
                {address}
              </Text>
            </View>

            {/* Balances */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Balances</Text>
            <View style={styles.balanceGrid}>
              <BalanceCard token="GYD" amount="0.0000" colors={colors} accent={colors.primary} />
              <BalanceCard token="GYDS" amount="0.0000" colors={colors} accent={colors.neonEmerald} />
            </View>

            {/* Send */}
            <View style={[styles.sendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sendTitle, { color: colors.foreground }]}>Send Tokens</Text>
              <Text style={[styles.sendDesc, { color: colors.mutedForeground }]}>
                Connect through the web app to send transactions securely.
              </Text>
              <View style={[styles.sendInfo, { backgroundColor: colors.muted, borderRadius: 8 }]}>
                <Feather name="info" size={14} color={colors.neonCyan ?? colors.primary} />
                <Text style={[styles.sendInfoText, { color: colors.mutedForeground }]}>
                  Transactions require the full ChainCore web interface for security.
                </Text>
              </View>
            </View>
          </>
        ) : (
          /* Connect prompt */
          <View style={styles.connectSection}>
            <View style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="briefcase" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.connectTitle, { color: colors.foreground }]}>
              Track Your Wallet
            </Text>
            <Text style={[styles.connectDesc, { color: colors.mutedForeground }]}>
              Enter your GYDS wallet address to monitor balances and activity on ChainCore.
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.addressInput, { color: colors.foreground }]}
                value={inputAddress}
                onChangeText={setInputAddress}
                placeholder="0x... or GYDS wallet address"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, { backgroundColor: colors.primary }]}
              onPress={handleConnect}
              activeOpacity={0.85}
            >
              <Text style={[styles.connectBtnText, { color: colors.primaryForeground }]}>
                Connect Wallet
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface BalanceCardProps {
  token: string;
  amount: string;
  colors: ReturnType<typeof useColors>;
  accent: string;
}

function BalanceCard({ token, amount, colors, accent }: BalanceCardProps) {
  return (
    <View style={[bcStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[bcStyles.dot, { backgroundColor: accent + "33" }]}>
        <View style={[bcStyles.dotInner, { backgroundColor: accent }]} />
      </View>
      <Text style={[bcStyles.amount, { color: colors.foreground }]}>{amount}</Text>
      <Text style={[bcStyles.token, { color: accent }]}>{token}</Text>
    </View>
  );
}

const bcStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: "flex-start",
    gap: 6,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  amount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  token: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, gap: 14 },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  walletCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    gap: 8,
  },
  walletCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addressLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  address: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  balanceGrid: {
    flexDirection: "row",
    gap: 10,
  },
  sendCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sendTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sendDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  sendInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
  },
  sendInfoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  connectSection: {
    alignItems: "center",
    paddingTop: 40,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  connectTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  connectDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  inputRow: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addressInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  connectBtn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  connectBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
