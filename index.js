import {saveChatDebounced} from '../../../../script.js';
import {ExternalExtension} from './src/classes/ExternalExtension.js';
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
    updatePresenceTrackingButton,
    toggleVisibilityAllMessages,
    hideChatMessageRange,
    getUniqueArray,
    getMessageIdChunks,
    htmlPrefix,
    extensionSettings,
    metadataName,
	t,
}

// @ts-check

/** @typedef {Presence.SillyTavernContext} SillyTavernContext */
/** @typedef {Presence.ChatMessageExtended} ChatMessageExtended */
/** @typedef {Presence.ExtensionSettings} ExtensionSettings */
/** @typedef {Presence.MessageIdChunk} MessageIdChunk */
/** @typedef {Presence.HTMLTemplateGetOptions} HTMLTemplateGetOptions */
/** @typedef {Presence.PresenceModes} PresenceModes */
/** @typedef {Presence.CommonTrackingButtonSetting} CommonTrackingButtonSetting */

/** @type {() => SillyTavernContext} */
const context = SillyTavern.getContext;

const {
	eventTypes,
	eventSource,
	saveSettingsDebounced,
	extensionSettings: extension_settings,
	swipe,
	saveMetadataDebounced,
    getThumbnailUrl,
	t
} = context();


const extensionName = 'Presence';
const extensionFullName = `SillyTavern-${extensionName}`;
const metadataName = extensionName.toLowerCase().replaceAll('-', '_') + '_extension';
const htmlPrefix = extensionName.toLowerCase();
const extensionFolderPath = `scripts/extensions/third-party/${extensionFullName}`;
const defaultAvatarIcon = 'img/quill.png';

/** @type {ExtensionSettings} */
const extensionSettings = extension_settings[extensionName];

/** @type {ExtensionSettings} */
const defaultSettings = {
	enabled: true,
	location: 'top',
	seeLast: true,
	includeMuted: false,
    disableTransition: false,
    minMessageDisplay: 0,
	debug: false,
};

/** @type {Presence.ExtensionMetadata} */
const defaultMetadata = {
    char_mode: {},
};

const MetadataMap = {
	universalTrackerOn: 'universal_tracker_on',
    universalTrackerLabel: 'presence_universal_tracker',
};

/** @type {Record<PresenceModes, CommonTrackingButtonSetting>} */
const commonTrackingButtonSettings = {
    present: {
        title: 'The character is present',
    },
    on_group_present: {
        title: 'This character will only see the messages where the currently active characters are present',
    },
    ignore: {
        title: 'Presence ignored',
    },
};

