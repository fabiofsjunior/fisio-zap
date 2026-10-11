package com.fisiozap.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {
    private val appUrl = "https://fisiozap.example/app/"

    @Test
    fun allowsExactHttpsOriginAcrossApplicationPathsQueriesAndFragments() {
        assertTrue(UrlPolicy.isAllowedInWebView("https://fisiozap.example/login", appUrl))
        assertTrue(UrlPolicy.isAllowedInWebView("https://FISIOZAP.EXAMPLE:443/panel?tab=chat#composer", appUrl))
        assertTrue(UrlPolicy.isAllowedInWebView("https://fisiozap.example/app/agenda?date=2026-10-10", appUrl))
    }

    @Test
    fun rejectsOtherOriginsDowngradesAndDifferentPorts() {
        listOf(
            "http://fisiozap.example/app/",
            "https://evil.example/app/",
            "https://fisiozap.example.evil.example/app/",
            "https://evilfisiozap.example/app/",
            "https://sub.fisiozap.example/app/",
            "https://fisiozap.example:444/app/",
            "https://fisiozap.example:8443/app/",
        ).forEach { assertFalse("must reject $it", UrlPolicy.isAllowedInWebView(it, appUrl)) }
        assertTrue(UrlPolicy.isAllowedInWebView("https://fisiozap.example:8443/app/", "https://fisiozap.example:8443/"))
    }

    @Test
    fun rejectsCredentialsMalformedUrlsAndAmbiguousAuthority() {
        listOf(
            "https://user@fisiozap.example/app/",
            "https://user:secret@fisiozap.example/app/",
            "https://fisiozap.example:/app/",
            "https://fisiozap.example:99999/app/",
            "https://fisiozap.example:0/app/",
            "https:///app/",
            "https://fisiozap.example\\@evil.example/app/",
            " https://fisiozap.example/app/",
            "https://fisiozap.example/app/ has-space",
        ).forEach { assertFalse("must reject $it", UrlPolicy.isAllowedInWebView(it, appUrl)) }
        assertFalse(UrlPolicy.isAllowedInWebView("https://fisiozap.example/app/", "not a URL"))
    }

    @Test
    fun rejectsUnicodeAndMisleadingInternationalizedHostnames() {
        listOf(
            "https://físiozap.example/app/",
            "https://xn--fsiozap-9za.example/app/",
            "https://fisiozap.example。evil.example/app/",
        ).forEach { assertFalse("must reject $it", UrlPolicy.isAllowedInWebView(it, appUrl)) }
    }

    @Test
    fun rejectsNonWebSchemesForInAppNavigation() {
        listOf(
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "content://com.example.provider/item/1",
            "intent://fisiozap.example/#Intent;scheme=https;end",
            "ftp://fisiozap.example/app/",
            "mailto:user@fisiozap.example",
        ).forEach { assertFalse("must reject $it", UrlPolicy.isAllowedInWebView(it, appUrl)) }
    }

    @Test
    fun externalBrowserOnlyReceivesWellFormedHttpOrHttpsUrlsWithoutCredentials() {
        assertEquals("https://other.example/path?q=ok#part", UrlPolicy.externalBrowserUrl("https://other.example/path?q=ok#part"))
        assertEquals("http://example.org:8080/help", UrlPolicy.externalBrowserUrl("http://example.org:8080/help"))
        listOf(
            "javascript:alert(1)",
            "data:text/plain,hello",
            "file:///tmp/private",
            "intent://example.org/#Intent;scheme=https;end",
            "content://example.org/file",
            "https://user:password@example.org/",
            "https://example.org:/",
            "https://example.org:99999/",
            "https://exämple.org/",
            "https://example.org\\@evil.org/",
            "https://example.org/path with spaces",
        ).forEach { assertNull("must not open $it externally", UrlPolicy.externalBrowserUrl(it)) }
    }
}
