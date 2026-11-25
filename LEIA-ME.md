# Livro de Formatura — 3º ano

Aplicativo para montar o livro de formatura com modelos prontos, fotos, textos editáveis e exportação para impressão em A4 paisagem.

## Como abrir

- **Na web:** https://brunodiasef.github.io/livro-de-formatura/ (use no computador, com Chrome ou Edge). O site é atualizado sozinho a cada envio para a branch `main`. As fotos e o projeto ficam só no navegador de quem usa; nada vai para o GitHub.
- **Sem internet:** dê duplo clique em **`Livro de Formatura.html`**. Ele abre no navegador (Chrome ou Edge) e funciona sem internet.
- O projeto é salvo sozinho no navegador deste computador. Para guardar num arquivo (backup ou outro PC), use **Projeto › Salvar…** (**Ctrl+S**). Na primeira vez você escolhe o nome e a pasta; depois, **Ctrl+S** regrava sempre o mesmo arquivo. **Salvar como…** (**Ctrl+Shift+S**) grava num arquivo novo. Ao **abrir** um projeto, o Ctrl+S passa a gravar nele mesmo. O arquivo `.livro.json` inclui as fotos. (Isso funciona no Chrome e no Edge; em outros navegadores cada salvamento vai para a pasta Downloads.)
- **Para alterar o código:** rode `npm run dev`. Depois de mexer, rode `npm run build` para atualizar o `Livro de Formatura.html`.

### No celular

Abra o mesmo link no navegador do celular. A tela muda sozinha para o modo celular (no computador nada muda):

- **Barra de baixo:** **Folhas** (escolher a folha), **Editar** (opções do item selecionado), **Modelos** e **Ajustar** (volta a mostrar a página inteira). Cada uma abre uma gaveta que sobe de baixo; toque de novo ou em **Fechar** para esconder.
- **Uma página por vez:** deslize o dedo para o lado para ver a outra página e passar de folha.
- **Toque** seleciona. **Arraste** um item **já selecionado** para mover (arrastar um item não selecionado só rola a tela, para não mexer sem querer). **Toque duas vezes** num texto para editar, ou numa foto para escolher/enquadrar.
- **Dois dedos (pinça)** dão zoom. **Segurar o dedo** abre o menu (copiar, colar, travar, mudar a ordem…).

> O projeto aberto pelo `npm run dev` (endereço localhost) e o aberto pelo arquivo `.html` ficam guardados em lugares diferentes do navegador. Para levar o trabalho de um para o outro, use Salvar cópia / Abrir projeto.

## Formato de impressão

| Item | Medida |
|---|---|
| Folha | A4 paisagem, 297 × 210 mm |
| Página do livro (meia folha) | A5 retrato, 148,5 × 210 mm, corte vertical no meio |
| Espaço de um aluno | 148,5 × 105 mm (2 por página, 4 por folha) |
| Margem de segurança | 10 mm da borda da folha, 8 mm da linha de corte, 5 mm entre os dois alunos |
| Resolução de exportação | 300 DPI (ou 200 DPI para rascunho) |

Com 30 alunos você usa cerca de 8 folhas (16 páginas). Sobram 2 espaços para capa, professores, turma, homenagens etc. Para essas páginas, use os modelos de **página inteira**.

As guias tracejadas no editor mostram a área segura (azul) e a linha de corte (vermelha). Elas **não** saem na impressão.

## Os 20 modelos

