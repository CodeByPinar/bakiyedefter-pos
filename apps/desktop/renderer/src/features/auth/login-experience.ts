export type LoginRoleHint = "owner" | "cashier";

export type LoginFormValues = {
  username: string;
  password: string;
  roleHint: LoginRoleHint;
  rememberDevice: boolean;
};

const preferencesKey = "bakiyedefter.login.preferences";

export const loginFeatureItems = [
  { title: "İnternet olmadan çalışır", body: "Tüm kritik işlemler cihazınızda devam eder.", icon: "offline" },
  { title: "Otomatik yedekleme", body: "Veriler düzenli olarak güvenli klasöre kopyalanır.", icon: "backup" },
  { title: "Cari hesap yönetimi", body: "Müşteri bakiyesi ve hareketleri tek merkezde tutulur.", icon: "customers" },
  { title: "Tahsilat takibi", body: "Kısmi ödeme ve gün sonu toplamları izlenir.", icon: "payment" },
  { title: "PDF raporlama", body: "Ekstre ve özetler yazdırılabilir PDF olarak alınır.", icon: "pdf" }
] as const;

export const loginTrustItems = [
  "Veriler cihazınızda saklanır",
  "Otomatik yedekleme desteklenir",
  "Şifreli kullanıcı girişi",
  "Offline kullanım desteği"
] as const;

export const loginProgressSteps = ["Kullanıcı doğrulanıyor", "Veritabanı hazırlanıyor", "Dashboard yükleniyor"] as const;

export const loginRoleOptions: Array<{ value: LoginRoleHint; label: string; description: string }> = [
  { value: "owner", label: "İşletme Sahibi", description: "Tam yetkili yönetici girişi" },
  { value: "cashier", label: "Kasiyer", description: "Kasa ve tahsilat işlemleri" }
];

export function readLoginPreferences(): Pick<LoginFormValues, "username" | "roleHint" | "rememberDevice"> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(preferencesKey) ?? "{}") as Partial<LoginFormValues>;
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      roleHint: parsed.roleHint === "cashier" ? "cashier" : "owner",
      rememberDevice: parsed.rememberDevice === true
    };
  } catch {
    return { username: "", roleHint: "owner", rememberDevice: false };
  }
}

export function persistLoginPreferences(values: LoginFormValues): void {
  try {
    if (!values.rememberDevice) {
      window.localStorage.removeItem(preferencesKey);
      return;
    }

    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({
        username: values.username.trim(),
        roleHint: values.roleHint,
        rememberDevice: true
      })
    );
  } catch {
    // Local storage can be disabled by policy; database-backed device remembering still runs in main.
  }
}

export function loginErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/çok fazla|fazla hatalı/i.test(message)) return "Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.";
  if (/rol|eşleşmiyor/i.test(message)) return "Seçilen rol bu kullanıcıyla eşleşmiyor.";
  if (message.trim()) return message;
  return "Kullanıcı adı veya şifre hatalı.";
}
