import {saveChatDebounced} from '../../../../script.js';
import {is_group_generating} from '../../../../scripts/group-chats.js';
import * as eventListeners from './src/js/eventListeners.js';
import * as slashCommands from './src/js/slashCommands.js';
import * as presenceMacros from './src/js/macros.js';

export {
	context,
	log,
	warn,
	debug,
	getCurrentParticipants,
	isActive,
	eventTypes,
	eventSource,
	saveChatDebounced,
	t,
}

// @ts-check

/** @typedef {Presence.ChatMessageExtended} ChatMessageExtended */
/** @typedef {Presence.ExtensionSettings} ExtensionSettings */
/** @typedef {Presence.MessageIdChunk} MessageIdChunk */
/** @typedef {Presence.HTMLTemplateGetOptions} HTMLTemplateGetOptions */

const context = SillyTavern.getContext;

const {
	eventTypes,
	eventSource,
	saveSettingsDebounced,
	extensionSettings: extension_settings,
	swipe,
	saveMetadataDebounced,
	t
} = context();


const extensionName = 'Presence';
const extensionFullName = `SillyTavern-${extensionName}`;
const metadataName = extensionName.toLowerCase().replaceAll('-', '_');
const htmlSuffix = extensionName.toLowerCase();
const extensionFolderPath = `scripts/extensions/third-party/${extensionFullName}`;

/** @type {ExtensionSettings} */
const extensionSettings = extension_settings[extensionName];

/** @type {ExtensionSettings} */
const defaultSettings = {
	enabled: true,
	location: 'top',
	seeLast: true,
	includeMuted: false,
    disableTransition: false,
	debug: false,
};

const MetadataMap = {
	universalTrackerOn: 'universal_tracker_on',
}

// * MARK:Debug

/**
 * @param {...any} messages
 */
function log(...messages) {
    if (extensionSettings.debug) console.log(`[${extensionName} Log]`, ...messages)
}

/**
 * @param {...any} messages
 */
function warn(...messages) {
    if (extensionSettings.debug) console.warn(`[${extensionName} Warning]`, ...messages)
}

/**
 * @param {...any} messages
 */
function debug(...messages) {
	if (extensionSettings.debug) console.debug(`[${extensionName} Debug]`, ...messages);
}

/**
 * @param {...any} messages
 */
function error(...messages) {
	if (extensionSettings.debug) console.error(`[${extensionName} Debug]`, ...messages);
}

// * MARK:Utility

/** Destroys an element and all data associated with it
    @param {String|HTMLElement|JQuery<any>} element
*/
function destroyElement(element) {
    const elem = $(element);

    elem.find('*').each(function() {
        const child = $(this);

        // Destroy even listeners
        child.off();

        // Clean any ghost data
        $.cleanData([child[0]]);

        // Destroy elements
        child.remove();
    });

    const leftoversCount = elem.children().length;

    if (leftoversCount) {
        elem.empty();
    }

	elem.remove();
}

const HTML_TEMPLATES = {
	/**
     * @param {string} [fileName]
     * @param {HTMLTemplateGetOptions} [options]
     * @returns {Promise<JQuery<HTMLElement>>}
     */
    get: async function(fileName = 'settings', {clone = false} = {}) {
		const extensionFolderPath = HTML_TEMPLATES.extensionFolderPath;

		if (!HTML_TEMPLATES[fileName]) {
			try {
				await $.get(`${extensionFolderPath}/src/html/${fileName}.html`)
					.done(function(response) {
						HTML_TEMPLATES[fileName] = $(response);
					})
			} catch (err) {
				const is404 = err?.status === 404;

				error({err});

				if (is404 && !HTML_TEMPLATES.didFallbackFetch) {
					HTML_TEMPLATES.extensionFolderPath = `${HTML_TEMPLATES.extensionFolderPath}.git`;
					HTML_TEMPLATES.didFallbackFetch = true;

					error(`Failed to fetch ${fileName}.html, attempting fallback path...`, {err, HTML_TEMPLATES: structuredClone({
						extensionFolderPath: HTML_TEMPLATES.extensionFolderPath,
						didFallbackFetch: HTML_TEMPLATES.didFallbackFetch,
					})});

					return HTML_TEMPLATES.get(fileName, {clone});
				}
			}
        }

        const $file = HTML_TEMPLATES[fileName];

        if (!$file) {
            toastr.warning(t`HTML template could not be loaded`, extensionName);
            return $();
        }

		return clone ? $file.clone() : $file;
    },
	didFallbackFetch: false,
	extensionFolderPath,
};

