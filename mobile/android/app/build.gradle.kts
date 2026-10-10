import org.gradle.api.GradleException
import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val webAppUrl = providers.gradleProperty("WEB_APP_URL").orNull?.trim().orEmpty()
fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "com.fisiozap.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fisiozap.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        resValue("string", "app_name", "FisioZap")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            resValue("string", "app_name", "FisioZap Debug")
            buildConfigField("String", "WEB_APP_URL", buildConfigString(webAppUrl))
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "WEB_APP_URL", buildConfigString(webAppUrl))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
}

val validateReleaseWebAppUrl = tasks.register("validateReleaseWebAppUrl") {
    group = "verification"
    description = "Requires a fixed HTTPS WEB_APP_URL for release builds."
    doLast {
        val uri = runCatching { URI(webAppUrl) }.getOrNull()
        val host = uri?.host
        val port = uri?.port ?: -1
        val authority = host?.lowercase()?.let { value -> value + if (port >= 0) ":$port" else "" }
        val valid = uri != null && uri.isAbsolute && !uri.isOpaque
            && uri.scheme.equals("https", ignoreCase = true)
            && !host.isNullOrBlank() && host.all { it.code in 0x21..0x7e }
            && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null
            && port in -1..65535 && port != 0
            && uri.rawAuthority.equals(authority, ignoreCase = true)
            && webAppUrl.none { it.isWhitespace() || it.isISOControl() || it == '\\' }
        if (!valid) {
            throw GradleException("Release builds require -PWEB_APP_URL=<fixed HTTPS base URL without credentials, query, or fragment>. No URL is embedded by default.")
        }
    }
}

tasks.configureEach {
    if (name.contains("Release", ignoreCase = true) && name != validateReleaseWebAppUrl.name) {
        dependsOn(validateReleaseWebAppUrl)
    }
}
