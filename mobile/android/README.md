# Android wrapper

This module packages the existing FisioZap web application in a small Kotlin `WebView` host. Chat and business behavior stay in the existing web app and backend; the Android project does not duplicate those screens or store clinical records.

## Build versions

- JDK 17
- Gradle 8.11.1
- Android Gradle Plugin 8.9.3
- Kotlin 2.2.21
- Android SDK compile/target 35, minimum 26
- AndroidX Activity 1.9.3 and WebKit 1.12.1

The GitHub Actions workflow installs these build tools, runs `testDebugUnitTest` and `assembleDebug`, then publishes the APK as the `FisioZap-debug` artifact. Local builds require Android SDK Platform 35 and Build Tools 35.0.0. No wrapper JAR or release signing key is included.

## Configure and run a debug build

Debug builds without `WEB_APP_URL` open `https://oxygen-nag-jolly.ngrok-free.dev/login` directly. The debug menu keeps an option to change the address for recovery or another test host; the entered address is used for that run only. You may also set `WEB_APP_URL` to an authorized, reachable HTTPS test host at build time. Do not use a Vercel Preview URL, a production secret, or an unapproved tenant. The URL is not written to logs or persisted by the app.

```sh
cd mobile/android
gradle --no-daemon testDebugUnitTest assembleDebug
```

To override the default test host in that local debug build, add `-PWEB_APP_URL=https://<authorized-test-host>` to the Gradle command. The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

For release variants, Gradle requires a fixed HTTPS base URL at build time:

```sh
gradle --no-daemon assembleRelease -PWEB_APP_URL=https://<approved-host>
```

The configured URL must not contain credentials, a query, or a fragment. Release builds still require an explicit `WEB_APP_URL`, hide the debug recovery menu, and do not inherit the ngrok debug default. TLS certificate errors are always blocked, and cleartext HTTP is disabled in all variants. Do not store production URLs or credentials in Gradle files, `gradle.properties`, or this repository.

The launcher icon is a native adaptive/vector icon: a white “F” on a black background. The debug APK version is 0.1.1 (version code 2).

## App behavior

The wrapper keeps navigation on the configured HTTPS origin. Valid HTTP(S) links to other origins open in the external browser; other schemes are blocked. Microphone capture requires both the website's request and Android's runtime permission. Attachments use the Android document picker and are limited to the chat's supported file types and 10 MiB. The app uses the existing website login/session flow and never injects tokens or credentials. WebView debugging is enabled only in debug builds.

The URL policy has JVM unit tests. A successful CI APK build does not replace device testing for login, microphone prompts, file selection, downloads, back navigation, network loss, and session logout.
