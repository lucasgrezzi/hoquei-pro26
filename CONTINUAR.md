# Hóquei Pro 26: onde paramos

> Para retomar: abra o Claude Code na pasta `Desktop/hoquei` e diga
> **"leia o CONTINUAR.md e vamos melhorar os gráficos"**.

## Repositório
- Git próprio nesta pasta, branch `main`, remoto `origin` = https://github.com/lucasgrezzi/hoquei-pro26 (criado em 26/10).
- Ao fim de cada rodada de trabalho: `git add -A && git commit` e `git push` (só quando o usuário pedir para salvar/subir).

## Como rodar
- Dois cliques em `index.html`. Funciona offline, sem instalar nada (Three.js r149 local em `lib/`).
- Scripts clássicos, sem build. As variáveis globais são compartilhadas entre os arquivos, na ordem do `index.html`.

## Arquivos
| Arquivo | O que tem |
|---|---|
| `js/config.js` | Medidas da pista (padrão NHL, em metros), 8 times fictícios, geração de elenco, dificuldades, utilitários |
| `js/audio.js` | Sons 100% sintetizados (WebAudio): torcida, taco, tabela, trave, apito, sirene de gol |
| `js/rink.js` | Gelo (textura em canvas), tabelas com anúncios, vidro, gols, arquibancada em degraus, **classe `Crowd`** (torcedores em InstancedMesh), luzes |
| `js/models.js` | Modelos low-poly: jogador (IK de braço, joelho articulado), goleiro, disco |
| `js/entities.js` | `Puck`, `Skater` (física de patinação, ações, **animações** em `updateModel`), `Goalie` |
| `js/ai.js` | IA tática: posicionamento por situação, pressão, passe, chute, dump-in, evita impedimento |
| `js/input.js` | Teclado (layouts solo/p1/p2) e Gamepad API |
| `js/game.js` | Loop com física fixa a 120 Hz, colisões, disco, defesas, regras (impedimento, icing, faceoff, períodos, prorrogação 3x3), câmeras |
| `js/procareer.js` | **Carreira de jogador**: `Pro` (liga de 32 times, tabela, playoffs, XP/atributos, prêmios), `ProPreview` (prévia 3D com renderer próprio), `ProUI` (telas criar/editar, painel, fim de temporada, troca de time). Save em localStorage `hoquei-pro` |
| `js/ui.js` / `js/main.js` | HUD, placar, minimapa, menus, pausa, relatórios; menu com jogo de demonstração ao fundo |

## O que já está pronto
- Partida completa: 3 períodos e prorrogação 3x3 com gol de ouro; modos 1P x CPU, 2P local e CPU x CPU.
- Regras: impedimento, icing, faceoff com timing, goleiro segurando o disco, chute bloqueado, trave e travessão.
- Ações: passe (com força), chute de pulso e slapshot com mira, one-timer, deke, body check, poke check, sprint com estamina.
- Câmeras (tecla **C**): TV, Próxima, Alta e **Pro**.
  - A Pro fica atrás do jogador, longe (18 m) e alta (11 m), sempre olhando para o gol de ataque.
  - Não gira com o jogador e tem distância mínima garantida nos contra-ataques.
  - Na Pro, os controles são relativos à câmera.
- Goleiro: faz borboleta em chute baixo e fica em pé em chute alto; a chance de defesa está em `Game.saveChance`.
- Animações: passada com joelho, deslize, crossover nas curvas, freada, patinação de costas em "C", torção do tronco no chute, cabeça seguindo o disco, comemoração com o taco para cima, goleiro inclinando e erguendo a luva.
- Torcida 3D animada.
  - Cerca de 62% torce para o time da casa, 26% para o visitante e o resto é neutro.
  - Reage via `game.cheer(time, intensidade)`: pula no gol, levanta em chutes, traves, defesas e pancadas.

## Testes automáticos (Chrome headless)
```
chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=5000 --dump-dom "file:///.../index.html?auto"
```
- `?auto`: simula uma partida CPU x CPU inteira e escreve um JSON em `<pre id="autotest">` (erros, placar, chutes, tipos de gol em `dbg`).
- `?shot=N`: tira um print com a câmera N (0 TV, 1 Próxima, 2 Alta, 3 Pro). Use `--screenshot=arquivo.png --window-size=1280,720`.
  - `?shot=0&hype` mostra a torcida comemorando.
