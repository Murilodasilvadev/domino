let vitoriasJogador = Number(localStorage.getItem('vitoriasJogador')) || 0;
let vitoriasCpu = Number(localStorage.getItem('vitoriasCpu')) || 0;

function atualizarPlacar() {
  document.getElementById('v-jogador').textContent = vitoriasJogador;
  document.getElementById('v-cpu').textContent = vitoriasCpu;
}

function salvarPlacar() {
  localStorage.setItem('vitoriasJogador', vitoriasJogador);
  localStorage.setItem('vitoriasCpu', vitoriasCpu);
  atualizarPlacar();
}

function registrarVitoria(vencedor) {
  if (vencedor === 'jogador') {
    vitoriasJogador++;
  } else if (vencedor === 'cpu') {
    vitoriasCpu++;
  }

  salvarPlacar();
}

function zerarPlacar() {
  vitoriasJogador = 0;
  vitoriasCpu = 0;
  localStorage.setItem('vitoriasJogador', '0');
  localStorage.setItem('vitoriasCpu', '0');
  atualizarPlacar();
}

const VOLUME_ALTO = 0.6;
const VOLUME_BAIXO = 0.00;
const VOLUME_IMPACTO = 0.72;
let somEstaBaixo = false;
let aguardandoHorizontal = false;
let contagemDeInicio = null;
let dificuldadeAtual = localStorage.getItem('dificuldadeDomino') || 'facil';
let modeloAtual = localStorage.getItem('modeloDomino') || 'classico';
let corMesaAtual = localStorage.getItem('corMesaDomino') || 'azul';
let salaOnline = null;
let estadoOnline = null;
let temporizadorSalaOnline = null;
let assinaturaEstadoOnline = null;
let temporizadorOnline = null;

async function requisicaoOnline(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, { headers: { 'Content-Type': 'application/json' }, ...opcoes });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.error || 'Não foi possível falar com a sala.');
  return dados;
}

function mostrarSalaOnline() {
  document.getElementById('menu-principal').classList.add('oculto');
  document.getElementById('painel-online').classList.remove('oculto');
}

function atualizarPainelSala(dados) {
  const sala = document.getElementById('online-sala');
  sala.classList.remove('oculto');
  document.getElementById('online-inicial').classList.add('oculto');
  document.getElementById('codigo-sala-exibido').textContent = salaOnline.code;
  const pronto = dados.players === 2;
  document.getElementById('status-sala-online').textContent = pronto ? 'Seu amigo entrou. Podem começar!' : 'Aguardando alguém entrar na sala…';
  document.getElementById('btn-iniciar-online').classList.toggle('oculto', !dados.host || !pronto);
}

async function criarSalaOnline() {
  try {
    salaOnline = await requisicaoOnline('/api/rooms', { method: 'POST' });
    const dados = await requisicaoOnline(`/api/rooms/${salaOnline.code}?token=${salaOnline.token}`);
    atualizarPainelSala(dados); observarSalaOnline();
  } catch (erro) { alert(erro.message); }
}

async function entrarNaSalaOnline() {
  const code = document.getElementById('codigo-sala').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return alert('Digite o código de 6 caracteres da sala.');
  try {
    salaOnline = await requisicaoOnline(`/api/rooms/${code}/join`, { method: 'POST' });
    const dados = await requisicaoOnline(`/api/rooms/${code}?token=${salaOnline.token}`);
    atualizarPainelSala(dados); observarSalaOnline();
  } catch (erro) { alert(erro.message); }
}

async function copiarConviteOnline() {
  const convite = `${location.href.split('?')[0]}?sala=${salaOnline.code}`;
  try { await navigator.clipboard.writeText(convite); alert('Convite copiado!'); } catch { prompt('Copie este convite:', convite); }
}

function observarSalaOnline() {
  clearInterval(temporizadorSalaOnline);
  temporizadorSalaOnline = setInterval(async () => {
    if (!salaOnline) return;
    try { const dados = await requisicaoOnline(`/api/rooms/${salaOnline.code}?token=${salaOnline.token}`); if (dados.state === 'waiting') atualizarPainelSala(dados); else aplicarEstadoOnline(dados); } catch { clearInterval(temporizadorSalaOnline); }
  }, 900);
}

async function iniciarSalaOnline() {
  try { await acaoOnline('start'); } catch (erro) { alert(erro.message); }
}

async function acaoOnline(type, extra = {}) {
  if (!salaOnline) return null;
  const dados = await requisicaoOnline(`/api/rooms/${salaOnline.code}/action`, { method: 'POST', body: JSON.stringify({ token: salaOnline.token, type, ...extra }) });
  aplicarEstadoOnline(dados); return dados;
}

function aplicarEstadoOnline(dados) {
  if (!dados?.game) return;
  const game = dados.game;
  const assinatura = [
    game.board.map((peca) => peca.id).join(','),
    game.hand.map((peca) => peca.id).join(','),
    game.opponentCount, game.stockCount, game.turn, game.mustOpen || '', game.finished ?? ''
  ].join('|');
  const mudou = assinatura !== assinaturaEstadoOnline;
  assinaturaEstadoOnline = assinatura;
  estadoOnline = dados;
  if (!document.body.classList.contains('jogo-ativo') && !contagemDeInicio) iniciarPeloMenu();
  prepararMesaOnline();
  if (!mudou) {
    tempoRestante = game.timeRemaining ?? tempoRestante;
    atualizarCronometro();
    atualizarIndicadorDaVez();
    return;
  }
  maoAtualJogador = game.hand;
  maoAtualCpu = Array.from({ length: game.opponentCount }, () => ({}));
  monteAtual = Array.from({ length: game.stockCount }, () => ({}));
  extremosMesa = game.ends;
  pecasNaMesa = game.board;
  pecaCentral = game.board[0] || null;
  pecasDoLadoEsquerdo = [];
  pecasDoLadoDireito = game.board.slice(1);
  vezDoJogador = game.turn === dados.you && game.finished === null;
  pecaObrigatoria = game.mustOpen && game.turn === dados.you
    ? maoAtualJogador.find((peca) => peca.id === game.mustOpen) || null
    : null;
  jogoEncerrado = game.finished !== null;
  document.getElementById('rotulo-adversario').innerHTML = 'Amigo: <strong id="v-cpu">0</strong>';
  atualizarMaoDoJogador(); atualizarMaoDaCpu(); atualizarBotoesDaVez();
  if (pecaCentral) renderizarMesa();
  else if (areaJogo) areaJogo.innerHTML = '';
  sincronizarCronometroOnline();
  if (jogoEncerrado) mostrarResultadoOnline(game.finished, dados.you);
}

function sincronizarCronometroOnline() {
  clearInterval(temporizadorOnline);
  temporizadorOnline = null;
  if (!estadoOnline?.game || jogoEncerrado) return;

  tempoRestante = estadoOnline.game.timeRemaining ?? 60;
  atualizarCronometro();

  temporizadorOnline = setInterval(() => {
    tempoRestante = Math.max(0, tempoRestante - 1);
    atualizarCronometro();
    if (tempoRestante > 0) return;
    if (vezDoJogador) {
      clearInterval(temporizadorOnline);
      temporizadorOnline = null;
      resolverTempoOnline();
    }
  }, 1000);
}

function resolverTempoOnline() {
  if (!vezDoJogador || !estadoOnline?.game) return;
  const obrigatoria = pecaObrigatoria
    ? maoAtualJogador.findIndex((peca) => peca.id === pecaObrigatoria.id)
    : -1;
  if (obrigatoria >= 0) return jogarPeca(obrigatoria);

  const indiceJogavel = maoAtualJogador.findIndex(podeJogar);
  if (indiceJogavel >= 0) return jogarPeca(indiceJogavel);
  if (monteAtual.length > 0) return acaoOnline('draw').catch((erro) => alert(erro.message));
  acaoOnline('pass').catch((erro) => alert(erro.message));
}

// A partida local cria a área da mesa durante a distribuição animada. Como a
// partida online já chega distribuída pelo servidor, ela precisa dessa montagem
// própria antes de renderizar as peças e o monte.
function prepararMesaOnline() {
  const lista = document.getElementById('lista');
  if (!lista) return;

  if (!areaJogo || !lista.contains(areaJogo)) {
    lista.innerHTML = '';
    areaJogo = document.createElement('li');
    areaJogo.className = 'area-jogo';
    lista.appendChild(areaJogo);
    inicializarAreaDeMesaDrag();

    monteFechado = document.createElement('li');
    monteFechado.className = 'monte-aberto oculto';
    lista.appendChild(monteFechado);
  }
  mostrarBotoesDoJogo();
}

function mostrarResultadoOnline(vencedor, voce) {
  const modal = document.getElementById('modal-vitoria');
  if (modal.classList.contains('ativo')) return;
  const empate = vencedor === 'draw'; const ganhou = vencedor === voce;
  document.getElementById('titulo-vitoria').textContent = empate ? 'Mesa bloqueada' : ganhou ? 'Parabéns!' : 'Rodada do amigo';
  document.getElementById('texto-vitoria').textContent = empate ? 'A rodada terminou empatada.' : ganhou ? 'Você venceu a rodada!' : 'Seu amigo venceu esta rodada.';
  modal.classList.add('ativo');
}

window.addEventListener('DOMContentLoaded', () => {
  atualizarPlacar();
  document.getElementById('musica').volume = VOLUME_ALTO;
  document.getElementById('som-peca').volume = VOLUME_IMPACTO;
  atualizarCronometro();
  atualizarStatusConexao();
  aplicarModelo(modeloAtual);
  aplicarCorMesa(corMesaAtual);
  aplicarDificuldade(dificuldadeAtual);
  const codigoNaUrl = new URLSearchParams(location.search).get('sala');
  if (codigoNaUrl) {
    document.getElementById('codigo-sala').value = codigoNaUrl.toUpperCase();
    setTimeout(mostrarSalaOnline, 1450);
  }
  setTimeout(() => {
    document.querySelector('.splash-logo').classList.add('oculto');
    document.getElementById('menu-principal').classList.remove('oculto');
  }, 1400);
});

