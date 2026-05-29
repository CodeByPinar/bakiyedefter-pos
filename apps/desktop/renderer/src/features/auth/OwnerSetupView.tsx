import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BrandLogoMark } from "@renderer/components/BrandLogoMark";
import { Button } from "@renderer/components/Button";
import { FormField } from "@renderer/components/FormField";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";

const schema = z.object({ username: z.string().min(3, "En az 3 karakter"), displayName: z.string().min(2, "Ad soyad gerekli"), password: z.string().min(8, "En az 8 karakter") });
type FormValues = z.infer<typeof schema>;

export function OwnerSetupView({ onReady }: { onReady(): void }) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { username: "owner", displayName: "", password: "" } });
  const mutation = useMutation({ mutationFn: (values: FormValues) => unwrapIpc(getDesktopApi().auth.createFirstOwner(values)), onSuccess: onReady });
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-panel__brand"><div className="brand-mark"><BrandLogoMark /></div><div><h1>BakiyeDefter POS</h1><span className="demo-pill auth-demo-pill">Demo Sürümü</span><p>İlk işletme sahibi hesabını oluşturun.</p></div></div>
        <form className="auth-form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FormField label="Kullanıcı adı" autoFocus {...form.register("username")} error={form.formState.errors.username?.message} />
          <FormField label="Ad soyad" {...form.register("displayName")} error={form.formState.errors.displayName?.message} />
          <FormField label="Şifre" type="password" {...form.register("password")} error={form.formState.errors.password?.message} />
          {mutation.isError ? <p className="form-error">{mutation.error.message}</p> : null}
          <Button type="submit" variant="primary" disabled={mutation.isPending}>Owner hesabını oluştur</Button>
        </form>
      </section>
    </main>
  );
}