- Use um `--user-data-dir` diferente a cada execução e timeout de cerca de 150 s.

## Rodada de gráficos de 24/10 (feito e testado sem erros)
- Novo arquivo `js/fx.js` com quatro peças:
  - `IceReflection`: reflexo planar no gelo, só no gráfico Alto. Renderiza a cena por uma câmera espelhada e injeta o resultado no shader do gelo via `onBeforeCompile`, com fresnel e sem escurecer o gelo.
  - `IceSpray`: partículas de gelo nas freadas e nos slapshots.
  - `IceMarks`: marcas de patins desenhadas na textura do gelo durante o jogo; nas freadas o risco é mais largo e esbranquiçado.
  - `Jumbotron`: telão central com placar e relógio ao vivo, que pisca "GOL!" quando sai gol.
- Anel de holofotes no teto e anel de LED azul embaixo do telão.
- Camisas: nome levemente curvado nas costas acima do número, números nos ombros, escudo no peito e listras nas mangas.
- Nas câmeras TV e Próxima, a torcida do lado da câmera fica escondida, como numa transmissão real.
- Equilíbrio: faceoff agora em ~50/50 (`c.r.fo * 0.3`); goleiro com base 0.92 e penalidade de posição menor.
  - Últimos testes: 5 gols em 42 chutes (88% de defesas) e 5 gols em 34 chutes (85%).

## Rodada de arena de 24/10 (tarde, testado sem erros)
- **Reflexo do gelo refeito** (`IceReflection` em `fx.js`): o passe do reflexo limpa com alfa 0, corta tudo acima de 4,2 m (plano de corte) e esconde a arquibancada (`arena.stands`) e a torcida. O shader usa o alfa como máscara, então jogadores, tabelas e anúncios refletem nítidos e o resto do gelo fica branco. Força 0.8 em `game.js`.
- **Telão com transmissão ao vivo** (`buildJumbotron` em `rink.js` + classe `Jumbotron` em `fx.js`), inspirado numa foto de arena real que o usuário mandou:
  - 4 telas mostram uma câmera de TV em close (`Jumbotron.cam`) renderizada numa textura a cada 2 quadros (Alto) ou 4 (Leve);
  - faixa de placar com "AO VIVO", cabeçalho "ARENA LBH", saia amarela de anúncio, anel de LED e cabos;
  - no gol, as telas alternam entre a transmissão e "GOL!" na cor do time.
- **Teto** (`buildRoof`): forro escuro, treliças metálicas (InstancedMesh), passarela clara dos holofotes e halos (sprites aditivos). Fica tudo no grupo `overhead`, escondido quando a câmera passa de 20 m (câmera Alta).
- (A câmera "Arquibancada" foi criada e depois removida a pedido do usuário.)
- `?auto`: sem erros, 2 a 1, 3 gols em 31 chutes no alvo.

## Rodada de 24/10 (noite): arena fechada + modo carreira (testado sem erros)
- **Telão nunca atrapalha:** subiu para y = 18,5 e `Jumbotron.fade()` projeta a caixa do telão na tela; se algum canto cair abaixo de 80% da altura, ele some suavemente. A câmera Arquibancada foi removida (o usuário achou desnecessária).
- **Arena fechada** (`rink.js`): anel de camarotes iluminados, faixa de LED, parede superior inclinada até o teto e `ArenaFlags` (8 bandeiras dos times nas laterais; Brasil e banners de campeão nos fundos, balançando).
  - Camarotes, LED e parede usam `THREE.BackSide`: só a face de dentro é desenhada. Assim, quando a câmera TV recua para fora no canto (tela larga), ela enxerga através. Esse foi um bug reportado pelo usuário: a parede tampava a tela.
- **Modo carreira de clubes** (`js/career.js`, botão "MODO CARREIRA" no menu):
  - escolha do clube, dificuldade e duração; 2 grupos de 4 em turno e returno (6 rodadas); os 2 primeiros de cada grupo vão às semifinais (1ºA x 2ºB, 1ºB x 2ºA) e depois à final, tudo em melhor de 3 (mando do melhor colocado nos jogos 1 e 3);
  - pontos: V = 3, VP = 2, DP = 1; os outros jogos são simulados por ratings (`simGame`);
  - na carreira não há empate: pênaltis **simulados** (`simShootout`) no relatório;
  - o humano pode jogar como visitante (`opts.humanSide`, a dificuldade vale para a CPU);
  - progresso salvo no localStorage (`hoquei-career`); sair no meio da partida volta para a carreira sem contar o jogo.