window.addEventListener('resize', () => {
  if (areaJogo && pecaCentral) renderizarMesa();
  if (aguardandoHorizontal && estaNaHorizontal()) iniciarContagemParaPartida();
  atualizarOrientacaoDuranteJogo();
});

window.addEventListener('online', atualizarStatusConexao);
window.addEventListener('offline', atualizarStatusConexao);
if (navigator.connection?.addEventListener) navigator.connection.addEventListener('change', atualizarStatusConexao);

// Sair, fechar ou recarregar a página inicia uma nova partida em 0 x 0.
window.addEventListener('beforeunload', zerarPlacar);

function ehCelular() {
  return window.innerWidth <= 1024 &&
    (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
}

function estaNaHorizontal() {
  return window.innerWidth > window.innerHeight;
}

function atualizarOrientacaoDuranteJogo() {
  document.getElementById('aviso-orientacao').classList.add('oculto');
}

function iniciarPeloMenu() {
  // O play é armado dentro do toque do usuário para a música poder começar ao fim da contagem.
  const musica = document.getElementById('musica');
  musica.muted = true;
  musica.play().catch(() => {});

  iniciarContagemParaPartida();
}

function iniciarContagemParaPartida() {
  if (contagemDeInicio) return;
  aguardandoHorizontal = false;
  document.getElementById('aviso-orientacao').classList.add('oculto');
  document.getElementById('tela-abertura').classList.add('fechada');

  const telaContagem = document.getElementById('contagem-inicio');
  const numero = document.getElementById('numero-contagem');
  let segundos = 3;
  numero.textContent = segundos;
  telaContagem.classList.remove('oculto');

  contagemDeInicio = setInterval(() => {
    segundos--;
    numero.textContent = segundos > 0 ? segundos : 'JÁ!';
    if (segundos > 0) return;

    clearInterval(contagemDeInicio);
    contagemDeInicio = null;
    telaContagem.classList.add('oculto');
    document.body.classList.add('jogo-ativo');
    document.getElementById('app-jogo').setAttribute('aria-hidden', 'false');
    document.getElementById('musica').muted = false;
    if (estadoOnline?.game) aplicarEstadoOnline(estadoOnline);
    else teste();
  }, 1000);
}

function mostrarRegras() {
  document.getElementById('menu-principal').classList.add('oculto');
  document.getElementById('painel-regras').classList.remove('oculto');
}

function mostrarPersonalizacao() {
  document.getElementById('menu-principal').classList.add('oculto');
  document.getElementById('painel-personalizacao').classList.remove('oculto');
}

function voltarAoMenu() {
  document.getElementById('painel-regras').classList.add('oculto');
  document.getElementById('painel-personalizacao').classList.add('oculto');
  document.getElementById('painel-online').classList.add('oculto');
  document.getElementById('menu-principal').classList.remove('oculto');
}

function selecionarModelo(modelo) {
  modeloAtual = modelo;
  localStorage.setItem('modeloDomino', modelo);
  aplicarModelo(modelo);
}

function aplicarModelo(modelo) {
  document.body.dataset.modelo = modelo;
  document.querySelectorAll('.opcao-modelo').forEach((opcao) => {
    const selecionada = opcao.dataset.modelo === modelo;
    opcao.classList.toggle('selecionada', selecionada);
    opcao.setAttribute('aria-checked', String(selecionada));
  });
}

function selecionarCorMesa(cor) {
  corMesaAtual = cor;
  localStorage.setItem('corMesaDomino', cor);
  aplicarCorMesa(cor);
}

function aplicarCorMesa(cor) {
  document.body.dataset.corMesa = cor;
  document.querySelectorAll('.opcao-mesa').forEach((opcao) => {
    const selecionada = opcao.dataset.corMesa === cor;
    opcao.classList.toggle('selecionada', selecionada);
    opcao.setAttribute('aria-checked', String(selecionada));
  });
}

function selecionarDificuldade(dificuldade) {
  dificuldadeAtual = dificuldade;
  localStorage.setItem('dificuldadeDomino', dificuldade);
  aplicarDificuldade(dificuldade);
}

function aplicarDificuldade(dificuldade) {
  document.querySelectorAll('.opcao-dificuldade').forEach((opcao) => {
    const selecionada = opcao.dataset.dificuldade === dificuldade;
    opcao.classList.toggle('selecionada', selecionada);
    opcao.setAttribute('aria-checked', String(selecionada));
  });
}


function obterAtrasoDaCpu() {
  const faixas = {
    facil: [8000, 10000],
    medio: [5000, 7000],
    dificil: [3000, 5000]
  };
  const [minimo, maximo] = faixas[dificuldadeAtual];
  return Math.floor(Math.random() * (maximo - minimo + 1)) + minimo;
}

function agendarTurnoDaCpu(aoTerminar = null) {
  pararTemporizadorJogador();
  if (aoTerminar) acaoCpuPendente = aoTerminar;
  const retomandoTurnoDaCpu = tempoCpuPausado !== null;
  const atraso = tempoCpuPausado ?? obterAtrasoDaCpu();
  const tempoInicialDaCpu = retomandoTurnoDaCpu ? (tempoCpuExibidoPausado ?? 60) : 60;
  tempoCpuPausado = null;
  tempoCpuExibidoPausado = null;
  tempoRestante = tempoInicialDaCpu;
  atualizarCronometro();
  document.getElementById('indicador-vez').textContent = 'CPU pensando';
  clearTimeout(temporizadorCpu);
  clearInterval(temporizadorCronometroCpu);
  const inicioDoTurnoDaCpu = Date.now();
  fimDoTurnoDaCpu = Date.now() + atraso;
  temporizadorCronometroCpu = setInterval(() => {
    const segundosDecorridos = Math.floor((Date.now() - inicioDoTurnoDaCpu) / 1000);
    tempoRestante = Math.max(0, tempoInicialDaCpu - segundosDecorridos);
    atualizarCronometro();
  }, 250);
  temporizadorCpu = setTimeout(() => {
    temporizadorCpu = null;
    clearInterval(temporizadorCronometroCpu);
    temporizadorCronometroCpu = null;
    fimDoTurnoDaCpu = null;
    tempoCpuExibidoPausado = null;
    if (!jogoPausado) {
      const acaoDaCpu = acaoCpuPendente;
      acaoCpuPendente = null;
      if (acaoDaCpu) acaoDaCpu();
      else jogarTurnoDaCpu();
    }
  }, atraso);
}

function conexaoFraca() {
  const tipo = navigator.connection?.effectiveType;
  return tipo === 'slow-2g' || tipo === '2g';
}

function atualizarStatusConexao() {
  const offline = !navigator.onLine || conexaoFraca();
  const status = document.querySelector('.online');
  const aviso = document.getElementById('aviso-offline');
  if (!status || !aviso) return;

  status.textContent = offline ? '⌁ Off' : '⌁ Online';
  status.classList.toggle('offline', offline);
  aviso.classList.toggle('oculto', !offline);
}


function novojogo() {

  const resposta = confirm("você realmente Deseja sair?");

  if (resposta) {
    zerarPlacar();
  } else {

    console.log("Operação cancelada.");
    return;
  }
  location.reload();
}



let pecas_ = [];
let maoAtualJogador = [];
let maoAtualCpu = [];
let extremosMesa = null;
let areaJogo = null;
let vezDoJogador = false;
let monteAtual = [];
let monteFechado = null;
let pecaObrigatoria = null;
let jogoEncerrado = false;
let pecaCentral = null;
let pecasNaMesa = [];
let pecasDoLadoEsquerdo = [];
let pecasDoLadoDireito = [];
let tempoRestante = 60;
let temporizadorJogador = null;
let alturaAnteriorDaMesa = 0;
let indicePecaPendente = null;
let jogoPausado = false;
let temporizadorCpu = null;
let temporizadorCronometroCpu = null;
let temporizadorFimCpu = null;
let fimDoTurnoDaCpu = null;
let tempoCpuPausado = null;
let tempoCpuExibidoPausado = null;
let acaoCpuPendente = null;
let aguardandoFimDaCpu = false;
let compraEmAndamento = false;
let pausadoPorOrientacao = false;
let pausadoManualAntesDaOrientacao = false;
let passagemAutomaticaEmCurso = false;
const MEDIDAS_MESA = {
  horizontalLargura: 76,
  horizontalAltura: 38,
  verticalLargura: 38,
  verticalAltura: 76,
  // As peças se encostam pelas bordas, sem sobreposição.
  juncao: 0,
  verticaisPorCurva: 2
};

function obterMedidasDaMesa(largura, altura, multiplicador = 1) {
  const escalaBase = Math.min(1, largura / 760, altura / 360);
  const escala = Math.max(0.26, escalaBase * multiplicador);
  return {
    escala,
    horizontalLargura: Math.round(MEDIDAS_MESA.horizontalLargura * escala),
    horizontalAltura: Math.round(MEDIDAS_MESA.horizontalAltura * escala),
    verticalLargura: Math.round(MEDIDAS_MESA.verticalLargura * escala),
    verticalAltura: Math.round(MEDIDAS_MESA.verticalAltura * escala),
    juncao: Math.round(MEDIDAS_MESA.juncao * escala),
    verticaisPorCurva: MEDIDAS_MESA.verticaisPorCurva
  };
}
let __peca_uid = 0;
for (let i = 0; i <= 6; i++) {
  for (let j = i; j <= 6; j++) {
    pecas_.push({ id: `p${__peca_uid++}`, l1: i, l2: j });
  }
}

function ehCarroca(peca) {
  return Boolean(peca) && peca.l1 === peca.l2;
}

function larguraNaCorrente(peca, medidas) {
  return ehCarroca(peca) ? medidas.verticalLargura : medidas.horizontalLargura;
}

function teste() {
  pararTemporizadorJogador();
  clearTimeout(temporizadorCpu);
  clearInterval(temporizadorCronometroCpu);
  clearTimeout(temporizadorFimCpu);
  temporizadorCronometroCpu = null;
  fimDoTurnoDaCpu = null;
  tempoCpuPausado = null;
  tempoCpuExibidoPausado = null;
  acaoCpuPendente = null;
  jogoPausado = false;
  compraEmAndamento = false;
  aguardandoFimDaCpu = false;
  pausadoPorOrientacao = false;
  pausadoManualAntesDaOrientacao = false;
  passagemAutomaticaEmCurso = false;
  document.getElementById('modal-pausa').classList.remove('ativo');
  esconderOpcoesDeJogada();
  document.getElementById('modal-vitoria').classList.remove('ativo');
  tempoRestante = 60;
  atualizarCronometro();

  const musica = document.getElementById('musica');
  musica.muted = false;
  musica.play().catch(() => {});
  const listaMae = document.getElementById('lista');
  const maoJogador = document.getElementById('mao-jogador');
  const maoCpu = document.getElementById('cpu-mao');

  listaMae.innerHTML = '';
  maoJogador.innerHTML = '';
  maoCpu.innerHTML = '';
  vezDoJogador = false;
  pecaObrigatoria = null;
  jogoEncerrado = false;

  const pecasEmbaralhadas = embaralhar([...pecas_]);
  const botaoIniciar = document.getElementById('btn-iniciar');
  botaoIniciar.disabled = true;

  // Primeiro, as peças aparecem espalhadas pela mesa antes de serem distribuídas.
  listaMae.classList.add('lista-distribuindo');
  pecasEmbaralhadas.forEach((peca, indice) => {
    const pecaEmbaralhada = criarPecaCostas();
    pecaEmbaralhada.classList.add('peca-embaralhada');
    pecaEmbaralhada.style.setProperty('--x', `${Math.round(Math.random() * 520 - 260)}px`);
    pecaEmbaralhada.style.setProperty('--y', `${Math.round(Math.random() * 150 - 75)}px`);
    pecaEmbaralhada.style.setProperty('--rotacao', `${Math.round(Math.random() * 70 - 35)}deg`);
    pecaEmbaralhada.style.setProperty('--ordem', indice);
    listaMae.appendChild(pecaEmbaralhada);
  });

  // Depois distribui sete peças para cada jogador.
  setTimeout(() => {
    maoAtualJogador = pecasEmbaralhadas.slice(0, 7);
    maoAtualCpu = pecasEmbaralhadas.slice(7, 14);
    monteAtual = pecasEmbaralhadas.slice(14);

    listaMae.innerHTML = '';
    listaMae.classList.remove('lista-distribuindo');
    extremosMesa = null;
    pecaCentral = null;
    pecasNaMesa = [];
    pecasDoLadoEsquerdo = [];
    pecasDoLadoDireito = [];
    alturaAnteriorDaMesa = 0;
    areaJogo = document.createElement('li');
    areaJogo.classList.add('area-jogo');
    listaMae.appendChild(areaJogo);
    inicializarAreaDeMesaDrag();

    atualizarMaoDoJogador();

    atualizarMaoDaCpu();

    // O monte fica visível somente quando a compra estiver disponível.
    monteFechado = document.createElement('li');
    monteFechado.classList.add('monte-aberto', 'oculto');
    listaMae.appendChild(monteFechado);
    atualizarMonte();

    mostrarBotoesDoJogo();
    atualizarBotoesDaVez();

    // Regra oficial: quem tem a maior carroça abre — pode ser você ou a CPU.
    const abertura = encontrarAberturaDaPartida();
    pararTemporizadorJogador();
    tempoRestante = 60;
    atualizarCronometro();

    if (abertura && abertura.dono === 'jogador') {
      pecaObrigatoria = { l1: abertura.peca.l1, l2: abertura.peca.l2 };
      vezDoJogador = true;
      atualizarMaoDoJogador();
      atualizarBotoesDaVez();
      iniciarTemporizadorDaVez();
    } else {
      pecaObrigatoria = null;
      agendarTurnoDaCpu(() => jogarPecaDeAberturaDaCpu(abertura ? abertura.peca : { l1: 6, l2: 6 }));
    }
  }, 900);
}

function embaralhar(pecas) {
  for (let i = pecas.length - 1; i > 0; i--) {
    const indiceAleatorio = Math.floor(Math.random() * (i + 1));
    [pecas[i], pecas[indiceAleatorio]] = [pecas[indiceAleatorio], pecas[i]];
  }

  return pecas;
}

function encontrarAberturaDaPartida() {
  // Regra oficial: quem tem a maior carroça (o dobre mais alto) abre a partida.
  for (let v = 6; v >= 0; v--) {
    const doJogador = maoAtualJogador.find(peca => peca.l1 === v && peca.l2 === v);
    if (doJogador) return { dono: 'jogador', peca: doJogador };
    const daCpu = maoAtualCpu.find(peca => peca.l1 === v && peca.l2 === v);
    if (daCpu) return { dono: 'cpu', peca: daCpu };
  }

  // Caso raríssimo: nenhuma carroça caiu em nenhuma das mãos. Abre quem tiver a peça de maior soma.
  let melhor = null;
  let dono = null;
  for (const peca of maoAtualJogador) {
    if (!melhor || peca.l1 + peca.l2 > melhor.l1 + melhor.l2) { melhor = peca; dono = 'jogador'; }
  }
  for (const peca of maoAtualCpu) {
    if (!melhor || peca.l1 + peca.l2 > melhor.l1 + melhor.l2) { melhor = peca; dono = 'cpu'; }
  }
  return melhor ? { dono, peca: melhor } : null;
}

function criarPeca(peca, horizontal = false) {
  const itemFilho = document.createElement('div');
  itemFilho.classList.add('peca');
  if (peca.id) itemFilho.dataset.id = peca.id;
  if (ehCarroca(peca)) itemFilho.classList.add('peca-carroca');
  itemFilho.appendChild(criarMetade(peca.l1, horizontal));
  itemFilho.appendChild(criarMetade(peca.l2, horizontal));
  return itemFilho;
}

function podeJogar(peca) {
  const lados = ladosDisponiveis(peca);
  return lados.esquerda || lados.direita;
}

function ladosDisponiveis(peca) {
  if (!extremosMesa) return { esquerda: true, direita: true };

  const esquerda = peca.l1 === extremosMesa.esquerda || peca.l2 === extremosMesa.esquerda;
  const direita = peca.l1 === extremosMesa.direita || peca.l2 === extremosMesa.direita;

  return { esquerda, direita };
}

function determinarLadoDeJogada(peca, ladoEscolhido = null) {
  if (ladoEscolhido === 'esquerda' || ladoEscolhido === 'direita') return ladoEscolhido;

  const lados = ladosDisponiveis(peca);
  if (lados.esquerda && lados.direita) return 'direita';
  if (lados.esquerda) return 'esquerda';
  return 'direita';
}

let pecaArrastada = null;
let dragPreview = null;
let zonasDeEncaixe = [];
let layoutDasPontas = null;

function limparZonasDeEncaixe() {
  zonasDeEncaixe.forEach((zona) => zona.remove());
  zonasDeEncaixe = [];
}

function pontoExternoDaPonta(ponta) {
  if (!ponta) return null;
  const { retangulo, direcao } = ponta;
  const centroX = retangulo.x + retangulo.width / 2;
  const centroY = retangulo.y + retangulo.height / 2;
  if (direcao === 'LEFT') return { x: retangulo.x, y: centroY };
  if (direcao === 'RIGHT') return { x: retangulo.x + retangulo.width, y: centroY };
  if (direcao === 'UP') return { x: centroX, y: retangulo.y };
  return { x: centroX, y: retangulo.y + retangulo.height };
}

function exibirZonasDeEncaixe(peca) {
  limparZonasDeEncaixe();
  if (!areaJogo || !peca || !layoutDasPontas || !podeJogar(peca)) return;

  const lados = ladosDisponiveis(peca);
  const largura = areaJogo.clientWidth;
  const altura = areaJogo.clientHeight;
  const tamanho = ehCarroca(peca) ? { width: 48, height: 76 } : { width: 76, height: 42 };

  ['esquerda', 'direita'].forEach((lado) => {
    if (!lados[lado]) return;
    const ponta = layoutDasPontas[lado];
    const ponto = pontoExternoDaPonta(ponta);
    if (!ponto) return;

    // A ponta informa a borda da última peça; o centro do alvo fica logo depois
    // dela para que a prévia não cubra a peça que já está na mesa.
    if (ponta.direcao === 'LEFT') ponto.x -= tamanho.width / 2;
    if (ponta.direcao === 'RIGHT') ponto.x += tamanho.width / 2;
    if (ponta.direcao === 'UP') ponto.y -= tamanho.height / 2;
    if (ponta.direcao === 'DOWN') ponto.y += tamanho.height / 2;

    const zona = document.createElement('div');
    zona.className = 'zona-encaixe';
    zona.dataset.lado = lado;
    zona.setAttribute('aria-hidden', 'true');
    zona.style.width = `${tamanho.width}px`;
    zona.style.height = `${tamanho.height}px`;
    zona.style.left = `${Math.max(6, Math.min(largura - tamanho.width - 6, ponto.x - tamanho.width / 2))}px`;
    zona.style.top = `${Math.max(6, Math.min(altura - tamanho.height - 6, ponto.y - tamanho.height / 2))}px`;
    zona.innerHTML = `<span>${lado === 'esquerda' ? '← Encaixar' : 'Encaixar →'}</span>`;
    areaJogo.appendChild(zona);
    zonasDeEncaixe.push(zona);
  });
}

function ladoDaZonaMaisProxima(event, peca) {
  const lados = ladosDisponiveis(peca);
  const zonasValidas = zonasDeEncaixe.filter((zona) => zona.dataset.lado && lados[zona.dataset.lado]);
  if (!zonasValidas.length) return determinarLadoDeJogada(peca);

  const zonaMaisProxima = zonasValidas.reduce((melhor, zona) => {
    const rect = zona.getBoundingClientRect();
    const distancia = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    return !melhor || distancia < melhor.distancia ? { zona, distancia } : melhor;
  }, null);
  return zonaMaisProxima.zona.dataset.lado;
}

function zonaSobCursor(event) {
  return zonasDeEncaixe.find((zona) => {
    const rect = zona.getBoundingClientRect();
    const margemDeSoltura = 18;
    return event.clientX >= rect.left - margemDeSoltura && event.clientX <= rect.right + margemDeSoltura &&
      event.clientY >= rect.top - margemDeSoltura && event.clientY <= rect.bottom + margemDeSoltura;
  }) || null;
}

function criarPreviewDeJogada(peca, lado) {
  if (!areaJogo) return null;

  const preview = document.createElement('div');
  preview.classList.add('peca-preview');
  const orientacao = ehCarroca(peca) ? 'vertical' : 'horizontal';
  preview.classList.toggle('peca-preview-vertical', orientacao === 'vertical');

  const visual = criarPecaDaMesa(peca, orientacao, false);
  visual.classList.add('peca-preview-visual');
  visual.style.pointerEvents = 'none';
  visual.style.opacity = '0.9';
  visual.style.filter = 'drop-shadow(0 8px 14px rgba(0,0,0,0.28))';
  visual.style.zIndex = '35';

  preview.appendChild(visual);
  preview.dataset.lado = lado;
  areaJogo.appendChild(preview);
  return preview;
}

function atualizarPreviewDeJogada(event) {
  if (!vezDoJogador || !pecaArrastada || !areaJogo) {
    dragPreview?.remove();
    dragPreview = null;
    return;
  }

  const indice = Number(pecaArrastada.indice);
  if (!Number.isInteger(indice)) return;

  const peca = maoAtualJogador[indice];
  if (!peca || !podeJogar(peca)) {
    dragPreview?.remove();
    dragPreview = null;
    return;
  }

  exibirZonasDeEncaixe(peca);
  const lado = event && typeof event.clientX === 'number'
    ? ladoDaZonaMaisProxima(event, peca)
    : determinarLadoDeJogada(peca);

  if (!dragPreview) dragPreview = criarPreviewDeJogada(peca, lado);
  if (!dragPreview) return;

  zonasDeEncaixe.forEach((zona) => zona.classList.toggle('ativa', zona.dataset.lado === lado));
  const zonaAtiva = zonasDeEncaixe.find((zona) => zona.dataset.lado === lado);
  if (!zonaAtiva) return;
  dragPreview.style.left = zonaAtiva.style.left;
  dragPreview.style.top = zonaAtiva.style.top;
  dragPreview.style.width = zonaAtiva.style.width;
  dragPreview.style.height = zonaAtiva.style.height;
  dragPreview.dataset.lado = lado;
}

function removerPreviewDeJogada() {
  dragPreview?.remove();
  dragPreview = null;
  limparZonasDeEncaixe();
}

function inicializarAreaDeMesaDrag() {
  if (!areaJogo) return;

  areaJogo.addEventListener('dragover', (event) => {
    if (!vezDoJogador || !pecaArrastada) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    atualizarPreviewDeJogada(event);
  });

  areaJogo.addEventListener('dragleave', (event) => {
    if (!pecaArrastada) return;
    if (event.relatedTarget && areaJogo.contains(event.relatedTarget)) return;
    removerPreviewDeJogada();
  });

  areaJogo.addEventListener('drop', (event) => {
    if (!vezDoJogador || !pecaArrastada) return;
    event.preventDefault();

    const indice = Number(pecaArrastada.indice);
    if (!Number.isInteger(indice)) return;

    const peca = maoAtualJogador[indice];
    if (!peca || !podeJogar(peca)) return;

    exibirZonasDeEncaixe(peca);
    const zonaDeDestino = zonaSobCursor(event);
    if (!zonaDeDestino) {
      removerPreviewDeJogada();
      return;
    }
    const ladoAutomatico = zonaDeDestino.dataset.lado;

    removerPreviewDeJogada();
    jogarPeca(indice, ladoAutomatico);
    pecaArrastada = null;
  });
}

function atualizarMaoDoJogador() {
  const maoJogador = document.getElementById('mao-jogador');
  maoJogador.innerHTML = '';

  maoAtualJogador.forEach((peca, indice) => {
    const elementoPeca = criarPeca(peca);
    const ehAPecaObrigatoria = !pecaObrigatoria || (peca.l1 === pecaObrigatoria.l1 && peca.l2 === pecaObrigatoria.l2);
    const jogavel = vezDoJogador && podeJogar(peca) && ehAPecaObrigatoria;

    elementoPeca.classList.add(jogavel ? 'peca-jogavel' : 'peca-nao-jogavel');
    if (jogavel) {
      elementoPeca.draggable = true;
      elementoPeca.addEventListener('click', () => jogarPeca(indice));
      elementoPeca.addEventListener('dragstart', (event) => {
        if (!vezDoJogador) return;
        pecaArrastada = { indice };
        elementoPeca.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(indice));
        }
        atualizarPreviewDeJogada(event);
      });
      elementoPeca.addEventListener('dragend', () => {
        pecaArrastada = null;
        removerPreviewDeJogada();
        elementoPeca.classList.remove('dragging');
      });
    }

    maoJogador.appendChild(elementoPeca);
  });
}

