# Plano de implementação: áudio, múltiplas imagens e badge do PWA

Status: pronto para execução  
Base: [hermes-multimodal-voice-pwa-design.md](./hermes-multimodal-voice-pwa-design.md)  
Data: 2026-08-02

## Objetivo

Implementar, em etapas verificáveis, gravação de voz com STT nativo do Hermes, envio atômico de múltiplas imagens, badge numérico no PWA e testes de regressão do reasoning estruturado. Todos os testes executáveis serão locais; o NAS será validado posteriormente pelo proprietário.

## Estado atual relevante

- `backend/main.py` monta o FastAPI e os routers de sessões, configuração e push.
- `backend/routers/sessions.py` encaminha a Sessions API, preserva o stream quando o navegador desconecta e envia push ao concluir uma resposta.
- `src/hooks/useHermesStream.ts` converte apenas `attachments[0]` e gera um aviso quando há mais imagens.
- `src/utils/imageUtils.ts` rejeita imagens acima de 4 MB antes de tentar comprimi-las.
- `src/components/ChatWindow/ChatWindow.tsx` já aceita seleção múltipla e exibe previews, mas limpa o composer imediatamente no submit.
- `public/sw.js` usa a propriedade visual `badge` da notificação, mas não chama a Badging API nem persiste contagem.
- O heartbeat de presença pode considerar o app ativo por até 60 segundos depois de ficar oculto e, nesse intervalo, impedir que o push seja enviado.
- O reasoning já é normalizado a partir de `tool.progress` com `tool_name: "_thinking"`; não é necessário voltar ao CLI.
- Ainda não existem testes Python no repositório. O script Vitest existe, mas não há suíte frontend versionada.

## Etapa 0 — baseline e caracterização do Hermes fixado

### Mudanças

- Identificar, na versão/digest do Hermes usado pelo `Dockerfile`, o caminho e a assinatura exatos da função de transcrição utilizada pelas integrações. Confirmado localmente: `tools.voice_mode.transcribe_recording(path, model=None)`.
- Registrar em comentário do adaptador a versão verificada, sem copiar código do Hermes.
- Confirmar os formatos aceitos pelo pipeline local, incluindo o formato produzido por Safari/iOS e WebM/Opus de Chromium.
- Criar `backend/requirements-dev.txt` com dependências exclusivas de testes, sem adicioná-las à imagem final.
- Adicionar `python-multipart` a `backend/requirements.txt`, pois o endpoint FastAPI receberá upload multipart.

### Verificação local

- Instalar requisitos em uma `.venv` local.
- Executar um smoke test de importação do mecanismo de STT.
- Se o Hermes não estiver instalado localmente, executar essa caracterização dentro da imagem Docker construída localmente.
- Registrar claramente qualquer teste que dependa do container e que não pôde ser executado.

## Etapa 1 — adaptador e API de transcrição no backend

### Arquivos

- Criar `backend/hermes_stt.py`.
- Criar `backend/routers/audio.py`.
- Atualizar `backend/routers/__init__.py` e `backend/main.py`.
- Criar `backend/tests/test_hermes_stt.py` e `backend/tests/test_audio_router.py`.

### Implementação

- Encapsular `tools.voice_mode.transcribe_recording` — o caminho que filtra alucinações de Whisper em silêncio e também é usado pelo dashboard — em uma interface pequena com:
  - verificação de disponibilidade;
  - transcrição de um caminho local;
  - normalização para texto;
  - mapeamento de ausência de fala e erros conhecidos.
- Executar trabalho bloqueante fora do event loop com `asyncio.to_thread`.
- Proteger o STT com um `asyncio.Lock`, permitindo uma transcrição por processo.
- Expor `GET /api/audio/capabilities` com disponibilidade, limite de bytes e tipos aceitos.
- Expor também, para diagnóstico, provedor, modelo e idioma efetivos lidos do `config.yaml`; representar idioma vazio como `auto` e nunca retornar credenciais.
- Expor `POST /api/audio/transcriptions` com um único `UploadFile`.
- Copiar o upload para arquivo temporário em blocos, interrompendo assim que exceder 25 MiB; não confiar apenas em `Content-Length`.
- Gerar o nome temporário no servidor e remover o arquivo em `finally`.
- Não registrar nome original, conteúdo do áudio ou transcrição.
- Retornar códigos estáveis:
  - `audio_unavailable`;
  - `audio_too_large`;
  - `audio_unsupported_format`;
  - `audio_transcription_busy`;
  - `audio_no_speech`;
  - `audio_transcription_failed`.

