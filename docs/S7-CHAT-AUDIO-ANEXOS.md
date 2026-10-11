# S7.3 — Áudio e anexos no Chat

Issue #32. Branch `feature/chat-audio-attachments` → `TESTES`. Homologação do proprietário pendente.

## Envio

- **Gravar áudio** pede acesso ao microfone somente após o clique. Pare para ouvir antes de enviar; cancelar descarta a gravação. Limite de dois minutos.
- **Anexar arquivo** permite escolher um PDF, imagem JPEG/PNG/WebP ou áudio WebM/Ogg/WAV/MP3/MP4.
- Cada envio contém um arquivo, de até 10 MiB. Texto e anexo são enviados separadamente; o texto digitado é preservado ao enviar o arquivo.
- O Chat confirma o recebimento após validação no servidor. Falhas mantêm o arquivo disponível para nova tentativa.
- Áudios podem ser ouvidos na conversa. Imagens e PDFs mostram nome e tamanho e podem ser baixados, sem visualização incorporada.

## Privacidade e limites

Os arquivos ficam disponíveis apenas na sessão do navegador, com limite de 30 MiB de conteúdo anexado, incluindo o arquivo pendente, e até dez anexos enviados. Esse teto se refere aos bytes dos arquivos, não ao consumo total de RAM do navegador. Ao sair ou recarregar, eles não compõem um histórico permanente. O servidor recebe o conteúdo para validar tamanho, tipo e assinatura básica do contêiner e então o descarta. Não há armazenamento em Supabase, URLs públicas ou envio a provedor de IA.

**Não há transcrição, leitura de documentos ou interpretação dos anexos nesta entrega.** O recibo de envio não transforma um arquivo em registro clínico. Durante desenvolvimento e homologação, use conteúdo fictício.

A validação de assinatura identifica o tipo básico; ela não substitui um parser completo ou antivírus. HTML, SVG, executáveis e tipos fora da lista não são aceitos. Antes de uma futura persistência, definir retenção, armazenamento privado, autorização por objeto e inspeção de conteúdo.

O endpoint `POST /chat/attachments` usa o JWT e a organização ativa existentes. Recebe bytes com `Content-Type` do arquivo e `X-FisioZap-File-Name` codificado com `encodeURIComponent`. Rejeita conteúdo vazio, tipos/extensões incompatíveis, nomes inválidos, corpo comprimido e arquivos acima do limite. Não fornece rota pública de download.

## Homologação funcional

1. No navegador desktop e celular, grave, pare, ouça e envie um áudio fictício. Confirme o recibo e a reprodução na conversa.
2. Cancele uma gravação e navegue para o Painel durante outra: o indicador de microfone deve desligar.
3. Negue a permissão e teste um navegador sem suporte: erro compreensível, sem bloquear envio de texto/anexo.
4. Anexe um PDF e uma imagem de teste, remova antes do envio e escolha novamente.
5. Simule backend indisponível: o anexo e texto digitado devem ser preservados para tentar de novo.
6. Teste arquivo inválido e maior que 10 MiB; confirme rejeição sem sucesso falso.
7. Faça logout/recarregue: os anexos anteriores não devem permanecer disponíveis.

O microfone requer contexto seguro (HTTPS ou localhost). A captura no dispositivo real continua dependente da homologação; testes automatizados simulam as APIs de mídia.
