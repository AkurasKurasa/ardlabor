import { useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { C, T } from "./ui";

export type Box = { x0: number; y0: number; x1: number; y1: number }; // screen points (dp), normalised

/** Drag a finger across the camera view to draw a box around the thing to fix. */
export default function BoxDraw({ box, onDraw, hint }: { box: Box | null; onDraw: (b: Box) => void; hint?: string }) {
  const [live, setLive] = useState<Box | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Box =>
    ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
  const pos = (e: GestureResponderEvent) => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });

  const shown = live ?? box;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => { const p = pos(e); setStart(p); setLive(norm(p, p)); }}
      onResponderMove={(e) => start && setLive(norm(start, pos(e)))}
      onResponderRelease={() => {
        if (live && live.x1 - live.x0 > 40 && live.y1 - live.y0 > 40) onDraw(live);
        setLive(null);
        setStart(null);
      }}
    >
      {shown && (
        <View pointerEvents="none" style={[s.box, { left: shown.x0, top: shown.y0, width: shown.x1 - shown.x0, height: shown.y1 - shown.y0 },
          live ? s.boxLive : null]}>
          {[s.tl, s.tr, s.br, s.bl].map((c, i) => <View key={i} style={[s.corner, c]} />)}
        </View>
      )}
      {hint && !shown && (
        <View pointerEvents="none" style={s.hintWrap}>
          <Text style={s.hint}>{hint}</Text>
        </View>
      )}
    </View>
  );
}

const K = 18;
const s = StyleSheet.create({
  box: { position: "absolute", borderWidth: 1, borderColor: "rgba(255,107,44,0.55)" },
  boxLive: { borderStyle: "dashed" },
  corner: { position: "absolute", width: K, height: K, borderColor: C.signal },
  tl: { left: -1, top: -1, borderLeftWidth: 2, borderTopWidth: 2 },
  tr: { right: -1, top: -1, borderRightWidth: 2, borderTopWidth: 2 },
  br: { right: -1, bottom: -1, borderRightWidth: 2, borderBottomWidth: 2 },
  bl: { left: -1, bottom: -1, borderLeftWidth: 2, borderBottomWidth: 2 },
  hintWrap: { position: "absolute", top: "46%", left: 0, right: 0, alignItems: "center" },
  hint: { color: C.text, ...T.body, textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
