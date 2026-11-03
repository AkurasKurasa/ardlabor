import { useState } from "react";
import { Image, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { Btn, C, Eyebrow } from "./ui";
import type { Pt } from "@core/gapscan";

type Props = {
  uri: string;
  imageSize: { width: number; height: number };
  corners: Pt[]; // in image pixels
  onConfirm: (corners: Pt[]) => void;
  onRetake: () => void;
};

const HANDLE = 44;
type Drag = { i: number; start: Pt; x0: number; y0: number } | null;

/** Shows the captured frame with the 4 door corners as handles you can drag onto the exact corner. */
export default function CornerEditor({ uri, imageSize, corners, onConfirm, onRetake }: Props) {
  const [pts, setPts] = useState<Pt[]>(corners);
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [drag, setDrag] = useState<Drag>(null);

  // the image is shown with "contain" inside the box
  const scale = Math.min(box.w / imageSize.width, box.h / imageSize.height);
  const offX = (box.w - imageSize.width * scale) / 2;
  const offY = (box.h - imageSize.height * scale) / 2;
  const visible = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= imageSize.width && p[1] <= imageSize.height;

  const grant = (i: number) => (e: GestureResponderEvent) =>
    setDrag({ i, start: pts[i], x0: e.nativeEvent.pageX, y0: e.nativeEvent.pageY });
  const move = (e: GestureResponderEvent) => {
    if (!drag) return;
    const next: Pt = [drag.start[0] + (e.nativeEvent.pageX - drag.x0) / scale, drag.start[1] + (e.nativeEvent.pageY - drag.y0) / scale];
    setPts((old) => old.map((p, j) => (j === drag.i ? next : p)));
  };

  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={styles.fill}>
      <View style={styles.fill} onLayout={onLayout}>
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
        {pts.map((p, i) =>
          visible(p) ? (
            <View
              key={i}
              onStartShouldSetResponder={() => true}
              onResponderGrant={grant(i)}
              onResponderMove={move}
              onResponderRelease={() => setDrag(null)}
              style={[styles.handle, { left: offX + p[0] * scale - HANDLE / 2, top: offY + p[1] * scale - HANDLE / 2 }]}
            >
              <View style={styles.cross} />
              <View style={[styles.cross, { transform: [{ rotate: "90deg" }] }]} />
            </View>
          ) : null,
        )}
      </View>
      <View style={styles.bar}>
        <Eyebrow icon="vector-square-edit">Check the corners</Eyebrow>
        <Text style={styles.hint}>Drag each cross onto the exact corner of the door face. Corners outside the picture stay where AR put them.</Text>
        <View style={styles.row}>
          <Btn label="Retake" icon="camera-retake" kind="secondary" onPress={onRetake} />
          <Btn label="Measure gaps" icon="ruler" onPress={() => onConfirm(pts)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  handle: { position: "absolute", width: HANDLE, height: HANDLE, alignItems: "center", justifyContent: "center",
    borderRadius: HANDLE / 2, borderWidth: 2, borderColor: "#ffd60a", backgroundColor: "rgba(255,214,10,0.12)" },
  cross: { position: "absolute", width: HANDLE * 0.7, height: 2, backgroundColor: "#ffd60a" },
  bar: { padding: 18, gap: 12, backgroundColor: C.glass, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  hint: { color: C.sub, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: "row", gap: 12 },
});
