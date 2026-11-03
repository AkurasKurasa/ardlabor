import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export const C = {
  glass: "rgba(18,18,20,0.94)",
  glassLine: "rgba(255,255,255,0.08)",
  raised: "#2a2a2e",
  text: "#f5f5f7",
  sub: "#b4b4bb",
  faint: "#7c7c85",
  accent: "#ffd60a", // workshop yellow: anything you should touch or aim at
  accentInk: "#1c1c1e",
  ok: "#32d74b",
  bad: "#ff453a",
  warn: "#ff9f0a",
};

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function Sheet({ children, bottomInset }: { children: ReactNode; bottomInset: number }) {
  return (
    <View style={[s.sheet, { paddingBottom: bottomInset + 14 }]}>
      {children}
    </View>
  );
}

export function Btn({ label, icon, onPress, kind = "primary", disabled }: {
  label: string; icon?: IconName; onPress: () => void; kind?: "primary" | "secondary" | "ghost"; disabled?: boolean;
}) {
  const fg = kind === "primary" ? C.accentInk : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, kind === "secondary" && s.btnSecondary, kind === "ghost" && s.btnGhost,
        pressed && { opacity: 0.75 }, disabled && { opacity: 0.35 }]}
    >
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const STEPS = ["Door", "Measure", "Diagnose", "Fix", "Verify"];

export function StepBar({ current, top }: { current: number; top: number }) {
  return (
    <View style={[s.stepBar, { top }]} pointerEvents="none">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        return (
          <View key={label} style={s.stepItem}>
            <View style={[s.stepDot, state === "done" && s.stepDone, state === "now" && s.stepNow]}>
              {state === "done" ? <Icon name="check" size={12} color={C.accentInk} /> : <Text style={[s.stepNum, state === "now" && { color: C.accentInk }]}>{i + 1}</Text>}
            </View>
            <Text style={[s.stepLabel, state !== "todo" && { color: C.text }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Crosshair in the middle of the camera view for precise aiming. */
export function Reticle({ label }: { label?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={s.reticleWrap}>
        <View style={s.reticleRing} />
        <View style={[s.reticleLine, { width: 2, height: 22, top: -30 }]} />
        <View style={[s.reticleLine, { width: 2, height: 22, bottom: -30 }]} />
        <View style={[s.reticleLine, { height: 2, width: 22, left: -30 }]} />
        <View style={[s.reticleLine, { height: 2, width: 22, right: -30 }]} />
        <View style={s.reticleDot} />
        {label ? <Text style={s.reticleLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

export function Dots({ total, filled }: { total: number; filled: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.dot, i < filled && { backgroundColor: C.accent, borderColor: C.accent }]} />
      ))}
    </View>
  );
}

export function Meter({ value, color = C.accent }: { value: number; color?: string }) {
  return (
    <View style={s.meter}>
      <View style={[s.meterFill, { width: `${Math.max(4, Math.min(100, value * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}
export function Body({ children }: { children: ReactNode }) {
  return <Text style={s.body}>{children}</Text>;
}
export function Small({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[s.small, color ? { color } : null]}>{children}</Text>;
}
export function Eyebrow({ icon, children, color = C.accent }: { icon: IconName; children: ReactNode; color?: string }) {
  return (
    <View style={s.eyebrow}>
      <Icon name={icon} size={15} color={color} />
      <Text style={[s.eyebrowText, { color }]}>{children}</Text>
    </View>
  );
}
export function Row({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", gap, alignItems: "center" }}>{children}</View>;
}
export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "bad" | "ok" }) {
  const col = tone === "ok" ? C.ok : tone === "bad" ? C.bad : C.warn;
  return (
    <View style={[s.notice, { borderColor: col }]}>
      <Icon name={tone === "ok" ? "check-circle" : "alert-circle"} size={18} color={col} />
      <Text style={[s.small, { color: C.text, flex: 1 }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: C.glass, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 16, gap: 14,
    borderTopWidth: 1, borderColor: C.glassLine },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 4 },
  btn: { flex: 1, minHeight: 52, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 14 },
  btnSecondary: { backgroundColor: C.raised },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.glassLine },
  btnText: { fontSize: 16, fontWeight: "700" },
  stepBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 10 },
  stepItem: { alignItems: "center", gap: 3, flex: 1 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  stepDone: { backgroundColor: C.accent, borderColor: C.accent },
  stepNow: { backgroundColor: C.accent, borderColor: "#fff" },
  stepNum: { color: C.sub, fontSize: 11, fontWeight: "700" },
  stepLabel: { color: C.faint, fontSize: 11, fontWeight: "600" },
  reticleWrap: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  reticleRing: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.accent },
  reticleLine: { position: "absolute", backgroundColor: C.accent },
  reticleDot: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent },
  reticleLabel: { position: "absolute", top: 40, left: -110, width: 220, textAlign: "center", color: C.accent, fontWeight: "700", fontSize: 13,
    textShadowColor: "#000", textShadowRadius: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  meter: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3 },
  title: { color: C.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
  body: { color: C.sub, fontSize: 15, lineHeight: 21 },
  small: { color: C.faint, fontSize: 13, lineHeight: 18 },
  eyebrow: { flexDirection: "row", gap: 6, alignItems: "center" },
  eyebrowText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  notice: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2 },
});

/** Thin progress line: one segment per stage, no labels. */
export function Progress({ current, total = 5, top }: { current: number; total?: number; top: number }) {
  return (
    <View style={[x.progress, { top }]} pointerEvents="none">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[x.seg, i <= current && { backgroundColor: C.accent }]} />
      ))}
    </View>
  );
}

export function IconBtn({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button"
      style={({ pressed }) => [x.iconBtn, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={22} />
    </Pressable>
  );
}

export function LinkBtn({ label, onPress, open }: { label: string; onPress: () => void; open?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={x.link}>
      <Text style={x.linkText}>{label}</Text>
      {open !== undefined && <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={C.sub} />}
    </Pressable>
  );
}

export function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={x.toggle}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[x.toggleItem, o.value === value && x.toggleOn]}>
          <Text style={[x.toggleText, o.value === value && { color: C.accentInk }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const x = StyleSheet.create({
  progress: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },
  iconBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.raised, alignItems: "center", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  linkText: { color: C.sub, fontSize: 14, fontWeight: "600" },
  toggle: { flexDirection: "row", backgroundColor: C.raised, borderRadius: 12, padding: 3, flex: 1 },
  toggleItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  toggleOn: { backgroundColor: C.accent },
  toggleText: { color: C.text, fontWeight: "700", fontSize: 14 },
});