- Testes novos: `?carreira=N` (simula N partidas e abre a tela), `?carreiraNova` (tela de escolha), `?carreiraJogo` (partida fora de casa até o fim) e `?shot=0&view=x,y,z,ax,ay,az` (câmera livre).

## Rodada de 25/10: shootout jogável + personagens novos (testado sem erros)
- **Shootout** (`js/shootout.js`, métodos adicionados ao `Game`): acontece em qualquer modo quando a prorrogação termina empatada.
  - 3 cobranças por time e depois morte súbita; acaba antes quando um time já não alcança o outro. Visitante bate primeiro. Sem rebote; tempo limite de 14 s.
  - Estados `soSetup` → `soPlay` → `soEnd`; `game.live()` vale para `play` e `soPlay`; `stopPlay` e `goalScored` encerram a cobrança enquanto `game.so` existir.
  - Câmera própria atrás do batedor; controles relativos à câmera (cima = avançar, esquerda/direita miram o canto no chute).
  - CPU: plano "chute" (de 6 a 9,5 m) ou "drible" (finta a ~5 m e chuta oposto). `saveChance`: −0,08 no shootout e −0,13 em chute logo após drible (`shot.deke`).
  - Equilíbrio medido: CPU 24–29% de conversão (NHL ≈ 31%), 68% de defesas; humano simulado 28%.
  - Na carreira, os pênaltis simulados foram trocados pelo shootout jogável (`game.soWinner`).
- **Modelos novos** (`js/models.js` reescrito, mesma interface de esqueleto):
  - tronco em perfil de torno com camisa sobre o calção, listras na barra, gola em V, escudo do time (`crestTexture`) e nome/número curvos nas costas (`torsoBand`);
  - capacete com viseira transparente, orelheiras, respiros e jugular; rosto com olhos, sobrancelhas, nariz e boca; pele e cabelo variados por nome (`hashStr`); altura e porte variados;
  - luvas com rolos dos dedos e polegar, punho dinâmico (`arm.cuff`, posicionado no IK); patins com bota em perfil, língua, suporte e lâmina; meião listrado (textura);
  - taco com manopla, grafismo e lâmina com fita;
  - goleiro: caneleiras com desenho do time na frente (`padTexture`), rolos do joelho, colete, pegador com bolso e trava em T, blocker desenhado, máscara pintada com abertura e grade "olho de gato";
  - `PartBuilder` funde as peças fixas de cada osso; as de cor sólida viram uma malha com *vertex colors*. Passada principal: 637 → 451 chamadas.
- Testes novos: `?soTeste` (40 shootouts CPU), `?soHumano` (teclas simuladas), `?soFinal` (prorrogação empatada → shootout → carreira), `?shot=0&so=3` (print da cobrança), `?shot=0&vitrine&view=...` (vitrine dos modelos; `&bf=1` = goleiro em borboleta). O modo `?shot` grava `calls`/`tris` em `<pre id=autotest>`.

