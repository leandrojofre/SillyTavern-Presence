import {
    context,
    getCurrentParticipants,
    isActive,
} from '../../index.js';

export {
    initialize,
};

/** @typedef {Presence.ChatMessageExtended} ChatMessageExtended */

function initialize() {
    const { powerUserSettings } = context();
    const canInitialize = 'macros' in context() && powerUserSettings.experimental_macro_engine;

	if (!canInitialize) return;

    const { macros } = context();
    const { category } = macros;

    macros.register('groupPresent', {
        handler: function ({args: [messageId]}) {
            if (!isActive()) return '';

            const validMsgId = String(messageId ?? '').trim() !== '';
            const statuses = Presence.getStatusAvatarMap({onlyEnabled: false});
            const characters = context().characters;
            let participants = [];

            if (validMsgId) {
                /** @type {ChatMessageExtended} */
                const message = context().chat[messageId];
                participants = message?.present ?? [];
            } else {
                participants = getCurrentParticipants().present;
            }

            participants = participants.map((avatar) => {
                if (statuses.has(avatar)) return null;

                const member = characters.find(char => char.avatar === avatar);

                return member && member?.name ? member.name : null;
            });

            const participantsFiltered = participants.filter(name => name !== null);

            return participantsFiltered?.length ? participantsFiltered.join(', ') : '';
        },
        unnamedArgs: [{
            name: 'messageId',
            description: 'The ID of the message to check for presence. If not provided, it will return the characters present in the current group chat.',
            optional: true,
            type: 'string',
        }],
        category: category.NAMES,
        description: 'Returns the names of characters detected by Presence as present in the current group chat or selected message.',
        returns: 'list of character names'
    });
}