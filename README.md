# Bot WhatsApp Multi-Instancia com Baileys

Projeto em Node.js com suporte a:

- multiplas instancias
- persistencia em MongoDB
- login por QR Code
- login por Pairing Code
- reconexao automatica ao reiniciar a aplicacao
- envio automatico de mensagem ao conectar

## Estrutura

```text
.
├── package.json
├── README.md
├── sessions/
│   └── .gitkeep
└── src/
    ├── config/
    │   └── constants.js
    ├── lib/
    │   ├── file-db.js
    │   └── mongo-connection.js
    ├── database/
    │   └── mongo-database.js
    ├── services/
    │   ├── instance-manager.js
    │   ├── instance-store.js
    │   ├── mongo-auth-state.js
    │   └── whatsapp-instance.js
    └── index.js
```

## Instalacao

```bash
npm install
```

Configure as variaveis de ambiente do MongoDB antes de iniciar:

```bash
cp .env.example .env
```

Variaveis usadas:

- `MONGODB_URI`: string de conexao SRV/normal
- `MONGODB_DB_NAME`: nome do banco que o bot vai usar
- `MONGODB_APP_NAME`: identificacao da aplicacao no cluster

## Execucao

```bash
npm start
```

## Como usar

1. Inicie o projeto com `npm start`.
2. Escolha no menu:
   - `1` para conectar uma nova instancia via QR Code
   - `2` para conectar uma nova instancia via Pairing Code
   - `3` para listar instancias salvas
3. No modo `Pairing Code`, copie o codigo exibido no terminal e informe no WhatsApp em `Dispositivos conectados > Conectar com numero`.
3. Ao conectar com sucesso, o bot envia automaticamente `hello world` para `+55 74 8114-5568`.

## Persistencia

- Metadados das instancias ficam na colecao `bot_instances`
- Credenciais e chaves do WhatsApp ficam na colecao `wa_auth`
- Estado dinamico do bot fica na colecao `bot_state`
- Configuracao do app fica na colecao `bot_app_config`
- Quando o bot reinicia, ele tenta reconectar automaticamente todas as instancias encontradas

## Migracao

Para limpar as colecoes do projeto e subir os arquivos dinamicos locais para o MongoDB:

```bash
npm run migrate:mongodb
```

Para limpar todas as colecoes do banco configurado antes da importacao:

```bash
node migrate-mongodb.js --reset-all
```

## Observacoes

- Para Pairing Code, informe o numero no formato internacional, por exemplo: `5574999999999`
- Se o codigo expirar antes de ser digitado no WhatsApp, o bot reconecta e gera um novo codigo automaticamente
- Se uma sessao for desconectada do WhatsApp, a aplicacao tenta reconectar automaticamente
- Se o WhatsApp invalidar a sessao, sera necessario autenticar novamente