## Rodada de 26/10: carreira de jogador + Liga Pro (testado sem erros)
- **Liga Pro** (`LIGA` em `config.js`): os 32 times da NHL com os apelidos originais, mas com outra cidade e outras cores (ex.: Thornhill Maple Leafs em verde, Edgemont Oilers em vermelho e marinho). `conf` 0 = Leste, 1 = Oeste. `ALL_TEAMS = [...TEAMS, ...LIGA]` alimenta o jogo rápido e a demo.
- **Criar jogador**: nome, sobrenome, número, posição (C/AE/AD/DE/DD), empunhadura, pele, cabelo, altura, porte, fita do taco, estilo (4 de ataque, 2 de defesa) e time. Prévia 3D girável (arraste) com zoom no rosto. O jogador pode ser editado depois (botão "Editar jogador").
- `makeSkaterModel(..., look)` aceita `{skin, hair, tall, wide, tape}`; o elenco passa `data.look`.
- **Na partida** (`opts.lock`): o humano controla só o atleta (`data.me`), e `switchHuman` fica travado fora do shootout. J/Espaço sem o disco **pede o passe** (`callForPass`). O atleta bate primeiro no shootout e, se for ala, fica no gelo na prorrogação 3x3 (sai o defensor do mesmo lado). O bônus do faceoff só vale quando o atleta é o centro.
- **Temporada**: 10/20/41/82 jogos (método do círculo; todos os 32 jogam a cada rodada). Os 8 melhores de cada conferência vão aos playoffs (1x8, 4x5, 2x7, 3x6), em 4 fases de melhor de 3, 5 ou 7. Pontos no estilo NHL: V = 2, DP = 1.
- **Evolução**: XP por jogo = (40 + 50·G + 35·A + 6·chute + 5·pancada + vitória 30, ou 20 na prorrogação; derrota na prorrogação 10) × dificuldade (0,8/1/1,25) × playoffs 1,2 × simulado 0,5. Custo por +1: 10 XP até 69, 15 até 79, 25 até 89 e 40 até 99. O overall é a média ponderada por função (`OVR_W`), e tudo em 99 dá 99. Há também um botão "Distribuir automaticamente". Numa temporada de 41 jogos simulados o atleta chega a cerca de 90; jogando de verdade, a evolução é mais rápida.
- O overall do atleta mexe na força do time nas simulações (`Pro.strength`). Os prêmios de fim de temporada (artilheiro, MVP, melhor defensor, novato do ano, campeão, MVP dos playoffs) comparam o atleta com líderes estimados.
- Corrigido um bug da carreira de clubes: o time de índice 0 vencendo uma série era tratado como "sem vencedor" (`!x.winner`).
- Testes: `?proNova[&rosto]`, `?proHub=N[&gasta][&tab=tab|est]`, `?proTemporada` (2 temporadas de 41 jogos), `?proJogo[=LW|LD]` e `?proVer` (print em jogo).

## Rodada de 26/10 (2): gráficos dos jogadores (testado sem erros)
- `rim(mat)` em `models.js`: luz de contorno via `onBeforeCompile` em todos os materiais dos jogadores, para destacar a silhueta contra o gelo como numa transmissão.
- Tecido (`fab`, `fabricTexture`): normal map gerado em canvas (trama + dobras irregulares que repetem sem emenda), Phong com brilho de poliéster. Vale para camisa, mangas, meiões e calção (este mais brilhante, como nylon). **Só no modo Alto**; no Leve continua Lambert. `PartBuilder` agrupa os materiais com normalMap na chave 'f'.
- Rosto: `faceMat` desenha olhos (íris marrom, azul ou verde, com brilho), pálpebras, sobrancelhas, órbitas, sombra do nariz, lábios e barba rala em ~40% dos jogadores, num pedaço de esfera na frente da cabeça. A viseira ficou mais transparente (0,2).
- Silhueta: ombros mais largos (TORSO), mangas largas e afuniladas, sem juntas de bola no cotovelo, e queixo e maçãs do rosto refeitos.
- Corrigido: a prévia 3D da carreira podia "explodir" o zoom, porque o 1º quadro do rAF vinha com dt negativo.
- Celular/tablet (`pointer: coarse`) sem configuração salva começa no modo Leve.
- Chamadas de desenho na câmera Próxima: 451 → ~512, por causa da malha do rosto.
- **Falta para o mobile de verdade: controles de toque** (joystick virtual + botões passe/chute/drible). Hoje só há teclado e gamepad.

## Rodada de 26/10 (3): velocidade do disco (testado sem erros; os controles de toque desta rodada foram removidos depois)
- **Controles de toque** (`Touch`/`setupTouch` em `input.js`, `#touch` no HUD): joystick flutuante na metade esquerda (aparece onde o dedo encosta; além da borda = sprint) e botões à direita: CHUTE (segure = slap), PASSE e DRIBLE. Os rótulos mudam sem o disco (PANCADA/ONE-TIMER, TROCAR ou PEDIR, ROUBAR; FACEOFF no faceoff) em `UI.touchLabels`. Há também botões de pausa (II) e câmera (CAM) no topo, e vibração ao tocar.
- Liga sozinho em `pointer: coarse` ou no primeiro `touchstart`. `?touch` força para teste; `?touch&toqueTeste` simula os toques.
- Ao começar a partida no celular: tela cheia e trava na horizontal (Android). Na vertical aparece o aviso "Gire o celular". Menu compacto e botões fixos no rodapé em telas baixas (`max-height: 620px`), e prévia menor ao lado dos campos na criação do jogador.
- A classe dos botões de toque é `.tbtn`, porque `.tb` já é usada pelas barras do menu.
- **Disco mais lento / menos icing**: atrito `dec = (1.0 + sp*0.03)` (era 0.5 + sp*0.012); chute de pulso 18+shot*0.09+p*4, slap 26+p*8+shot*0.05, passe máximo 23, isolamento de costas 11+p*8, dump 18. A CPU só faz dump-in depois da linha vermelha, e a saída pela tabela da própria zona ficou a 12,5. **Icing: 13–22 → 2–4 por partida**, goleiro em 87,7% (157/179), shootout em 29%.
- O `?auto` mostra `dbg.ICING_<tipo>` e `sv` (defesas de cada goleiro).