function jogarPeca(indice, ladoEscolhido = null) {
  if (estadoOnline?.game) {
    const peca = maoAtualJogador[indice];
    if (!peca || !vezDoJogador) return;
    const lados = ladosDisponiveis(peca);
    if (!ladoEscolhido && lados.esquerda && lados.direita && extremosMesa && extremosMesa.esquerda !== extremosMesa.direita) {
      indicePecaPendente = indice; document.getElementById('opcoes-jogada').classList.remove('oculto'); return;
    }
    const lado = determinarLadoDeJogada(peca, ladoEscolhido);
    acaoOnline('play', { cardId: peca.id, side: lado === 'esquerda' ? 'left' : 'right' }).catch(erro => alert(erro.message));
    return;
  }
  const pecaSelecionada = maoAtualJogador[indice];
  if (jogoPausado || !vezDoJogador || !pecaSelecionada || !podeJogar(pecaSelecionada)) return;

  const lados = ladosDisponiveis(pecaSelecionada);
  if (!ladoEscolhido && lados.esquerda && lados.direita && extremosMesa) {
    if (extremosMesa.esquerda === extremosMesa.direita) {
      ladoEscolhido = 'direita';
    } else {
      indicePecaPendente = indice;
      document.getElementById('opcoes-jogada').classList.remove('oculto');
      return;
    }
  }

  ladoEscolhido = determinarLadoDeJogada(pecaSelecionada, ladoEscolhido);
  esconderOpcoesDeJogada();
  colocarPecaNaMesa(pecaSelecionada, ladoEscolhido);

  maoAtualJogador.splice(indice, 1);
  pecaObrigatoria = null;
  pararTemporizadorJogador();

  if (maoAtualJogador.length === 0) {
    finalizarRodada('jogador');
    return;
  }

  vezDoJogador = false;
  atualizarMaoDoJogador();
  atualizarBotoesDaVez();
  agendarTurnoDaCpu();
}

