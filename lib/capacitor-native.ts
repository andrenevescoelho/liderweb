"use client";

const SESSION_KEY = "lw_session_token";
const SESSION_EMAIL = "lw_session_email";

// Salvar sessão — usa Capacitor Preferences no app, localStorage no web
async function saveSession(token: string, email: string) {
  try {
    // @ts-ignore
    if (window.Capacitor?.isNativePlatform?.()) {
      // @ts-ignore
      const { Preferences } = window.Capacitor.Plugins;
      if (Preferences) {
        await Preferences.set({ key: SESSION_KEY, value: token });
        await Preferences.set({ key: SESSION_EMAIL, value: email });
        return;
      }
    }
    localStorage.setItem(SESSION_KEY, token);
    localStorage.setItem(SESSION_EMAIL, email);
  } catch {}
}

// Carregar sessão salva
async function loadSession(): Promise<{ token: string; email: string } | null> {
  try {
    // @ts-ignore
    if (window.Capacitor?.isNativePlatform?.()) {
      // @ts-ignore
      const { Preferences } = window.Capacitor.Plugins;
      if (Preferences) {
        const { value: token } = await Preferences.get({ key: SESSION_KEY });
        const { value: email } = await Preferences.get({ key: SESSION_EMAIL });
        if (token && email) return { token, email };
        return null;
      }
    }
    const token = localStorage.getItem(SESSION_KEY);
    const email = localStorage.getItem(SESSION_EMAIL);
    if (token && email) return { token, email };
    return null;
  } catch {
    return null;
  }
}

// Limpar sessão ao fazer logout
export async function clearSession() {
  try {
    // @ts-ignore
    if (window.Capacitor?.isNativePlatform?.()) {
      // @ts-ignore
      const { Preferences } = window.Capacitor.Plugins;
      if (Preferences) {
        await Preferences.remove({ key: SESSION_KEY });
        await Preferences.remove({ key: SESSION_EMAIL });
        return;
      }
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EMAIL);
  } catch {}
}

// Restaurar sessão ao abrir o app
export async function restoreSession(): Promise<boolean> {
  try {
    // @ts-ignore
    if (!window.Capacitor?.isNativePlatform?.()) return false;

    const saved = await loadSession();
    if (!saved) return false;

    // Verificar se a sessão ainda é válida no servidor
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const session = await res.json();

    if (session?.user?.email === saved.email) return true;

    // Tentar renovar com o token salvo
    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", {
      redirect: false,
      nativeToken: saved.token,
      nativeEmail: saved.email,
    });

    if (result?.ok) return true;

    // Token inválido — limpar
    await clearSession();
    return false;
  } catch {
    return false;
  }
}

// Google Sign-In nativo
export async function googleSignInNative(): Promise<boolean> {
  try {
    // @ts-ignore
    const { GoogleAuth } = window.Capacitor?.Plugins ?? {};
    if (!GoogleAuth) return false;

    await GoogleAuth.initialize({
      clientId: "510384512031-6bsejt1g5ffgg8e34n9kevt7hn4r8spv.apps.googleusercontent.com",
      scopes: ["profile", "email"],
      grantOfflineAccess: true,
    });

    const user = await GoogleAuth.signIn();
    const idToken = user?.authentication?.idToken;
    if (!idToken) return false;

    const res = await fetch("/api/auth/google-native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    if (!data.ok) return false;

    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", {
      redirect: false,
      nativeToken: data.token,
      nativeEmail: data.user.email,
    });

    if (result?.ok) {
      await saveSession(data.token, data.user.email);
      const dest = data.user?.groupId ? "/dashboard" : "/signup?mode=new-group";
      window.location.href = dest;
      return true;
    }

    return false;
  } catch (err) {
    console.error("[LW] Erro:", err);
    return false;
  }
}
