# Dashboard WhatsApp — configuração por ambiente

A página `/admin/whatsapp` e a API `/api/admin/whatsapp/dashboard` são restritas a `SUPERADMIN`.

O dashboard lê o Postgres do funil por uma conexão Prisma separada, usando `FUNNEL_DATABASE_URL`.
O banco principal do LiderWeb continua usando `DATABASE_URL`.

## Desenvolvimento — Jupyter

Caminho do projeto:

```bash
cd /home/mega/liderweb-lab/app
```

Configure no `.env` usado pelo Docker Compose:

```env
FUNNEL_DATABASE_URL=postgresql://liderweb_funnel:SENHA@evolution_postgres:5432/liderweb_funnel
```

O `docker-compose.yml` desta alteração apenas repassa `FUNNEL_DATABASE_URL` para o container `app`.
Ele não altera o banco principal nem o `schema.prisma`.

Se o hostname `evolution_postgres` não resolver de dentro de `liderweb_app`, não altere código:
primeiro verifique as redes Docker e conecte o container da app à rede compartilhada onde está o Evolution.

Exemplo de diagnóstico:

```bash
docker inspect liderweb_app --format '{{json .NetworkSettings.Networks}}'
docker inspect evolution_postgres --format '{{json .NetworkSettings.Networks}}'
```

Depois de configurar a variável:

```bash
docker compose up -d --build app
```

Valide:

```bash
docker exec liderweb_app printenv FUNNEL_DATABASE_URL | sed 's#://[^:]*:[^@]*@#://***:***@#'
```

Abra com usuário SUPERADMIN:

```text
http://SEU-ENDERECO/admin/whatsapp
```

## Produção

Produção usa `/opt/liderweb`, `.env.prod` e `docker-compose.prod.yml`.

Não foi incluída alteração em `docker-compose.prod.yml` porque esse arquivo não está no ZIP/repositório recebido.
Na VPS, adicione em `.env.prod`:

```env
FUNNEL_DATABASE_URL=postgresql://liderweb_funnel:SENHA@evolution_postgres:5432/liderweb_funnel
```

E confirme que o serviço `app` do `docker-compose.prod.yml` repassa:

```yaml
FUNNEL_DATABASE_URL: ${FUNNEL_DATABASE_URL}
```

Antes de produção, valide tudo no Jupyter.

## Segurança

- Menu visível apenas para `SUPERADMIN`.
- A página valida a sessão server-side.
- A API valida `SUPERADMIN` novamente.
- Nenhuma senha deve ser commitada.
- Não há alteração no `schema.prisma`.