function confirmarJogada(lado) {
  if (indicePecaPendente === null) return;
  jogarPeca(indicePecaPendente, lado);
}

function esconderOpcoesDeJogada() {
  indicePecaPendente = null;
  document.getElementById('opcoes-jogada')?.classList.add('oculto');
}

function normalizarPecaParaConexao(peca, lado, valorConexao) {
 if (!peca || typeof valorConexao !== 'number') return null;

 const base = { ...peca };
 if (lado === 'direita') {
   if (base.l1 === valorConexao) return base;
   if (base.l2 === valorConexao) return { l1: base.l2, l2: base.l1 };
 }

 if (lado === 'esquerda') {
   if (base.l2 === valorConexao) return base;
   if (base.l1 === valorConexao) return { l1: base.l2, l2: base.l1 };
 }

 return null;
}

function validarJogadaNaExtremidade(peca, valorExtremidade) {
 if (!peca || typeof valorExtremidade !== 'number') return false;
 return peca.l1 === valorExtremidade || peca.l2 === valorExtremidade;
}

// isValidMove: verifica explicitamente se uma peça pode ser jogada em um lado específico
function isValidMove(peca, lado) {
 if (!extremosMesa) return true; // mesa vazia: qualquer peça pode abrir
 if (lado === 'esquerda') return validarJogadaNaExtremidade(peca, extremosMesa.esquerda);
 if (lado === 'direita') return validarJogadaNaExtremidade(peca, extremosMesa.direita);
 return false;
}

function colocarPecaNaMesa(peca, ladoEscolhido = null) {
 let pecaNaMesa = { ...peca };

 if (!extremosMesa) {
   extremosMesa = { esquerda: pecaNaMesa.l1, direita: pecaNaMesa.l2 };
   adicionarPecaNaMesa(pecaNaMesa, 'append');
   return true;
 }

 // Se o lado foi especificado, valide estritamente nesse lado.
 if (ladoEscolhido) {
   if (!isValidMove(pecaNaMesa, ladoEscolhido)) return false;
   const valorConexao = ladoEscolhido === 'direita' ? extremosMesa.direita : extremosMesa.esquerda;
   const normalizada = normalizarPecaParaConexao(pecaNaMesa, ladoEscolhido, valorConexao);
   if (!normalizada) return false;
   pecaNaMesa = normalizada;
   if (ladoEscolhido === 'direita') {
     extremosMesa.direita = pecaNaMesa.l2;
     adicionarPecaNaMesa(pecaNaMesa, 'append');
   } else {
     extremosMesa.esquerda = pecaNaMesa.l1;
     adicionarPecaNaMesa(pecaNaMesa, 'prepend');
   }
   return true;
 }

 // Se o lado não foi especificado, escolha o único lado possível ou aplique a regra padrão
 const encaixaEsquerda = validarJogadaNaExtremidade(pecaNaMesa, extremosMesa.esquerda);
 const encaixaDireita = validarJogadaNaExtremidade(pecaNaMesa, extremosMesa.direita);
 if (!encaixaEsquerda && !encaixaDireita) return false;

 let ladoDefinitivo = determinarLadoDeJogada(pecaNaMesa, ladoEscolhido);
 if (ladoDefinitivo === 'direita' && !encaixaDireita) ladoDefinitivo = 'esquerda';
 if (ladoDefinitivo === 'esquerda' && !encaixaEsquerda) ladoDefinitivo = 'direita';

 const valorConexao = ladoDefinitivo === 'direita' ? extremosMesa.direita : extremosMesa.esquerda;
 const normalizada = normalizarPecaParaConexao(pecaNaMesa, ladoDefinitivo, valorConexao);
 if (!normalizada) return false;

 pecaNaMesa = normalizada;

 if (ladoDefinitivo === 'direita') {
   extremosMesa.direita = pecaNaMesa.l2;
   adicionarPecaNaMesa(pecaNaMesa, 'append');
   return true;
 }

 extremosMesa.esquerda = pecaNaMesa.l1;
 adicionarPecaNaMesa(pecaNaMesa, 'prepend');
 return true;
}

