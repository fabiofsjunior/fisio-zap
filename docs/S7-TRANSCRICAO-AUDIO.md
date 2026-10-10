# S7.4 — Transcrição opcional de áudio

Issue #34. Branch `feature/chat-audio-transcription` → `TESTES`. Homologação funcional do proprietário pendente.

## Fluxo

Grave ou selecione um áudio no Chat. Quando o backend estiver configurado, escolha **Transcrever**, leia o aviso de envio ao OpenAI e confirme. O resultado fica em um campo editável: revise antes de adicionar ao rascunho. O texto já digitado deve ser preservado. Uma consulta ao assistente exige outro clique em **Enviar**; transcrever não executa comandos nem cria registros clínicos.

PDFs e imagens continuam como anexos de sessão, sem interpretação. A transcrição não cria um histórico permanente e não altera o livro-caixa, a agenda ou as evoluções.

## Configuração no servidor

O recurso é desativado por padrão. Configure exclusivamente no ambiente do **backend**, nunca em variáveis `NEXT_PUBLIC_*`:

```dotenv
FISIOZAP_TRANSCRIPTION_ENABLED=true
OPENAI_API_KEY=<chave configurada fora do repositório>
FISIOZAP_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Sem opt-in literal e chave preenchida, o backend informa indisponibilidade e não chama o provedor. O endpoint de disponibilidade verifica a configuração; ele não testa saldo ou validade da chave no provedor. `AI_API_KEY` não habilita esta integração. O launcher local lê `.env.local`; não publique esse arquivo. O modelo padrão é `gpt-4o-mini-transcribe`; também são aceitos `gpt-4o-transcribe` e `whisper-1`. Modelos fora dessa lista desabilitam o recurso.

O OpenAI é uma integração opcional desta entrega. A API tem cobrança própria, independente de uma assinatura do ChatGPT. Não há ativação automática, configuração remota de credenciais ou chamada real durante os testes automatizados. Antes de habilitar para usuários, o proprietário deve avaliar custo, tratamento e retenção do provedor. Use apenas gravações fictícias na homologação.

## Privacidade

O backend autentica o usuário e valida sua organização antes de receber os bytes. Apenas áudio aceito é encaminhado após consentimento explícito da interface. O áudio e o texto não são gravados em banco, disco ou logs pela aplicação. A transcrição retorna como texto, sem HTML executável e sem instruções automáticas. As políticas de tratamento do provedor externo são independentes do descarte na aplicação.

## Contrato e limites

- `GET /chat/transcription-status` retorna somente `{enabled:boolean}`, com autenticação e organização ativa.
- `POST /chat/transcriptions` recebe bytes de áudio, JWT, organização, `Content-Type`, `X-FisioZap-File-Name` codificado com `encodeURIComponent` e `X-Transcription-Consent: true`. Retorna `{text,mode:'transcription'}`. O nome encaminhado ao provedor é genérico, sem o nome original do arquivo.
- Até 10 MiB por áudio; assinatura básica, tipo e extensão devem corresponder. PDFs, imagens, corpo comprimido e conteúdo vazio são rejeitados. Esta checagem não decodifica o áudio nem garante sua duração.
- Upload: 30 segundos sem atividade e 60 segundos totais. Provedor: timeout de 20 segundos, sem tentativas automáticas. Resposta limitada a 256 KiB e texto a 4.000 caracteres; excesso é rejeitado, sem truncar silenciosamente.
- Até duas requisições simultâneas por processo e três tentativas válidas por minuto por usuário/organização, além do limite geral de 30 requisições por minuto por IP. Tentativas ao provedor que falham também consomem a quota.

As quotas ficam na memória de cada processo e reiniciam com ele; múltiplas instâncias multiplicam os limites. Elas não substituem um teto financeiro ou quota compartilhada para produção. O limite de dois minutos vale para gravações feitas na interface; arquivos importados podem ser mais longos. Cancelar encerra a requisição da aplicação, mas não garante que o provedor deixará de processar ou cobrar um áudio já recebido. Habilitar esta etapa exige considerar essas limitações.

Referências de implementação: [guia oficial Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text) e [API de transcrição](https://developers.openai.com/api/docs/api-reference/audio/createTranscription).

## Homologação

1. Com o recurso desativado, confirme que texto, gravação e anexos funcionam e não há envio ao provedor.
2. Habilite o backend com chave própria e áudio fictício; confira o aviso e cancele antes de confirmar.
3. Confirme uma transcrição, revise o resultado e adicione ao rascunho: um texto previamente digitado deve continuar presente.
4. Verifique que nenhuma consulta ocorre antes do clique em **Enviar**.
5. Teste erro, cancelamento, troca de organização, logout e mudança de tela durante a requisição; resultados tardios não devem aparecer em outra sessão.
6. Teste no desktop e celular, inclusive permissão do microfone negada. Testes automatizados simulam as APIs de mídia e o provedor; não homologam esses dispositivos.
