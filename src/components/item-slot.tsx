import type { CSSProperties } from "react";
import { enchantColor, itemIconUrl, parseGearCode, tierColor } from "@/lib/builds";

/**
 * Casinha de item no estilo do jogo: fundo escuro com leve relevo, moldura na cor do tier,
 * brilho na cor do encantamento e o tier no canto.
 */
export function ItemSlot({ code, label, size = 64, showTier = true, fluid = false, className = "" }: {
  code: string | null; label?: string; size?: number; showTier?: boolean; fluid?: boolean; className?: string;
}) {
  const parsed = code ? parseGearCode(code) : null;
  const frame = parsed ? tierColor(parsed.tier) : undefined;
  const glow = parsed && parsed.enchant > 0 ? enchantColor(parsed.enchant) : undefined;
  const style: CSSProperties = {
    ...(fluid ? {} : { width: size, height: size }),
    ...(frame ? { borderColor: frame } : {}),
    boxShadow: glow
      ? `inset 0 0 ${Math.max(8, size / 4)}px ${glow}66, 0 0 ${Math.max(6, size / 8)}px ${glow}55`
      : "inset 0 1px 0 rgba(255,255,255,.06), inset 0 -10px 18px rgba(0,0,0,.35)",
  };
  return (
    <span
      className={`relative inline-flex ${fluid ? "aspect-square w-full" : ""} shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-gradient-to-b from-[oklch(0.3_0.03_275)] to-[oklch(0.19_0.02_270)] ${parsed ? "" : "border-dashed border-border/70"} ${className}`}
      style={style}
    >
      {code ? (
        <img src={itemIconUrl(code, size > 64 ? 192 : 128)} alt="" loading="lazy" className="h-[92%] w-[92%] object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,.6)]" />
      ) : (
        label && size >= 56 && <span className="px-1 text-center text-[11px] leading-tight text-muted-foreground">{label}</span>
      )}
      {parsed && showTier && (
        <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/70 px-1 text-[10px] font-bold leading-4" style={{ color: glow ?? frame ?? "#fff" }}>
          {parsed.tier}{parsed.enchant > 0 ? `.${parsed.enchant}` : ""}
        </span>
      )}
    </span>
  );
}