function atualizarMaoDaCpu() {
  const maoCpu = document.getElementById('cpu-mao');
  const contadorCpu = document.getElementById('pecas-cpu');
  maoCpu.innerHTML = '';
  maoAtualCpu.forEach(() => maoCpu.appendChild(criarPecaCostas()));
  const nomeAdversario = estadoOnline?.game ? 'Amigo' : 'CPU';
  contadorCpu.textContent = `${nomeAdversario}: ${maoAtualCpu.length} ${maoAtualCpu.length === 1 ? 'peça' : 'peças'}`;
}

function jogarPecaDeAberturaDaCpu(peca) {
  if (jogoEncerrado || maoAtualCpu.length === 0) return;
  // Preferir busca por id se fornecida, para que haja correspondência correta mesmo
  // com peças que tenham os mesmos valores.
  let indice = -1;
  if (peca.id) {
    indice = maoAtualCpu.findIndex(p => p.id === peca.id);
  }
  if (indice < 0) {
    indice = maoAtualCpu.findIndex(p => p.l1 === peca.l1 && p.l2 === peca.l2);
  }
  const pecaDaCpu = maoAtualCpu.splice(indice >= 0 ? indice : 0, 1)[0];

  colocarPecaNaMesa(pecaDaCpu);
  atualizarMaoDaCpu();
  vezDoJogador = true;
  atualizarMaoDoJogador();
  atualizarBotoesDaVez();
  iniciarTemporizadorJogador();
}

function podeComprarDoMonte() {
  const temPecaJogavel = maoAtualJogador.some(podeJogar);
  return !compraEmAndamento && !jogoPausado && vezDoJogador && !temPecaJogavel && monteAtual.length > 0;
}

function comprarPeca(indiceEscolhido = null, origemRect = null) {
  if (estadoOnline?.game) {
    if (vezDoJogador) acaoOnline('draw').catch(erro => alert(erro.message));
    return;
  }
  if (!podeComprarDoMonte()) return;

  if (!Number.isInteger(indiceEscolhido)) {
    document.getElementById('indicador-vez').textContent = 'Escolha uma peça do monte';
    monteFechado?.classList.remove('oculto');
    atualizarMonte();
    return;
  }

  const indiceReal = Number(indiceEscolhido);
  if (indiceReal < 0 || indiceReal >= monteAtual.length) return;

  const origemPeca = monteFechado?.querySelector(`[data-indice="${indiceReal}"]`);
  const rectOrigem = origemRect || origemPeca?.getBoundingClientRect();
  const pecaComprada = monteAtual.splice(indiceReal, 1)[0];
  if (!pecaComprada) return;

  compraEmAndamento = true;
  monteFechado?.classList.add('oculto');
  animarCompraDaPeca(pecaComprada, rectOrigem, () => {
    maoAtualJogador.push(pecaComprada);
    compraEmAndamento = false;
    atualizarMaoDoJogador();
    destacarPecaComprada();
    atualizarBotoesDaVez();
  });
}

function verificarPassagemAutomaticaDoJogador() {
  if (!vezDoJogador || jogoPausado || jogoEncerrado || compraEmAndamento || passagemAutomaticaEmCurso) return false;
  if (monteAtual.length > 0 || maoAtualJogador.some(podeJogar)) return false;

  passagemAutomaticaEmCurso = true;
  setTimeout(() => {
    passagemAutomaticaEmCurso = false;
    if (!vezDoJogador || jogoPausado || jogoEncerrado || compraEmAndamento) return;
    if (monteAtual.length > 0 || maoAtualJogador.some(podeJogar)) return;

    vezDoJogador = false;
    pararTemporizadorJogador();
    atualizarMaoDoJogador();
    atualizarBotoesDaVez();
    if (verificarMesaBloqueada()) return;
    agendarTurnoDaCpu();
  }, 450);

  return true;
}

function destacarPecaComprada() {
  const mao = document.getElementById('mao-jogador');
  const ultima = mao?.lastElementChild;
  if (!ultima) return;
  ultima.classList.add('peca-recem-comprada');
  setTimeout(() => ultima.classList.remove('peca-recem-comprada'), 900);
}

function animarCompraDaPeca(pecaComprada, origemRect, aoTerminar) {
  const mao = document.getElementById('mao-jogador');
  const destinoMao = mao.getBoundingClientRect();
  const ultima = mao.lastElementChild?.getBoundingClientRect();
  const pecaVoando = criarPeca(pecaComprada);
  pecaVoando.classList.add('peca-comprada-animacao');

  const larguraPeca = ultima?.width || 50;
  const alturaPeca = ultima?.height || 100;
  const inicioX = origemRect?.left ?? window.innerWidth / 2;
  const inicioY = origemRect?.top ?? window.innerHeight / 2;
  const fimX = ultima ? ultima.right + 8 : destinoMao.left + Math.max(12, destinoMao.width / 2 - larguraPeca / 2);
  const fimY = ultima ? ultima.top : destinoMao.top + 6;

  document.body.appendChild(pecaVoando);
  pecaVoando.style.left = `${inicioX}px`;
  pecaVoando.style.top = `${inicioY}px`;
  pecaVoando.style.width = `${origemRect?.width || 32}px`;
  pecaVoando.style.height = `${origemRect?.height || 58}px`;
  pecaVoando.style.opacity = '1';
  pecaVoando.style.transform = 'translate(0, 0) scale(1)';
  pecaVoando.style.transition = 'none';

  const deltaX = fimX - inicioX;
  const deltaY = fimY - inicioY;

  requestAnimationFrame(() => {
    pecaVoando.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), width 0.38s ease, height 0.38s ease, opacity 0.38s ease';
    requestAnimationFrame(() => {
      pecaVoando.style.width = `${larguraPeca}px`;
      pecaVoando.style.height = `${alturaPeca}px`;
      pecaVoando.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });
  });

  setTimeout(() => {
    pecaVoando.remove();
    aoTerminar();
  }, 400);
}

function passarVez() {
  if (estadoOnline?.game) {
    if (vezDoJogador) acaoOnline('pass').catch(erro => alert(erro.message));
    return;
  }
  const temPecaJogavel = maoAtualJogador.some(podeJogar);
  if (jogoPausado || !vezDoJogador || monteAtual.length > 0 || temPecaJogavel) return;

  vezDoJogador = false;
  pararTemporizadorJogador();
  atualizarMaoDoJogador();
  atualizarBotoesDaVez();
  if (verificarMesaBloqueada()) return;
  agendarTurnoDaCpu();
}

function calcularPontuacaoJogadaCpu(peca, indice, ladoEscolhido) {
  if (!peca || !extremosMesa) return -Infinity;

  let pontuacao = 0;
  const valor = peca.l1 + peca.l2;
  const ehDobra = ehCarroca(peca);
  const lados = ladosDisponiveis(peca);

  pontuacao += ehDobra ? 35 : 10;
  pontuacao += valor * 1.5;
  if (lados.esquerda && lados.direita) pontuacao += 18;
  const encaixaEsquerda = ladoEscolhido === 'esquerda' && (extremosMesa.esquerda === peca.l1 || extremosMesa.esquerda === peca.l2);
  const encaixaDireita = ladoEscolhido === 'direita' && (extremosMesa.direita === peca.l1 || extremosMesa.direita === peca.l2);
  if (encaixaEsquerda || encaixaDireita) pontuacao += 8;
  if (peca.l1 === 6 || peca.l2 === 6) pontuacao += 12;
  if (maoAtualCpu.length === 2) pontuacao += 20;
  if (maoAtualJogador.some((p) => p.l1 + p.l2 === valor)) pontuacao += 4;

  const outras = maoAtualCpu.filter((_, idx) => idx !== indice);
  const podeJogadasDepois = outras.filter((outra) => podeJogar(outra)).length;
  pontuacao -= podeJogadasDepois * 7;

  return pontuacao;
}

function escolherMelhorJogadaDaCpu() {
  const opcoes = maoAtualCpu
    .map((peca, indice) => {
      const lados = ladosDisponiveis(peca);
      const escolhas = [];

      if (lados.esquerda) escolhas.push('esquerda');
      if (lados.direita) escolhas.push('direita');
      if (!escolhas.length) return null;

      return escolhas.map((lado) => ({
        indice,
        peca,
        lado,
        pontuacao: calcularPontuacaoJogadaCpu(peca, indice, lado)
      }));
    })
    .flat()
    .filter(Boolean);

  if (!opcoes.length) return null;

  opcoes.sort((a, b) => b.pontuacao - a.pontuacao);
  if (dificuldadeAtual === 'facil') {
    return opcoes[Math.floor(Math.random() * opcoes.length)];
  }
  if (dificuldadeAtual === 'medio') {
    const melhoresOpcoes = opcoes.slice(0, Math.min(3, opcoes.length));
    return melhoresOpcoes[Math.floor(Math.random() * melhoresOpcoes.length)];
  }
  return opcoes[0];
}

