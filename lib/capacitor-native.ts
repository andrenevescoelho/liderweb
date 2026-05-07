"use client";

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

    // Enviar para o servidor que vai criar a sessão via NextAuth
    const res = await fetch("/api/auth/google-native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    if (!data.ok) return false;

    // Usar signIn do NextAuth com o token já validado
    // em vez de setar cookie manualmente
    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", {
      redirect: false,
      nativeToken: data.token,
      nativeEmail: data.user.email,
    });

    if (result?.ok) {
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
