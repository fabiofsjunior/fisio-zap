package com.fisiozap.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.net.URI
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private lateinit var webView: WebView
    private lateinit var trustedOrigin: Uri
    private lateinit var mediaPermissions: MediaPermissions
    private lateinit var fileChooser: FileChooser
    private lateinit var attachmentDownloads: AttachmentDownloads
    private var offlineView: View? = null
    private var currentUrl: String? = null
    private var attachmentBridgeReady = false

    private val microphonePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingMicrophoneResult?.invoke(granted)
        pendingMicrophoneResult = null
    }
    private var pendingMicrophoneResult: ((Boolean) -> Unit)? = null

    private val openDocument = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (::fileChooser.isInitialized) {
            fileChooser.onPickerResult(if (result.resultCode == RESULT_OK) result.data?.data else null)
        }
    }
    private val createDocument = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (::attachmentDownloads.isInitialized) {
            attachmentDownloads.onCreateDocumentResult(if (result.resultCode == RESULT_OK) result.data?.data else null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val systemInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(0, systemInsets.top, 0, maxOf(systemInsets.bottom, imeInsets.bottom))
            insets
        }
        ViewCompat.requestApplyInsets(root)
        configureBackButton()

        val configuredUrl = validBaseUrl(BuildConfig.WEB_APP_URL)
        if (BuildConfig.DEBUG && configuredUrl == null) {
            showSetupScreen()
        } else if (configuredUrl != null) {
            openWebApp(configuredUrl)
        } else {
            showGenericError("O aplicativo não está configurado.")
        }
    }

    private fun openWebApp(url: String) {
        val validated = validBaseUrl(url)
        if (validated == null) {
            showGenericError("Endereço HTTPS inválido.")
            return
        }
        currentUrl = validated
        trustedOrigin = originUri(validated)
        webView = WebView(this)
        configureWebView(webView)
        mediaPermissions = MediaPermissions(this, webView, trustedOrigin) { callback ->
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                callback(true)
            } else {
                pendingMicrophoneResult = callback
                microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
        fileChooser = FileChooser(this, trustedOrigin) { intent -> openDocument.launch(intent) }
        attachmentDownloads = AttachmentDownloads(this, webView, trustedOrigin) { intent -> createDocument.launch(intent) }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                mediaPermissions.onPermissionRequest(request)
            }

            override fun onPermissionRequestCanceled(request: android.webkit.PermissionRequest) {
                mediaPermissions.onPermissionRequestCanceled(request)
            }

            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: android.webkit.ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean = fileChooser.onShowFileChooser(view, filePathCallback, fileChooserParams)
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (!request.isForMainFrame) {
                    return !UrlPolicy.isAllowedInWebView(url, trustedOrigin.toString())
                }
                return handleNavigation(url, request.hasGesture())
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleNavigation(url, false)

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                if (!UrlPolicy.isAllowedInWebView(url, trustedOrigin.toString())) {
                    notifyNavigation(url)
                    view.stopLoading()
                    showOfflineView()
                    return
                }
                notifyNavigation(url)
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.isForMainFrame && !UrlPolicy.isAllowedInWebView(request.url.toString(), trustedOrigin.toString())) {
                    notifyNavigation(request.url.toString())
                    runOnUiThread { showOfflineView() }
                    return WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        403,
                        "Blocked",
                        mapOf("Cache-Control" to "no-store"),
                        ByteArrayInputStream(ByteArray(0)),
                    )
                }
                return null
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (UrlPolicy.isAllowedInWebView(url, trustedOrigin.toString())) {
                    hideOfflineView()
                    if (attachmentBridgeReady) {
                        attachmentDownloads.installClickInterceptorAfterPageFinished()
                    }
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                handler.cancel()
                showOfflineView()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOfflineView()
            }
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }
        root.removeAllViews()
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        attachmentBridgeReady = attachmentDownloads.installClickInterceptor()
        webView.loadUrl(validated)
    }

    private fun configureWebView(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }
        view.isSaveEnabled = true
        view.setBackgroundColor(Color.WHITE)
    }

    private fun handleNavigation(rawUrl: String, hasUserGesture: Boolean): Boolean {
        if (::trustedOrigin.isInitialized && UrlPolicy.isAllowedInWebView(rawUrl, trustedOrigin.toString())) return false
        val externalUrl = UrlPolicy.externalBrowserUrl(rawUrl) ?: return true
        if (!hasUserGesture) return true
        notifyNavigation(rawUrl)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(externalUrl)))
        } catch (_: Exception) {
            // No browser is installed; keep the navigation blocked without exposing URL content.
        }
        return true
    }

    private fun notifyNavigation(url: String) {
        if (::mediaPermissions.isInitialized) mediaPermissions.onNavigation(url)
        if (::fileChooser.isInitialized) fileChooser.onNavigation(url)
        if (::attachmentDownloads.isInitialized) attachmentDownloads.onNavigation(url)
    }

    private fun showSetupScreen() {
        root.removeAllViews()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(40), dp(24), dp(24))
        }
        content.addView(TextView(this).apply {
            text = "FisioZap"
            textSize = 28f
            setTextColor(Color.rgb(22, 73, 61))
        })
        content.addView(TextView(this).apply {
            text = "Informe o endereço HTTPS autorizado para homologação."
            textSize = 16f
            setPadding(0, dp(10), 0, dp(16))
        })
        val input = EditText(this).apply {
            hint = "https://servidor-autorizado"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setTextColor(Color.DKGRAY)
            setHintTextColor(Color.GRAY)
        }
        content.addView(input)
        val error = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.rgb(160, 40, 40))
            visibility = View.GONE
            setPadding(0, dp(8), 0, dp(8))
        }
        content.addView(error)
        content.addView(Button(this).apply {
            text = "Abrir"
            setOnClickListener {
                val url = validBaseUrl(input.text.toString())
                if (url == null) {
                    error.text = "Use um endereço base HTTPS válido, sem credenciais, consulta ou fragmento."
                    error.visibility = View.VISIBLE
                } else {
                    openWebApp(url)
                }
            }
        })
        root.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun showOfflineView() {
        if (offlineView != null || !::root.isInitialized) return
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setBackgroundColor(Color.WHITE)
        }
        panel.addView(TextView(this).apply {
            text = "Não foi possível conectar. Verifique sua conexão e tente novamente."
            textSize = 16f
            gravity = android.view.Gravity.CENTER
            setTextColor(Color.DKGRAY)
        })
        panel.addView(Button(this).apply {
            text = "Tentar novamente"
            setOnClickListener { currentUrl?.let(webView::loadUrl) }
        })
        offlineView = panel
        root.addView(panel, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun hideOfflineView() {
        offlineView?.let(root::removeView)
        offlineView = null
    }

    private fun showGenericError(message: String) {
        root.removeAllViews()
        root.addView(TextView(this).apply {
            text = message
            textSize = 16f
            gravity = android.view.Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun configureBackButton() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    override fun onDestroy() {
        if (::mediaPermissions.isInitialized) mediaPermissions.close()
        if (::fileChooser.isInitialized) fileChooser.close()
        if (::attachmentDownloads.isInitialized) attachmentDownloads.close()
        if (::webView.isInitialized) {
            root.removeView(webView)
            webView.stopLoading()
            webView.webChromeClient = null
            webView.webViewClient = WebViewClient()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun validBaseUrl(raw: String?): String? {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (value.any { it.isWhitespace() || it.isISOControl() || it == '\\' }) return null
        val uri = runCatching { URI(value) }.getOrNull() ?: return null
        if (uri.rawQuery != null || uri.rawFragment != null || uri.rawUserInfo != null) return null
        if (!UrlPolicy.isAllowedInWebView(value, value)) return null
        return uri.normalize().toASCIIString()
    }

    private fun originUri(url: String): Uri {
        val uri = URI(url)
        val port = if (uri.port >= 0 && uri.port != 443) ":${uri.port}" else ""
        return Uri.parse("https://${uri.host.lowercase()}$port")
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
