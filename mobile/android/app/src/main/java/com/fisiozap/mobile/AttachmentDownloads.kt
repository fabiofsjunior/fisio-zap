package com.fisiozap.mobile

import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.OutputStream
import java.util.Locale

/** Handles chat blob downloads through a narrowly origin-scoped WebMessageListener and SAF. */
class AttachmentDownloads(
    private val activity: ComponentActivity,
    private val webView: WebView,
    private val trustedOrigin: Uri,
    private val launchCreateDocument: (Intent) -> Unit,
) {
    private var bridgeInstalled = false
    private var closed = false
    private var pendingBytes: ByteArray? = null
    private var savePickerInFlight = false

    /** Install after WebView setup. Unsupported Android System WebView versions fail closed. */
    fun installClickInterceptor(): Boolean {
        if (closed) return false
        if (bridgeInstalled) return true
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        return try {
            WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME, setOf(originRule())) { _, message, sourceOrigin, isMainFrame, _ ->
                activity.runOnUiThread {
                    if (!closed && isMainFrame && isTrusted(sourceOrigin) && isTrustedUrl(webView.url)) {
                        receivePayload(message.data)
                    }
                }
            }
            bridgeInstalled = true
            true
        } catch (_: Exception) {
            try {
                WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME)
            } catch (_: Exception) {
                // Unsupported features remain unavailable; the app never falls back to a broad JS bridge.
            }
            bridgeInstalled = false
            false
        }
    }

    /** Injects a capture-phase handler for the app's existing user-clicked blob download links. */
    fun installClickInterceptorAfterPageFinished() {
        if (closed || !bridgeInstalled || !isTrustedUrl(webView.url)) return
        webView.evaluateJavascript(CLICK_HANDLER, null)
    }

    /** Forward the ACTION_CREATE_DOCUMENT result; null means the user canceled. */
    fun onCreateDocumentResult(uri: Uri?) {
        activity.runOnUiThread {
            if (!savePickerInFlight) return@runOnUiThread
            savePickerInFlight = false
            val bytes = pendingBytes
            pendingBytes = null
            if (closed || uri == null || uri.scheme?.equals("content", ignoreCase = true) != true || bytes == null) {
                bytes?.fill(0)
                return@runOnUiThread
            }
            try {
                activity.contentResolver.openOutputStream(uri, "w")?.use { output ->
                    AttachmentDownloadPolicy.writeBytesBounded(output, bytes)
                } ?: return@runOnUiThread
            } catch (_: Exception) {
                // The system document provider owns the destination; never open or execute it here.
            } finally {
                bytes.fill(0)
            }
        }
    }

    fun onNavigation(url: String) {
        activity.runOnUiThread {
            // Cancel payloads for any attempted navigation, including a link handed to the
            // external browser. The trusted-origin listener remains installed on this WebView;
            // WebViewClient prevents the off-origin document from being loaded here.
            clearPending()
        }
    }

    fun close() {
        activity.runOnUiThread {
            closed = true
            clearPending()
            if (bridgeInstalled) {
                try {
                    WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME)
                } catch (_: Exception) {
                    // Ignore WebView teardown races.
                }
                bridgeInstalled = false
            }
        }
    }

    private fun receivePayload(raw: String?) {
        if (raw.isNullOrEmpty() || raw.length > MAX_ENCODED_PAYLOAD_CHARS || pendingBytes != null || savePickerInFlight) return
        val attachment = AttachmentDownloadPolicy.decodePayload(raw) ?: return
        pendingBytes = attachment.bytes
        savePickerInFlight = true
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = attachment.mime
            putExtra(Intent.EXTRA_TITLE, attachment.name)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        try {
            launchCreateDocument(intent)
        } catch (_: Exception) {
            savePickerInFlight = false
            clearPending()
        }
    }

    private fun clearPending() {
        pendingBytes?.fill(0)
        pendingBytes = null
    }

    private fun isTrustedUrl(url: String?): Boolean =
        url != null && UrlPolicy.isAllowedInWebView(url, trustedOrigin.toString())

    private fun isTrusted(origin: Uri): Boolean =
        UrlPolicy.isAllowedInWebView(origin.toString(), trustedOrigin.toString()) &&
            origin.scheme.equals("https", ignoreCase = true)

    private fun originRule(): String {
        val host = trustedOrigin.host?.lowercase(Locale.ROOT) ?: return "https://invalid.invalid"
        val port = trustedOrigin.port
        val authorityHost = if (host.contains(':') && !host.startsWith('[')) "[$host]" else host
        return "https://$authorityHost" + if (port >= 0 && port != 443) ":$port" else ""
    }

    companion object {
        private const val BRIDGE_NAME = "FisioZapAttachmentDownload"
        private const val MAX_ENCODED_PAYLOAD_CHARS = 15 * 1024 * 1024

        private const val CLICK_HANDLER = """
            (function(){
              if (window.__fisioZapDownloadHandlerInstalled) return;
              window.__fisioZapDownloadHandlerInstalled = true;
              document.addEventListener('click', function(event) {
                if (!event.isTrusted || !window.FisioZapAttachmentDownload) return;
                var anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
                if (!anchor || !anchor.href || !anchor.href.startsWith('blob:')) return;
                event.preventDefault();
                event.stopPropagation();
                fetch(anchor.href).then(function(response) { return response.blob(); }).then(function(blob) {
                  if (!blob.size || blob.size > 10485760) return;
                  var mime = (blob.type || '').split(';', 1)[0].trim().toLowerCase();
                  var allowed = ['application/pdf','image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a'];
                  if (allowed.indexOf(mime) < 0) return;
                  var reader = new FileReader();
                  reader.onload = function() {
                    var result = String(reader.result || '');
                    var comma = result.indexOf(',');
                    if (comma < 0) return;
                    var base64 = result.slice(comma + 1);
                    if (base64.length > 13981016) return;
                    window.FisioZapAttachmentDownload.postMessage(JSON.stringify({name: anchor.download || 'anexo', mime: mime, base64: base64}));
                  };
                  reader.readAsDataURL(blob);
                }).catch(function(){});
              }, true);
            })();
        """
    }
}

