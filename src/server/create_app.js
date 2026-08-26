import fs from "node:fs"
import path from "node:path"

import cookie from "@fastify/cookie"
import fastify_static from "@fastify/static"
import Fastify from "fastify"
import { ZodError } from "zod"

import { register_routes } from "./http/routes.js"

/**
 * Build a side-effect-free Fastify instance around an explicit runtime.
 *
 * @param {object} runtime
 * @returns {Promise<object>}
 */
export async function create_app( runtime ) {
    const app = Fastify( {
        bodyLimit: 8 * 1024 * 1024,
        logger: false,
        trustProxy: false,
    } )

    await app.register( cookie )

    app.addContentTypeParser( `application/octet-stream`, ( request, payload, done ) => {
        done( null, payload )
    } )

    // Fastify snapshots inherited error handlers when routes are registered.
    app.setErrorHandler( ( error, request, reply ) => {
        const validation = error instanceof ZodError
        const status_code = validation ? 400 : error.statusCode ?? error.status_code ?? 500
        const code = validation ? `validation_failed` : error.code ?? `internal_error`

        if( status_code >= 500 ) {
            runtime.log.error( `Request failed`, {
                code,
                method: request.method,
                path: request.url.split( `?` )[0],
            } )
        }

        return reply.code( status_code ).send( {
            error: code,
            message: status_code >= 500 ? `The request could not be completed.` : error.message,
        } )
    } )

    await register_routes( app, runtime )

    const dist_root = path.resolve( `dist` )

    if( fs.existsSync( dist_root ) ) {
        await app.register( fastify_static, {
            decorateReply: true,
            root: dist_root,
            wildcard: false,
        } )
    }

    app.setNotFoundHandler( ( request, reply ) => {
        if(
            request.method === `GET`
      && !request.url.startsWith( `/api/` )
      && fs.existsSync( path.join( dist_root, `index.html` ) )
        ) {
            return reply.sendFile( `index.html` )
        }

        return reply.code( 404 ).send( { error: `not_found`, message: `Resource was not found.` } )
    } )

    return app
}
