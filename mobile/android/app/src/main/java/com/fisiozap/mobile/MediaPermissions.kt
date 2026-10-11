package com.fisiozap.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat

/** Mediates WebView microphone requests with an exact HTTPS origin and Android's runtime permission. */
class MediaPermissions(
    private val activity: ComponentActivity,
    private val webView: WebView,
    private val trustedOrigin: Uri,
    private val requestRecordAudio: (onResult: (Boolean) -> Unit) -> Unit,
) {
    private val pending = linkedSetOf<PermissionRequest>()
    private var permissionPromptActive = false
    private var navigationGeneration = 0L
    private var closed = false

    fun onPermissionRequest(request: PermissionRequest) {
        activity.runOnUiThread {
            if (closed || !isAudioOnly(request) || !isTrusted(request.origin) || !isTrustedUrl(webView.url)) {
                request.deny()
                return@runOnUiThread
            }

            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                return@runOnUiThread
            }

            pending += request
            startPermissionPromptIfNeeded()
        }
    }

    fun onPermissionRequestCanceled(request: PermissionRequest) {
        activity.runOnUiThread { pending.remove(request) }
    }

    /** Cancel outstanding WebView requests whenever the host begins a navigation. */
    fun onNavigation(url: String) {
        activity.runOnUiThread {
            navigationGeneration++
            val requests = pending.toList()
            pending.clear()
            requests.forEach { it.deny() }
        }
    }

    fun close() {
        activity.runOnUiThread {
            closed = true
            navigationGeneration++
            permissionPromptActive = false
            val requests = pending.toList()
            pending.clear()
            requests.forEach { it.deny() }
        }
    }

    private fun isAudioOnly(request: PermissionRequest): Boolean =
        request.resources.contentEquals(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))

    private fun isTrustedUrl(rawUrl: String?): Boolean =
        rawUrl != null && UrlPolicy.isAllowedInWebView(rawUrl, trustedOrigin.toString())

    private fun isTrusted(requestOrigin: Uri): Boolean =
        UrlPolicy.isAllowedInWebView(requestOrigin.toString(), trustedOrigin.toString()) &&
            requestOrigin.scheme.equals("https", ignoreCase = true)

    private fun startPermissionPromptIfNeeded() {
        if (closed || permissionPromptActive || pending.isEmpty()) return
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            val requests = pending.toList()
            pending.clear()
            requests.forEach { request ->
                if (isTrusted(request.origin) && isTrustedUrl(webView.url)) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    request.deny()
                }
            }
            return
        }
        permissionPromptActive = true
        val promptGeneration = navigationGeneration
        try {
            requestRecordAudio { granted ->
                activity.runOnUiThread {
                    if (closed) {
                        permissionPromptActive = false
                        return@runOnUiThread
                    }
                    if (promptGeneration != navigationGeneration) {
                        permissionPromptActive = false
                        val staleRequests = pending.toList()
                        pending.clear()
                        staleRequests.forEach { it.deny() }
                        return@runOnUiThread
                    }
                    permissionPromptActive = false
                    val runtimeGranted = granted && ContextCompat.checkSelfPermission(
                        activity,
                        Manifest.permission.RECORD_AUDIO,
                    ) == PackageManager.PERMISSION_GRANTED
                    val requests = pending.toList()
                    pending.clear()
                    requests.forEach { request ->
                        if (runtimeGranted && isTrusted(request.origin) && isTrustedUrl(webView.url)) {
                            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        } else {
                            request.deny()
                        }
                    }
                }
            }
        } catch (_: Exception) {
            permissionPromptActive = false
            pending.toList().forEach { it.deny() }
            pending.clear()
        }
    }
}
