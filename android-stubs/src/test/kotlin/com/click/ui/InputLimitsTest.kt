package com.click.ui

import com.click.ui.chat.ChatComposerLimits
import com.click.ui.connection.ConnectionContextSheetLimits
import kotlin.test.Test
import kotlin.test.assertEquals

class InputLimitsTest {
    @Test
    fun interestFieldMaxLengthMatchesDatabaseContract() {
        assertEquals(25, ConnectionContextSheetLimits.INTEREST_TEXT_MAX_LENGTH)
    }

    @Test
    fun chatInputMaxLengthMatchesDatabaseContract() {
        assertEquals(1000, ChatComposerLimits.MESSAGE_INPUT_MAX_LENGTH)
    }
}
