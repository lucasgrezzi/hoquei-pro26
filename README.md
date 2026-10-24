# Hóquei Pro 26

Jogo de hóquei no gelo em 3D que roda direto no navegador do PC, feito com [Three.js](https://threejs.org/). Não precisa instalar nada, não tem etapa de build e funciona offline.

## Como jogar

1. Baixe ou clone o repositório:
   ```
   git clone https://github.com/lucasgrezzi/hoquei-pro26.git
   ```
2. Abra o arquivo `index.html` no Chrome, Edge ou Firefox.

Pronto. Tudo, inclusive o Three.js, já está na pasta `lib`.

## Modos de jogo

- **Jogo rápido:** 1 jogador contra a CPU, 2 jogadores no mesmo PC ou CPU contra CPU. Dá para escolher entre 40 times: 8 brasileiros e os 32 da Liga Pro.
- **Carreira de jogador:** crie o seu atleta (nome, número, posição, visual e estilo de jogo) com prévia 3D, escolha um dos 32 times da Liga Pro e jogue temporadas com playoffs. A cada jogo você ganha XP para evoluir os atributos até 99 de overall. No fim da temporada há prêmios, histórico e a opção de trocar de time.
- **Carreira de clube:** comande um time brasileiro numa liga com fase de grupos, semifinais e final em melhor de 3.

## Regras

Segue as regras e as medidas oficiais da NHL:

- 3 períodos (de 2 a 20 minutos, à sua escolha)
- Impedimento e icing, que podem ser desligados
- Prorrogação 3 contra 3 e, se continuar empatado, **shootout jogável**
- Faceoffs, pancadas (body check), one-timers e dribles

## Controles

| Ação | Teclado (P1) | Teclado (P2) | Controle |
|---|---|---|---|
| Patinar | W A S D (ou setas no modo 1 jogador) | Setas | Analógico esquerdo |
| Sprint | Shift esquerdo | Shift direito / Num 0 | LT / LB |
| Passe (segure = mais forte) | J ou Espaço | Num 1 / vírgula | A |
| Chute (toque = pulso, segure = slapshot) | K | Num 2 / ponto | X ou RT |
| Drible | L | Num 3 / barra | B ou RB |
| Trocar de jogador (sem o disco) | J ou Espaço | Num 1 / vírgula | A |
| Body check (sem o disco) | K | Num 2 / ponto | X ou RT |
| Roubar com o taco (sem o disco) | L | Num 3 / barra | B ou RB |

- **Mirar o canto do gol:** segure cima ou baixo ao soltar o chute.
- **Faceoff:** aperte passe ou chute no instante em que o disco cai.
- **Outros atalhos:** **Esc** pausa, **C** troca a câmera (TV, Próxima, Alta e Pro) e **M** liga ou desliga o som.
- **Carreira de jogador:** você controla só o seu atleta. Sem o disco, **J** pede o passe.

## Gráficos

- Arena fechada com teto, treliças, holofotes, camarotes e torcida animada
- Telão central com transmissão ao vivo, placar e "GOL!" piscando a cada gol
- Reflexo dos jogadores no gelo, marcas de patins e spray de gelo
- Jogadores e goleiros detalhados, com camisas de tecido, números, escudos e rostos variados
- Sons sintetizados na hora: torcida, taco, tabela, apito e sirene
- Dois níveis de qualidade no menu: **Alto** (sombras, reflexo e antialias) e **Leve** (para PCs mais fracos)

## Estrutura do projeto

| Arquivo | O que tem |
|---|---|
| `index.html` / `style.css` | Telas, HUD e estilos |
| `js/config.js` | Medidas do rinque, times, elencos e dificuldades |
| `js/rink.js` | Gelo, tabelas, arena, torcida e luzes |
| `js/fx.js` | Reflexo do gelo, telão, spray, marcas e bandeiras |
| `js/models.js` | Modelos 3D dos jogadores, goleiros e disco |
| `js/entities.js` | Física e animação de disco, jogadores e goleiros |
| `js/ai.js` | Inteligência artificial dos times |
| `js/input.js` | Teclado e controle (Gamepad API) |
| `js/game.js` | Loop do jogo, colisões, regras e câmeras |
| `js/shootout.js` | Disputa de shootout |
| `js/ui.js` | Placar, minimapa e relatórios |
| `js/career.js` | Carreira de clube |
| `js/procareer.js` | Carreira de jogador e Liga Pro |
| `js/main.js` | Menu, configurações, loop principal e testes |

## Testes automáticos

Alguns parâmetros na URL rodam testes e mostram o resultado na página. Por exemplo:

- `index.html?auto`: partida CPU x CPU completa e acelerada
- `index.html?shot=1`: captura a cena na câmera Próxima
- `index.html?proJogo`: partida da carreira de jogador, com prorrogação e shootout
- `index.html?proTemporada`: duas temporadas completas simuladas

A lista completa e o histórico de desenvolvimento estão no [`CONTINUAR.md`](CONTINUAR.md).

## Observações

- Os times, nomes e marcas do jogo são fictícios. A Liga Pro usa os apelidos dos times da NHL com outras cidades e outras cores.
- O progresso das carreiras fica salvo no próprio navegador (localStorage).
