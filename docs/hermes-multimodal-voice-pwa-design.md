# Design: áudio, múltiplas imagens, reasoning e badges do PWA

Status: aprovado  
Data: 2026-08-02

## 1. Contexto e objetivo

O Hermes Chat UI é um cliente web privado para o Hermes Agent. O Hermes deve continuar sendo a fonte canônica para sessões, mensagens e anexos; o app não deve criar um banco de conversas paralelo.

Este design cobre quatro melhorias relacionadas:

1. adicionar gravação de voz no app web e no PWA;
2. restaurar o envio de múltiplas imagens;
3. preservar o reasoning estruturado sem voltar a usar o CLI;
4. implementar o badge numérico de notificações no ícone do PWA.

Também decide se o backend deve permanecer em Python ou ser migrado para TypeScript.

## 2. Entendimento confirmado

- O app é um cliente de usuário único, executado em infraestrutura privada e acessado por rede privada/Tailscale.
- Sessões e mensagens permanecem no banco e nas APIs do Hermes.
- O CLI não será reintroduzido. O reasoning continuará vindo dos eventos estruturados da Sessions API.
- A UI deve aceitar várias imagens e enviar todas ou nenhuma, após redimensionamento e compressão automáticos.
- O botão de microfone deve funcionar tanto no navegador quanto no PWA. O app grava e transcreve com o STT do Hermes, mas insere o resultado no composer para revisão e envio manual.
- Enquanto a transcrição estiver em andamento, toda a interface ficará bloqueada, exceto por uma ação dedicada de cancelamento.
- Provedor, modelo e idioma do STT serão configurados exclusivamente no `config.yaml` do Hermes. O app não criará variáveis de ambiente ou preferências paralelas para esses valores.
- O idioma deve ser detectado por gravação. Como o Hermes atual usa `stt.language: "en"` por padrão, o operador deve definir explicitamente `stt.language: ""` para restaurar a autodetecção.
- O áudio não será anexado à sessão nem armazenado permanentemente.
- O badge contará respostas concluídas enquanto o app estiver oculto ou fechado e será zerado quando o app abrir ou voltar a ficar visível.

## 3. Premissas e requisitos não funcionais

### Escala e desempenho

- Usuário único, com uma transcrição ativa por processo.
- Não há limite artificial de duração da gravação; o limite técnico é 25 MB.
- A requisição multimodal do Hermes tem limite aproximado de 10 MB. O cliente usará uma margem inferior a esse valor para texto, JSON e Base64.
- O redimensionamento e a compressão de imagens acontecem no navegador antes do envio.

### Segurança e privacidade

- O serviço não será projetado, nesta etapa, para exposição pública ou múltiplos usuários.
- O áudio existirá apenas na memória do navegador durante gravação, envio ou repetição e em arquivo temporário no backend durante a transcrição.
- O arquivo temporário será removido tanto em sucesso quanto em falha.
- Áudio e texto transcrito não serão escritos em logs.
- Nomes de arquivo enviados pelo navegador não serão reutilizados no servidor.

### Confiabilidade

- Se rede ou STT falharem, o navegador manterá o `Blob` temporariamente para uma tentativa manual.
- A transcrição concluída será adicionada ao fim do texto existente, separada por nova linha, e permanecerá editável até o envio manual.
- Cancelar uma transcrição descarta imediatamente o áudio no navegador e invalida qualquer resposta tardia.
- Uma falha no adaptador de áudio não pode impedir chat, sessões, imagens ou notificações de funcionar.
- Transcrições vazias ou classificadas como ausência de fala não serão enviadas.

### Compatibilidade e manutenção

