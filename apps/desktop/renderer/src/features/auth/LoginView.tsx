import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Crown,
  Database,
  Eye,
  EyeOff,
  FileText,
  Keyboard,
  Loader2,
  LockKeyhole,
  Maximize2,
  Minus,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BrandLogoMark } from "@renderer/components/BrandLogoMark";
import { Button } from "@renderer/components/Button";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import {
  loginErrorMessage,
  loginFeatureItems,
  loginProgressSteps,
  loginRoleOptions,
  loginTrustItems,
  persistLoginPreferences,
  readLoginPreferences,
  type LoginFormValues
} from "./login-experience";
import { getLoginStatus, type LoginStatusViewModel } from "./login-status-service";

const schema = z.object({
  username: z.string().trim().min(1, "Boş alan bırakmayın."),
  password: z.string().min(1, "Boş alan bırakmayın."),
  roleHint: z.enum(["owner", "cashier"]),
  rememberDevice: z.boolean()
});

const fallbackStatus: LoginStatusViewModel = {
  appVersion: "1.6.3",
  databaseLabel: "Veritabanı hazırlanıyor",
  databaseReady: false,
  backupLabel: "Yedekleme kontrol ediliyor",
  backupReady: false,
  offlineLabel: "Çevrimdışı mod destekleniyor",
  offlineReady: true
};

