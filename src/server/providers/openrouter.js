import { HttpError } from "../http/errors.js"

/**
 * Send one privacy-constrained request without logging diary content.
 *
 * @param {object} runtime
 * @param {object} body
 * @param {number} timeout_ms
 * @returns {Promise<object>}
 */
export async function openrouter_request( runtime, body, timeout_ms = 120_000 ) {
    if( !runtime.config.OPENROUTER_API_KEY ) {
        throw new HttpError( 503, `provider_unavailable`, `OpenRouter is not configured.` )
    }

    const provider = runtime.config.OPENROUTER_ZDR
        ? { data_collection: `deny`, zdr: true }
        : undefined
    let response

    try {
        response = await fetch( `https://openrouter.ai/api/v1/chat/completions`, {
            body: JSON.stringify( { ...body, provider } ),
            headers: {
                Authorization: `Bearer ${ runtime.config.OPENROUTER_API_KEY }`,
                [`Content-Type`]: `application/json`,
            },
            method: `POST`,
            signal: AbortSignal.timeout( timeout_ms ),
        } )
    } catch {
        throw new HttpError( 502, `provider_failed`, `The provider could not be reached.` )
    }

    if( !response.ok ) {
        throw new HttpError( 502, `provider_failed`, `The provider rejected the request.` )
    }

    const result = await response.json()

    if( !result.choices?.[0]?.message ) {
        throw new HttpError( 502, `provider_invalid_response`, `The provider returned an invalid response.` )
    }

    return result
}

/**
 * Generate speech through OpenRouter's dedicated OpenAI-compatible TTS API.
 *
 * @param {object} runtime
 * @param {string} input
 * @param {number} timeout_ms
 * @returns {Promise<Buffer>}
 */
export async function openrouter_speech( runtime, input, timeout_ms = 180_000 ) {
    if( !runtime.config.OPENROUTER_API_KEY ) {
        throw new HttpError( 503, `provider_unavailable`, `OpenRouter is not configured.` )
    }

    const provider = runtime.config.OPENROUTER_ZDR
        ? { data_collection: `deny`, zdr: true }
        : undefined
    let response

    try {
        response = await fetch( `https://openrouter.ai/api/v1/audio/speech`, {
            body: JSON.stringify( {
                input,
                model: runtime.config.OPENROUTER_TTS_MODEL,
                provider,
                response_format: runtime.config.OPENROUTER_TTS_FORMAT,
                voice: runtime.config.OPENROUTER_TTS_VOICE,
            } ),
            headers: {
                Authorization: `Bearer ${ runtime.config.OPENROUTER_API_KEY }`,
                [`Content-Type`]: `application/json`,
            },
            method: `POST`,
            signal: AbortSignal.timeout( timeout_ms ),
        } )
    } catch {
        throw new HttpError( 502, `provider_failed`, `The speech provider could not be reached.` )
    }

    if( !response.ok ) {
        throw new HttpError( 502, `provider_failed`, `The speech provider rejected the request.` )
    }

    const audio = Buffer.from( await response.arrayBuffer() )

    if( !audio.length ) {
        throw new HttpError( 502, `provider_invalid_response`, `The speech provider returned no audio.` )
    }

    return audio
}
