package com.fisiozap.mobile

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/** Conservative URL checks for deciding which navigations stay inside the app WebView. */
object UrlPolicy {
    private data class Origin(val scheme: String, val host: String, val port: Int)

    /** Only a well-formed HTTPS URL on the app's exact origin may stay in the WebView. */
    fun isAllowedInWebView(rawUrl: String, appUrl: String): Boolean {
        val target = parseWebUrl(rawUrl) ?: return false
        val trusted = parseWebUrl(appUrl) ?: return false
        if (target.scheme != "https" || trusted.scheme != "https") return false
        return origin(target) == origin(trusted)
    }

    /** Returns a normalized HTTP(S) URL for an external browser, never a privileged scheme. */
    fun externalBrowserUrl(rawUrl: String): String? {
        val uri = parseWebUrl(rawUrl) ?: return null
        return uri.normalize().toASCIIString()
    }

    private fun parseWebUrl(rawUrl: String): URI? {
        if (rawUrl.isBlank() || rawUrl.any { it.isWhitespace() || it.isISOControl() } || '\\' in rawUrl) return null
        val uri = try {
            URI(rawUrl)
        } catch (_: URISyntaxException) {
            return null
        }
        if (!uri.isAbsolute || uri.isOpaque || uri.rawUserInfo != null) return null
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
        if (scheme != "http" && scheme != "https") return null
        val host = uri.host ?: return null
        if (host.isBlank() || host.any { it.code > 0x7f } || uri.rawAuthority.isNullOrBlank()) return null
        if (uri.port !in -1..65535 || uri.port == 0) return null

        // Require an unambiguous authority. This rejects empty ports, encoded hosts, and parser
        // differences around userinfo, Unicode hostnames, and malformed IPv6 authorities.
        val hostForAuthority = if (host.startsWith("[") && host.endsWith("]")) host else host
        val expectedAuthority = hostForAuthority + if (uri.port >= 0) ":${uri.port}" else ""
        if (!uri.rawAuthority.equals(expectedAuthority, ignoreCase = true)) return null
        return uri
    }

    private fun origin(uri: URI): Origin {
        val scheme = uri.scheme.lowercase(Locale.ROOT)
        val host = uri.host.lowercase(Locale.ROOT)
        val port = if (uri.port >= 0) uri.port else if (scheme == "https") 443 else 80
        return Origin(scheme, host, port)
    }
}