### Testes locais

- Adaptador disponível e indisponível.
- Sucesso, ausência de fala e exceção interna com STT mockado.
- Limite aplicado durante leitura em blocos.
- Tipo não suportado.
- Concorrência retornando `409`.
- Arquivo temporário apagado em todos os caminhos.
- Demais endpoints continuam respondendo quando o STT está indisponível.

## Etapa 2 — cliente de áudio e máquina de estados no frontend

### Arquivos

- Criar `src/utils/audioApi.ts`.
- Criar `src/hooks/useVoiceRecorder.ts`.
- Criar testes Vitest para o cliente, negociação de MIME e reducer da gravação.
- Atualizar `src/utils/index.ts` e `src/hooks/index.ts`.

### Implementação

- Validar as respostas de capacidades e transcrição com Zod.
- Negociar o MIME com `MediaRecorder.isTypeSupported`, preferindo formatos compactos aceitos pelo backend.
- Manter estados explícitos: `idle`, `requesting_permission`, `recording`, `transcribing`, `retryable_error` e `too_large`.
- Somar o tamanho dos chunks durante a gravação e interromper em 25 MiB.
- Manter o `Blob` apenas em memória depois de falha recuperável.
- Expor ações de iniciar, parar, cancelar, repetir e descartar.
- Em sucesso, entregar a transcrição ao composer para revisão manual e descartar o áudio; não enviar à sessão.
- Criar um `AbortController` por tentativa e um identificador que invalida respostas tardias.
- Cancelar a transcrição aborta a requisição, descarta Blob/chunks e volta a `idle` sem retry.
- Cancelar tracks do microfone em parada, cancelamento, erro e desmontagem.
- Tratar permissão negada, browser incompatível, transcrição vazia e mudança de sessão durante a operação.

### Testes locais

- Negociação de formato em Safari-like e Chromium-like.
- Transições válidas e proteção contra cliques duplicados.
- Interrupção por tamanho.
- Retry preservando o mesmo `Blob`.
- Cancelamento durante transcrição, descarte e resposta tardia ignorada.
- Descarte e encerramento das tracks.
- Erros do backend traduzidos sem perder o áudio recuperável.

## Etapa 3 — revisão da transcrição e lock global da interface

### Arquivos

- Atualizar `src/components/Icons/Icons.tsx` com ícone de microfone, se ainda não existir.
- Atualizar `src/components/ChatWindow/ChatWindow.tsx` e `ChatWindow.module.scss`.
- Atualizar `src/App.tsx` e o contrato de `onSendMessage` quando necessário.
- Atualizar `src/components/Sidebar/Sidebar.tsx` e estilos para o estado bloqueado.
- Atualizar `src/i18n/locales/en.json` e `src/i18n/locales/pt-BR.json`.

### Implementação

- Posicionar o microfone junto às ações do composer, mantendo área de toque adequada em mobile.
- Exibir estado de gravação e ações de parar/cancelar sem introduzir limite por cronômetro.
- Desabilitar nova gravação enquanto houver geração ou transcrição ativa.
- Após transcrição válida, adicionar o texto ao fim do composer, usando nova linha quando já houver conteúdo, e devolver o foco ao textarea.
- Não chamar `onSendMessage`; o usuário revisa e envia manualmente.
- Elevar `isTranscribing` ao `App` e aplicar `inert`, `aria-busy`, props `disabled` e guards nos handlers da sidebar e do chat.
- Renderizar via portal um overlay fora da árvore inerte com status e somente o botão de cancelamento ativo.
- Bloquear textarea, anexos, drag-and-drop, modelos, título, menus, configurações, nova sessão e navegação entre sessões.
- Não criar mensagem de áudio, player ou preview persistente.
- Exibir mensagens específicas para permissão, indisponibilidade, ocupado, ausência de fala, erro recuperável e limite de tamanho.

### Testes locais

