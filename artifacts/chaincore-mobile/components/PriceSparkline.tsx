import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

interface PriceSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

function buildPath(data: number[], w: number, h: number): string {
  if (!data || data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = h * 0.1;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx} ${prev.y} ${cx} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildFillPath(data: number[], w: number, h: number): string {
  const line = buildPath(data, w, h);
  if (!line) return "";
  const last = data[data.length - 1];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = h * 0.1;
  const lastY = h - pad - ((last - min) / range) * (h - pad * 2);
  return `${line} L ${w} ${h} L 0 ${h} Z`;
}

export function PriceSparkline({ data, width = 200, height = 60, positive = true }: PriceSparklineProps) {
  const colors = useColors();
  const strokeColor = positive ? colors.neonEmerald : colors.destructive;
  const gradId = `grad_${positive ? "pos" : "neg"}`;

  if (!data || data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const linePath = buildPath(data, width, height);
  const fillPath = buildFillPath(data, width, height);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={fillPath} fill={`url(#${gradId})`} />
      <Path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

interface PriceCardProps {
  price: number;
  change24h: number;
  priceHistory?: number[];
}

export function PriceCard({ price, change24h, priceHistory }: PriceCardProps) {
  const colors = useColors();
  const positive = change24h >= 0;
  const changeColor = positive ? colors.neonEmerald : colors.destructive;
  const fakeHistory = priceHistory ?? Array.from({ length: 24 }, (_, i) =>
    price * (1 + Math.sin(i * 0.5) * 0.05 - (positive ? 0 : 0.05))
  );

  return (
    <View style={[pcStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={pcStyles.header}>
        <View>
          <Text style={[pcStyles.label, { color: colors.mutedForeground }]}>GYD / USD</Text>
          <Text style={[pcStyles.price, { color: colors.foreground }]}>
            ${price?.toFixed(4) ?? "—"}
          </Text>
        </View>
        <View style={[pcStyles.changeBadge, { backgroundColor: changeColor + "22" }]}>
          <Text style={[pcStyles.changeText, { color: changeColor }]}>
            {positive ? "+" : ""}
            {change24h?.toFixed(2) ?? "0"}%
          </Text>
        </View>
      </View>
      <View style={pcStyles.chartArea}>
        <PriceSparkline data={fakeHistory} width={260} height={56} positive={positive} />
      </View>
    </View>
  );
}

const pcStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  price: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  changeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chartArea: {
    marginHorizontal: -4,
  },
});
