# Privacidade: o que é público e o que não é

## Ver é livre, escrever pede login
- Qualquer pessoa vê a lista de conteúdos públicos, a página de cada um, as builds, as lutas e as kills, sem entrar.
- Para **pingar, entrar na fila, falar no chat e entrar na voz** é preciso estar logado (Discord, Google ou e-mail) e ter o nick do Albion no perfil. Pingar só é aceito com o nick do próprio perfil (migração 0019).
- Os botões do Discord continuam pedindo o nick do jogo; eles passam por funções do banco com permissão própria.

## O que é público de verdade (por desenho)
- Nome de exibição, nick do Albion, foto e guilda do perfil. A guilda lista os membros.
- Quem pingou em cada conteúdo **público** (nick e arma), a fila de espera e o chat.
- O e-mail **nunca** fica no perfil.

## Conteúdo privado ("só com o link")
O banco esconde o conteúdo privado, as armas, as inscrições, a fila, o chat, as confirmações e o post do Discord de quem não tem acesso (migração 0020). Quem consulta a API do Supabase não vê nem lista os privados.

Quem enxerga um conteúdo privado:
1. quem abre o **link** dele (o site manda o id do conteúdo num cabeçalho `x-event-link`; o código do conteúdo é impossível de adivinhar);
2. quem **gerencia ou edita** o conteúdo (dono, administrador, editor delegado);
3. quem **já pingou ou está na fila** com o nick do próprio perfil (por isso ele aparece em Meus pings);
4. o **bot do Discord**: abre o conteúdo do botão em que alguém clicou pelo mesmo cabeçalho. Para os **lembretes e a limpeza automática** de conteúdos privados ele precisa de uma chave de serviço (veja abaixo).

Quem tiver o link pode repassá-lo: o link é a "senha". Além disso:
- A página pede aos buscadores para não indexar.
- Conteúdos privados **não recebem atualização em tempo real** do banco (o tempo real não vê o cabeçalho do link). Para eles, a página e o chat se atualizam sozinhos a cada poucos segundos.

### Chave de serviço do bot (opcional, para lembretes e limpeza de privados)
Sem ela, tudo funciona para conteúdos públicos, e os botões dos cartões privados também. Mas o lembrete de 30 minutos e a limpeza automática dos cartões **privados** não rodam, porque o bot não consegue listar o que não pode ver.

Para ligar:
1. No Supabase: *Project Settings → API Keys* e copie a chave **service_role** (ou *secret*).
2. Na Cloudflare, em *Variables and secrets* do Worker (runtime), crie `SUPABASE_SERVICE_ROLE_KEY` como **Secret**.
3. Faça o deploy.

Essa chave ignora todas as regras do banco. Ela só existe no servidor (nunca vai para o navegador). Se vazar, gire a chave no Supabase.

### Ordem para ativar a migração 0020
1. Dê o **deploy do site** com este código **antes**. O site antigo não manda o cabeçalho e deixaria de abrir os privados.
2. Rode `0020_private_protected.sql` no Supabase.
3. (Opcional) Cadastre a chave de serviço.
4. Teste: abra um conteúdo privado pelo link (deve abrir) e, numa aba anônima, veja que ele não aparece nas listas.
