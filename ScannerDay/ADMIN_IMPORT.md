# ScannerDay Admin Import

## Configuração

1. Execute a migração `supabase/migrations/202607290001_admin_import.sql` no SQL Editor do Supabase.
2. Em **Authentication → Users**, crie o usuário que administrará as importações.
3. No SQL Editor, promova esse usuário substituindo o e-mail abaixo:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'SEU_EMAIL_ADMIN');
```

4. Faça um novo deployment.
5. Abra **Administração → Importar análises**, entre com o usuário administrativo e valide o arquivo de exemplo em `examples/scannerday-import-v1.json`.

A sessão do Supabase é renovada automaticamente e mantida no navegador. A API valida o token e consulta `profiles.role = 'admin'` no servidor antes de permitir qualquer operação administrativa.

## API

Rotas administrativas exigem `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` de um usuário com perfil `admin`:

- `POST /api/validate-analysis` — valida sem salvar.
- `POST /api/import-analysis` — valida e publica o lote em uma transação.
- `GET /api/imports` — lista os lotes.
- `GET /api/imports/:id` — detalha um lote.
- `DELETE /api/imports/:id` — exclui o lote e registros vinculados.

Rotas públicas:

- `GET /api/analyses` — lista análises editoriais publicadas.
- `GET /api/analysis/:id` — retorna uma análise completa.

Corpo das rotas de validação e publicação:

```json
{
  "file_name": "analises-2026-07-29.json",
  "payload": { "schema_version": "1.0", "generated_at": "...", "methodology": "...", "analyses": [] }
}
```

O limite é 10 MB. Uma falha em qualquer análise cancela toda a publicação; nenhum registro parcial é preservado.