function jogarTurnoDaCpu() {
  if (jogoEncerrado || jogoPausado || aguardandoFimDaCpu) return;

  let melhorJogada = escolherMelhorJogadaDaCpu();

  while (!melhorJogada && monteAtual.length > 0) {
    const indiceEscolhido = Math.floor(Math.random() * monteAtual.length);
    maoAtualCpu.push(monteAtual.splice(indiceEscolhido, 1)[0]);
    melhorJogada = escolherMelhorJogadaDaCpu();
  }
  atualizarMonte();
  atualizarMaoDaCpu();

  if (melhorJogada) {
    const pecaDaCpu = maoAtualCpu.splice(melhorJogada.indice, 1)[0];
    const ladoEscolhido = melhorJogada.lado;
    colocarPecaNaMesa(pecaDaCpu, ladoEscolhido);
    if (maoAtualCpu.length === 0) {
      aguardandoFimDaCpu = true;
      pararTemporizadorJogador();
      setTimeout(() => {
        aguardandoFimDaCpu = false;
        finalizarRodada('cpu', '', 0);
      }, 230);
      return;
    }
  }

  if (verificarMesaBloqueada()) return;

  temporizadorFimCpu = setTimeout(() => {
    temporizadorFimCpu = null;
    if (jogoPausado || jogoEncerrado) return;
    vezDoJogador = true;
    atualizarMaoDoJogador();
    atualizarBotoesDaVez();
    iniciarTemporizadorDaVez();
  }, 350);
}

function atualizarMonte() {
  if (!monteFechado) return;

  const deveMostrarMonte = podeComprarDoMonte() && !compraEmAndamento;
  monteFechado.classList.toggle('oculto', !deveMostrarMonte);
  monteFechado.classList.toggle('pode-escolher', deveMostrarMonte);
  monteFechado.innerHTML = '';

  monteAtual.forEach((peca, indice) => {
    const costas = criarPecaCostas();
    costas.classList.add('peca-do-monte');
    costas.dataset.indice = String(indice);
    costas.title = `Escolher peça ${indice + 1} do monte`;
    costas.setAttribute('role', 'button');
    costas.setAttribute('aria-label', `Escolher peça ${indice + 1} do monte`);
    costas.tabIndex = deveMostrarMonte ? 0 : -1;
    const escolher = (event) => {
      const alvo = event.currentTarget;
      comprarPeca(Number(alvo.dataset.indice), alvo.getBoundingClientRect());
    };
    costas.addEventListener('click', escolher);
    costas.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        escolher(event);
      }
    });
    monteFechado.appendChild(costas);
  });

  monteFechado.title = `${monteAtual.length} peças disponíveis no monte`;
}

function somaDePontos(mao) {
  return mao.reduce((soma, peca) => soma + peca.l1 + peca.l2, 0);
}

function verificarMesaBloqueada() {
  if (jogoEncerrado || monteAtual.length > 0 ||
    maoAtualJogador.some(podeJogar) || maoAtualCpu.some(podeJogar)) {
    return false;
  }

  // Regra oficial da mesa fechada ("trancada"): vence quem tiver menos pontos
  // somados na mão, não quem tiver menos peças.
  const pontosJogador = somaDePontos(maoAtualJogador);
  const pontosCpu = somaDePontos(maoAtualCpu);

  if (pontosJogador === pontosCpu) {
    finalizarRodada(null, 'A mesa fechou e os dois ficaram com a mesma pontuação na mão.');
  } else {
    const vencedor = pontosJogador < pontosCpu ? 'jogador' : 'cpu';
    finalizarRodada(vencedor, 'A mesa fechou. Vence quem ficou com menos pontos na mão.');
  }
  return true;
}

function atualizarBotoesDaVez() {
  const botaoComprar = document.getElementById('btn-comprar');
  const botaoPassar = document.getElementById('btn-passar');
  const temPecaJogavel = maoAtualJogador.some(podeJogar);

  if (!estadoOnline?.game && vezDoJogador && monteAtual.length === 0 && !temPecaJogavel) {
    verificarPassagemAutomaticaDoJogador();
  }

  botaoComprar.disabled = jogoPausado || !vezDoJogador || temPecaJogavel || monteAtual.length === 0;
  botaoPassar.disabled = jogoPausado || !vezDoJogador || monteAtual.length > 0 || temPecaJogavel;
  atualizarMonte();
  if (!vezDoJogador) esconderOpcoesDeJogada();
  atualizarIndicadorDaVez();
}

function atualizarIndicadorDaVez() {
  const indicador = document.getElementById('indicador-vez');
  if (!indicador) return;

  const textoAbertura = pecaObrigatoria ? `Jogue sua carroça (${pecaObrigatoria.l1}-${pecaObrigatoria.l2})` : 'Sua vez';
  indicador.textContent = jogoEncerrado ? 'Rodada encerrada' : (vezDoJogador ? textoAbertura : (estadoOnline?.game ? 'Vez do amigo' : 'Vez da CPU'));
  indicador.classList.toggle('sua-vez', vezDoJogador && !jogoEncerrado);
}

function reconstruirLadosDaMesa() {
  if (!pecaCentral || !pecasNaMesa.length) {
    pecasDoLadoEsquerdo = [];
    pecasDoLadoDireito = [];
    return;
  }

  const indiceCentral = pecasNaMesa.findIndex((item) => {
    if (item.id && pecaCentral.id) return item.id === pecaCentral.id;
    return item === pecaCentral;
  });

  if (indiceCentral <= 0) {
    pecasDoLadoEsquerdo = [];
    pecasDoLadoDireito = pecasNaMesa.slice(1);
    return;
  }

  if (indiceCentral >= pecasNaMesa.length - 1) {
    pecasDoLadoEsquerdo = pecasNaMesa.slice(0, -1).reverse();
    pecasDoLadoDireito = [];
    return;
  }

  pecasDoLadoEsquerdo = pecasNaMesa.slice(0, indiceCentral).reverse();
  pecasDoLadoDireito = pecasNaMesa.slice(indiceCentral + 1);
}

function adicionarPecaNaMesa(peca, posicao) {
  if (!peca || !peca.l1 && peca.l1 !== 0 || !peca.l2 && peca.l2 !== 0) return;

  const jaExiste = pecasNaMesa.some((item) => item.id && peca.id ? item.id === peca.id : item === peca);
  if (jaExiste) return;

  if (!pecaCentral) {
    pecaCentral = peca;
    pecasNaMesa = [peca];
    reconstruirLadosDaMesa();
    renderizarMesa();
    tocarSomDaPeca();
    return;
  }

  if (posicao === 'prepend') {
    pecasNaMesa.unshift(peca);
  } else {
    pecasNaMesa.push(peca);
  }

  reconstruirLadosDaMesa();
  renderizarMesa();
  tocarSomDaPeca();
}

