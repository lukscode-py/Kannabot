const MESSAGE_BANK = {
  animeIntro: [
    "Ara... Nexus Nex entrou em sintonia com o mar.",
    "Heh... meu grimorio de Blox Fruits ja esta aberto.",
    "Mestre, Nexus Nex esta pronto para analisar a loja."
  ],
  stockFound: [
    "Mestre... a loja mudou agora mesmo.",
    "Hmm... detectei novas frutas no stock.",
    "Nexus Nex traz novidades fresquinhas."
  ],
  stockStatus: [
    "Observe com calma... este e o stock atual.",
    "Minha leitura do dealer esta concluida.",
    "Heh... os mercadores revelaram o inventario."
  ],
  fruitInfo: [
    "Encontrei a fruta no grimorio. Veja os detalhes.",
    "Analise concluida. Esta fruta carrega estes dados.",
    "Hmm... reuni tudo que sei sobre essa fruta."
  ],
  historyInfo: [
    "Vasculhei os registros recentes para voce.",
    "Meus arquivos guardam estas aparicoes.",
    "Os ecos do stock dizem o seguinte."
  ],
  menuIntro: [
    "Escolha sua rota, mestre.",
    "Meu painel tatico esta pronto.",
    "Heh... aqui esta o centro de comando."
  ],
  error: [
    "Isso nao saiu como esperado...",
    "Algo falhou no sistema...",
    "Hmph... tente novamente."
  ],
  noPermission: [
    "Voce nao possui autoridade para isso.",
    "Apenas administradores podem usar isso.",
    "Essa ordem esta acima do seu nivel de acesso."
  ],
  cooldown: [
    "Calma... seus comandos ainda estao em recarga.",
    "Sem flood, guerreiro. Aguarde alguns segundos.",
    "Meu núcleo ainda esta processando sua ultima ordem."
  ],
  groupOnly: [
    "Esse comando so faz sentido dentro de um grupo.",
    "Preciso de um grupo para executar essa rotina."
  ],
  notFound: [
    "Nao encontrei essa fruta no meu grimorio.",
    "Hmm... esse nome nao bate com nenhuma fruta conhecida."
  ],
  success: [
    "Ordem executada com sucesso.",
    "Feito. O sistema respondeu como esperado.",
    "Tudo certo. Ajuste aplicado."
  ]
};

export function pickMessage(category, fallback = "Mensagem indisponivel.") {
  const pool = MESSAGE_BANK[category];

  if (!Array.isArray(pool) || !pool.length) {
    return fallback;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

export function withPersona(category, content) {
  return `${pickMessage(category)}\n\n${content}`;
}
