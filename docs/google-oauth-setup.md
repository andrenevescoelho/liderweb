# Configuração rápida do Google OAuth (SSO)

1. Acesse [Google Cloud Console](https://console.cloud.google.com/) e selecione o projeto.
2. Em **APIs e serviços > Tela de consentimento OAuth**, configure o app.
3. Em **APIs e serviços > Credenciais**, crie um **ID do cliente OAuth 2.0** do tipo **Aplicativo da Web**.
4. Adicione os URIs de redirecionamento autorizados:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Produção: `https://SEU_DOMINIO/api/auth/callback/google`
5. Copie `Client ID` e `Client Secret` para as variáveis de ambiente:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=...
NEXTAUTH_SECRET=...
```

> Reinicie a aplicação após alterar variáveis de ambiente.
