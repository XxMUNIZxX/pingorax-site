# Privacidade: o que é público e o que não é

## Ver é livre, escrever pede login
- Qualquer pessoa vê a lista de conteúdos, a página de cada conteúdo, as builds, as lutas e as kills, sem entrar.
- Para **pingar, entrar na fila, falar no chat e entrar na voz** é preciso estar logado (Discord, Google ou e-mail) e ter o nick do Albion no perfil. Pingar só é aceito com o nick do próprio perfil (migração 0019).
- Os botões do Discord continuam pedindo o nick do jogo; eles passam por funções do banco com permissão própria.

## O que é público de verdade (por desenho)
- Nome de exibição, nick do Albion, foto e guilda do perfil. A guilda lista os membros.
- Quem pingou em cada conteúdo (nick e arma), a fila de espera e o chat.
- O e-mail **nunca** fica no perfil.

## Conteúdo privado ("só com o link")
É **não listado**, como um vídeo não listado do YouTube:
- Não aparece na página inicial, na lista de conteúdos nem na página da guilda, e a página pede aos buscadores para não indexar.
- O endereço leva um código impossível de adivinhar. Quem recebe o link abre, pinga e fala no chat normalmente, e pode repassá-lo.
- **Não é protegido por senha.** Quem usar a API pública do Supabase com a chave pública do site consegue listar os conteúdos privados, as inscrições e o chat deles. Por isso: não coloque nada realmente sigiloso (senhas, dados pessoais) na descrição ou no chat de um conteúdo privado.

### Por que não fechamos isso no banco
O site público e o bot do Discord leem os conteúdos com a mesma chave pública. Esconder os privados da API exigiria uma credencial própria para o bot, funções de leitura por id e mudanças no tempo real (inscrições e chat ao vivo). Decidimos manter simples e documentar o limite. Se um dia for necessário, o caminho é:
1. Criar uma credencial de serviço do Supabase só para o bot (guardada na Cloudflare).
2. Trocar a regra de leitura das tabelas `events`, `event_weapons`, `signups`, `waitlist`, `attendance` e `event_messages` para esconder as linhas de conteúdos privados de quem não os gerencia.
3. Abrir cada conteúdo privado por uma função do banco que recebe o id.