export function LoginView({ onLogin }: { onLogin(): void }) {
  const preferences = useMemo(() => readLoginPreferences(), []);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const screenRef = useRef<HTMLElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...preferences, password: "" }
  });

  const selectedRole = form.watch("roleHint");
  const usernameField = form.register("username");
  const statusQuery = useQuery({ queryKey: ["login", "system-status"], queryFn: getLoginStatus, refetchInterval: 45_000 });
  const status = statusQuery.data ?? fallbackStatus;

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => unwrapIpc(getDesktopApi().auth.login(values)),
    onSuccess: (_user, values) => {
      persistLoginPreferences(values);
      onLogin();
    }
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      usernameRef.current?.focus({ preventScroll: true });
      screenRef.current?.scrollTo({ top: 0, left: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mutation.isPending) {
      setActiveStep(0);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, loginProgressSteps.length - 1));
    }, 760);
    return () => window.clearInterval(timer);
  }, [mutation.isPending]);

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      form.reset({ username: "", password: "", roleHint: "owner", rememberDevice: false });
      mutation.reset();
    };

    window.addEventListener("keydown", clearOnEscape);
    return () => window.removeEventListener("keydown", clearOnEscape);
  }, [form, mutation]);

  const firstValidationError = Object.values(form.formState.errors)[0]?.message;
  const errorMessage = mutation.isError ? loginErrorMessage(mutation.error) : firstValidationError;

  return (
    <main className="login-screen" ref={screenRef}>
      <header className="login-titlebar">
        <div className="login-titlebar__brand">
          <span className="login-titlebar__mark">
            <BrandLogoMark size="tiny" />
          </span>
          <strong>BakiyeDefter POS</strong>
          <em>v{status.appVersion}</em>
          <b>Demo Sürümü</b>
        </div>
        <div className="login-titlebar__mode">
          <span className="status-dot" />
          <strong>Çevrimdışı Mod</strong>
        </div>
        <div className="login-window-controls" aria-label="Pencere kontrolleri">
          <button type="button" aria-label="Küçült" onClick={() => void getDesktopApi().window.minimize()}>
            <Minus size={16} />
          </button>
          <button type="button" aria-label="Büyüt" onClick={() => void getDesktopApi().window.toggleMaximize()}>
            <Maximize2 size={15} />
          </button>
          <button type="button" aria-label="Kapat" className="login-window-controls__close" onClick={() => void getDesktopApi().window.close()}>
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="login-dashboard-ghost" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>

      <section className="login-shell login-shell--compact" aria-label="BakiyeDefter POS giriş ekranı">
        <aside className="login-brand-panel">
          <div className="login-brand">
            <div className="login-logo" aria-hidden="true">
              <BrandLogoMark size="large" />
            </div>
            <div>
              <h1>BakiyeDefter <b>POS</b></h1>
              <p>Esnafın dijital cari defteri</p>
            </div>
          </div>

          <div className="login-badges" aria-label="Sürüm ve çalışma modu">
            <span className="login-badge login-badge--demo">Demo Sürümü</span>
            <span className="login-badge">v{status.appVersion}</span>
            <span className="login-badge login-badge--green">Offline-First</span>
            <span className="login-badge login-badge--blue">Çevrimdışı Mod</span>
          </div>

          <div className="login-info-grid">
            <div className="login-feature-list">
              <h2>Temel güvence</h2>
              {loginFeatureItems.slice(0, 3).map((item) => (
                <div className="login-feature" key={item.title}>
                  <span>{featureIcon(item.icon)}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="login-trust-card">
              <h2>Yerel veri güvenliği</h2>
              {loginTrustItems.slice(0, 3).map((item) => (
                <div className="login-trust-row" key={item}>
                  <ShieldCheck size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="login-card">
          <div className="login-card__title">
            <span>
              <UserRound size={24} />
            </span>
            <div>
              <h2>Giriş</h2>
              <p>Yerel veritabanına güvenli erişim.</p>
            </div>
          </div>

          <form className="login-form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <label className="login-field">
              <span>Kullanıcı adı</span>
              <div className="login-input-shell">
                <UserRound size={18} />
                <input
                  autoComplete="username"
                  placeholder="Kullanıcı adınızı giriniz"
                  {...usernameField}
                  ref={(element) => {
                    usernameField.ref(element);
                    usernameRef.current = element;
                  }}
                />
              </div>
            </label>

            <label className="login-field">
              <span>Şifre</span>
              <div className="login-input-shell">
                <LockKeyhole size={18} />
                <input autoComplete="current-password" placeholder="Şifrenizi giriniz" type={passwordVisible ? "text" : "password"} {...form.register("password")} />
                <button type="button" className="login-eye-button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Şifreyi gizle" : "Şifreyi göster"}>
                  {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="login-role-group" aria-label="Rol seçimi">
              <span>Rol seçimi</span>
              <div className="login-role-options">
                {loginRoleOptions.map((role) => (
                  <label className={clsx("login-role-option", selectedRole === role.value && "is-selected")} key={role.value}>
                    <input type="radio" value={role.value} {...form.register("roleHint")} />
                    {role.value === "owner" ? <Crown size={17} /> : <UserRound size={17} />}
                    <strong>{role.label}</strong>
                    <small>{role.description}</small>
                  </label>
                ))}
              </div>
            </div>

            <div className="login-form-row">
              <label className="login-checkbox">
                <input type="checkbox" {...form.register("rememberDevice")} />
                <span>Beni hatırla</span>
              </label>
              <div className="login-shortcuts" aria-label="Klavye kısayolları">
                <span>
                  <kbd>Enter</kbd> ile giriş
                </span>
                <span>
                  <kbd>Esc</kbd> temizle
                </span>
              </div>
            </div>

            <Button className="login-submit" type="submit" variant="primary" disabled={mutation.isPending} icon={mutation.isPending ? <Loader2 className="login-spinner" size={19} /> : <ArrowRight size={19} />}>
              {mutation.isPending ? loginProgressSteps[activeStep] : "Giriş Yap"}
            </Button>

            {mutation.isPending ? (
              <div className="login-progress" aria-live="polite">
                <div className="login-progress__label">
                  <Keyboard size={15} />
                  <span>Sistem hazırlanıyor</span>
                </div>
                <div className="login-progress__steps">
                  {loginProgressSteps.map((step, index) => (
                    <div className={clsx("login-progress-step", index <= activeStep && "is-active")} key={step}>
                      <span>{index === activeStep ? <Loader2 className="login-spinner" size={16} /> : <CheckCircle2 size={16} />}</span>
                      <small>{step}</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="login-error-area is-visible" role="alert">
                <ShieldCheck size={18} />
                <div>
                  <strong>Giriş yapılamadı</strong>
                  <p>{errorMessage}</p>
                </div>
              </div>
            ) : null}
          </form>
        </section>
      </section>

      <footer className="login-status-footer">
        <StatusPill ready={status.databaseReady} icon={<Database size={20} />} title={status.databaseLabel} detail={status.databaseReady ? "Bağlantı başarılı" : "Kontrol bekleniyor"} />
        <StatusPill ready={status.backupReady} icon={<CloudUpload size={20} />} title={status.backupLabel} detail={status.backupReady ? "Yedek klasörü erişilebilir" : "Yedekleme yolu kontrol edilmeli"} />
        <StatusPill ready={status.offlineReady} icon={<WifiOff size={20} />} title={status.offlineLabel} detail="Temel işlemler yerelde çalışır" />
        <div className="login-footer-copy">
          <span>© 2026 BakiyeDefter POS</span>
          <strong>Demo MVP</strong>
          <span>Yerel veri güvenliği</span>
        </div>
      </footer>
    </main>
  );
}

function StatusPill({ ready, icon, title, detail }: { ready: boolean; icon: ReactNode; title: string; detail: string }) {
  return (
    <div className={clsx("login-status-pill", ready && "is-ready")}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function featureIcon(icon: (typeof loginFeatureItems)[number]["icon"]) {
  switch (icon) {
    case "offline":
      return <WifiOff size={22} />;
    case "backup":
      return <CloudUpload size={22} />;
    case "customers":
      return <Users size={22} />;
    case "payment":
      return <WalletCards size={22} />;
    case "pdf":
      return <FileText size={22} />;
  }
}
