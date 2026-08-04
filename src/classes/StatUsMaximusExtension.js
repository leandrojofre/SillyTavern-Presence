/** @typedef {Presence.PresenceModes} PresenceModes */

export class StatUsMaximusExtension {
    /** @type {boolean} */enabled;
    /** @type {StatUsMaximus.GlobalInterface} */global;

    constructor () {
        this.enabled = 'StatUsMaximus' in globalThis;
        this.global = 'StatUsMaximus' in globalThis ? globalThis.StatUsMaximus : null;
    }

    /**
     * @template {keyof StatUsMaximus.GlobalInterface} K
     * @param {K} key
     * @param {unknown[]} [args]
     * @returns {ReturnType<StatUsMaximus.GlobalInterface[K]>}
     */
    call(key, ...args) {
        if (!this.enabled) return;
        if (key === 'Status') return;
        if (key === 'StatusEntry') return;

        const value = this.global[key];

        if (!value) return;
        if (typeof value !== 'function') return;

        // @ts-ignore
        return args.length ? value(...args) : value();
    }

    /**
     * @template {keyof StatUsMaximus.GlobalInterface} K
     * @param {K} key
     * @returns {StatUsMaximus.GlobalInterface[K]}
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
        if (!this.enabled) return new Map();

        const statuses = this.call('getStatuses') || [];
        const avatarMap = new Map();

        for (const s of statuses) {
            if (onlyEnabled && !s.enabled) continue;
            if (onlyDetached && !s.is_detached) continue;

            avatarMap.set(s.avatar, s);
        }

        return avatarMap;
    }
}