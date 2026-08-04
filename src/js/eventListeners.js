import {
    log,
    toggleVisibilityAllMessages,
    isActive,
    eventTypes,
    eventSource,
    updatePresenceTrackingButton,
    getCurrentParticipants,
    extensionSettings,
    getUniqueArray,
    getMessageIdChunks,
    addPresenceTrackerToMessages,
    saveChatDebounced,
    hideChatMessageRange,
    context,
} from "../../index.js";

import { is_group_generating } from '/scripts/group-chats.js';

export {
    initialize,
};

async function onChatChanged({forceUpdate = false} = {}) {
	if (!isActive()) return;

    // Just to initialize metadata on chat change
    Presence.metadata('char_mode');

	await addPresenceTrackerToMessages(forceUpdate);

    updateMemberListButton();
}

let lastGenType;

function onNewMessage(mesId) {
    if (!isActive()) return;

    const { characterId: charId, characters, chat } = context();
    const mes = chat[mesId];
    const participants = getCurrentParticipants();

    const thumbnail = new URL(mes.force_avatar, window.location.origin);
    const thumbnailFile = thumbnail?.searchParams?.get('file');
    const character = Number(charId ?? -1) >= 0  ? characters[charId] : {};
    const avatars = [
        thumbnailFile || '',
        mes.original_avatar || '',
    ].filter(a => a.length);

    mes.present = mes.present || [];

    if (mes.is_user)
        return mes.present = participants.present;

    const isCharMessage = avatars.includes(character?.avatar);
    const isCharAbsentee = isCharMessage && !participants.present.includes(character?.avatar);

    if (isCharAbsentee) mes.present.push(character?.avatar);
    else mes.present.push(...participants.present);

    mes.present = getUniqueArray(mes.present, (a) => a.length);

    if(extensionSettings.seeLast) {
        const prevMes = chat[mesId - 1];
        prevMes.present = prevMes.present || [];
        prevMes.present.push(avatars.find(a => a.length));
        prevMes.present = getUniqueArray(prevMes.present, (a) => a.length);
    }

    saveChatDebounced();
}

function updateMemberListButton() {
    $('#rm_group_members .group_member').each(function(i, elem) {
        updatePresenceTrackingButton(elem);
    });
}

/**
 * @param {string} type Generation type
 * @param {number|string} charId
 * @returns {void}
 */
function onGroupMemberDrafted(type, charId) {
    log('is_group_generating', is_group_generating)
	if (!isActive() || !is_group_generating) return;

	const { chat, characters, chatMetadata } = context();

	const lastMessage = chat[chat.length - 1];
	const isUserContinue = type === 'continue' && lastMessage.is_user;
	const avatar = characters[charId].avatar || null;

    if (
		type == 'impersonate' ||
		isUserContinue ||
		chatMetadata.ignore_presence?.includes(avatar)
	) {
        toggleVisibilityAllMessages(true);
	} else {
		toggleVisibilityAllMessages(false, false);

		const messageIdChunks = getMessageIdChunks(avatar);

		for (const idChunk of messageIdChunks) {
			hideChatMessageRange(idChunk, true, false);
		}

        if (extensionSettings.seeLast) {
            const lastMessageID = chat.length - 1;
            hideChatMessageRange({start: lastMessageID}, true, false);
        }

		saveChatDebounced();
	}
}

function initialize() {
    eventSource.on(eventTypes.CHAT_CHANGED, async function (...args) {
        log("CHAT_CHANGED", args);

        const [chatId] = args;

        if (!chatId) return;

        onChatChanged({forceUpdate: true});
    });

    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, async function (...args) {
        log("CHARACTER_MESSAGE_RENDERED", args);
        onChatChanged();
    });

    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, async function (...args) {
        log("USER_MESSAGE_RENDERED", args);
        onChatChanged();
    });

    eventSource.on(eventTypes.GROUP_UPDATED, function (...args) {
        log(eventTypes.GROUP_UPDATED, args);
        updateMemberListButton();
    });

    eventSource.makeFirst(eventTypes.GENERATION_AFTER_COMMANDS, async function (...args) {
        log("GENERATION_AFTER_COMMANDS", args);
        lastGenType = args[0];
    });

    eventSource.makeFirst(eventTypes.GROUP_MEMBER_DRAFTED, function (...args) {
        log(eventTypes.GROUP_MEMBER_DRAFTED, args);
        onGroupMemberDrafted(lastGenType, args[0]);
        updateMemberListButton();
    });

    eventSource.makeFirst(eventTypes.MESSAGE_RECEIVED, function (...args) {
        log("MESSAGE_RECEIVED", args);
        onNewMessage(...args);
        toggleVisibilityAllMessages(true);
    });

    eventSource.makeLast(eventTypes.MESSAGE_SENT, async function (...args) {
        log("MESSAGE_SENT", args);
        onNewMessage(...args);
    });

    eventSource.makeFirst(eventTypes.GENERATION_STOPPED, function (...args) {
        log("GENERATION_STOPPED", args);
        toggleVisibilityAllMessages(true);
    });

    eventSource.makeFirst(eventTypes.GROUP_WRAPPER_FINISHED, function (...args) {
        log("GENERATION_STOPPED", args);
        updateMemberListButton();
    });
}