function isActive() {
	return context().groupId != null && extensionSettings.enabled;
}

// * MARK:Features

function getCurrentParticipants() {
	const {groupId, groups, chatMetadata} = context();
	const group = groups.find((g) => g.id == groupId);

	if (!group) return { members: [], present: [] };

	var active = [...group.members];

    if (chatMetadata[MetadataMap.universalTrackerOn]) active.push('presence_universal_tracker');

	if (!extensionSettings.includeMuted)
		active = active.filter(char => !group.disabled_members.includes(char));

	if (!chatMetadata.ignore_presence) chatMetadata.ignore_presence = [];

	chatMetadata.ignore_presence.forEach(char => {
		if (active.includes(char)) active.splice(active.indexOf(char), 1);
	});

	return { members: group.members, present: active };
}

export async function onNewMessage(mesId) {
	if (!isActive()) return;

	/** @type {ChatMessageExtended[]} */
	const chat = context().chat;
	const mes = chat[mesId];
    const participants = await getCurrentParticipants();
	const { this_chid, characters } = context();

	const thumbnail = new URL(mes.force_avatar, window.location.origin);
	const urlType = thumbnail?.searchParams?.get('type') ?? '';
	const urlFile = thumbnail?.searchParams?.get('file') ?? '';
	const isUser = urlType === 'persona';

    if (this_chid !== undefined && !isUser && urlFile) {
        const character = characters[this_chid];
		const isCharMessage = urlFile === character.avatar || mes.original_avatar === character.avatar;
	    const isCharActive = participants.present.includes(character.avatar);

        if (isCharMessage && !isCharActive) mes.present = character?.avatar ? [character.avatar] : [];
        else mes.present = structuredClone(participants.present);
    } else {
        mes.present = structuredClone(participants.present);
    }

	if(extensionSettings.seeLast && !mes.is_user) {
		/** @type {ChatMessageExtended} */
		const prevMes = chat[mesId - 1];

		if(!prevMes.present) prevMes.present = [];

		if(!prevMes.present.includes(mes.original_avatar)){
			prevMes.present.push(mes.original_avatar);
		}
	}

	await saveChatDebounced();
}

/**
 * @param {boolean} [refresh=false] Whether to refresh existing presence trackers. Set to true when messages are added/removed from the chat, false when just updating presence info.
 * @returns {Promise<void>}
 */
export async function addPresenceTrackerToMessages(refresh = false) {
	if (refresh) {
		let trackers = $("#chat .mes_presence_tracker");
		let messages = trackers.closest(".mes");

        messages.removeAttr("has_presence_tracker");

        destroyElement(trackers);
	}

	if (!isActive()) return;

	let selector = "#chat .mes:not(.smallSysMes,[has_presence_tracker=true])";
    const elements = $(selector).toArray();
	const chat = context().chat;

    for (const element of elements) {
        const mesId = $(element).attr("mesid");
        const mes = chat[mesId];

        if (mes.present == undefined)
            mes.present = [];
        else mes.present = [...new Set(mes.present)];

        const mesPresence = mes.present;
        const members = (await getCurrentParticipants()).members;
        const trackerMembers = members.concat(mesPresence.filter((m) => !members.includes(m))).sort();
        const presenceTracker = $('<div class="mes_presence_tracker"></div>');

        if (!presenceTracker.first().hasClass('universal')) {
            const universalTracker = $('<div class="presence_icon universal"><div class="fa-solid fa-universal-access interactable" title="Universal Tracker"></div></div>');

            universalTracker.on("click", (e) => {
                const target = $(e.target).closest(".presence_icon");
                if (target.hasClass("present")) {
                    target.removeClass("present");
                    updateMessagePresence(mesId, "presence_universal_tracker", false);
                } else {
                    target.addClass("present");
                    updateMessagePresence(mesId, "presence_universal_tracker", true);
                }
            });

            presenceTracker.prepend(universalTracker);
        }

        trackerMembers.forEach((member) => {
            const isPresent = mesPresence.includes(member);

            if (member === "presence_universal_tracker") {
                if (isPresent) presenceTracker.find('.universal').addClass("present");
                return;
            }

            const memberIcon = $('<div class="presence_icon' + (isPresent ? " present" : "") + '"><img src="/thumbnail?type=avatar&amp;file=' + member + '"></div>');

            memberIcon.on("click", (e) => {
                const target = $(e.target).closest(".presence_icon");
                if (target.hasClass("present")) {
                    target.removeClass("present");
                    updateMessagePresence(mesId, member, false);
                } else {
                    target.addClass("present");
                    updateMessagePresence(mesId, member, true);
                }
            });

            presenceTracker.append(memberIcon);
        });

        if (element.hasAttribute("has_presence_tracker")) return;
        if (extensionSettings.location == "top") $(".mes_block > .ch_name > .flex1", element).append(presenceTracker);
        else if (extensionSettings.location == "bottom") $(".mes_block", element).append(presenceTracker);
        element.setAttribute("has_presence_tracker", "true");
    };
}

