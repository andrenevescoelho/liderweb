"use client";

// Bridge para funcionalidades nativas do Capacitor
// Importado dinamicamente apenas quando isCapacitorApp === true

export async function googleSignInNative(): Promise<boolean> {
  try {
    // @ts-ignore — GoogleAuth é injetado pelo Capacitor no WebView
    const { GoogleAuth } = window.Capacitor?.Plugins ?? {};

    if (!GoogleAuth) {
      console.error("[LiderWeb] GoogleAuth plugin não disponível");
      return false;
    }

    await GoogleAuth.initialize({
      clientId: "510384512031-n27ieo0cqa1b5de7eg8jdvtqnk6qss52.apps.googleusercontent.com",
      scopes: ["profile", "email"],
      grantOfflineAccess: true,
    });

    const user = await GoogleAuth.signIn();
    const idToken = user?.authentication?.idToken;

    if (!idToken) return false;

    // Enviar token para o servidor LiderWeb
    const res = await fetch("/api/auth/google-native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();

    if (data.token) {
      // Setar cookie de sessão NextAuth
      document.cookie = `next-auth.session-token=${data.token}; path=/; secure; samesite=lax`;
      // Redirecionar
      const dest = data.user?.groupId ? "/dashboard" : "/signup?mode=new-group";
      window.location.href = dest;
      return true;
    }

    return false;
  } catch (err) {
    console.error("[LiderWeb] Google Sign-In nativo erro:", err);
    return false;
  }
}