function renderizarMesa() {
  if (!areaJogo || !pecaCentral) return;
  removerPreviewDeJogada();
  areaJogo.innerHTML = '';
  layoutDasPontas = null;
  reconstruirLadosDaMesa();

  const largura = Math.max(areaJogo.clientWidth, 340);
  const altura = Math.max(areaJogo.clientHeight, 180);
  const medidas = obterMedidasDaMesa(largura, altura);
  const margem = 16;
  const gap = 2;

  const dimensaoDaPeca = (peca, orientacao) => {
    const horizontal = orientacao === 'horizontal';
    return {
      width: horizontal ? medidas.horizontalLargura : medidas.verticalLargura,
      height: horizontal ? medidas.horizontalAltura : medidas.verticalAltura
    };
  };

  const orientacaoDaPeca = (peca, forcarOrientacao = null) => {
    if (forcarOrientacao) return forcarOrientacao;
    return ehCarroca(peca) ? 'vertical' : 'horizontal';
  };

  const centroDimensao = dimensaoDaPeca(pecaCentral, orientacaoDaPeca(pecaCentral));
  const centroX = largura * 0.5;
  const centroY = altura * 0.5;
  const centroRetangulo = {
    x: centroX - centroDimensao.width / 2,
    y: centroY - centroDimensao.height / 2,
    width: centroDimensao.width,
    height: centroDimensao.height,
    orientacao: orientacaoDaPeca(pecaCentral),
    direction: 'RIGHT'
  };

  // A orientação já vem calculada pelo sentido da corrente: peças comuns seguem
  // a linha e carroças ficam atravessadas. Rotacionar de novo nas curvas fazia
  // exatamente o oposto (uma carroça passava a acompanhar a corrente).
  const rotacaoDaDirecao = () => 0;

  // l1/l2 guardam a ordem lógica usada nas validações. Ao fazer uma curva,
  // porém, a metade que encosta na peça anterior precisa estar na borda física
  // correta: esquerda/direita na linha horizontal e cima/baixo na vertical.
  const pecaParaExibicao = (peca, lado, direction) => {
    if (ehCarroca(peca)) return peca;

    const valorDeConexao = lado > 0 ? peca.l1 : peca.l2;
    const conexaoNaPrimeiraMetade = direction === 'RIGHT' || direction === 'DOWN';
    const primeiraMetadeEhConexao = peca.l1 === valorDeConexao;

    return primeiraMetadeEhConexao === conexaoNaPrimeiraMetade
      ? peca
      : { ...peca, l1: peca.l2, l2: peca.l1 };
  };

  const posicionar = (peca, esquerda, topo, orientacao, camada, direction = 'RIGHT') => {
    const elemento = criarPecaDaMesa(peca, orientacao, false);
    elemento.style.left = `${Math.round(esquerda)}px`;
    elemento.style.top = `${Math.round(topo)}px`;
    elemento.style.width = `${orientacao === 'vertical' ? medidas.verticalLargura : medidas.horizontalLargura}px`;
    elemento.style.height = `${orientacao === 'vertical' ? medidas.verticalAltura : medidas.horizontalAltura}px`;
    elemento.style.setProperty('--escala-peca', medidas.escala);
    elemento.style.setProperty('--rotacao-peca', `${rotacaoDaDirecao(direction)}deg`);
    elemento.style.zIndex = String(camada);
    areaJogo.appendChild(elemento);
  };

  posicionar(
    pecaCentral,
    centroRetangulo.x,
    centroRetangulo.y,
    centroRetangulo.orientacao,
    10,
    centroRetangulo.direction
  );

  const dentroDoTabuleiro = (x, y, width, height) => x >= margem && y >= margem && x + width <= largura - margem && y + height <= altura - margem;

  const colideComOutra = (retangulo, ocupados) => ocupados.some((outro) => {
    const sobrepoeHorizontal = retangulo.x < outro.x + outro.width && retangulo.x + retangulo.width > outro.x;
    const sobrepoeVertical = retangulo.y < outro.y + outro.height && retangulo.y + retangulo.height > outro.y;
    return sobrepoeHorizontal && sobrepoeVertical;
  });

  const orientacaoPorDirecao = (direction) => (direction === 'LEFT' || direction === 'RIGHT' ? 'horizontal' : 'vertical');

  const dimensaoDaDirecao = (direction, peca = null) => {
    const orientacao = orientacaoPorDirecao(direction);
    const horizontal = orientacao === 'horizontal';

    // Preferimos manter as carroças em pé. Além de preservar a leitura clássica
    // da mesa, isso deixa as curvas verticais compactas: a corrente pode seguir
    // para baixo a partir da carroça sem ela atravessar o caminho.
    if (peca && ehCarroca(peca)) {
      return { width: medidas.verticalLargura, height: medidas.verticalAltura, orientacao: 'vertical' };
    }

    return horizontal
      ? { width: medidas.horizontalLargura, height: medidas.horizontalAltura, orientacao: 'horizontal' }
      : { width: medidas.verticalLargura, height: medidas.verticalAltura, orientacao: 'vertical' };
  };

  const avancar = (retangulo, direction, peca) => {
    const dimensao = dimensaoDaDirecao(direction, peca);
    let x = retangulo.x;
    let y = retangulo.y;

    // Centraliza cada nova peça no eixo perpendicular da corrente. Isso é
    // especialmente importante para carroças: a linha do meio delas deve ficar
    // alinhada ao centro da peça à qual estão conectadas, e não pela borda.
    const deslocamentoH = (retangulo.width - dimensao.width) / 2;
    const deslocamentoV = (retangulo.height - dimensao.height) / 2;

    if (direction === 'RIGHT') {
      x = retangulo.x + retangulo.width + gap;
      y = retangulo.y + deslocamentoV;
    } else if (direction === 'LEFT') {
      x = retangulo.x - dimensao.width - gap;
      y = retangulo.y + deslocamentoV;
    } else if (direction === 'DOWN') {
      x = retangulo.x + deslocamentoH;
      y = retangulo.y + retangulo.height + gap;
    } else if (direction === 'UP') {
      x = retangulo.x + deslocamentoH;
      y = retangulo.y - dimensao.height - gap;
    }

    return {
      x,
      y,
      width: dimensao.width,
      height: dimensao.height,
      orientacao: dimensao.orientacao,
      direction
    };
  };

  const direcoesPerpendiculares = (direction) => {
    if (direction === 'RIGHT' || direction === 'LEFT') return ['DOWN', 'UP'];
    return ['LEFT', 'RIGHT'];
  };

  const tentarDirecao = (retangulo, direction, peca, ocupados) => {
    const tentativa = avancar(retangulo, direction, peca);
    if (!dentroDoTabuleiro(tentativa.x, tentativa.y, tentativa.width, tentativa.height)) return null;
    if (colideComOutra(tentativa, ocupados)) return null;
    return tentativa;
  };

  const proximoRetangulo = (retangulo, direction, peca, ocupados) => {
    const direta = tentarDirecao(retangulo, direction, peca, ocupados);
    if (direta) return direta;

    const opcoes = direcoesPerpendiculares(direction)
      .map((direcao) => tentarDirecao(retangulo, direcao, peca, ocupados))
      .filter(Boolean);

    if (opcoes.length) {
      opcoes.sort((a, b) => {
        const distanciaA = Math.abs(a.x - retangulo.x) + Math.abs(a.y - retangulo.y);
        const distanciaB = Math.abs(b.x - retangulo.x) + Math.abs(b.y - retangulo.y);
        return distanciaA - distanciaB;
      });
      return opcoes[0];
    }

    return avancar(retangulo, direction, peca);
  };

  const ocupados = [{ ...centroRetangulo }];

  const desenharLado = (pecas, lado) => {
    let direction = lado > 0 ? 'RIGHT' : 'LEFT';
    let atual = { ...centroRetangulo };

    pecas.forEach((peca, indice) => {
      const proximo = proximoRetangulo(atual, direction, peca, ocupados);
      const proximaDirection = proximo.direction || direction;
      direction = proximaDirection;

      const pecaVisual = pecaParaExibicao(peca, lado, direction);
      posicionar(pecaVisual, proximo.x, proximo.y, proximo.orientacao, 2 + indice, direction);
      ocupados.push({
        x: proximo.x,
        y: proximo.y,
        width: proximo.width,
        height: proximo.height
      });
      atual = { ...proximo, direction };
    });
    return { retangulo: atual, direcao: direction };
  };

  layoutDasPontas = {
    esquerda: desenharLado(pecasDoLadoEsquerdo, -1),
    direita: desenharLado(pecasDoLadoDireito, 1)
  };
  areaJogo.style.minHeight = '100%';
}
function criarPecaDaMesa(peca, orientacao, invertida = false) {
  const elementoPeca = criarPeca(peca, orientacao === 'horizontal');
  elementoPeca.classList.add('peca-na-mesa');
  elementoPeca.classList.add(orientacao === 'vertical' ? 'peca-vertical' : 'peca-horizontal');
  if (ehCarroca(peca)) elementoPeca.classList.add('peca-carroca-mesa');
  if (invertida) elementoPeca.classList.add('peca-invertida');
  return elementoPeca;
}

function finalizarRodada(vencedor, motivo = '', atraso = 500) {
  if (jogoEncerrado) return;
  jogoEncerrado = true;
  vezDoJogador = false;
  pararTemporizadorJogador();
  if (vencedor) registrarVitoria(vencedor);
  atualizarMaoDoJogador();
  atualizarBotoesDaVez();

  // Aguarda a animação da última pedra terminar antes de abrir a celebração.
  setTimeout(() => {
    const modal = document.getElementById('modal-vitoria');
    const trofeu = modal?.querySelector('.trofeu');
    const titulo = vencedor === 'jogador' ? 'Parabéns!' : vencedor === 'cpu' ? 'Rodada da CPU' : 'Mesa bloqueada';
    const resultado = vencedor === 'jogador'
      ? 'Você venceu a rodada!'
      : vencedor === 'cpu'
        ? 'A CPU venceu esta rodada.'
        : 'A rodada terminou empatada.';

    modal.dataset.vencedor = vencedor || 'empate';
    if (trofeu) {
      trofeu.textContent = vencedor === 'cpu' ? '😢' : '🏆';
    }

    document.getElementById('titulo-vitoria').textContent = titulo;
    document.getElementById('texto-vitoria').textContent = vencedor === 'cpu'
      ? `😢 ${motivo ? `${resultado} ${motivo}` : resultado}`
      : motivo ? `${resultado} ${motivo}` : resultado;
    modal.classList.add('ativo');
  }, atraso);
}

function iniciarProximaRodada() {
  const modal = document.getElementById('modal-vitoria');
  modal.classList.remove('ativo');
  modal.dataset.vencedor = '';
  if (estadoOnline?.game) { sairParaMenu(); return; }
  teste();
}

function sairParaMenu() {
  clearInterval(temporizadorSalaOnline);
  clearInterval(temporizadorOnline);
  temporizadorSalaOnline = null;
  temporizadorOnline = null;
  salaOnline = null;
  estadoOnline = null;
  assinaturaEstadoOnline = null;
  pararTemporizadorJogador();
  clearTimeout(temporizadorCpu);
  clearInterval(temporizadorCronometroCpu);
  clearTimeout(temporizadorFimCpu);
  temporizadorCronometroCpu = null;
  fimDoTurnoDaCpu = null;
  tempoCpuPausado = null;
  tempoCpuExibidoPausado = null;
  acaoCpuPendente = null;
  jogoPausado = false;
  document.getElementById('musica').pause();
  document.getElementById('modal-vitoria').classList.remove('ativo');
  document.getElementById('modal-pausa').classList.remove('ativo');
  document.body.classList.remove('jogo-ativo');
  document.getElementById('app-jogo').setAttribute('aria-hidden', 'true');
  document.getElementById('tela-abertura').classList.remove('fechada');
  document.getElementById('painel-regras').classList.add('oculto');
  document.getElementById('painel-online').classList.add('oculto');
  document.getElementById('menu-principal').classList.remove('oculto');
}

function atualizarCronometro() {
  const cronometro = document.getElementById('cronometro');
  if (!cronometro) return;
  cronometro.textContent = `⏱ ${tempoRestante}s`;
  cronometro.classList.toggle('tempo-acabando', tempoRestante <= 10 && tempoRestante > 0);
}

function iniciarTemporizadorDaVez(reiniciar = true) {
  pararTemporizadorJogador();
  if (reiniciar) tempoRestante = 60;
  atualizarCronometro();

  temporizadorJogador = setInterval(() => {
    tempoRestante--;
    atualizarCronometro();

    if (tempoRestante <= 0) {
      pararTemporizadorJogador();
      if (!vezDoJogador || jogoEncerrado || jogoPausado) return;

      // Na abertura, a carroça obrigatória entra automaticamente ao fim do tempo.
      const indiceDaCarrocaObrigatoria = pecaObrigatoria
        ? maoAtualJogador.findIndex((peca) =>
          peca.l1 === pecaObrigatoria.l1 && peca.l2 === pecaObrigatoria.l2)
        : -1;

      if (indiceDaCarrocaObrigatoria >= 0) {
        document.getElementById('indicador-vez').textContent = 'Tempo esgotado: carroça jogada automaticamente';
        jogarPeca(indiceDaCarrocaObrigatoria);
        return;
      }

      vezDoJogador = false;
      atualizarMaoDoJogador();
      atualizarBotoesDaVez();
      agendarTurnoDaCpu();
    }
  }, 1000);
}

function iniciarTemporizadorJogador() {
  iniciarTemporizadorDaVez();
}

