# Programa do caller: enviar loot e dps para o conteúdo

O programa que roda no PC do caller (leitor de loot/dps) manda os dados para o site. Os players veem no conteúdo e o caller pode mandar o resumo para o Discord.

## 1. Criar o token
No site: **Meu perfil → Programa de loot e dps → Criar token**. O texto (`plx_...`) aparece uma vez. Guarde como senha. Dá para apagar a qualquer momento. Só quem cria ou edita conteúdo tem essa opção.

> Antes disso, rode a migração `supabase/migrations/0022_logger_bridge.sql` (depois da 0021).

## 2. API
Endereço: `https://pingorax.online/api/public/logger`. Sempre com o cabeçalho `Authorization: Bearer plx_...`.

### GET — conteúdos que o token pode alimentar
Resposta: `{ "ok": true, "events": [{ "id": "uuid", "title": "...", "starts_at": "..." }] }` (próximos conteúdos e os de até 12 h atrás que você edita).

### POST — enviar dados
```json
{
  "event_id": "uuid do conteúdo",
  "session_id": "uuid (opcional)",
  "silver": 1500000,
  "items": [{ "name": "Tomo de ...", "quantity": 1, "unit_value": 250000, "looted_by": "Nick", "external_id": "id-unico-do-item" }],
  "dps": [{ "nick": "Nick", "damage": 1234567, "healing": 0 }]
}
```
- Sem `session_id`: usa a sessão aberta mais recente do conteúdo (ou cria "Loot (programa)").
- `items` são **acrescentados**. Com `external_id`, reenviar o mesmo item não duplica.
- `dps` e `silver` são **a fotografia atual** (valores acumulados): cada envio substitui o anterior daquele jogador.
- Limites: 200 itens e 100 jogadores por envio, corpo até 200 KB. `unit_value` pode ficar 0 (o caller ajusta no site).
- Erros: `401` token inválido, `403` sem permissão no conteúdo, `400` dados inválidos, `413` grande demais.

## 3. Discord
No conteúdo, na sessão de loot, **Enviar ao Discord** responde ao card do conteúdo com a divisão e o top 5 de dps. O card precisa já ter sido postado no Discord.

## Segurança
O banco guarda só o hash do token. O token só consegue enviar loot/dps para conteúdos que você edita; não lê nada além da lista de conteúdos.