- Suporte alvo: duas versões mais recentes de Safari/iOS, Chrome e Edge.
- Recursos dependentes do navegador serão habilitados por detecção de capacidade.
- No Chrome desktop, uma origem HTTP privada pode ser autorizada localmente com `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. Essa exceção será apenas documentada; o app não terá código específico para contorná-la.
- É aceitável depender da API interna de STT do Hermes, pois este app funciona como cliente do Hermes. A dependência ficará isolada, testada e vinculada à versão instalada do Hermes.
- Toda validação executável será feita localmente. O ambiente real está em um NAS sem acesso por este processo; nele, somente o proprietário executará o checklist manual pós-deploy.

## 4. Não objetivos

- Enviar ou armazenar áudio bruto dentro das sessões do Hermes.
- Player ou histórico de mensagens de áudio.
- Wake word, conversa de voz contínua, modo realtime ou TTS.
- Autenticação multiusuário, autorização por sessão ou exposição direta à internet.
- Sincronização do número do badge entre dispositivos.
- Retornar ao CLI para obter reasoning.

## 5. Alternativas consideradas

### 5.1 FastAPI com adaptador Python para o STT nativo — escolhida

O backend atual permanece em Python. Uma camada pequena isola a chamada ao mecanismo interno de transcrição usado pelo Hermes. Isso reutiliza configuração, provedores e comportamento do Hermes e evita uma ponte adicional entre runtimes.

### 5.2 FastAPI chamando o endpoint interno do dashboard

Evitaria a importação direta do código de STT, mas exigiria que o dashboard estivesse ativo e introduziria autenticação e disponibilidade entre serviços. O endpoint continuaria sendo interno.

### 5.3 Backend em TypeScript

Sessões, SSE, push e proxy podem ser implementados em Node. Entretanto, o STT equivalente ao Telegram/Discord ainda exigiria o dashboard ou uma ponte Python. Como o Hermes continua sendo Python, a migração adicionaria complexidade sem remover esse runtime da implantação.

## 6. Arquitetura escolhida

### 6.1 Áudio no frontend

Um controlador de gravação usa `MediaRecorder` quando disponível. A UI possui estados explícitos: ocioso, gravando, preparando, transcrevendo, enviando, falha recuperável e áudio grande demais.

Durante a gravação, o tamanho acumulado é acompanhado. Ao chegar a 25 MB, a gravação é interrompida e o usuário recebe a mensagem de que o áudio ficou grande demais. Não é feita tentativa de enviar um arquivo acima desse limite.

Ao parar normalmente, o navegador envia o áudio em `multipart/form-data`. O formato concreto pode variar por navegador, por exemplo WebM/Opus ou MP4/AAC; a detecção deve escolher entre os tipos realmente aceitos por `MediaRecorder` e pelo backend.

Se a transcrição retornar texto válido, esse texto é adicionado ao fim do conteúdo atual do composer, separado por nova linha quando necessário. O usuário pode corrigir o resultado e enviá-lo manualmente pelo fluxo existente da Sessions API. Em falha recuperável, a UI oferece tentar novamente ou descartar.

Durante o estado `transcribing`, o `ChatWindow` eleva um lock ao `App`. O layout principal usa `inert` e `aria-busy`, e os componentes recebem `disabled` explicitamente. Textarea, anexos, modelos, título, botões, configurações e navegação da sidebar não executam ações. Um overlay fora da árvore inerte apresenta o progresso e mantém somente “Cancelar transcrição” operável.

Cada tentativa de transcrição possui um `AbortController` e um identificador de operação. O cancelamento aborta a requisição do navegador, invalida respostas tardias, descarta Blob/chunks e remove o lock imediatamente. O backend pode terminar trabalho já iniciado, mas continua removendo o arquivo temporário no `finally`.

### 6.2 Endpoint e adaptador de transcrição

O backend expõe uma rota conceitual `POST /api/audio/transcriptions`, que aceita um único arquivo. A rota:

1. verifica disponibilidade da integração;
2. valida tamanho e tipo;
3. aplica o controle de uma transcrição simultânea;
4. cria um arquivo temporário com nome gerado pelo servidor;
5. chama o adaptador do STT interno do Hermes;
6. normaliza o resultado;
7. remove o arquivo em um bloco `finally`.

Resposta de sucesso conceitual:

```json
{
  "text": "mensagem transcrita"
}
```

Erros devem ter códigos estáveis para: recurso indisponível, arquivo grande demais, formato incompatível, transcrição ocupada, ausência de fala e falha interna de transcrição. A UI traduz esses códigos em mensagens claras.

O adaptador é o único módulo que conhece a API interna do Hermes. Sua inicialização não deve derrubar o backend: se a importação for incompatível, a capacidade de áudio será marcada como indisponível.

O adaptador não seleciona idioma, provedor ou modelo. `transcribe_recording()` lê a configuração nativa do Hermes. O endpoint de capacidades pode expor o provedor, o modelo e o modo de idioma efetivos para diagnóstico, convertendo o valor vazio em `"auto"`, sem expor credenciais ou outras configurações sensíveis.

### 6.3 Múltiplas imagens

O frontend deixa de usar apenas o primeiro anexo e monta conteúdo multimodal com uma parte de texto e uma parte `image_url` para cada imagem.

Antes do envio, todas as imagens são decodificadas com orientação correta e redimensionadas mantendo proporção. A compressão reduz primeiro a qualidade e, se necessário, as dimensões. O cálculo final considera o payload serializado, inclusive o crescimento causado por Base64.

A operação é atômica: se o conjunto não couber dentro da margem segura da requisição, nada é enviado. Texto e anexos permanecem no composer para o usuário remover itens ou tentar novamente. O backend encaminha o conteúdo à Sessions API e não mantém cópias dos anexos.

### 6.4 Reasoning

O reasoning continua sendo consumido de eventos estruturados da Sessions API e exibido separadamente da resposta final. Conteúdo de raciocínio não será concatenado à mensagem do assistente nem persistido como se fosse resposta comum.

A correção futura da issue `NousResearch/hermes-agent#7556` não é pré-requisito para este fluxo. Se o Hermes passar a expor outro formato compatível, a normalização deve ocorrer no adaptador de streaming, preservando o contrato da UI.