data class SafeChatDownload(val name: String, val mime: String, val bytes: ByteArray)

/** Pure validation used by the bridge before any destination picker is opened. */
object AttachmentDownloadPolicy {
    const val MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
    private val extensionByMime = mapOf(
        "application/pdf" to "pdf",
        "image/jpeg" to "jpg",
        "image/png" to "png",
        "image/webp" to "webp",
        "audio/webm" to "webm",
        "audio/ogg" to "ogg",
        "audio/wav" to "wav",
        "audio/mpeg" to "mp3",
        "audio/mp4" to "mp4",
    )
    private val mimeAliases = mapOf(
        "audio/x-wav" to "audio/wav",
        "audio/mp3" to "audio/mpeg",
        "audio/x-m4a" to "audio/mp4",
    )

    fun decodePayload(raw: String): SafeChatDownload? {
        if (raw.length > 15 * 1024 * 1024) return null
        return try {
            val json = JSONObject(raw)
            val mimeInput = json.optString("mime").lowercase(Locale.ROOT).substringBefore(';')
            val mime = mimeAliases[mimeInput] ?: mimeInput
            if (mime !in extensionByMime) return null
            val base64 = json.optString("base64")
            if (base64.isEmpty() || base64.length > ((10 * 1024 * 1024 + 2) / 3) * 4) return null
            if (!base64.matches(Regex("[A-Za-z0-9+/]*={0,2}"))) return null
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.isEmpty() || bytes.size > 10 * 1024 * 1024) {
                bytes.fill(0)
                return null
            }
            val name = safeFileName(json.optString("name"), extensionByMime.getValue(mime)) ?: run {
                bytes.fill(0)
                return null
            }
            SafeChatDownload(name, mime, bytes)
        } catch (_: Exception) {
            null
        }
    }

    fun safeFileName(rawName: String, extension: String): String? {
        if (rawName.isBlank() || extension !in extensionByMime.values) return null
        val leaf = rawName.substringAfterLast('/').substringAfterLast('\\').trim()
        val base = leaf.substringBeforeLast('.', leaf)
            .map { char -> if (char.isLetterOrDigit() || char == '-' || char == '_' || char == ' ') char else '_' }
            .joinToString("")
            .trim(' ', '.', '_')
            .take(80)
            .ifBlank { return null }
        return "$base.$extension"
    }

    /** Writes only an already validated, nonempty payload while retaining the exact supplied bytes. */
    fun writeBytesBounded(output: OutputStream, bytes: ByteArray) {
        require(bytes.isNotEmpty() && bytes.size <= MAX_ATTACHMENT_BYTES)
        var offset = 0
        while (offset < bytes.size) {
            val count = minOf(8 * 1024, bytes.size - offset)
            output.write(bytes, offset, count)
            offset += count
        }
        output.flush()
    }
}