## Pendências e ideias para a próxima sessão
### Gráficos (prioridade do usuário)
- [x] Reflexo do gelo (resolvido com máscara de alfa).
- [ ] Telão: mostrar replay do gol nas telas (combina com o item Replay abaixo) e telas de intervalo/estatísticas.
- [ ] Arena: camarotes / segundo anel de arquibancada, escadas amarelas como na foto, câmeras de TV nos cantos.
- [ ] Rastro do disco em chutes fortes.
- [ ] Animação de goleiro: queda lateral (pad stack), defesa com o taco, recuperar posição.
- [ ] Replay do gol (gravar posições nos últimos ~5 s e reproduzir com câmera lenta).
- [x] Personagens mais detalhados (25/10).
- [ ] Próximo nível dos personagens: rostos/cabelo mais variados, barba, fita nos meiões, animação do goleiro (pad stack, defesa com o taco).
- [ ] Bancos de reservas e cabines de penalidade (teto já feito).
- [ ] Desempenho: no modo Alto a cena é renderizada até 3 vezes (reflexo + telão a cada 2 quadros). Se ficar pesado, renderizar o reflexo a cada 2 quadros ou em resolução menor.

### Jogabilidade
- [ ] Continuar monitorando o equilíbrio do goleiro (rodar `?auto` umas 4 vezes; alvo de 88 a 91%).
- [ ] Os testes `?auto` ficaram mais lentos: usar timeout de ~400 s por execução.
- [x] Shootout jogável.
- [ ] Shootout: o humano controlar o goleiro quando o time dele defende (hoje o goleiro é sempre da CPU).
- [ ] Penalidades (2 min), power play e penalty kill.
- [ ] Troca de linhas / cansaço por linha.
- [x] Modo carreira de clubes (grupos + playoffs).
- [ ] Carreira: estatísticas da temporada (artilheiros, goleiros), prêmios, evolução dos jogadores entre temporadas.
- [x] Modo carreira de jogador (26/10).
- [ ] Carreira de jogador: goleiro como posição jogável; contratos/propostas de times; estatísticas dos outros jogadores (líderes reais em vez de estimados); lesões; mudar a logo do centro do gelo para a Liga Pro nos jogos da liga.

### Celular: REMOVIDO (26/10, decisão do usuário)
- O usuário testou num celular real e decidiu **manter o jogo só para PC** ("tenho ideias melhores para o pc"). Foram removidos os controles de toque, a tela cheia/orientação, o aviso de girar, o menu compacto, a resolução adaptativa e o `?fps`. **Não sugerir mobile de novo** sem o usuário pedir.
- Ficaram, por serem úteis no PC: a correção de digitação nos campos de texto (Espaço/setas em inputs) e as telas roláveis que não cortam o topo em janelas baixas.

### Ideias anotadas no fim do dia (26/10), por prioridade sugerida
1. **Penalidades de 2 min + power play** (pedido antigo do usuário).
2. Replay do gol com câmera lenta, mostrado também no telão.
3. Animações novas: goleiro (pad stack, defesa com o taco), comemorações de gol variadas, jogadores batendo no vidro.
4. Troca de linhas com cansaço por linha (dá sentido aos elencos e à carreira).
5. Carreira de jogador: estatísticas reais de toda a liga, propostas de contrato, lesões e logo da Liga Pro no gelo.
6. Mais variedade visual: cabelos visíveis, barbas, tatuagens/fitas, uniformes alternativos (3ª camisa).
7. Som: narração simples por texto/voz sintetizada nos gols e grandes defesas.
