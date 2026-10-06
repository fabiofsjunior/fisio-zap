@echo off
setlocal EnableExtensions
chcp 65001 >nul
title FisioZap - Gerenciador local

set "ROOT=%~dp0"
set "FRONT_DIR=%ROOT%"
set "BACK_DIR=%ROOT%backend"
set "ENV_FILE=%ROOT%.env.local"
set "EXAMPLE_ENV=%ROOT%.env.example"
set "FRONT_URL=http://localhost:3000"
set "BACK_URL=http://localhost:3001"

:MENU
cls
echo ============================================================
echo                    FISIOZAP - MENU LOCAL
echo ============================================================
echo  Raiz: %ROOT%
echo.
echo  DESENVOLVIMENTO
echo  [1] Instalar dependencias (frontend + backend)
echo  [2] Configurar ambiente local (.env.local)
echo  [3] RUN FRONT + BACK
echo  [4] Iniciar somente FRONTEND
echo  [5] Iniciar somente BACKEND
echo  [6] Atualizar codigo da branch atual
echo.
echo  TESTES E VALIDACAO
echo  [7] Smoke test
echo  [8] Criar usuario de teste
echo  [9] Bootstrap das contas de teste
echo  [10] Teste RLS
echo  [11] Verificar ambiente e dependencias
echo  [12] Testar saude do backend (/health)
echo.
echo  BUILD E ACESSO
echo  [13] Gerar build de producao
echo  [14] Abrir frontend no navegador
echo  [0] Sair
echo.
set "OP="
set /p "OP=Escolha uma opcao: "

if "%OP%"=="1" goto INSTALL
if "%OP%"=="2" goto CONFIG
if "%OP%"=="3" goto BOTH
if "%OP%"=="4" goto FRONT
if "%OP%"=="5" goto BACK
if "%OP%"=="6" goto PULL
if "%OP%"=="7" goto SMOKE
if "%OP%"=="8" goto CREATE_USER
if "%OP%"=="9" goto BOOTSTRAP
if "%OP%"=="10" goto RLS
if "%OP%"=="11" goto CHECK
if "%OP%"=="12" goto HEALTH
if "%OP%"=="13" goto BUILD
if "%OP%"=="14" goto OPEN
if "%OP%"=="0" goto END

echo.
echo Opcao invalida.
pause
goto MENU

:INSTALL
cls
echo [FisioZap] Instalando dependencias do frontend...
if not exist "%FRONT_DIR%package.json" (
  echo ERRO: package.json do frontend nao encontrado.
  pause
  goto MENU
)
pushd "%FRONT_DIR%"
call npm install
set "FRONT_RC=%ERRORLEVEL%"
popd
if not "%FRONT_RC%"=="0" (
  echo ERRO ao instalar dependencias do frontend.
  pause
  goto MENU
)
echo.
echo [FisioZap] Instalando dependencias do backend...
if not exist "%BACK_DIR%\package.json" (
  echo ERRO: backend\package.json nao encontrado.
  pause
  goto MENU
)
pushd "%BACK_DIR%"
call npm install
set "BACK_RC=%ERRORLEVEL%"
popd
if not "%BACK_RC%"=="0" (
  echo ERRO ao instalar dependencias do backend.
) else (
  echo.
  echo Dependencias instaladas.
)
pause
goto MENU

:CONFIG
cls
if exist "%ENV_FILE%" (
  echo O arquivo .env.local ja existe e nao sera sobrescrito.
  echo Edite-o manualmente para configurar as credenciais locais.
  pause
  goto MENU
)
if not exist "%EXAMPLE_ENV%" (
  echo ERRO: .env.example nao encontrado.
  pause
  goto MENU
)
copy "%EXAMPLE_ENV%" "%ENV_FILE%" >nul
if errorlevel 1 (
  echo ERRO ao criar .env.local.
) else (
  echo Arquivo .env.local criado a partir de .env.example.
  echo Preencha as variaveis necessarias para o ambiente local.
  echo Configure segredos apenas localmente. Nunca envie .env.local ao Git.
)
pause
goto MENU

:BOTH
cls
if not exist "%FRONT_DIR%node_modules\next" (
  echo Dependencias do frontend ausentes. Execute a opcao 1 primeiro.
  pause
  goto MENU
)
if not exist "%BACK_DIR%\node_modules\express" (
  echo Dependencias do backend ausentes. Execute a opcao 1 primeiro.
  pause
  goto MENU
)
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado. Execute a opcao 2 primeiro.
  pause
  goto MENU
)
echo ============================================================
echo             RUN FRONT + BACK - FISIOZAP
echo ============================================================
echo.
echo O npm run dev ira:
echo  1. Identificar a branch atual.
echo  2. Executar git pull --ff-only da branch atual.
echo  3. Iniciar o BACKEND.
echo  4. Aguardar o /health.
echo  5. Iniciar o FRONTEND.
echo  6. Abrir o navegador.
echo.
echo Frontend e backend permanecerao no MESMO TERMINAL.
echo Use CTRL+C para encerrar os dois processos.
echo.
pause
pushd "%ROOT%"
call npm run dev
set "DEV_RC=%ERRORLEVEL%"
popd
echo.
if not "%DEV_RC%"=="0" echo FisioZap encerrado com erro. Codigo: %DEV_RC%
pause
goto MENU

:FRONT
cls
if not exist "%FRONT_DIR%node_modules\next" (
  echo Dependencias do frontend ausentes. Use a opcao 1 primeiro.
  pause
  goto MENU
)
if not exist "%ENV_FILE%" (
  echo AVISO: .env.local nao encontrado. Use a opcao 2 e configure o Supabase.
  pause
)
echo Iniciando frontend pelo npm run dev...
pushd "%ROOT%"
call npm run dev
popd
pause
goto MENU