export async function onChatChanged({forceUpdate = false} = {}) {
	// @ts-ignore
	$(document).off('mouseup touchend', '#show_more_messages', addPresenceTrackerToMessages);

	if (!isActive()) return;
	await addPresenceTrackerToMessages(forceUpdate);

	$('#rm_group_members .group_member').each((index, element) => {
		updatePresenceTrackingButton($(element));
	});

	// @ts-ignore
	$(document).on('mouseup touchend', '#show_more_messages', addPresenceTrackerToMessages);
}

export async function onGenerationAfterCommands(type, config, dryRun) {
	if (!isActive() && !is_group_generating) return;

	async function draftHandler(...args) {
        eventSource.removeListener(eventTypes.GENERATION_STOPPED, stopHandler);
		return await onGroupMemberDrafted(type, args[0]);
	}

	async function stopHandler() {
		eventSource.removeListener(eventTypes.GROUP_MEMBER_DRAFTED, draftHandler);
	}

	eventSource.once(eventTypes.GROUP_MEMBER_DRAFTED, draftHandler);
	eventSource.once(eventTypes.GENERATION_STOPPED,stopHandler);
}

/**
 * @param {ChatMessageExtended} message
 * @param {Object} [options]
 * @param {string|null} [options.avatar] If provided, the avatar of the character for which the message's presence should be checked.
 * @returns {boolean} Whether the message should be hidden or not according
 */
function canToggleHideMessage(message, {avatar = null} = {}) {
	const present = message.present ?? [];
	const charIsPresent = present.includes(avatar) || present.includes('presence_universal_tracker');

	const hasManuallyHiddenFlag = 'presence_manually_hidden' in message;
	const forceManualToggleOff = message.presence_manually_hidden && !message.is_system;

	if (forceManualToggleOff && hasManuallyHiddenFlag)
		message.presence_manually_hidden = false;

	if (message.presence_manually_hidden) return false;
	if (!charIsPresent && avatar !== null) return false;

	return true;
}

/**
 * @param {string|null} [avatar]
 * @returns {MessageIdChunk[]} An array of message ID ranges that can be hidden by Presence.
 */
function getMessageIdChunks(avatar = null) {
	/** @type {ChatMessageExtended[]} */
	const chat = context().chat;

	if (!chat || !chat.length) return [];

	/** @type {MessageIdChunk[]} */
	const messageIdChunks = [{}];
	let current_chunk = 0;

	for (const [mesId, mess] of chat.entries()) {
		console.log({mesId, mess, avatar, canToggle: canToggleHideMessage(mess, {avatar})});
		if (!canToggleHideMessage(mess, {avatar})) continue;

		const chunk = messageIdChunks[current_chunk];
		const hasStart = 'start' in chunk;

		if (!hasStart) {
			chunk.start = mesId;
			chunk.end = mesId;
		} else if (chunk.end + 1 === mesId) {
			chunk.end = mesId;
		} else {
			current_chunk++;
			messageIdChunks.push({
				start: mesId,
				end: mesId,
			});
		}
	};

	return messageIdChunks;
}

