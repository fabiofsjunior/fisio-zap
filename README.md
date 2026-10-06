# FisioZap

Assistente profissional para fisioterapeutas.

## Branch de desenvolvimento

Todo desenvolvimento deve ocorrer na branch `TESTES`. A branch `main` permanece protegida e não deve receber desenvolvimento direto.

## Ambiente

- Frontend: Vercel
- Backend: execução local no desktop durante o desenvolvimento
- Banco/Auth: Supabase
- Segredos: somente em `.env.local` (nunca versionar)

## Aplicativo móvel futuro

O frontend permanece em Next.js + React. A preparação responsiva e o manifesto web estão sendo desenvolvidos em `TESTES`. A estratégia prevista é avaliar o Capacitor após estabilizar e validar os fluxos web; ainda não existe um APK pronto para distribuição. Consulte [docs/mobile-app.md](docs/mobile-app.md).

## Status

MVP em preparação para testes. O app móvel é uma etapa futura e depende de autenticação, backend e módulos web validados.
