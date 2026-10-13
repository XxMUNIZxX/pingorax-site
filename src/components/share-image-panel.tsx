import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Save, X, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SHARE_IMAGE, prepareShareImage } from "@/lib/share-image";

export function ShareImagePanel() {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [image, setImage] = useState<Blob>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["share-image-settings"], queryFn: async () => {
    const result = await supabase.from("site_share_settings").select("image_path").eq("id", "site").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return { path: null, url: DEFAULT_SHARE_IMAGE };
    const signed = await supabase.storage.from("share-images").createSignedUrl(result.data.image_path, 3600);
    if (signed.error) throw signed.error;
    return { path: result.data.image_path, url: signed.data.signedUrl };
  } });
  useEffect(() => {
    if (!image) { setPreview(undefined); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function save() {
    if (!image) return;
    setBusy(true);
    let uploadedPath: string | undefined;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Entre novamente para salvar a imagem.");
      const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
      const uploaded = await supabase.storage.from("share-images").upload(path, image, { contentType: "image/jpeg", upsert: false });
      if (uploaded.error) throw uploaded.error;
      uploadedPath = path;
      const saved = await supabase.from("site_share_settings").upsert({ id: "site", image_path: path, updated_at: new Date().toISOString() });
      if (saved.error) throw saved.error;
      uploadedPath = undefined;
      await qc.invalidateQueries({ queryKey: ["share-image-settings"] });
      setImage(undefined);
      toast.success("Imagem de compartilhamento salva.");
    } catch {
      if (uploadedPath) await supabase.storage.from("share-images").remove([uploadedPath]);
      toast.error("Não foi possível salvar a imagem. Confira seu acesso e tente novamente.");
    } finally { setBusy(false); }
  }

  return <section className="mt-6 border-y border-border py-6">
    <h2 className="text-xl font-bold text-gold">Imagem de compartilhamento</h2>
    <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
      <div className="aspect-[1200/630] w-full max-w-sm overflow-hidden rounded-md border border-border bg-muted">
        {isLoading ? <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin" /></div> : (preview || data?.url) ? <img src={preview ?? data?.url} alt="Prévia da imagem de compartilhamento" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Imagem de compartilhamento" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          try { setImage(await prepareShareImage(file)); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível abrir a imagem."); }
          finally { setBusy(false); }
        }} />
        <Button variant="outline" disabled={busy || isLoading} onClick={() => input.current?.click()}><ImagePlus />Trocar imagem</Button>
        {image && <><Button variant="gold" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Salvar imagem</Button><Button variant="ghost" size="icon" aria-label="Cancelar troca de imagem" title="Cancelar" disabled={busy} onClick={() => setImage(undefined)}><X /></Button></>}
        {error && <p role="alert" className="w-full text-sm text-destructive">Não foi possível carregar a imagem atual.</p>}
      </div>
    </div>
  </section>;
}