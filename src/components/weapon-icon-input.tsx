import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWeaponIcon, validateWeaponIcon } from "@/lib/weapon-icons";
import { useServerFn } from "@tanstack/react-start";
import { getAlbionWeaponIcon } from "@/lib/weapon-icons.functions";

export function WeaponIconInput({ name, file, url, onChange }: {
  name: string;
  file?: File | undefined;
  url?: string | null | undefined;
  onChange: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const loadAlbion = useServerFn(getAlbionWeaponIcon);
  const [preview, setPreview] = useState<string>();
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const src = preview ?? url;
  async function loadLink() {
    setLoading(true);
    try {
      const selected = await fetchWeaponIcon(link, (url) => loadAlbion({ data: url }));
      onChange(selected);
      setShowLink(false);
      setLink("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a imagem.");
    } finally { setLoading(false); }
  }
  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1">
      <input ref={input} type="file" accept="image/png,.png" className="hidden" aria-label={`Ícone PNG de ${name || "arma"}`} onChange={async (event) => {
        const selected = event.target.files?.[0];
        event.target.value = "";
        if (!selected) return;
        try { await validateWeaponIcon(selected); onChange(selected); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível abrir o ícone."); }
      }} />
      <Button type="button" variant="outline" size="icon" disabled={loading} className="h-12 w-12" title={src ? "Trocar ícone PNG" : "Adicionar ícone PNG"} aria-label={`${src ? "Trocar" : "Adicionar"} ícone de ${name || "arma"}`} onClick={() => input.current?.click()}>
        {src ? <img src={src} alt="" className="h-10 w-10 object-contain" /> : <ImagePlus />}
      </Button>
      <Button type="button" variant="outline" size="icon" disabled={loading} title="Imagem por link" aria-label={`Imagem por link de ${name || "arma"}`} aria-expanded={showLink} onClick={() => setShowLink(!showLink)}><Link /></Button>
      {src && <Button type="button" variant="ghost" size="icon" disabled={loading} title="Remover ícone" aria-label={`Remover ícone de ${name || "arma"}`} onClick={() => onChange(undefined)}><X /></Button>}
      {showLink && <div className="flex w-full min-w-0 basis-full items-center gap-2 pt-1">
        <Input type="url" className="w-48 min-w-0 flex-1" aria-label={`Link PNG de ${name || "arma"}`} placeholder="https://…/imagem.png" disabled={loading} value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (link.trim() && !loading) void loadLink(); } }} />
        <Button type="button" variant="outline" size="sm" disabled={loading || !link.trim()} onClick={loadLink}>{loading ? <LoaderCircle className="animate-spin" /> : null}{loading ? "Carregando…" : "Usar imagem"}</Button>
      </div>}
    </div>
  );
}