:BACK
cls
if not exist "%BACK_DIR%\node_modules\express" (
  echo Dependencias do backend ausentes. Use a opcao 1 primeiro.
  pause
  goto MENU
)
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado. Execute a opcao 2 primeiro.
  pause
  goto MENU
)
echo Iniciando backend...
pushd "%BACK_DIR%"
call npm run dev
set "BACK_RC=%ERRORLEVEL%"
popd
if not "%BACK_RC%"=="0" echo Backend encerrado com erro. Codigo: %BACK_RC%
pause
goto MENU

:PULL
cls
echo ============================================================
echo                 ATUALIZAR CODIGO
echo ============================================================
pushd "%ROOT%"
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
  echo ERRO: nao foi possivel identificar a branch atual.
  popd
  pause
  goto MENU
)
echo Branch atual: %CURRENT_BRANCH%
echo.
echo Executando git pull --ff-only origin %CURRENT_BRANCH% ...
git pull --ff-only origin "%CURRENT_BRANCH%"
set "PULL_RC=%ERRORLEVEL%"
popd
echo.
if "%PULL_RC%"=="0" (
  echo Codigo atualizado sem criar merge automatico.
) else (
  echo Falha ao atualizar. Nenhuma alteracao forcada foi feita.
)
pause
goto MENU

:SMOKE
cls
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado.
  pause
  goto MENU
)
echo Executando smoke test...
pushd "%ROOT%"
call npm run test:smoke
set "SMOKE_RC=%ERRORLEVEL%"
popd
echo.
if "%SMOKE_RC%"=="0" (
  echo SMOKE TEST: OK
) else (
  echo SMOKE TEST: FALHOU - codigo %SMOKE_RC%
)
pause
goto MENU

:CREATE_USER
cls
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado.
  pause
  goto MENU
)
echo Gerando usuario de teste...
pushd "%ROOT%"
call npm run test:create-user
set "USER_RC=%ERRORLEVEL%"
popd
echo.
if not "%USER_RC%"=="0" echo Falha ao criar usuario de teste. Codigo: %USER_RC%
pause
goto MENU

:BOOTSTRAP
cls
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado.
  pause
  goto MENU
)
echo Sincronizando contas ADMIN e TESTE...
pushd "%ROOT%"
call npm run bootstrap:test-accounts
set "BOOT_RC=%ERRORLEVEL%"
popd
echo.
if "%BOOT_RC%"=="0" (
  echo Bootstrap concluido e login das contas validado.
) else (
  echo Bootstrap falhou. Codigo: %BOOT_RC%
)
pause
goto MENU

:RLS
cls
if not exist "%ENV_FILE%" (
  echo ERRO: .env.local nao encontrado.
  pause
  goto MENU
)
echo Executando teste negativo de RLS...
pushd "%ROOT%"
call npm run test:rls
set "RLS_RC=%ERRORLEVEL%"
popd
echo.
if "%RLS_RC%"=="0" (
  echo TESTE RLS: OK
) else (
  echo TESTE RLS: FALHOU - codigo %RLS_RC%
)
pause
goto MENU

:CHECK
cls
echo ================== VERIFICACAO LOCAL ==================
echo.
where node
if errorlevel 1 echo ERRO: Node.js nao encontrado no PATH.
where npm
if errorlevel 1 echo ERRO: npm nao encontrado no PATH.
git --version
if errorlevel 1 echo ERRO: Git nao encontrado no PATH.
echo.
if exist "%FRONT_DIR%package.json" (echo [OK] Frontend package.json) else echo [ERRO] Frontend package.json ausente
if exist "%BACK_DIR%\package.json" (echo [OK] Backend package.json) else echo [ERRO] Backend package.json ausente
if exist "%FRONT_DIR%node_modules\next" (echo [OK] Dependencias frontend instaladas) else echo [PENDENTE] Dependencias frontend
if exist "%BACK_DIR%\node_modules\express" (echo [OK] Dependencias backend instaladas) else echo [PENDENTE] Dependencias backend
if exist "%ENV_FILE%" (echo [OK] .env.local existe) else echo [PENDENTE] .env.local nao existe
if exist "%EXAMPLE_ENV%" (echo [OK] .env.example existe) else echo [ERRO] .env.example ausente
echo.
pushd "%ROOT%"
git branch --show-current
git status --short --branch
popd
echo.
echo Esta verificacao nao valida se as credenciais Supabase sao validas.
pause
goto MENU

:HEALTH
cls
echo Testando %BACK_URL%/health ...
where curl >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Invoke-WebRequest -UseBasicParsing '%BACK_URL%/health' -TimeoutSec 5).Content } catch { Write-Host 'Falha: backend indisponivel ou sem resposta.'; exit 1 }"
) else (
  curl --fail --silent --show-error --max-time 5 "%BACK_URL%/health"
)
if errorlevel 1 echo Falha no teste. Confirme se o backend esta em execucao.
echo.
pause
goto MENU

:BUILD
cls
echo Gerando build de producao do frontend...
pushd "%FRONT_DIR%"
call npm run build
set "BUILD_RC=%ERRORLEVEL%"
popd
if not "%BUILD_RC%"=="0" echo Build falhou. Leia as mensagens acima antes de publicar.
if "%BUILD_RC%"=="0" echo Build concluido.
pause
goto MENU

:OPEN
start "" "%FRONT_URL%"
goto MENU

:END
endlocal
exit /b 0
