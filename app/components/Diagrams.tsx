import { StyleSheet, Text, View } from "react-native";
import type { Measurement, FixStep } from "@core/CabinetCore";
import { RULES } from "@core/CabinetCore";
import { C, Icon } from "./ui";

/** A small door with each gap reading placed where it was measured. */
export function DoorGapDiagram({ measurements, side }: { measurements: Measurement[]; side: "left" | "right" }) {
  const get = (id: string) => measurements.find((m) => m.id === id)?.mm ?? null;
  const W = 116, H = 168;
  const hingeLeft = side === "left";
  const chip = (id: string, style: object) => {
    const v = get(id);
    const t = RULES.gapTarget;
    const col = v === null ? C.faint : v >= t[0] && v <= t[1] ? C.ok : C.bad;
    return (
      <View key={id} style={[d.chip, { borderColor: col }, style]}>
        <Text style={[d.chipText, { color: col }]}>{v === null ? "—" : v.toFixed(1)}</Text>
      </View>
    );
  };
  const near = hingeLeft ? { left: 4 } : { right: 4 };
  const far = hingeLeft ? { right: 4 } : { left: 4 };
  const sideX = hingeLeft ? { right: -52 } : { left: -52 };
  return (
    <View style={d.wrap}>
      <View style={{ width: W, height: H }}>
        <View style={d.door}>
          <View style={[d.handle, hingeLeft ? { right: 10 } : { left: 10 }]} />
          {[0.12, 0.82].map((f) => (
            <View key={f} style={[d.hinge, { top: H * f }, hingeLeft ? { left: -3 } : { right: -3 }]} />
          ))}
        </View>
        {chip("gap_top_hinge", { top: -26, ...near })}
        {chip("gap_top_handle", { top: -26, ...far })}
        {chip("gap_side_top", { top: 14, ...sideX })}
        {chip("gap_side_bottom", { bottom: 14, ...sideX })}
        {chip("gap_bottom_hinge", { bottom: -26, ...near })}
        {chip("gap_bottom_handle", { bottom: -26, ...far })}
      </View>
      <Text style={d.caption}>mm · target {RULES.gapTarget[0]}–{RULES.gapTarget[1]}</Text>
    </View>
  );
}

/** Side view of a concealed (cup) hinge with the screw to turn highlighted. */
export function HingeDiagram({ screw }: { screw: FixStep["screw"] }) {
  return (
    <View style={h.wrap}>
      <View style={h.cabinet}><Text style={h.tag}>cabinet side</Text></View>
      <View style={h.plate} />
      <View style={h.arm} />
      <View style={h.door}><Text style={h.tag}>door</Text></View>
      <View style={h.cup} />
      <HingeScrew on={screw === "mounting" || screw === "height"} left={32} label="mount" />
      <HingeScrew on={screw === "depth"} left={92} label="depth" />
      <HingeScrew on={screw === "side"} left={148} label="side" />
    </View>
  );
}

function HingeScrew({ on, left, label }: { on: boolean; left: number; label: string }) {
  return (
    <View style={[h.screwWrap, { left }]}>
      <View style={[h.screw, on && h.screwOn]}>
        <View style={[h.slot, on && { backgroundColor: C.accentInk }]} />
      </View>
      <Text style={[h.label, on && { color: C.accent }]}>{label}</Text>
    </View>
  );
}

/** Big turn instruction. */
export function TurnBadge({ dir, quarters }: { dir: "cw" | "ccw"; quarters: number }) {
  return (
    <View style={t.badge}>
      <Icon name={dir === "cw" ? "rotate-right" : "rotate-left"} size={44} color={C.accentInk} />
      <Text style={t.amount}>{quarters >= 2 ? "½" : "¼"}</Text>
    </View>
  );
}

/** Before → after with how far each is from the target. */
export function VerifyStrip({ before, after, target }: { before: number; after: number; target: [number, number] }) {
  const err = (v: number) => (v < target[0] ? target[0] - v : v > target[1] ? v - target[1] : 0);
  const better = err(after) < err(before);
  const done = err(after) === 0;
  const col = done ? C.ok : better ? C.accent : C.bad;
  return (
    <View style={v.row}>
      <View style={v.cell}><Text style={v.num}>{before.toFixed(1)}</Text><Text style={v.cap}>before</Text></View>
      <Icon name="arrow-right" size={22} color={col} />
      <View style={v.cell}><Text style={[v.num, { color: col }]}>{after.toFixed(1)}</Text><Text style={v.cap}>now</Text></View>
      <View style={[v.cell, { marginLeft: "auto" }]}><Text style={v.target}>{target[0]}–{target[1]}</Text><Text style={v.cap}>target mm</Text></View>
    </View>
  );
}

const d = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 30, paddingBottom: 4, gap: 40 },
  door: { flex: 1, borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.04)" },
  handle: { position: "absolute", top: "45%", width: 4, height: 26, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.5)" },
  hinge: { position: "absolute", width: 6, height: 16, borderRadius: 2, backgroundColor: C.accent },
  chip: { position: "absolute", minWidth: 44, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1.5,
    backgroundColor: "#1c1c1e", alignItems: "center" },
  chipText: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  caption: { color: C.faint, fontSize: 12 },
});

const h = StyleSheet.create({
  wrap: { height: 108, width: 230, alignSelf: "center", marginVertical: 4 },
  cabinet: { position: "absolute", left: 0, top: 0, bottom: 24, width: 12, backgroundColor: "#4a4a50", borderRadius: 2 },
  plate: { position: "absolute", left: 12, top: 30, width: 36, height: 22, backgroundColor: "#6e6e75", borderRadius: 3 },
  arm: { position: "absolute", left: 40, top: 34, width: 150, height: 14, backgroundColor: "#8e8e95", borderRadius: 4 },
  door: { position: "absolute", right: 0, top: 0, bottom: 24, width: 16, backgroundColor: "#4a4a50", borderRadius: 2 },
  cup: { position: "absolute", right: 10, top: 26, width: 30, height: 30, borderRadius: 15, backgroundColor: "#6e6e75" },
  tag: { position: "absolute", bottom: -20, width: 90, color: C.faint, fontSize: 10 },
  screwWrap: { position: "absolute", top: 31, alignItems: "center", width: 40, marginLeft: -12 },
  screw: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#c7c7cc", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  screwOn: { backgroundColor: C.accent, borderColor: "#fff", transform: [{ scale: 1.25 }] },
  slot: { width: 10, height: 2, backgroundColor: "#636366" },
  label: { color: C.faint, fontSize: 11, fontWeight: "700", marginTop: 26, position: "absolute" },
});

const t = StyleSheet.create({
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  amount: { position: "absolute", bottom: 8, right: 10, fontSize: 16, fontWeight: "900", color: C.accentInk },
});

const v = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 12 },
  cell: { alignItems: "center" },
  num: { color: C.text, fontSize: 26, fontWeight: "800", fontVariant: ["tabular-nums"] },
  target: { color: C.sub, fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cap: { color: C.faint, fontSize: 11 },
});