- Renderização com capacidades disponíveis e indisponíveis.
- Gravar, parar, transcrever, editar e enviar manualmente.
- Garantir que a conclusão não chama `onSendMessage`.
- Append com composer vazio e preenchido.
- Todos os controles bloqueados durante transcrição, exceto cancelar.
- Cancelar sem enviar.
- Retry após falha.
- Não enviar texto vazio.
- Composer permanece funcional quando o microfone não é suportado.
- Verificação manual local em viewport desktop e mobile/PWA.

## Etapa 4 — pipeline atômico de múltiplas imagens

### Arquivos

- Refatorar `src/utils/imageUtils.ts`.
- Atualizar `src/hooks/useHermesStream.ts`.
- Atualizar `src/components/ChatWindow/ChatWindow.tsx` para aguardar preparação antes de limpar anexos.
- Atualizar os dois arquivos de tradução e remover `multipleImagesWarning`.
- Criar testes Vitest para orçamento e montagem multimodal.

### Implementação

- Remover a seleção exclusiva de `attachments[0]` e o aviso de imagem única.
- Não rejeitar uma imagem apenas por superar o antigo limite de origem de 4 MB; tentar processá-la primeiro.
- Criar previews com object URLs e revogá-las ao remover, enviar ou desmontar para reduzir uso de memória.
- Corrigir orientação, preservar proporção e limitar dimensões iniciais.
- Comprimir iterativamente as maiores imagens, reduzindo qualidade antes de dimensões.
- Medir o tamanho do corpo JSON final com Base64 e reservar margem abaixo dos 10 MB do Hermes.
- Produzir uma parte de texto opcional seguida de uma parte `image_url` por imagem.
- Se qualquer decodificação/compressão falhar, ou se o conjunto continuar grande demais, não iniciar a requisição e preservar o composer completo.
- Só limpar texto e anexos depois que a preparação terminar e o envio for aceito pelo fluxo local.

### Testes locais

- Uma imagem e várias imagens.
- Texto mais imagens e mensagem apenas com imagens.
- Crescimento de Base64 contabilizado.
- Compressão progressiva e preservação de proporção.
- Rejeição atômica por tamanho ou falha de uma imagem.
- Ordem dos anexos preservada.
- Reasoning continua separado depois de uma mensagem multimodal.

## Etapa 5 — presença compartilhada, push confiável e badge numérico

### Arquivos

- Atualizar `backend/routers/sessions.py`.
- Atualizar `backend/routers/notifications.py` e os modelos de payload.
- Atualizar `public/sw.js`.
- Atualizar `src/utils/pushNotifications.ts`.
- Remover `usePresenceHeartbeat` de `src/App.tsx` e, se ficar sem uso, de `src/hooks`.
- Adicionar testes das funções puras de contador/deduplicação onde for possível sem simular o ambiente completo do service worker.

### Implementação

- Criar um registro de presença em memória por identificador efêmero de aba.
- A página informa `visible` imediatamente e renova o registro em intervalo curto; em `visibilitychange` para oculto e `pagehide`, remove ou marca a presença como oculta com envio `keepalive`.
- Expirar registros abandonados por TTL para cobrir encerramento abrupto, perda de rede e suspensão do navegador.
- Antes do push de conclusão, suprimi-lo quando qualquer cliente registrado estiver visível. O service worker mantém a checagem de seus próprios clientes como proteção redundante.
- Não persistir presença. O desenho assume uma única instância do backend no NAS.
- Gerar um `notificationId` único uma vez por resposta concluída e incluí-lo no mesmo payload enviado a todas as inscrições.
- No service worker, persistir contador e uma lista limitada de IDs vistos em IndexedDB.
- Ignorar pushes já processados.
- Com cliente visível: não mostrar notificação e não incrementar.
- Com app oculto/fechado: incrementar, persistir e chamar `self.navigator.setAppBadge` quando disponível antes de mostrar a notificação.
- No clique, zerar o contador, limpar o badge e focar/abrir o app.
- Na página, limpar contador e badge na inicialização e em `visibilitychange` para `visible`, enviando uma mensagem ao service worker.
- Preservar o fallback de notificação em navegadores sem Badging API.

### Testes locais