### 6.5 Badge do PWA

O service worker mantém um contador local e persistente por instalação. Cada push de resposta concluída contém um identificador único, usado para evitar incrementos duplicados.

O service worker consegue consultar somente clientes do mesmo contexto de instalação. Como navegador e PWA podem manter contextos separados, cada aba também registra no backend um identificador efêmero e seu estado de visibilidade. Clientes visíveis renovam essa presença periodicamente; ao ocultar ou fechar, informam a mudança imediatamente. Um TTL curto remove registros abandonados após encerramento abrupto.

Antes de enviar um push de conclusão, o backend verifica a presença compartilhada:

- se qualquer cliente estiver visível, não envia push;
- se nenhum cliente estiver visível, envia o push para as inscrições.

Ao receber o push, o service worker ainda consulta seus próprios clientes como proteção adicional:

- se alguma janela estiver visível, não incrementa o contador e não mostra notificação externa;
- se o app estiver oculto ou fechado, incrementa o contador, persiste o novo valor, chama `setAppBadge(total)` quando disponível e mostra a notificação.

Ao abrir o app, clicar na notificação ou retornar ao estado visível, a página chama `clearAppBadge()` e envia uma mensagem ao service worker para zerar o contador persistido. A propriedade visual `badge` da notificação não substitui esse uso da Badging API.

Em navegadores sem suporte, notificações continuam funcionando e o contador numérico é simplesmente omitido.

## 7. Casos de falha e bordas

- Permissão de microfone negada: explicar como habilitá-la e manter o chat utilizável.
- `MediaRecorder` indisponível ou nenhum formato compatível: ocultar/desabilitar o microfone com explicação.
- App fechado durante gravação ou repetição: o áudio em memória é perdido por design.
- Sessão removida enquanto a transcrição está ativa: descartar o resultado e desbloquear a interface.
- Resposta chega depois de cancelamento: ignorar pelo identificador de operação.
- Mudança de visibilidade/aba: não cancelar automaticamente uma transcrição válida.
- Áudio exatamente no limite: o backend permanece como autoridade final sobre o tamanho.
- STT retorna apenas espaços ou ausência de fala: não enviar mensagem.
- Sessão removida entre transcrição e envio: preservar o texto e informar que ele não pôde ser enviado.
- Várias imagens válidas individualmente, mas conjunto grande demais: rejeitar o conjunto completo.
- Compressão ou decodificação falha para uma imagem: não enviar subconjunto silenciosamente.
- Push repetido: identificador da resposta impede nova contagem.
- Aba encerrada sem informar estado: o registro de presença expira pelo TTL e não bloqueia notificações indefinidamente.
- Backend reiniciado: a presença é reconstruída no próximo heartbeat; nenhum dado de presença precisa ser persistido.
- Badge recusado pelo sistema: não tratar como falha de notificações.

