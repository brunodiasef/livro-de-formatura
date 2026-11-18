# Livro de Formatura — 3º ano

Aplicativo para montar o livro de formatura com modelos prontos, fotos, textos editáveis e exportação para impressão em A4 paisagem.

## Como abrir

- **Na web:** https://brunodiasef.github.io/livro-de-formatura/ (use no computador, com Chrome ou Edge). O site é atualizado sozinho a cada envio para a branch `main`. As fotos e o projeto ficam só no navegador de quem usa; nada vai para o GitHub.
- **Sem internet:** dê duplo clique em **`Livro de Formatura.html`**. Ele abre no navegador (Chrome ou Edge) e funciona sem internet.
- O projeto é salvo sozinho no navegador deste computador. Para ter um backup ou levar para outro PC, use **Projeto › Salvar cópia do projeto**. O arquivo `.livro.json` inclui as fotos.
- **Para alterar o código:** rode `npm run dev`. Depois de mexer, rode `npm run build` para atualizar o `Livro de Formatura.html`.

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

## Fluxo sugerido

1. **Alunos em lote**: selecione as fotos de todos os alunos de uma vez. O nome vem do nome do arquivo. Cole os textos e o app monta as páginas.
2. Ajuste cada aluno. Duplo clique na foto ativa o enquadramento (arraste para posicionar, roda do mouse para dar zoom). Duplo clique no texto abre a edição.
3. Monte a capa, os professores e a turma com os modelos de página inteira.
4. **Exportar para impressão** → PDF A4. Na impressora, escolha **"Tamanho real / 100%"**.
5. Para cortar, escolha a ordem das páginas:
   - **Sequencial:** cada folha tem as páginas 1–2, 3–4 e assim por diante.
   - **Cortar e empilhar:** corte a pilha inteira de uma vez e coloque a pilha da direita embaixo da da esquerda.

## Atalhos

| Ação | Atalho |
|---|---|
| Desfazer / Refazer | Ctrl+Z / Ctrl+Y |
| Duplicar elemento | Ctrl+D |
| Excluir elemento | Delete |
| Mover elemento | Setas (0,5 mm) · Shift+Setas (5 mm) |
| Enquadrar a foto direto | Alt + arrastar |
| Zoom da tela | Ctrl + roda do mouse |
| Folha anterior / próxima | PageUp / PageDown |
| Girar de 15 em 15° ou manter proporção | Shift (com a alça) |
| Mover sem encaixar nas guias | Ctrl (ao arrastar) |

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