- Payload contém ID estável por conclusão.
- Cliente visível em navegador separado do PWA suprime o envio do push.
- Estado oculto remove a supressão imediatamente e registros abandonados expiram pelo TTL.
- Push duplicado não incrementa duas vezes.
- Visível, oculto e fechado produzem os comportamentos esperados.
- Persistência e limpeza do contador.
- Falha ou ausência de `setAppBadge` não impede a notificação.
- Clique foca o cliente correto e limpa o estado.
- Teste manual local com DevTools e, quando disponível, um PWA instalado.

## Etapa 6 — regressões de Sessions API e reasoning

### Arquivos

- Criar ou ampliar testes de `src/utils/api.ts` e `src/hooks/useHermesStream.ts`.
- Criar testes focados no parser SSE de `backend/routers/sessions.py`, se a refatoração do push tocar o parser.

### Implementação e testes

- Manter `tool.progress`/`_thinking` direcionado somente a `reasoning_content`.
- Garantir que `assistant.delta` continue formando apenas `content`.
- Confirmar que `assistant.completed` aciona exatamente um push, mesmo se o navegador desconectar do stream.
- Confirmar que cancelamento não gera notificação de conclusão.
- Não adicionar fallback para CLI nem banco próprio.

## Etapa 7 — documentação pública

### Arquivos

- Atualizar `README.md`.
- Atualizar `docker-compose.example.yml` apenas se a integração exigir nova variável documentada.
- Manter os documentos de design e implementação como referência.

### Conteúdo

- Adicionar áudio e múltiplas imagens à lista de recursos.
- Atualizar o diagrama para mostrar STT interno no backend Python.
- Explicar que somente a transcrição entra na sessão e o áudio temporário é apagado.
- Documentar limites de 25 MiB e aproximadamente 10 MB.
- Documentar HTTPS, permissão de microfone, PWA instalado, notificações e limitações do badge no iOS.
- Documentar `chrome://flags/#unsafely-treat-insecure-origin-as-secure` como exceção local do Chrome desktop para hosts HTTP privados, com origem completa, porta, reinicialização e aviso de segurança. Não alterar o código de detecção HTTP.
- Documentar o `config.yaml` como fonte única de STT, incluindo exemplos de provedores/modelos e `stt.language: ""` para autodetecção. Alertar que o padrão atual do Hermes é inglês.
- Explicar por que o backend permanece em Python e o acoplamento versionado ao Hermes.
- Declarar explicitamente o foco em rede privada e ausência de autenticação multiusuário.
- Adicionar troubleshooting para áudio indisponível, formato, tamanho e badge ausente.
- Incluir comandos de testes Python locais junto aos comandos frontend existentes.

## Etapa 8 — validação final exclusivamente local

### Comandos

```bash
npm test
npm run type-check
npm run lint
npm run build
.venv/bin/python -m pytest backend/tests
```

Também executar, se Docker estiver disponível localmente:

```bash
docker build -t hermes-chat-ui:local .
```

### Critérios de conclusão local

- Todos os testes automatizados passam.
- Build frontend e importação do backend passam.
- Nenhum temporário de áudio permanece após os testes.
- Uma mensagem com múltiplas imagens produz todas as partes esperadas.
- Um áudio curto percorre o STT local e envia a transcrição, quando o Hermes/STT estiver disponível.
- Push visível não gera badge; push oculto gera; retorno limpa.
- O README corresponde ao comportamento implementado.

## Validação posterior pelo proprietário no NAS

O processo de implementação não acessará nem testará diretamente o NAS. Após disponibilizar a imagem, o proprietário executará o checklist da seção 9 do design, com atenção especial a:

- importação do STT na imagem final do Hermes;
- formatos gravados pelo Safari do iPhone;
- badge com o PWA instalado e fechado;
- limpeza do badge ao reabrir;
- ausência de áudio e transcrições nos logs.

Qualquer problema exclusivo do NAS/iPhone será tratado como feedback pós-deploy, não como falha silenciosa dos testes locais.

## Ordem de commits sugerida

1. `test: add local backend and frontend test foundations`
2. `feat: add Hermes audio transcription adapter and API`
3. `feat: add web and PWA voice recording`
4. `feat: support atomic multi-image messages`
5. `fix: add persistent PWA notification badges`
6. `test: cover sessions reasoning and completion notifications`
7. `docs: document voice, multimodal input, and PWA badges`

Cada commit deve permanecer executável e não incluir mudanças de dependências alheias ao recurso.
