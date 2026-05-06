"use client";

export async function googleSignInNative(): Promise<boolean> {
  try {
    // @ts-ignore
    const Capacitor = window.Capacitor;
    console.log("[LW] Capacitor disponível:", !!Capacitor);
    console.log("[LW] isNative:", Capacitor?.isNativePlatform?.());

    // @ts-ignore
    const { GoogleAuth } = window.Capacitor?.Plugins ?? {};
    console.log("[LW] GoogleAuth plugin:", !!GoogleAuth);

    if (!GoogleAuth) {
      console.error("[LW] GoogleAuth plugin não encontrado");
      return false;
    }

    console.log("[LW] Inicializando GoogleAuth...");
    await GoogleAuth.initialize({
      clientId: "510384512031-n27ieo0cqa1b5de7eg8jdvtqnk6qss52.apps.googleusercontent.com",
      scopes: ["profile", "email"],
      grantOfflineAccess: true,
    });

    console.log("[LW] Abrindo tela de login Google...");
    const user = await GoogleAuth.signIn();
    console.log("[LW] user retornado:", JSON.stringify(user));

    const idToken = user?.authentication?.idToken;
    console.log("[LW] idToken existe:", !!idToken);
    console.log("[LW] idToken início:", idToken?.substring(0, 50));

    if (!idToken) {
      console.error("[LW] idToken não encontrado");
      return false;
    }

    console.log("[LW] Enviando para /api/auth/google-native...");
    const res = await fetch("/api/auth/google-native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    console.log("[LW] HTTP status:", res.status);
    const data = await res.json();
    console.log("[LW] Resposta:", JSON.stringify(data));

    if (!res.ok) {
      console.error("[LW] Erro servidor:", data.error);
      return false;
    }

    if (data.token) {
      document.cookie = `next-auth.session-token=${data.token}; path=/; secure; samesite=lax`;
      const dest = data.user?.groupId ? "/dashboard" : "/signup?mode=new-group";
      console.log("[LW] Redirecionando para:", dest);
      window.location.href = dest;
      return true;
    }

    console.error("[LW] Token não veio na resposta");
    return false;
  } catch (err) {
    console.error("[LW] Erro:", err);
    console.error("[LW] Mensagem:", (err as any)?.message);
    return false;
  }
}
