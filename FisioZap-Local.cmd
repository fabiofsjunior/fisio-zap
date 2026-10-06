@echo off
setlocal EnableExtensions
chcp 65001 >nul
title FisioZap - Gerenciador local

set "ROOT=%~dp0"
set "FRONT_DIR=%ROOT%"
set "BACK_DIR=%ROOT%backend"
set "ENV_FILE=%ROOT%.env.local"
set "EXAMPLE_ENV=%ROOT%.env.example"
set "FRONT_URL=http://localhost:3001"
set "BACK_URL=http://localhost:3000"

:MENU
cls
echo ============================================================
echo                    FISIOZAP - MENU LOCAL
echo ============================================================
echo  Raiz: %ROOT%
echo.
echo  [1] Instalar dependencias (frontend + backend)
echo  [2] Configurar ambiente local (.env.local)
echo  [3] Iniciar FRONTEND
echo  [4] Iniciar BACKEND
echo  [5] Iniciar FRONTEND + BACKEND
echo  [6] Verificar ambiente e dependencias
echo  [7] Testar saude do backend (/health)
echo  [8] Gerar build de producao do frontend
echo  [9] Abrir frontend no navegador
echo  [0] Sair
echo.
set "OP="
set /p "OP=Escolha uma opcao: "

if "%OP%"=="1" goto INSTALL
if "%OP%"=="2" goto CONFIG
if "%OP%"=="3" goto FRONT
if "%OP%"=="4" goto BACK
if "%OP%"=="5" goto BOTH
if "%OP%"=="6" goto CHECK
if "%OP%"=="7" goto HEALTH
if "%OP%"=="8" goto BUILD
if "%OP%"=="9" goto OPEN
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
  echo Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
  echo Configure segredos apenas localmente. Nunca envie .env.local ao Git.
)
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
echo Iniciando frontend em %FRONT_URL%...
start "FisioZap - Frontend" /D "%FRONT_DIR%" cmd /k "npm run dev -- --port 3001"
echo O frontend sera iniciado em uma nova janela.
echo URL: %FRONT_URL%
pause
goto MENU

:BACK
cls
if not exist "%BACK_DIR%\node_modules\express" (
  echo Dependencias do backend ausentes. Use a opcao 1 primeiro.
  pause
  goto MENU
)
echo Iniciando backend em %BACK_URL%...
start "FisioZap - Backend" /D "%BACK_DIR%" cmd /k "set DOTENV_CONFIG_PATH=%ENV_FILE%&& npm run dev"
echo Backend iniciado em uma nova janela.
echo Health check: %BACK_URL%/health
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
  echo AVISO: .env.local nao encontrado. O backend pode iniciar, mas configure o Supabase na opcao 2.
  pause
)
start "FisioZap - Backend" /D "%BACK_DIR%" cmd /k "set DOTENV_CONFIG_PATH=%ENV_FILE%&& npm run dev"
start "FisioZap - Frontend" /D "%FRONT_DIR%" cmd /k "npm run dev -- --port 3001"
echo.
echo Frontend: %FRONT_URL%
echo Backend:  %BACK_URL%
echo Backend health: %BACK_URL%/health
echo Foram abertas duas janelas de terminal.
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
echo.
if exist "%FRONT_DIR%package.json" (echo [OK] Frontend package.json) else echo [ERRO] Frontend package.json ausente
if exist "%BACK_DIR%\package.json" (echo [OK] Backend package.json) else echo [ERRO] Backend package.json ausente
if exist "%FRONT_DIR%node_modules\next" (echo [OK] Dependencias frontend instaladas) else echo [PENDENTE] Dependencias frontend
if exist "%BACK_DIR%\node_modules\express" (echo [OK] Dependencias backend instaladas) else echo [PENDENTE] Dependencias backend
if exist "%ENV_FILE%" (echo [OK] .env.local existe) else echo [PENDENTE] .env.local nao existe
if exist "%EXAMPLE_ENV%" (echo [OK] .env.example existe) else echo [ERRO] .env.example ausente
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