## 8. Estratégia de testes locais

### Backend

- validação de tamanho e formato;
- exclusão do temporário em sucesso, erro, cancelamento e timeout;
- normalização de transcrição e ausência de fala;
- concorrência de transcrição;
- adaptador indisponível sem afetar outras rotas;
- teste de integração ou smoke test contra a versão local fixada do Hermes.

### Frontend

- máquina de estados da gravação;
- repetição e descarte do áudio temporário;
- inserção da transcrição no composer sem chamar o envio;
- append após texto existente e foco para revisão;
- lock global semântico durante transcrição;
- cancelamento, aborto da requisição, descarte e resposta tardia ignorada;
- uma e várias imagens;
- compressão e orçamento do payload;
- rejeição atômica;
- suporte e ausência de `MediaRecorder` e Badging API.
- diagnóstico do STT mostra apenas provedor, modelo e `auto`/idioma, sem segredos.

### Service worker

- incremento somente com app oculto ou fechado;
- supressão do push quando navegador ou PWA estiver visível, inclusive em contextos separados;
- atualização, remoção explícita e expiração de presença;
- deduplicação de respostas;
- restauração do contador persistido;
- limpeza ao abrir, clicar ou voltar à visibilidade;
- fallback sem Badging API.

### Navegadores

Os testes automatizados e manuais acessíveis serão executados apenas localmente. Quando possível, cobrir Chrome/Edge e Safari local. O comportamento específico do PWA instalado no iPhone será validado pelo proprietário no dispositivo real.

## 9. Checklist manual para o NAS e iPhone

Este checklist não será executado automaticamente nem exige acesso remoto ao NAS:

1. subir a nova imagem mantendo a versão prevista do Hermes;
2. verificar saúde do chat e listagem de sessões;
3. confirmar que a capacidade de áudio aparece disponível;
4. gravar um áudio curto, revisar/corrigir a transcrição no composer e enviá-la manualmente;
5. simular uma falha de rede e testar nova tentativa;
6. enviar várias imagens em uma mensagem;
7. instalar/atualizar o PWA no iPhone e conceder notificações;
8. receber uma resposta com o app fechado e verificar o badge;
9. abrir o app e confirmar que o badge foi zerado;
10. revisar logs para garantir que não contenham áudio nem transcrições.

## 10. Implantação, rollback e documentação pública

Não há migração de banco. As funcionalidades são aditivas e protegidas por capacidades. Se o adaptador de STT falhar após uma atualização do Hermes, somente o microfone fica indisponível.

O rollback restaura a versão anterior do app sem converter sessões ou remover dados. O contador do badge é estado local descartável.

O README público deve explicar:

- por que o backend permanece em Python;
- que áudio é transcrito e descartado, e apenas o texto entra na sessão;
- limites de 25 MB para áudio e aproximadamente 10 MB por requisição multimodal;
- requisitos de HTTPS, permissão de microfone, notificações e instalação do PWA;
- uso opcional e local de `chrome://flags/#unsafely-treat-insecure-origin-as-secure` para uma origem HTTP privada no Chrome desktop, incluindo origem completa e reinicialização;
- configuração nativa de `stt.provider`, do modelo do provedor e de `stt.language: ""` no `config.yaml` para autodetecção multilíngue;
- limitações do badge no iOS;
- dependência versionada da API interna do Hermes;
- foco em implantação privada e ausência de autenticação multiusuário;
- que a validação do ambiente final deve ser feita pelo operador do NAS.

## 11. Riscos reconhecidos

