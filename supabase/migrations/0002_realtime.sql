-- Eventos ao vivo: o aplicativo escuta mudanças nestas tabelas.
alter publication supabase_realtime add table agentes, fichas, passos, aprovacoes;
