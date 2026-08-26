import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import YAML from "yaml"
import { z } from "zod"

import { atomic_write } from "../archive/atomic_write.js"
import { confined_path, user_root } from "../archive/paths.js"
import { HttpError } from "../http/errors.js"

const reflection_schema = z.object( {
    answer: z.string().min( 1 ),
    citations: z.array( z.string() ).default( [] ),
} )

function citation_for( source ) {
    return `[${ source.local_date }:${ source.item_id }]`
}

function normalize_citation( citation ) {
    const trimmed = citation.trim()

    return trimmed.startsWith( `[` ) && trimmed.endsWith( `]` )
        ? trimmed
        : `[${ trimmed }]`
}

function structured_format() {
    return {
        json_schema: {
            name: `diary_reflection`,
            schema: {
                additionalProperties: false,
                properties: {
                    answer: { type: `string` },
                    citations: { items: { type: `string` }, type: `array` },
                },
                required: [ `answer`, `citations` ],
                type: `object`,
            },
            strict: true,
        },
        type: `json_schema`,
    }
}

async function ask( runtime, system, prompt ) {
    const response = await runtime.providers.openrouter_request( runtime, {
        messages: [
            { content: system, role: `system` },
            { content: prompt, role: `user` },
        ],
        model: runtime.config.OPENROUTER_REFLECTION_MODEL,
        response_format: structured_format(),
    } )
    const { content } = response.choices[0].message
    const parsed = reflection_schema.parse(
        typeof content === `string` ? JSON.parse( content ) : content,
    )

    return { ...parsed, usage: response.usage ?? {} }
}

function format_sources( sources ) {
    return sources.map( source => `${ citation_for( source ) }\n${ source.content }` ).join( `\n\n` )
}

function chunk_sources( sources, maximum_characters = 40_000 ) {
    const chunks = []
    let current = []
    let size = 0

    for( const source of sources ) {
        const source_size = source.content.length + 80

        if( current.length && size + source_size > maximum_characters ) {
            chunks.push( current )
            current = []
            size = 0
        }

        current.push( source )
        size += source_size
    }

    if( current.length ) chunks.push( current )

    return chunks
}

async function answer_with_full_coverage( runtime, question, sources ) {
    const system = `You are a careful diary reflection partner. Use only the supplied diary sources. `
    + `Cite factual claims with exact citation IDs. Say when evidence is absent. Return valid JSON.`
    const chunks = chunk_sources( sources )

    if( chunks.length === 1 ) {
        return ask( runtime, system, `Question: ${ question }\n\nDiary sources:\n${ format_sources( sources ) }` )
    }

    let summaries = []

    for( const chunk of chunks ) {
        const result = await ask(
            runtime,
            system,
            `Summarize every relevant fact for this question while retaining exact citations.\n`
        + `Question: ${ question }\n\nDiary sources:\n${ format_sources( chunk ) }`,
        )

        summaries.push( `${ result.answer }\nRetained citations: ${ result.citations.join( ` ` ) }` )
    }

    while( summaries.join( `\n\n` ).length > 60_000 ) {
        const groups = []
        let current = []
        let size = 0

        for( const summary of summaries ) {
            if( current.length && size + summary.length > 40_000 ) {
                groups.push( current )
                current = []
                size = 0
            }

            current.push( summary )
            size += summary.length
        }

        if( current.length ) groups.push( current )

        const reduced = []

        for( const group of groups ) {
            const result = await ask(
                runtime,
                system,
                `Reduce these complete chunk summaries for the question while retaining their original citations.\n`
                    + `Question: ${ question }\n\n${ group.join( `\n\n` ) }`,
            )
            reduced.push( `${ result.answer }\nRetained citations: ${ result.citations.join( ` ` ) }` )
        }

        summaries = reduced
    }

    return ask(
        runtime,
        system,
        `Answer from these summaries, which collectively cover the complete selected range. `
            + `Use only original diary citation IDs.\nQuestion: ${ question }\n\n${ summaries.join( `\n\n` ) }`,
    )
}

/**
 * Reflect across every selected source and persist a grounded Markdown artifact.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function create_reflection( runtime, user, input ) {
    const sources = runtime.database.prepare( `
    SELECT item_id, local_date, content
    FROM search_documents
    WHERE user_id = ? AND local_date BETWEEN ? AND ? AND content <> ''
    ORDER BY local_date, id
  ` ).all( user.id, input.range_start, input.range_end )

    if( !sources.length ) {
        const error = new Error( `No diary material exists in that range` )
        error.status_code = 422
        error.code = `empty_reflection_range`
        throw error
    }

    const result = await answer_with_full_coverage( runtime, input.question, sources )
    const valid_citations = new Set( sources.map( citation_for ) )
    const returned_citations = result.citations.map( normalize_citation )
    const citations = [ ...new Set( returned_citations ) ].filter( value => valid_citations.has( value ) )

    if( returned_citations.some( value => !valid_citations.has( value ) ) ) {
        throw new HttpError( 502, `provider_invalid_citation`, `The provider returned an unknown citation.` )
    }

    const id = randomUUID()
    const created_at = new Date()
    const relative_path = path.join(
        `reflections`,
        String( created_at.getUTCFullYear() ),
        `${ created_at.toISOString().replaceAll( `:`, `-` ) }--${ id }.md`,
    )
    const root = user_root( runtime.config.diary_data_path, user.id, user.email )
    const target = confined_path( root, relative_path )
    const source_checksums = Object.fromEntries( sources.map( source => [
        citation_for( source ),
        createHash( `sha256` ).update( source.content ).digest( `hex` ),
    ] ) )
    const frontmatter = {
        citations,
        created_at: created_at.toISOString(),
        model: runtime.config.OPENROUTER_REFLECTION_MODEL,
        question: input.question,
        range_end: input.range_end,
        range_start: input.range_start,
        source_checksums,
    }
    const markdown = `---\n${ YAML.stringify( frontmatter ) }---\n\n${ result.answer }\n`

    await atomic_write( target, markdown )
    runtime.database.prepare( `
    INSERT INTO reflections (
      id, user_id, range_start, range_end, question, answer,
      citations_json, model, relative_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ` ).run(
        id,
        user.id,
        input.range_start,
        input.range_end,
        input.question,
        result.answer,
        JSON.stringify( citations ),
        runtime.config.OPENROUTER_REFLECTION_MODEL,
        relative_path,
        created_at.getTime(),
    )
    runtime.database.prepare( `
    INSERT INTO provider_usage (
      id, user_id, provider, model, operation,
      input_tokens, output_tokens, created_at
    ) VALUES (?, ?, 'openrouter', ?, 'reflection', ?, ?, ?)
  ` ).run(
        randomUUID(),
        user.id,
        runtime.config.OPENROUTER_REFLECTION_MODEL,
        result.usage.prompt_tokens ?? null,
        result.usage.completion_tokens ?? null,
        Date.now(),
    )

    return { citations, created_at: created_at.toISOString(), id, ...input, answer: result.answer }
}

/**
 * List saved reflections without reading provider state.
 *
 * @param {object} runtime
 * @param {string} user_id
 * @returns {object[]}
 */
export function list_reflections( runtime, user_id ) {
    return runtime.database.prepare( `
    SELECT id, range_start, range_end, question, answer,
      citations_json, model, created_at
    FROM reflections WHERE user_id = ? ORDER BY created_at DESC
  ` ).all( user_id ).map( row => ( {
        ...row,
        citations: JSON.parse( row.citations_json ),
        created_at: new Date( row.created_at ).toISOString(),
    } ) )
}
