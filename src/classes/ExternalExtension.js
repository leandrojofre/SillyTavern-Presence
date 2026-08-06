/** @typedef {Presence.PresenceModes} PresenceModes */
/** @typedef {Presence.GlobalInterfaceExtensions} GlobalInterfaceExtensions */

/**
 * @template {keyof GlobalInterfaceExtensions} Name
 */
export class ExternalExtension {
    /** @type {Name} */ key;
    /** @type {boolean} */ enabled;
    /** @type {typeof globalThis[Name]} */ global;

    /**
     * @param {Name} key
     */
    constructor (key) {
        this.key = key;
        this.enabled = key in globalThis;
        this.global = key in globalThis ? globalThis[key] : null;
    }

    /**
     * @template {keyof typeof globalThis[Name]} K
     * @param {K} key
     * @param {unknown[]} [args]
     * @returns {ReturnType<typeof globalThis[Name][K]>}
     */
    call(key, ...args) {
        if (!this.enabled) return;

        const value = this.global[key];

        if (!value) return;
        if (typeof value !== 'function') return;

        return args.length ? value(...args) : value();
    }

    /**
     * @template {keyof typeof globalThis[Name]} K
     * @param {K} key
     * @returns {typeof globalThis[Name][K]}
     */
    get(key) {
        if (!this.enabled) return;

        const value = this.global[key];

        if (!value) return;
        if (typeof value === 'function') return;
        return value;
    }

    /**
     * @param {Object} [options]
     * @param {boolean} [options.onlyEnabled]
     * @param {boolean} [options.onlyDetached]
     * @returns {Map<string, StatUsMaximus.Status>}
     */
    getAvatarMap({onlyEnabled = true, onlyDetached = true} = {}) {
        if (!this.enabled || this.key !== 'StatUsMaximus') return new Map();

        const statuses = Presence.ext('StatUsMaximus').call('getStatuses') || [];
        const avatarMap = new Map();

        for (const s of statuses) {
            if (onlyEnabled && !s.enabled) continue;
            if (onlyDetached && !s.is_detached) continue;

            avatarMap.set(s.avatar, s);
        }

        return avatarMap;
    }
}