/**
 * Mark a range of messages as hidden ("is_system") or not.
 * @param {MessageIdChunk} idChunk An object with "start" and "end" properties indicating the range of message IDs to hide/unhide.
 * @param {boolean} unhide If true, unhide the messages instead.
 * @param {boolean} [saveChat] Whether to save the chat after toggling message visibility.
 * @returns {Promise<void>}
 */
export async function hideChatMessageRange(idChunk, unhide, saveChat = true) {
	let { start, end } = idChunk;

	if (isNaN(start)) return;
	if (!end) end = start;

	const hide = !unhide;
	const chat = context().chat;

	for (let messageId = start; messageId <= end; messageId++) {
		const message = chat[messageId];

		if (!message) continue;

		message.is_system = hide;

		const messageBlock = $(`.mes[mesid="${messageId}"]`);

		if (!messageBlock.length) continue;

		messageBlock.attr('is_system', String(hide));
	}

	swipe.refresh();
	if (saveChat) saveChatDebounced();
}

export async function toggleVisibilityAllMessages(unhide = false, saveChat = true) {
	if (!isActive()) return;

	const messageIdChunks = getMessageIdChunks();

	for (const idChunk of messageIdChunks) {
		log({idChunk, unhide});
		hideChatMessageRange(idChunk, unhide, saveChat);
	}
}

async function updateMessagePresence(mesId, member, isPresent) {
	/** @type {ChatMessageExtended} */
	const mes = context().chat[mesId];
	if (!mes.present) mes.present = [];

	if (isPresent) {
		mes.present.push(member);
        mes.present = [...new Set(mes.present)];
	} else {
		mes.present = mes.present.filter((m) => m != member);
	}

	saveChatDebounced();
}