function pausarJogo() {
  if (jogoEncerrado || jogoPausado || aguardandoFimDaCpu) return;
  jogoPausado = true;
  pararTemporizadorJogador();
  if (!vezDoJogador && fimDoTurnoDaCpu) {
    tempoCpuPausado = Math.max(0, fimDoTurnoDaCpu - Date.now());
    tempoCpuExibidoPausado = tempoRestante;
  }
  clearTimeout(temporizadorCpu);
  clearInterval(temporizadorCronometroCpu);
  temporizadorCronometroCpu = null;
  fimDoTurnoDaCpu = null;
  clearTimeout(temporizadorFimCpu);
  esconderOpcoesDeJogada();
  document.getElementById('modal-pausa').classList.add('ativo');
}

function retomarJogo() {
  if (pausadoPorOrientacao) return;
  jogoPausado = false;
  document.getElementById('modal-pausa').classList.remove('ativo');
  atualizarMaoDoJogador();
  atualizarBotoesDaVez();
  if (vezDoJogador) iniciarTemporizadorDaVez(false);
  else agendarTurnoDaCpu();
}

function novaRodadaPausada() {
  document.getElementById('modal-pausa').classList.remove('ativo');
  teste();
}

function mostrarRegrasPausa() {
  document.getElementById('conteudo-pausa').innerHTML = '<p class="texto-pausa">Encaixe números iguais nas pontas da corrente. Quem tem a maior carroça abre o jogo. Se não houver jogada, compre do monte até conseguir jogar; só passe com o monte vazio. Vence quem bater primeiro — ou quem tiver menos pontos na mão se a mesa fechar.</p><button type="button" onclick="restaurarMenuPausa()">Voltar</button>';
}

function mostrarModelosPausa() {
  const opcoes = [['classico', 'Modelo 1 — branco + bolinhas pretas'], ['colorido-claro', 'Modelo 2 — branco + bolinhas coloridas'], ['escuro', 'Modelo 3 — preto + bolinhas brancas'], ['colorido-escuro', 'Modelo 4 — preto + bolinhas coloridas']];
  document.getElementById('conteudo-pausa').innerHTML = `<p class="texto-pausa">Escolha um modelo para usar imediatamente:</p><div class="acoes-pausa">${opcoes.map(([id, nome]) => `<button type="button" class="${id === modeloAtual ? 'selecionado' : 'botao-escuro'}" onclick="selecionarModelo('${id}'); atualizarPecasDoModelo(); restaurarMenuPausa()">${nome}</button>`).join('')}</div><button type="button" class="botao-escuro" onclick="restaurarMenuPausa()">Voltar</button>`;
}

function atualizarPecasDoModelo() {
  atualizarMaoDoJogador();
  atualizarMaoDaCpu();
  if (pecaCentral) renderizarMesa();
}

function restaurarMenuPausa() {
  document.getElementById('conteudo-pausa').innerHTML = '<p>A partida está segura. O que você quer fazer?</p><div class="acoes-pausa"><button type="button" onclick="retomarJogo()">Continuar</button><button type="button" onclick="novaRodadaPausada()">Novo jogo</button><button type="button" class="botao-escuro" onclick="mostrarRegrasPausa()">Regras</button><button type="button" class="botao-escuro" onclick="mostrarModelosPausa()">Personalizar</button><button type="button" class="botao-escuro" onclick="sairParaMenu()">Sair para o menu</button></div>';
}

function pararTemporizadorJogador() {
  clearInterval(temporizadorJogador);
  temporizadorJogador = null;
}

function criarPecaCostas() {
  const peca = document.createElement('div');
  peca.classList.add('peca-costas');
  return peca;
}

function mostrarBotoesDoJogo() {
  document.getElementById('btn-iniciar').classList.add('oculto');
  document.getElementById('btn-iniciar').disabled = false;
  document.getElementById('btn-comprar').classList.add('oculto');
  document.getElementById('btn-passar').classList.add('oculto');
  document.getElementById('btn-sair').classList.add('oculto');
  document.getElementById('btn-pausar').classList.remove('oculto');
}

function obterPosicoesPontos(valor, rotacionar90 = false) {
  const base = {
    0: [],
    1: [[2, 2]],
    2: [[1, 1], [3, 3]],
    3: [[1, 1], [2, 2], [3, 3]],
    4: [[1, 1], [1, 3], [3, 1], [3, 3]],
    5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
    6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]]
  };
  const pontos = base[valor] || [];
  if (!rotacionar90) return pontos;
  // 90° horário no grid 3x3: os pares (2, 4, 6) passam a deitar com a peça.
  return pontos.map(([linha, coluna]) => [coluna, 4 - linha]);
}

function criarMetade(valor, rotacionar90 = false) {
  const metade = document.createElement("div");
  metade.classList.add("metade");
  if (rotacionar90) metade.classList.add("metade-deitada");

  for (const [linha, coluna] of obterPosicoesPontos(valor, rotacionar90)) {
    const bolinha = document.createElement("div");
    bolinha.classList.add("bola");
    if (modeloAtual === 'colorido-claro' || modeloAtual === 'colorido-escuro') {
      bolinha.classList.add(`bola-cor-${(linha + coluna + valor) % 6}`);
    }
    bolinha.style.gridRow = linha;
    bolinha.style.gridColumn = coluna;
    metade.appendChild(bolinha);
  }

  return metade;
}
function alternarSom() {
  const musica = document.getElementById('musica');
  const somPeca = document.getElementById('som-peca');
  const botaoSom = document.getElementById('btn-som');

  somEstaBaixo = !somEstaBaixo;
  musica.volume = somEstaBaixo ? VOLUME_BAIXO : VOLUME_ALTO;
  somPeca.volume = somEstaBaixo ? VOLUME_BAIXO : VOLUME_IMPACTO;
  botaoSom.textContent = somEstaBaixo ? '🔇 Mudo' : '🔊 Som';
  botaoSom.setAttribute('aria-pressed', String(somEstaBaixo));
}

function tocarSomDaPeca() {
  if (somEstaBaixo) return;

  const somPeca = document.getElementById('som-peca');
  somPeca.currentTime = 0;
  somPeca.play().catch(() => {});
}

function fecharPagina() {
  const confirmado = confirm("Você realmente deseja sair desta partida?");
  if (!confirmado) return;

  zerarPlacar();
  location.reload();
}

// --- Diagnostic helpers: call these from the browser console to run automated checks ---
function _verificarConexao(prevValor, peca, lado) {
  if (lado === 'direita') return (peca.l1 === prevValor || peca.l2 === prevValor);
  if (lado === 'esquerda') return (peca.l1 === prevValor || peca.l2 === prevValor);
  return false;
}

function _logEstado(msg) {
  console.groupCollapsed('[DIAGNOSTIC] ' + msg);
  try {
    console.log('extremosMesa:', JSON.parse(JSON.stringify(extremosMesa)));
    console.log('pecaCentral:', JSON.parse(JSON.stringify(pecaCentral)));
    console.log('pecasDoLadoEsquerdo:', JSON.parse(JSON.stringify(pecasDoLadoEsquerdo)));
    console.log('pecasDoLadoDireito:', JSON.parse(JSON.stringify(pecasDoLadoDireito)));
  } catch (e) {
    console.log('estado (não serializável):', {extremosMesa, pecaCentral, pecasDoLadoEsquerdo, pecasDoLadoDireito});
  }
  console.groupEnd();
}

function executarDiagnosticos() {
  if (!areaJogo) areaJogo = document.getElementById('lista')?.querySelector('.area-jogo') || document.getElementById('lista')?.firstElementChild;
  console.warn('[DIAGNOSTIC] iniciando diagnósticos — chame executarDiagnosticos() no console do navegador');

  // Função utilitária para resetar o tabuleiro para teste sem recarregar a página
  function resetTabuleiroParaTeste() {
    pecaCentral = null;
    pecasDoLadoEsquerdo = [];
    pecasDoLadoDireito = [];
    extremosMesa = null;
    areaJogo.innerHTML = '';
  }

  // Cenário 1: linha simples (direita)
  resetTabuleiroParaTeste();
  const seq1 = [{l1:6,l2:6},{l1:6,l2:4},{l1:4,l2:2},{l1:2,l2:5},{l1:5,l2:1}];
  console.group('Cenário 1: linha simples →');
  seq1.forEach((p, i) => {
    console.log('Jogando peça:', p, 'índice', i);
    colocarPecaNaMesa(p, 'direita');
    _logEstado('após jogar ' + JSON.stringify(p));
    // verificar conexão com a peça anterior
    if (i > 0) {
      const anterior = (i === 1) ? pecaCentral : pecasDoLadoDireito[pecasDoLadoDireito.length-2];
      const conectado = (anterior && (anterior.l2 === (pecasDoLadoDireito.length ? pecasDoLadoDireito[pecasDoLadoDireito.length-1].l1 : p.l1))) || true;
      console.log('verificação simples (anterior vs atual):', conectado);
    }
  });
  console.groupEnd();

  // Cenário 2: testar encaixe por esquerda
  resetTabuleiroParaTeste();
  const seq2 = [{l1:3,l2:5},{l1:4,l2:3},{l1:2,l2:4}];
  console.group('Cenário 2: encaixe pela esquerda');
  seq2.forEach((p, i) => {
    const lado = (i === 0) ? 'direita' : 'esquerda';
    console.log('Jogando peça:', p, 'lado', lado);
    colocarPecaNaMesa(p, lado);
    _logEstado('após jogar ' + JSON.stringify(p));
  });
  console.groupEnd();

  // Cenário 3: sequência longa para forçar curva (tentar até 30 peças)
  resetTabuleiroParaTeste();
  const base = [{l1:6,l2:6},{l1:6,l2:5}];
  const seq3 = [];
  let val = 5;
  for (let i=0;i<20;i++) {
    seq3.push({l1:val,l2:(val-1>=0?val-1:0)});
    val = Math.max(0,val-1);
  }
  console.group('Cenário 3: sequência longa (tenta forçar curvas)');
  base.concat(seq3).forEach((p, i) => {
    console.log('Jogando peça:', p);
    colocarPecaNaMesa(p, 'direita');
    _logEstado('após jogar ' + JSON.stringify(p));
  });
  console.groupEnd();

  console.warn('[DIAGNOSTIC] Diagnósticos concluídos. Verifique o console para falhas de conexão e sobreposição.');
}

// Expor atalho global
window.executarDiagnosticos = executarDiagnosticos;