- A API interna de STT pode mudar. Mitigação: adaptador isolado, versão fixada, teste local e desativação graciosa.
- Formatos produzidos por `MediaRecorder` variam. Mitigação: negociação por capacidade e validação no backend.
- Base64 aumenta o tamanho das imagens. Mitigação: medir o payload serializado e reservar margem.
- Badges dependem do navegador, instalação do PWA e preferências do sistema. Mitigação: feature detection e fallback sem contador.
- A presença compartilhada é mantida em memória e pressupõe uma única instância do backend. Mitigação: corresponde ao deploy atual no NAS; uma implantação com réplicas exigiria armazenamento compartilhado.
- O ambiente NAS não pode ser testado diretamente. Mitigação: testes locais e checklist manual explícito.

## 12. Decision log

| Decisão                                   | Alternativas consideradas                   | Motivo                                                                                 |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Manter o backend em Python/FastAPI        | Migrar para TypeScript; chamar dashboard    | Integração mais direta e estável com o STT nativo, sem ponte adicional                 |
| Isolar a API interna de STT               | Esperar API pública; duplicar STT           | Reproduz agora o comportamento de Telegram/Discord com risco contido                   |
| Enviar apenas a transcrição               | Anexar áudio bruto                          | A Sessions API atual não aceita áudio e as integrações do Hermes usam texto transcrito |
| Usar `config.yaml` como fonte única do STT | Variáveis do wrapper; seletor na UI          | Evita duas configurações para o mesmo pipeline nativo                                  |
| Usar autodetecção por gravação             | Idioma fixo; idioma da interface             | O usuário alterna entre vários idiomas; `stt.language: ""` remove o padrão inglês      |
| Revisão manual após transcrever           | Envio automático                            | Permite corrigir erros de STT antes de enviar                                           |
| Adicionar após texto existente            | Substituir; impedir gravação com texto       | Preserva o rascunho e combina ditado com texto já escrito                               |
| Lock elevado ao `App`                     | Contexto global; overlay somente visual      | Coordena sidebar e chat com menor abstração e bloqueio semântico                        |
| `inert` mais `disabled`                    | Apenas `pointer-events`                      | Bloqueia mouse, toque, teclado e foco com melhor acessibilidade                         |
| Cancelamento descarta o áudio             | Preservar para retry                         | Comportamento explícito escolhido; nenhuma persistência após cancelar                   |
| Sem limite artificial de duração          | Limite por minutos                          | O limite relevante é o tamanho técnico de 25 MB                                        |
| Manter áudio no navegador em falha        | Apagar imediatamente; persistir no servidor | Permite uma tentativa manual sem armazenamento permanente                              |
| Enviar todas as imagens ou nenhuma        | Somente primeira; subconjunto que couber    | Evita resultado silenciosamente incompleto                                             |
| Comprimir no navegador                    | Processar no backend                        | Reduz tráfego e permite validar antes do envio                                         |
| Continuar com Sessions API para reasoning | Voltar ao CLI; aguardar issue 7556          | O fluxo estruturado atual já preserva a separação correta                              |
| Badge local por instalação                | Estado de não lido no servidor              | Escopo de usuário único e requisito restrito ao dispositivo                            |
| Presença compartilhada no backend         | Somente `clients.matchAll`; heartbeat antigo | Navegador e PWA podem estar em contextos separados                                     |
| Apenas documentar a flag HTTP do Chrome   | Alterar detecção do frontend                 | A flag já expõe as APIs e resolveu o host privado sem mudança de código                 |
| Uma transcrição ativa por processo        | Concorrência ilimitada                      | Protege recursos do NAS e atende à escala atual                                        |
| Testes somente locais                     | Acesso/teste direto no NAS                  | O ambiente NAS não está acessível; validação final será manual pelo proprietário       |

## 13. Referências

- [Hermes API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)
- [Hermes Voice Mode](https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode)
- [Hermes Voice & TTS](https://hermes-agent.nousresearch.com/docs/user-guide/features/tts/)
- [Hermes issue #7556](https://github.com/NousResearch/hermes-agent/issues/7556)
- [WebKit: Badging for Home Screen Web Apps](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