/** @type {Map<PresenceModes, PresenceModes>} */
const presenceModes = new Map();

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

				error('Template rendering error.', {err});

				if (is404 && !HTML_TEMPLATES.didFallbackFetch) {
					HTML_TEMPLATES.extensionFolderPath = `${HTML_TEMPLATES.extensionFolderPath}.git`;
					HTML_TEMPLATES.didFallbackFetch = true;

					error(`Failed to fetch ${fileName}.html, attempting fallback path...`, {err, HTML_TEMPLATES: structuredClone({
						extensionFolderPath: HTML_TEMPLATES.extensionFolderPath,
						didFallbackFetch: HTML_TEMPLATES.didFallbackFetch,
					})});

					return await HTML_TEMPLATES.get(fileName, {clone});
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

/**
 * @param {any[]} array
 * @param {(v: any) => boolean} [filter]
 */
function getUniqueArray(array, filter = (v) => true) {
    return new Set(array).values().toArray().filter(filter);
}

// * MARK:Features

function getCurrentParticipants() {
	const {groupId, groups, chatMetadata} = context();
	const group = groups.find((g) => g.id == groupId);

	if (!group) return { members: [], present: [] };

	let active = [...group.members];
    const statuses = Presence.getStatusAvatarMap();

    for (const [avatar, status] of statuses) {
        active.push(avatar);
    }

    if (chatMetadata[MetadataMap.universalTrackerOn])
        active.push('presence_universal_tracker');

	if (!extensionSettings.includeMuted)
		active = active.filter(char => !group.disabled_members.includes(char));

	Object
    .entries(Presence.metadata('char_mode') || {})
    .forEach(([char, mode]) => {
		if (mode === 'ignore' && active.includes(char))
            active.splice(active.indexOf(char), 1);
	});

    active = getUniqueArray(active, (m) => m?.length);

	return { members: group.members, present: active };
}

/**
 * @param {string} file
 * @param {Object} [options]
 * @param {Map<string, StatUsMaximus.Status>} [options.statuses]
 */
function getAvatarImage(file, {statuses = null} = {}) {
    statuses = statuses ?? Presence.getStatusAvatarMap({onlyEnabled: false});

    const thumbnail = statuses.has(file) ? statuses.get(file).getThumbnail() : getThumbnailUrl('avatar', file);

    return {thumbnail, fallback: () => {
        const status = Presence.ext('StatUsMaximus').call('getStatus', file) || {getThumbnail: () => defaultAvatarIcon};

        return status.getThumbnail();
    }};
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

	const selector = '#chat .mes:not(.smallSysMes, [has_presence_tracker="true"])';
    const elements = $(selector).toArray();
	const chat = context().chat;
    const members = getCurrentParticipants().members;
    const statuses = Presence.getStatusAvatarMap();

    for (const element of elements) {
        const mesId = $(element).attr('mesid');
        const mes = chat[mesId];

        mes.present = getUniqueArray(mes.present ?? []);

        const trackerMembers = getUniqueArray([
            ...members,
            ...mes.present,
            ...statuses.keys(),
        ]).sort();

        const presenceTracker = await HTML_TEMPLATES.get('trackerChat', {clone: true});

        for (const member of trackerMembers) {
            if (!member) continue;

            const isPresent = mes.present.includes(member);

            if (member === MetadataMap.universalTrackerLabel) {
                presenceTracker.find('.universal').toggleClass('present', isPresent);
                presenceTracker.find('.universal').data('member', member);
                continue;
            }

            const memberIcon = await HTML_TEMPLATES.get('trackerChatMember', {clone: true});
            const avatarImg = getAvatarImage(member, {statuses});
            const title = statuses.has(member) ? statuses.get(member).name : member;

            memberIcon.data('member', member);
            memberIcon.attr('title', title);
            memberIcon.toggleClass('present', isPresent);
            memberIcon.find('.presence_avatar').one('error', {fallback: avatarImg.fallback}, function (e) {
                $(e.target).off('error');
                $(e.target).attr('src', e.data.fallback());
            }).attr('src', avatarImg.thumbnail)

            presenceTracker.append(memberIcon);
        };

        if (extensionSettings.location == 'top')
            $(element).find('.mes_block > .ch_name > .flex1').append(presenceTracker);

        if (extensionSettings.location == 'bottom')
            $(element).find('.mes_block').append(presenceTracker);

        $(element).attr('has_presence_tracker', 'true');
    };
}

/**
 * @param {ChatMessageExtended} message
 * @param {Object} [options]
 * @param {string} [options.avatar] If provided, the avatar of the character for which the message's presence should be checked.
 * @param {string[]} [options.present]
 * @returns {boolean} Whether the message should be unhidden
 */
function canToggleVisibility(message, {avatar = null, present = []} = {}) {
	if (!message.is_system) delete message.presence_manually_hidden;
	if (message?.presence_manually_hidden) return false;

	const messPresent = message.present ?? [];
    const universalPresent = messPresent.includes(MetadataMap.universalTrackerLabel);

    if (!avatar || universalPresent)
        return true;

    const charModes = Presence.metadata('char_mode');
    const presenceMode = charModes[avatar] || 'present';

    if (presenceMode === 'ignore')
        return true;

    const avatarPresent = messPresent.includes(avatar);

    if (presenceMode === 'present' && avatarPresent)
        return true;

    if (presenceMode === 'on_group_present' && avatarPresent)
        return messPresent.some(p => p !== avatar && present.includes(p));

	return false;
}

/**
 * @param {string|null} [avatar]
 * @returns {MessageIdChunk[]} An array of message ID ranges that can be hidden by Presence.
 */
function getMessageIdChunks(avatar = null) {
	const chatFull = context().chat || [];
    const minMessageDisplay = extensionSettings.minMessageDisplay;
    const chat = avatar ? chatFull.slice(minMessageDisplay) : chatFull;

	if (!chat.length) return [];

    /** @type {MessageIdChunk[]} */
	const messageIdChunks = [];
    const present = getCurrentParticipants().present;
	let current_chunk = 0;

	for (const [i, mess] of chat.entries()) {
        const canToggle = canToggleVisibility(mess, {avatar, present});

		if (!canToggle) continue;
        if (!messageIdChunks.length) messageIdChunks.push({});

		const chunk = messageIdChunks[current_chunk];
		const hasStart = 'start' in chunk;
        const mesID = avatar ? minMessageDisplay + i : i;

		if (!hasStart) {
			chunk.start = mesID;
			chunk.end = mesID;
		} else if (chunk.end + 1 === mesID) {
			chunk.end = mesID;
		} else {
			current_chunk++;

			messageIdChunks.push({
				start: mesID,
				end: mesID,
			});
		}
	};

	return messageIdChunks;
}

/**
 * Mark a range of messages as hidden `is_system=true` or not.
 * @param {MessageIdChunk} idChunk An object with "start" and "end" properties indicating the range of message IDs to hide/unhide.
 * @param {boolean} unhide If true, unhide the messages instead.
 * @param {boolean} [saveChat] Whether to save the chat after toggling message visibility.
 * @returns {Promise<void>}
 */
function hideChatMessageRange(idChunk, unhide, saveChat = true) {
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

/**
 * @param {boolean} unhide
 * @param {boolean} saveChat
 * @returns {void}
 */
function toggleVisibilityAllMessages(unhide = false, saveChat = true) {
	if (!isActive()) return;

	const messageIdChunks = getMessageIdChunks();

	for (const idChunk of messageIdChunks) {
		hideChatMessageRange(idChunk, unhide, false);
	}

    if (saveChat) saveChatDebounced();
}

/**
 * @param {number|string} mesId
 * @param {string} member
 * @param {boolean} isPresent
 */
function updateMessagePresence(mesId, member, isPresent) {
	const { chat } = context();
	const mes = chat.at(Number(mesId));

	mes.present = mes.present || [];

	if (isPresent) {
		mes.present.push(member);
        mes.present = getUniqueArray(mes.present);
	} else {
		mes.present = getUniqueArray(mes.present, (m) => m != member);
	}

	saveChatDebounced();
}

function toggleMessagesManuallyHiddenFlag(e) {
	const { chat } = context();
	const $mess = $(e.target).closest('.mes');
	const mesId = $mess.attr('mesid');
	const isHiding = $(e.target).hasClass('mes_hide');
	const mes = chat.at(Number(mesId));

	mes.presence_manually_hidden = isHiding;

	saveChatDebounced();
}

function updatePresenceTrackingButton(member) {
	if (!isActive() || !member) return;

	const target = $(member).find('.ignore_presence_toggle');
	const charId = $(member).data('chid');
	const character = context().characters[charId];
	const charModes = Presence.metadata('char_mode');

    if (!character?.avatar) return;

    const avatar = character.avatar;
    const mode = avatar in charModes ? charModes[avatar] : 'present';

    target.toggleClass('presence_ignore_shadow', mode === 'ignore');
    target.toggleClass('presence_on_group_shadow', mode === 'on_group_present');
    target.attr('title', commonTrackingButtonSettings[mode]?.title || '');
}

function togglePresenceTracking(e) {
	const target = $(e.target).closest('.group_member');
	const charId = target.data('chid');
	const charAvatar = context().characters[charId].avatar;
	const charModes = Presence.metadata('char_mode');
    const nextMode = presenceModes.get(charModes[charAvatar]) || 'ignore';

    charModes[charAvatar] = nextMode;
    Presence.metadata('char_mode', charModes);

	saveChatDebounced();
	updatePresenceTrackingButton(target);
}

function toggleMessageIcon(e) {
    const target = $(e.target).closest('.presence_icon');
    const mesId = $(e.target).closest('.mes')?.attr('mesid');
    const isPresent = target.hasClass('present');
    const member = target.data('member');

    if (!mesId || !member) return;

    target.toggleClass('present', !isPresent);
    updateMessagePresence(mesId, member, !isPresent);
}

/**
 * MARK:Interface
 * @type {Presence.GlobalInterface}
 */
globalThis.Presence = {
    extensions: {},
    ext(key) {
        const exists = key in Presence.extensions;

        // @ts-ignore
        if (!exists) Presence.extensions[key] = new ExternalExtension(key);

        return Presence.extensions[key];
    },
    metadata(key, value) {
        const { chatMetadata } = context();
        const metadataExists = 'presence_extension' in chatMetadata;

        const metadata = Object.assign({},
            structuredClone(defaultMetadata),
            metadataExists ? chatMetadata.presence_extension : {},
        );

        if (value) metadata[key] = value;

        chatMetadata.presence_extension = metadata;

        return metadata[key];
    },
    addPresenceMode(mode) {
        const [from, to] = presenceModes.entries().toArray().pop();

        presenceModes.set(from, mode);
        presenceModes.set(mode, to);
    },
    getStatusAvatarMap({onlyEnabled = true, onlyDetached = true, onlyGroup = false} = {}) {
        const ext = Presence.ext('StatUsMaximus');

        if (!ext.enabled) return new Map();

        /** @type {Map<string, StatUsMaximus.Status>} */
        const avatarMap = new Map();
        const statuses = ext.call('getStatuses') || [];

        const { groupId, groups, characterId, characters } = context();
        const character = characterId ? characters.at(Number(characterId)).avatar : '';
        const group = groups.find(g => g.id === groupId)?.members || [character];

        for (const s of statuses) {
            if (onlyEnabled && !s.enabled) continue;
            if (onlyDetached && !s.is_detached) continue;
            if (onlyGroup && !s.is_detached && !group.includes(s.avatar)) continue;

            avatarMap.set(s.avatar, s);
        }

        return avatarMap;
    },
	toggleVisibilityAllMessages,
	hideChatMessageRange,
	getMessageIdChunks,
    log,
    debug,
    error,
	extensionName,
    presenceModes,
};

// * MARK:Extension Settings

const settingsCallbacks = {
    enabled() {
        // Nothing by the moment
    },

	location() {
		addPresenceTrackerToMessages(true);
	},

	disableTransition() {
		$('#chat').toggleClass('no-presence-animations', extensionSettings.disableTransition);
	},
}

/**
 * @param {JQuery|HTMLElement} element
 * @returns {{callback: Function; setting: string;}}
 */
function getSettingInputCallback(element) {
    const $target = $(element);
    const setting = $target.attr(`${htmlPrefix}-setting`);
    const callback = settingsCallbacks[setting];

    return {callback, setting};
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const $target = $(event.target);
    const {callback, setting} = getSettingInputCallback($target);
    const value = Boolean($target.prop('checked'));

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const $target = $(event.target);
    const {callback, setting} = getSettingInputCallback($target);
    const value = String($target.val());
    const pattern = String($target.attr('pattern') || '');

    if (pattern) {
        const regex = new RegExp(pattern);
        const isValid = regex.test(value);

        if (!isValid) return;
    }

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLSelectElement} */(event.target);
    const {callback, setting} = getSettingInputCallback(target);

    const defValue = defaultSettings[setting];
    const raw_value = isNaN(Number(target.value)) ? defValue : Number(target.value);
    const min = Number(target.getAttribute('min') || raw_value);
    const max = Number(target.getAttribute('max') || raw_value);

    const insideMinBoundary = min <= raw_value;
    const insideMaxBoundary = max >= raw_value;

    let value = raw_value;

    if (!insideMinBoundary) value = min;
    if (!insideMaxBoundary) value = max;

    extensionSettings[setting] = value;

    if (callback) callback();

    $(target).val(value);
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

    $('#extensions_settings').append(settingsHtml);

    $(`#${htmlPrefix}-enabled`).on('input', settingsBooleanButton);

	$(`#${htmlPrefix}-location`).on('change', settingsTextButton);
	$(`#${htmlPrefix}-see-last`).on('input', settingsBooleanButton);
	$(`#${htmlPrefix}-include-muted`).on('input', settingsBooleanButton);
	$(`#${htmlPrefix}-disable-transition`).on('input', settingsBooleanButton);
	$(`#${htmlPrefix}-min-message-display`).on('input', settingsNumberButton);

    $(`#${htmlPrefix}-debug`).on('input', settingsBooleanButton);
    $(`#${htmlPrefix}-check-configuration`).on('click', displaySettings);

    log('Settings menu created');

    $(`#${htmlPrefix}-enabled`).prop('checked', extensionSettings.enabled).trigger('input');
    $(`#${htmlPrefix}-location`).val(extensionSettings.location).trigger('change');
    $(`#${htmlPrefix}-see-last`).prop('checked', extensionSettings.seeLast).trigger('input');
    $(`#${htmlPrefix}-include-muted`).prop('checked', extensionSettings.includeMuted).trigger('input');
    $(`#${htmlPrefix}-disable-transition`).prop('checked', extensionSettings.disableTransition).trigger('input');
    $(`#${htmlPrefix}-min-message-display`).val(extensionSettings.minMessageDisplay).trigger('input');
    $(`#${htmlPrefix}-debug`).prop('checked', extensionSettings.debug).trigger('input');

    log('Settings values initialized', extensionSettings);
}

// * MARK:Initialization

async function initializeFeatures() {
    Presence.ext('StatUsMaximus');
    presenceModes.set('present', 'ignore');
    presenceModes.set('ignore', 'present');
    Presence.addPresenceMode('on_group_present');

    const universalTrackerToggle = await HTML_TEMPLATES.get('universalTrackerToggle');
	const universalTrackerContainer = $('#GroupFavDelOkBack div:has(#rm_group_automode_label)');

	universalTrackerContainer.append(universalTrackerToggle);
    universalTrackerToggle.on('change', (e) => {
		context().chatMetadata[MetadataMap.universalTrackerOn] = $(e.target).prop('checked');
		saveMetadataDebounced();
	});

	const ignorePresenceButton = await HTML_TEMPLATES.get('presenceModeButton', {clone: true});
	const groupMemberIconsTemplate = $('.group_member_icon');
	groupMemberIconsTemplate.prepend(ignorePresenceButton);

	$(document).on('mouseup touchend', '#show_more_messages', () => addPresenceTrackerToMessages());
	$('#rm_group_members').on('click', '.ignore_presence_toggle', togglePresenceTracking);
	$('#chat').on('click', '.mes_button.mes_hide, .mes_button.mes_unhide', toggleMessagesManuallyHiddenFlag);
    $('#chat').on('click', '.mes_presence_tracker .presence_icon', toggleMessageIcon);
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
