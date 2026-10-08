# Preparação do FisioZap para aplicativo móvel

## Decisão de arquitetura

- Manter Next.js + React como frontend principal.
- Manter regras de negócio, autenticação, autorização e acesso aos dados no servidor/Supabase; o aplicativo não terá credenciais privilegiadas embutidas.
- Quando o fluxo web estiver estável, avaliar o Capacitor para encapsular o frontend existente e gerar builds Android/iOS.
- Não migrar para React Native nem criar um segundo frontend nesta etapa.
- Tratar PWA como melhoria de instalação pela web, não como substituta automática do app Capacitor.

## O que esta etapa prepara

- Viewport móvel e áreas seguras de telas com recortes/notches.
- Metadados para experiência web instalável e nome do app.
- Manifesto web básico.
- Estilos responsivos, campos confortáveis para toque, foco visível e respeito à preferência por movimento reduzido.
- Requisitos e critérios para a futura integração Capacitor documentados aqui.

## Antes de integrar Capacitor

1. Validar login, logout, recuperação/expiração de sessão e retorno após login em navegador móvel.
2. Confirmar que todos os módulos funcionam em larguras pequenas e com teclado virtual aberto.
3. Publicar frontend e backend em infraestrutura acessível por HTTPS; o app não pode depender do computador local ligado para o uso remoto.
4. Confirmar CORS, URLs de redirecionamento e políticas de sessão para os domínios usados.
5. Adicionar Capacitor e seus scripts apenas em uma alteração própria, incluindo lockfile e instruções reproduzíveis para Android/iOS.
6. Configurar identificadores de pacote, ícones, splash screen e assinatura fora de segredos versionados.
7. Testar em dispositivos reais: login, sessão renovada, navegação, anexos, câmera (se necessária), notificações push, links externos e comportamento offline.
8. Manter qualquer cache local de dados clínicos mínimo, protegido e com política de limpeza/logout.

## Critérios de aceite para a etapa Capacitor

- Build web de produção concluído.
- Build Android de debug reproduzível a partir do repositório.
- Login e renovação de sessão testados em aparelho real.
- Nenhuma chave privilegiada presente no bundle web ou APK.
- Permissões e acesso a pacientes continuam sendo validados no servidor/RLS.
- Uploads, links de autenticação e notificações documentados e testados.
- Falhas de rede exibem mensagens úteis sem expor dados clínicos.
- CI verifica lint/typecheck/build e os arquivos de configuração mobile.

## Fora do escopo atual

- APK/AAB de produção ou publicação em lojas.
- Service worker/cache offline para dados de pacientes.
- Notificações push nativas.
- Acesso a câmera/arquivos sem um caso de uso confirmado.
- Migração de autenticação ou lógica de negócio para o cliente.

## Observação sobre segurança

O FisioZap lida com dados potencialmente sensíveis. Nunca confiar no cliente para autorização; não registrar informações clínicas em logs desnecessários; não armazenar tokens/segredos no repositório; e exigir revisão profissional antes de confirmar conteúdo clínico sugerido por IA.
