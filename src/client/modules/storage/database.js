import Dexie from "dexie"

export const diary_database = new Dexie( `shad_local` )

diary_database.version( 1 ).stores( {
    chunks: `[recording_id+sequence], recording_id, account_id`,
    operations: `id, account_id, [account_id+status], created_at`,
    recordings: `id, account_id, [account_id+status], created_at`,
    settings: `key`,
    upload_receipts: `[recording_id+sequence], recording_id`,
} )

/**
 * Ask the browser to preserve local recordings against routine eviction.
 *
 * @returns {Promise<object>}
 */
export async function request_durable_storage() {
    const persisted = await navigator.storage?.persist?.()
    const estimate = await navigator.storage?.estimate?.()

    return {
        persisted: Boolean( persisted ),
        quota: estimate?.quota ?? null,
        usage: estimate?.usage ?? null,
    }
}