**Alunos (meia página, 4 por folha)**
1. Clássico · foto à esquerda: igual ao seu modelo do Qwen, foto com borda em tinta e texto ao lado.
2. Clássico · foto à direita: a versão espelhada.
3. Medalhão dourado: foto redonda com aro dourado, nome em letra cursiva e texto centralizado.
4. Moderno · foto sangrada: foto ocupando a lateral inteira e tipografia moderna.
5. Polaroid: foto em moldura polaroid levemente inclinada.
6. Perfil do aluno: foto em arco com os campos Apelido, Um sonho, Uma lembrança e Recado.
7. Minha trajetória: 3 fotos (infância, adolescência, hoje) ligadas por uma linha do tempo.
8. Duas fotos sobrepostas: foto principal e uma segunda foto menor com borda branca.
9. Mensagem de despedida: citação grande com aspas e uma foto pequena com o nome.
10. Aquarela suave · foto à direita: foto esfumada com mancha rosé e nome cursivo.

**Página inteira**

11. Capa
12. Nossa turma: foto da turma e lista com 30 nomes.
13. Professores: 6 fotos redondas com nome e disciplina.
14. Homenagem (aos pais): foto em arco e texto.
15. Momentos especiais: colagem com 4 fotos.
16. Galeria moderna: 3 fotos.
17. Foto em destaque: foto de página inteira com uma faixa de legenda.
18. Gratidão / agradecimentos: moldura dourada e ramos de louro.
19. Aluno em destaque: orador ou homenageado, em página inteira.
20. Contracapa: mensagem final, brasão da escola e ano.

Ao trocar de modelo, a foto e os textos que você já inseriu continuam no lugar.

## Fundos, molduras e enfeites

- **9 fundos de página** (clique numa área vazia da página › Fundo da página): Aquarela creme, Creme liso, Clássico com moldura, Rosé suave, Branco, Escuro elegante, Aquarela sálvia, Pergaminho e Cantos ornamentados.
- **12 molduras de foto** (clique na foto › Moldura › Estilo): Aquarela em tinta, Aquarela suave, Retângulo, Cantos arredondados, Círculo/oval, Arco, Polaroid, Passe-partout dourado, Foto com fita adesiva, Papel rasgado, Borda ondulada e Coração. A Borda ondulada e o Coração aceitam borda dourada, branca, marrom ou preta. Para mudar várias fotos de uma vez, selecione todas (retângulo ou Shift + clique) e use a seção **Fotos selecionadas**: moldura, difusão da borda, borda, sombra, filtro, brilho e contraste.
- **23 enfeites** (botão **Enfeite** na barra de cima). Os 10 mais novos são: Faixa de fita (para pôr o nome por cima), Arabesco, Canto ornamentado (use **Espelhar** para os outros cantos), Raminho de folhas, Florzinha, Coração, Estrela, Confete dourado, Diploma (canudo) e Selo/medalha. Todos trocam de cor.

## Fluxo sugerido

1. **Alunos em lote**: selecione as fotos de todos os alunos de uma vez. O nome vem do nome do arquivo. Cole os textos e o app monta as páginas.
2. Ajuste cada aluno. Duplo clique na foto ativa o enquadramento (arraste para posicionar, roda do mouse para dar zoom). Duplo clique no texto abre a edição. Nas molduras aquarela, **Difusão da borda** (aba Editar › Moldura) controla a largura do degradê em que a foto vai sumindo: 0 deixa a borda nítida, 100 deixa bem esfumada.
   - **Texto em volta da foto:** clique no texto › **Contornar as fotos**. Estique a caixa de texto por cima da foto e o texto desvia do formato real da moldura (aquarela, círculo, coração…), linha por linha. **Distância da foto** ajusta o respiro. Com **Separar sílabas**, as palavras que não cabem são quebradas com hífen no lugar certo (con-se-quen-te-men-te). **Justificado** deixa o contorno mais elegante. Se o texto tiver quebras feitas à mão, o botão **Juntar as linhas que quebrei à mão** tira essas quebras.
   - **Mudar a ordem dos alunos/professores:** clique numa área vazia do bloco (aluno de cima ou de baixo) e use **Subir** / **Descer** no painel (ou **Alt+↑ / Alt+↓**, ou o botão direito). O bloco troca de lugar com o vizinho e passa de uma página para outra sozinho; o fundo das páginas não muda. **Organizar a ordem de todos…** abre a lista do livro inteiro para arrastar. **Apagar bloco** (ou tecla **Delete** com o bloco selecionado) pergunta se os próximos sobem uma casa ou se só esvazia aquele espaço.
   - **Mudar a ordem das páginas:** clique numa área vazia da página › **Mover para trás / para frente** (ou o botão direito). A página anda uma casa: da direita para a esquerda da mesma folha, depois para a folha anterior, e quem estava lá desce. **Organizar a ordem das páginas…** abre a lista para arrastar.
