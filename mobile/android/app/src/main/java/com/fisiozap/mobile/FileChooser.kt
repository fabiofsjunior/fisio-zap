package com.fisiozap.mobile

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity

/** SAF-backed, single-file chooser restricted to the chat's existing file allowlist. */
class FileChooser(
    private val activity: ComponentActivity,
    private val trustedOrigin: Uri,
    private val launchOpenDocument: (Intent) -> Unit,
) {
    private var pendingCallback: ValueCallback<Array<Uri>>? = null
    private var pickerInFlight = false
    private var generation = 0L
    private var pendingGeneration = 0L
    private var closed = false

    fun onShowFileChooser(
        view: WebView,
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        activity.runOnUiThread {
            if (closed || pickerInFlight || !isTrusted(view.url) || params.mode != WebChromeClient.FileChooserParams.MODE_OPEN) {
                callback.onReceiveValue(null)
                return@runOnUiThread
            }
            pendingCallback = callback
            pendingGeneration = generation
            pickerInFlight = true
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, CHAT_MIME_TYPES)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            try {
                launchOpenDocument(intent)
            } catch (_: Exception) {
                pendingCallback = null
                pickerInFlight = false
                callback.onReceiveValue(null)
            }
        }
        return true
    }

    /** Forward the URI from the ActivityResult launcher; null means the user canceled. */
    fun onPickerResult(uri: Uri?) {
        activity.runOnUiThread {
            // Keep the lock until the ActivityResult for this exact picker returns. Otherwise a
            // delayed result after logout/navigation could be delivered to a newer chooser request.
            if (!pickerInFlight) return@runOnUiThread
            pickerInFlight = false
            val callback = pendingCallback
            pendingCallback = null
            if (closed || callback == null || pendingGeneration != generation || uri == null || !isSupportedChatFile(uri)) {
                callback?.onReceiveValue(null)
            } else {
                callback.onReceiveValue(arrayOf(uri))
            }
        }
    }

    fun onNavigation(url: String) {
        activity.runOnUiThread {
            generation++
            cancelPending()
        }
    }

    fun close() {
        activity.runOnUiThread {
            closed = true
            generation++
            cancelPending()
        }
    }

    private fun cancelPending() {
        val callback = pendingCallback
        pendingCallback = null
        callback?.onReceiveValue(null)
    }

    private fun isTrusted(url: String?): Boolean =
        url != null && UrlPolicy.isAllowedInWebView(url, trustedOrigin.toString())

    private fun isSupportedChatFile(uri: Uri): Boolean {
        return try {
            if (uri.scheme?.equals("content", ignoreCase = true) != true) return false
            val mime = activity.contentResolver.getType(uri)?.lowercase()?.substringBefore(';') ?: return false
            val canonicalMime = MIME_ALIASES[mime] ?: mime
            if (canonicalMime !in CHAT_MIME_EXTENSIONS) return false
            val info = activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                ?.use { cursor ->
                    if (!cursor.moveToFirst()) return false
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    val name = if (nameIndex >= 0) cursor.getString(nameIndex) else null
                    val size = if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) cursor.getLong(sizeIndex) else -1L
                    name to size
                } ?: return false
            val name = info.first ?: return false
            val extension = name.substringAfterLast('.', "").lowercase()
            if (extension !in CHAT_MIME_EXTENSIONS.getValue(canonicalMime)) return false
            val size = info.second
            size in 1..MAX_CHAT_FILE_BYTES
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        const val MAX_CHAT_FILE_BYTES = 10L * 1024L * 1024L

        private val CHAT_MIME_TYPES = arrayOf(
            "application/pdf", "image/jpeg", "image/png", "image/webp", "audio/webm", "audio/ogg",
            "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a",
        )
        private val MIME_ALIASES = mapOf("audio/x-wav" to "audio/wav", "audio/mp3" to "audio/mpeg", "audio/x-m4a" to "audio/mp4")
        private val CHAT_MIME_EXTENSIONS = mapOf(
            "application/pdf" to setOf("pdf"),
            "image/jpeg" to setOf("jpg", "jpeg"),
            "image/png" to setOf("png"),
            "image/webp" to setOf("webp"),
            "audio/webm" to setOf("webm"),
            "audio/ogg" to setOf("ogg", "oga"),
            "audio/wav" to setOf("wav"),
            "audio/mpeg" to setOf("mp3"),
            "audio/mp4" to setOf("mp4", "m4a"),
        )
    }
}