function onGroupMemberDrafted(type, charId) {
	if (!isActive()) return;

	const { chat, characters, chatMetadata } = context();

	/** @type {ChatMessageExtended} */
	const lastMessage = chat[chat.length - 1];
	const isUserContinue = (type === "continue" && lastMessage.is_user);
	const avatar = characters[charId].avatar || null;

	if (
		type == "impersonate" ||
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

async function togglePresenceTracking(e) {
	const target = $(e.target).closest(".group_member");
	const charId = target.data("chid");
	const charAvatar = context().characters[charId].avatar;
	const chatMetadata = context().chatMetadata;

	const ignorePresence = chatMetadata.ignore_presence ?? [];

	if (!ignorePresence.includes(charAvatar)) {
		if (!chatMetadata.ignore_presence) chatMetadata.ignore_presence = [];
		chatMetadata.ignore_presence.push(charAvatar);
	} else {
		chatMetadata.ignore_presence = ignorePresence.filter((c) => c != charAvatar);
	}

	saveChatDebounced();
	updatePresenceTrackingButton(target);
}

function toggleMessagesManuallyHiddenFlag(e) {
	const $mess = $(e.target).closest(".mes");
	const mesId = $mess.attr("mesid");
	const isHiding = $(e.target).hasClass("mes_hide");

	/** @type {ChatMessageExtended} */
	const mes = context().chat[mesId];

	mes.presence_manually_hidden = isHiding;

	saveChatDebounced();
}

async function updatePresenceTrackingButton(member) {
	if (!isActive()) return;

	const target = member.find(".ignore_presence_toggle");
	const charId = member.data("chid");
	const characters = context().characters;
	const chatMetadata = context().chatMetadata;

	if (!chatMetadata?.ignore_presence?.includes(characters[charId].avatar)) {
		target.removeClass("active");
	} else {
		target.addClass("active");
	}
}

globalThis.Presence = {
	toggleVisibilityAllMessages,
	hideChatMessageRange,
	getMessageIdChunks,
};

// * MARK:Extension Settings

const settingsCallbacks = {
    /**	Triggers on enabled setting change. */
    enabled: () => {
        // Nothing by the moment
    },

	location: function () {
		addPresenceTrackerToMessages(true);
	},

	disableTransition: function () {
		$('#chat').toggleClass('no-presence-animations', extensionSettings.disableTransition);
	},
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop('checked'));
    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const target = event.target;
    const value = String($(target).val());

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const raw_value = isNaN(target.valueAsNumber) ? 0 : target.valueAsNumber;
    const insideMinBoundary = (target.min !== '') ? (Number(target.min) <= raw_value) : true;
    const insideMaxBoundary = (target.max !== '') ? (Number(target.max) >= raw_value) : true;

    let value = raw_value;

    if (!insideMinBoundary) value = Number(target.min);
    if (!insideMaxBoundary) value = Number(target.max);

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    debug(`The extension is ${extensionSettings.enabled ? 'enabled' : 'disabled'}`);

    debug(`Debug mode is ${extensionSettings.debug ? 'active' : 'not active'}`);
    debug(structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadSettingsMenu() {
    const settingsHtml = await HTML_TEMPLATES.get('settings');

    // extensions_settings2 is an alternative
    $('#extensions_settings').append(settingsHtml);

    $(`#${htmlSuffix}-enabled`).on('input', settingsBooleanButton);

	$(`#${htmlSuffix}-location`).on('change', settingsTextButton);
	$(`#${htmlSuffix}-see-last`).on('input', settingsBooleanButton);
	$(`#${htmlSuffix}-include-muted`).on('input', settingsBooleanButton);
	$(`#${htmlSuffix}-disable-transition`).on('input', settingsBooleanButton);

    $(`#${htmlSuffix}-debug`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-check-configuration`).on('click', displaySettings);

    log('Settings menu created');

    $(`#${htmlSuffix}-enabled`).prop('checked', extensionSettings.enabled).trigger('input');
    $(`#${htmlSuffix}-location`).val(extensionSettings.location).trigger('change');
    $(`#${htmlSuffix}-see-last`).prop('checked', extensionSettings.seeLast).trigger('input');
    $(`#${htmlSuffix}-include-muted`).prop('checked', extensionSettings.includeMuted).trigger('input');
    $(`#${htmlSuffix}-disable-transition`).prop('checked', extensionSettings.disableTransition).trigger('input');
    $(`#${htmlSuffix}-debug`).prop('checked', extensionSettings.debug).trigger('input');

    log('Settings values initialized', extensionSettings);
}

// * MARK:Initialization

async function initializeFeatures() {
    const universalTrackerAlwaysOn = await HTML_TEMPLATES.get('universalTrackerButton');
	const universalTrackerContainer = $('#GroupFavDelOkBack div:has(#rm_group_automode_label)');

	universalTrackerContainer.append(universalTrackerAlwaysOn);
    universalTrackerAlwaysOn.on("change", (e) => {
		context().chatMetadata[MetadataMap.universalTrackerOn] = $(e.target).prop("checked");
		saveMetadataDebounced();
	});

	const groupMemberTemplateIcons = $('.group_member_icon');
	const ignorePresenceButton = $(`<div title="Ignore Presence" class="ignore_presence_toggle fa-solid fa-eye-slash right_menu_button fa-lg interactable" tabindex="0"></div>`);

	groupMemberTemplateIcons.prepend(ignorePresenceButton);

	$('#rm_group_members').on('click', '.ignore_presence_toggle', togglePresenceTracking);
	$('#chat').on('click', '.mes_button.mes_hide, .mes_button.mes_unhide', toggleMessagesManuallyHiddenFlag);

	const groupMemberList = document.getElementById("rm_group_members");
	const observer = new MutationObserver((mutationList, observer) => {
		const chatMetadata = context().chatMetadata;

		for (const mutation of mutationList) {
			if (mutation.type === "childList" && mutation.addedNodes.length > 0 && chatMetadata.ignore_presence) {
				mutation.addedNodes.forEach((node) => {
					updatePresenceTrackingButton($(node));
				});
			}
		}
	});

	observer.observe(groupMemberList, { childList: true, subtree: true });
}

eventSource.once(eventTypes.APP_INITIALIZED, async function () {
    if (!context().extensionSettings[extensionName]) {
        context().extensionSettings[extensionName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context().extensionSettings[extensionName][key] === undefined) {
            context().extensionSettings[extensionName][key] = defaultSettings[key];
        }
    }

	await loadSettingsMenu();
	await initializeFeatures();
	presenceMacros.initialize();
    eventListeners.initialize();
    slashCommands.initialize();
});
