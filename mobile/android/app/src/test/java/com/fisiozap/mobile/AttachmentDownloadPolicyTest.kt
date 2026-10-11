package com.fisiozap.mobile

import java.io.ByteArrayOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AttachmentDownloadPolicyTest {
    @Test
    fun safeFileNameRemovesPathsAndUnsafeCharactersAndForcesAllowedExtension() {
        assertEquals("visit notes.pdf", AttachmentDownloadPolicy.safeFileName("../../visit notes.pdf", "pdf"))
        assertEquals("patient audio.mp3", AttachmentDownloadPolicy.safeFileName("C:\\private\\patient audio.exe", "mp3"))
        assertEquals("report.pdf", AttachmentDownloadPolicy.safeFileName("report", "pdf"))
        assertNull(AttachmentDownloadPolicy.safeFileName("   ", "pdf"))
        assertNull(AttachmentDownloadPolicy.safeFileName("report.pdf", "html"))
        assertNull(AttachmentDownloadPolicy.safeFileName("..", "pdf"))
    }

    @Test
    fun safeFileNameBoundsLengthAndDoesNotAllowExtensionConfusion() {
        val result = AttachmentDownloadPolicy.safeFileName("a".repeat(300) + ".exe", "pdf")
        assertEquals(84, result?.length)
        assertTrue(result!!.endsWith(".pdf"))
        assertFalse(result.contains("/"))
        assertFalse(result.contains("\\"))
    }

    @Test
    fun boundedWriterPreservesEveryByteIncludingChunkBoundaries() {
        val source = ByteArray(AttachmentDownloadPolicy.MAX_ATTACHMENT_BYTES) { index -> (index % 251).toByte() }
        val output = ByteArrayOutputStream()
        AttachmentDownloadPolicy.writeBytesBounded(output, source)
        assertArrayEquals(source, output.toByteArray())
    }

    @Test
    fun boundedWriterRejectsEmptyOrOversizedPayloadBeforeWriting() {
        val emptyOutput = ByteArrayOutputStream()
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDownloadPolicy.writeBytesBounded(emptyOutput, byteArrayOf())
        }
        assertEquals(0, emptyOutput.size())

        val oversizedOutput = ByteArrayOutputStream()
        val tooLarge = ByteArray(AttachmentDownloadPolicy.MAX_ATTACHMENT_BYTES + 1)
        assertThrows(IllegalArgumentException::class.java) {
            AttachmentDownloadPolicy.writeBytesBounded(oversizedOutput, tooLarge)
        }
        assertEquals(0, oversizedOutput.size())
    }
}
