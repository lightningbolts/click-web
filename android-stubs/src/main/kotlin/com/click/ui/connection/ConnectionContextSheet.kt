package com.click.ui.connection

/**
 * Character limits aligned with Supabase CHECK constraints and the web dashboard.
 * The full Connection Context sheet lives in the KMP Android module; this artifact
 * keeps the contract testable in CI when that module is not present in-tree.
 */
object ConnectionContextSheetLimits {
    const val INTEREST_TEXT_MAX_LENGTH = 25
}
