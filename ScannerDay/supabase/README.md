# Backend ScannerDay

Esta pasta contém a primeira migração do PostgreSQL/Supabase.

## Aplicação da migração

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `migrations/202607280001_initial_schema.sql`.
4. Copie `config.example.js` para `config.js`.
5. Preencha apenas `supabaseUrl` e `supabaseAnonKey`.

Nunca use a chave `service_role` no frontend. Ela será reservada para tarefas seguras no servidor, como o scanner automático.

