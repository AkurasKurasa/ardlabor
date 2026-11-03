/**
 * ARdlabor interface kit.
 *
 * Direction: a camera instrument, not a chat app. Text sits straight on the camera image over a
 * soft fade, left-aligned like viewfinder captions. White is the interface; one signal orange
 * is reserved for things you aim at in AR (markers, crosshair, the box you draw).
 * Type: IBM Plex Sans, two weights, sentence case.
 */
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export const C = {
  text: "#ffffff",
  sub: "rgba(255,255,255,0.78)",
  faint: "rgba(255,255,255,0.55)",
  line: "rgba(255,255,255,0.28)",
  signal: "#ff6b2c", // AR targets only
  accent: "#ff6b2c", // alias kept for AR code paths
  accentInk: "#000000",
  ok: "#4cd47a",
  bad: "#ff6b5e",
  warn: "#ffb547",
  ink: "#000000",
  glass: "rgba(0,0,0,0.72)",
  glassLine: "rgba(255,255,255,0.12)",
  raised: "rgba(255,255,255,0.12)",
};

export const F = {
  regular: "IBMPlexSans_400Regular",
  medium: "IBMPlexSans_500Medium",
  semibold: "IBMPlexSans_500Medium", // two weights only, on purpose
};

/** Scale (dp), ratio ~1.2: 13 · 15 · 18 · 22. */
export const T = {
  display: { fontFamily: F.regular, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title: { fontFamily: F.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21 },
  button: { fontFamily: F.medium, fontSize: 15, letterSpacing: 0 },
  small: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: F.regular, fontSize: 13, letterSpacing: 0 },
} as const;

const shadow = { textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** Bottom caption area: a fade from the camera image into dark, text left-aligned on top. */
export function Sheet({ children, bottomInset = 0 }: { children: ReactNode; bottomInset?: number }) {
  return (
    <View style={{ paddingBottom: bottomInset }}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.72)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.sheet}>{children}</View>
    </View>
  );
}

export function Btn({ label, onPress, kind = "primary", disabled }: {
  label: string; icon?: IconName; onPress: () => void; kind?: "primary" | "secondary" | "ghost"; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.btn, kind === "secondary" && s.btnSecondary, kind === "ghost" && s.btnGhost,
        pressed && { opacity: 0.7 }, disabled && { opacity: 0.35 }]}
    >
      <Text style={[s.btnText, kind !== "primary" && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A quiet text action. The icon prop is accepted for older call sites but not drawn. */
export function IconBtn({ onPress, label }: { icon?: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }]}>
      <Text style={s.textBtnText}>{label}</Text>
    </Pressable>
  );
}

export function LinkBtn({ label, onPress }: { label: string; onPress: () => void; open?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }]}>
      <Text style={[s.textBtnText, s.underline]}>{label}</Text>
    </Pressable>
  );
}

/** Progress as a thin line along the top edge. */
export function Progress({ current, total = 5, top }: { current: number; total?: number; top: number }) {
  return (
    <View style={[s.progress, { top }]} pointerEvents="none">
      <View style={[s.progressFill, { width: `${((current + 1) / total) * 100}%` }]} />
    </View>
  );
}
export const StepBar = Progress;

/** Thin crosshair for aiming, in the AR signal colour. */
export function Reticle({ label }: { label?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={s.reticleWrap}>
        <View style={[s.reticleLine, { width: 1.5, height: 16, top: -24 }]} />
        <View style={[s.reticleLine, { width: 1.5, height: 16, bottom: -24 }]} />
        <View style={[s.reticleLine, { height: 1.5, width: 16, left: -24 }]} />
        <View style={[s.reticleLine, { height: 1.5, width: 16, right: -24 }]} />
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
        <View key={i} style={[s.dot, i < filled && { backgroundColor: C.text }]} />
      ))}
    </View>
  );
}

export function Meter({ value, color = C.text }: { value: number; color?: string }) {
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
/** Kept for older call sites: a plain caption, no icon, no capitals. */
export function Eyebrow({ children, color = C.faint }: { icon?: IconName; children: ReactNode; color?: string }) {
  return <Text style={[s.small, { color }]}>{children}</Text>;
}
/** What the assistant concluded: shown as the headline itself, not as a chat bubble. */
export function Bubble({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}
export function Row({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", gap, alignItems: "center", flexWrap: "wrap" }}>{children}</View>;
}
export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "bad" | "ok" }) {
  const col = tone === "ok" ? C.ok : tone === "bad" ? C.bad : C.warn;
  return <Text style={[s.small, { color: col }]}>{children}</Text>;
}
export function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chip, pressed && { opacity: 0.6 }]}>
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
}

export function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 18 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} hitSlop={8}>
          <Text style={[s.textBtnText, { color: o.value === value ? C.text : C.faint }, o.value === value && s.underline]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { paddingHorizontal: 28, paddingTop: 56, paddingBottom: 22, gap: 10, maxWidth: 620 },
  btn: { height: 44, paddingHorizontal: 22, borderRadius: 8, backgroundColor: C.text, alignItems: "center", justifyContent: "center" },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.line },
  btnGhost: { backgroundColor: "transparent", paddingHorizontal: 4 },
  btnText: { ...T.button, color: C.ink },
  textBtn: { height: 44, justifyContent: "center" },
  textBtnText: { ...T.button, color: C.sub, ...shadow },
  underline: { textDecorationLine: "underline", textDecorationColor: C.line },
  progress: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: "rgba(255,255,255,0.15)" },
  progressFill: { height: 2, backgroundColor: C.text },
  reticleWrap: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  reticleLine: { position: "absolute", backgroundColor: C.signal },
  reticleDot: { position: "absolute", width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.signal },
  reticleLabel: { position: "absolute", top: 34, left: -110, width: 220, textAlign: "center", color: C.text, ...T.small, ...shadow },
  dot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: C.text },
  meter: { height: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  meterFill: { height: 2 },
  title: { color: C.text, ...T.title, ...shadow },
  body: { color: C.sub, ...T.body, ...shadow },
  small: { color: C.faint, ...T.small, ...shadow },
  chip: { paddingVertical: 6 },
  chipText: { ...T.small, color: C.sub, textDecorationLine: "underline", textDecorationColor: C.line },
});
