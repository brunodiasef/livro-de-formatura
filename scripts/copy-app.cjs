// Copia o app empacotado para a raiz com um nome fácil de achar
require('fs').copyFileSync('dist/index.html', 'Livro de Formatura.html');
console.log('Pronto: abra "Livro de Formatura.html" com duplo clique.');
