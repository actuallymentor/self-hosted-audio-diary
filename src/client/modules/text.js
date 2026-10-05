/**
 * Close a free-form message as a sentence, so it reads well before follow-up copy.
 *
 * @param {string} message
 * @returns {string}
 */
export const as_sentence = message => /[.!?…]$/.test( message.trim() ) ? message.trim() : `${ message.trim() }.`
