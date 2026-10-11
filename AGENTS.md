# Instruções de agente — FisioZap

## Supabase e migrations

Ao alterar qualquer arquivo em `supabase/`, estas regras são obrigatórias:

1. **SQL deve ser sintaticamente válido antes do commit.**
2. Blocos PL/pgSQL anônimos devem usar exatamente os delimitadores PostgreSQL:
   ```sql
   do $$
   begin
     -- comandos
   end $$;
   ```
   Nunca usar `do $`, `do $;`, `end $` ou variações incompletas.
3. Se for necessário um tag de dollar-quoting, use um par completo e consistente, por exemplo `$migration$` ... `$migration$`.
4. Não copiar delimitadores parcialmente de outro contexto. O delimitador de abertura e fechamento deve ser idêntico.
5. Antes de considerar uma migration concluída:
   - revisar o arquivo SQL inteiro;
   - procurar por `do $`, `end $` e outros dollar-quoting incompletos;
   - executar a validação local/replay das migrations;
   - executar os testes e o CI aplicável.
6. Uma migration só pode ser considerada pronta quando `supabase db reset --local --no-seed` consegue reproduzir o schema desde o início sem erro.
7. Não corrigir falhas de migration apenas com rerun. Primeiro identificar a causa no SQL/log e corrigir o arquivo.
8. Nunca alterar o banco remoto para mascarar uma falha de replay local.
9. Para novas migrations, seguir as instruções da skill oficial do Supabase e criar o arquivo por `supabase migration new <nome>` quando o CLI estiver disponível.
10. Em alterações de RLS, revisar `USING`, `WITH CHECK`, isolamento por organização e permissões `anon/authenticated`.

### Checklist obrigatório antes de commit de migration

```text
SQL revisado
↓
Dollar-quoting revisado
↓
Replay completo das migrations
↓
Lint do schema
↓
Testes relacionados
↓
CI verde
```

Uma falha em qualquer etapa bloqueia o merge.

## Frontend — skills obrigatórias

Antes de criar ou refatorar interfaces, o agente deve consultar e aplicar as orientações da [Issue #4](https://github.com/fabiofsjunior/fisio-zap/issues/4) e a skill [Impeccable](https://impeccable.style/#language), quando disponível no ambiente de execução.

- Verificar explicitamente se a skill está instalada/acessível e ler suas instruções antes de editar UI. Não afirmar que foi usada apenas por existir um link.
- Se a skill não estiver disponível, registrar a limitação na PR; não simular sua execução. Seguir as diretrizes públicas acessíveis e o design existente, sem bloquear correções críticas.
- Aplicar hierarquia visual, acessibilidade, responsividade, estados de carregamento/erro, consistência e testes pertinentes.
- Registrar na PR quais orientações foram efetivamente aplicadas, com evidências dos testes.
- Trabalhar na `TESTES`; não modificar `main` diretamente nem mesclar sem CI verde e revisão.