3. Monte a capa, os professores e a turma com os modelos de página inteira.
4. **Exportar para impressão** → PDF A4. Ao clicar em **Exportar…**, o app pergunta onde salvar e com que nome (no Chrome/Edge; ele lembra a última pasta). Na impressora, escolha **"Tamanho real / 100%"**.
5. Para cortar, escolha a ordem das páginas:
   - **Sequencial:** cada folha tem as páginas 1–2, 3–4 e assim por diante.
   - **Cortar e empilhar:** corte a pilha inteira de uma vez e coloque a pilha da direita embaixo da da esquerda.

## Atalhos

| Ação | Atalho |
|---|---|
| Desfazer / Refazer | Ctrl+Z / Ctrl+Y |
| Copiar / Recortar / Colar (entre páginas) | Ctrl+C / Ctrl+X / Ctrl+V |
| Copiar o aluno inteiro (foto, textos e enfeites) | Clique numa área vazia do aluno e Ctrl+C |
| Menu com copiar, colar, duplicar e excluir | Botão direito do mouse |
| Agrupar / Desagrupar os itens selecionados | Ctrl+G / Ctrl+Shift+G |
| Editar um item só, dentro de um grupo | Duplo clique nele |
| Travar / destravar (cadeado): o item não se move, não é editado nem apagado | Ctrl+Shift+L |
| Destravar o livro inteiro (todas as páginas) | Projeto › Destravar o livro inteiro (também no painel da página e no botão direito) |
| Duplicar elemento | Ctrl+D |
| Excluir elemento | Delete |
| Mover elemento | Setas (0,5 mm) · Shift+Setas (5 mm) |
| Enquadrar a foto direto | Alt + arrastar |
| Zoom da tela | Ctrl + roda do mouse |
| Folha anterior / próxima | PageUp / PageDown |
| Girar de 15 em 15° ou manter proporção | Shift (com a alça) |
| Selecionar vários (como no Canva) | Arrastar um retângulo a partir de uma área vazia |
| Pôr ou tirar um item da seleção | Shift + clique |
| Selecionar tudo da folha | Ctrl+A |
| Duplicar arrastando (como no Word) | Ctrl + arrastar |
| Mover só na horizontal ou vertical | Shift + arrastar (Ctrl+Shift duplica travado) |
| Mover sem encaixar nas guias | Alt (ao arrastar) |

## Estrutura do código

```
src/
  constants.js   medidas (mm), margens de segurança, cores, molduras, enfeites
  templates.js   os 20 modelos (coordenadas em mm) e a troca de modelo mantendo o conteúdo
  render.js      renderizador único (tela e impressão): fundos, fotos, textos e enfeites
  editor.js      folha aberta: seleção, arrastar, redimensionar, girar, enquadrar, soltar fotos
  ui.js          barra superior, lista de folhas, aba Modelos e aba Editar
  export.js      PDF A4 com marca de corte, PDF A5 e PNG, a 300 DPI, com checagens antes de imprimir
  batch.js       inserir alunos em lote
  state.js       dados do livro, desfazer/refazer, salvamento automático
  images.js      importação de fotos (corrige a rotação de fotos de celular)
  db.js          armazenamento no navegador (IndexedDB)
  project.js     salvar e abrir o arquivo .livro.json
  fonts.js       13 famílias de fontes embutidas (funcionam offline)
```
