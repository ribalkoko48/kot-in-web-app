
/**
 * Управляет режимами работы нативной компоненты (НК)
 *
 * @constructor
 * @struct
 * @param {string} type
 */
function NativeEnvironment(type)
{
    /**
     * Тип подключаемой НК.
     *
     * @type {NativeEnvironment.Type}
     */
    this.type = this.parseType(type);

    /**
     * Поддерживаемый режим работы.
     *
     * @type {Object<NativeEnvironment.Code>}
     */
    this.env = null;

    /**
     * Текущий режим работы.
     *
     * @type {Object<NativeEnvironment.Code>}
     */
    this.context = null;

    this.initEnv();
}

/**
 * Полное имя НК (параметр hostname) определяется шаблоном 'com.%vendor%.enterprise.%type%.%version%'
 *
 * @type {!RegExp}
 */
NativeEnvironment.NameRegex = /^com\.[^.]+\.enterprise\.([^.]+)\..+$/;

/**
 * Тип подключаемой НК.
 * Идентифицируем по %type%
 *
 * @enum {!string}
 */
NativeEnvironment.Type =
    {
        FileSystem: 'filesystemext',
        Crypto: 'cryptoextension',
        Agent: 'agent',

        Unknown: 'unknownextension'
    };

/**
 * Коды поддерживаемых режимов работы
 *
 * @enum {string}
 */
NativeEnvironment.Code =
{
    // Если значение methodPermissionRequests true, то НК не показывает подтверждающие диалоги
    NO_DIALOGS_IN_NATIVE: 'methodPermissionRequests'
};

/**
 * @param {string} fullName
 * @return {NativeEnvironment.Type}
 */
NativeEnvironment.prototype.parseType = function(fullName)
{
    const matches = fullName.match(NativeEnvironment.NameRegex) || [];
    const type = /** @type {string|undefined} */(matches[1]);

    for (let key in NativeEnvironment.Type)
    {
        if (type === NativeEnvironment.Type[key])
            return NativeEnvironment.Type[key];
    }

    return NativeEnvironment.Type.Unknown;
};

/** @return {NativeEnvironment.Type} */
NativeEnvironment.prototype.getType = function()
{
    return this.type;
};

NativeEnvironment.prototype.initEnv = function()
{
    switch (this.type)
    {
        case NativeEnvironment.Type.FileSystem:
        case NativeEnvironment.Type.Crypto:
            this.env = {[NativeEnvironment.Code.NO_DIALOGS_IN_NATIVE]: true};
            break;
        case NativeEnvironment.Type.Agent:
        case NativeEnvironment.Type.Unknown:
        default:
            this.env = null;
    }
};

/**
 * @param {!MessageDataObject} msg
 * @return {!boolean}
 */
NativeEnvironment.isContextClear = function(msg)
{
    const data = /** @type {Object} */(msg['data']);
    const environment = /** @type {Object|undefined} */(msg['environment']);

    if (environment || data && /** @type {Object|undefined} */(data['context']))
        return false;

    return true;
};

/**
 * @param {!MessageDataObject} msg
 * @return {!boolean}
 */
NativeEnvironment.containsEnvInfo = function(msg)
{
    const data = /** @type {Object} */(msg['data']);

    if (!data)
        return false;

    return data['type'] === NativeMessageType.TYPE_HELLO_REPLY;
};

/** @param {!MessageDataObject} msg */
NativeEnvironment.prototype.setupEnv = function(msg)
{
    const data = /** @type {Object} */(msg['data']);
    const env = /** @type {Object} */(data['environment']);

    this.env = Object.assign({}, env);
};

/**
 * Устанавливаем текущий режим работы (фичи).
 * Фича либо ключ (значение true), либо объект {ключ: значение}
 *
 * @param {Array<NativeEnvironment.Code|!Object<NativeEnvironment.Code>>} features
 */
NativeEnvironment.prototype.setContext = function(features)
{
    const self = this;
    const context = {};

    features.forEach(
        function(feature)
        {
            /** @type {NativeEnvironment.Code} */
            let key;
            let val;

            if (typeof feature === 'string')
            {
                key = val = feature;
            }
            else
            {
                key = /** @type {NativeEnvironment.Code<string>} */(Object.keys(feature)[0]);
                val = feature[key];
            }

            if (!self.env || !self.env[key])
                return;

            switch (key)
            {
                case NativeEnvironment.Code.NO_DIALOGS_IN_NATIVE:
                    context[key] = true;

                    return;
                default:
                    context[key] = val;
            }
        });

    this.context = context ? context : null;
};

/**
 * @param {!MessageDataObject} msg
 * @return {!MessageDataObject}
 */
NativeEnvironment.prototype.appendContext = function(msg)
{
    // new window.Object(), т.к msg в ff имеет тип XrayObject (см подробнее Xray vision)
    if (/** @type {?Object|undefined} */(msg['data']) && this.context)
        msg['data']['context'] = Object.assign(new window.Object(), this.context);

    return msg;
};

/**
 * @param {!Object} msg
 * @return {!Object}
 */
NativeEnvironment.prototype.appendEnv = function(msg)
{
    if (this.env)
        msg['environment'] = this.env;

    return msg;
};

/**
 * Поддерживает ли НК режим "Без диалогов"
 *
 * @return {!boolean}
 */
NativeEnvironment.prototype.noDialogsAreSupported = function()
{
    if (!this.env)
        return false;

    return !!this.env[NativeEnvironment.Code.NO_DIALOGS_IN_NATIVE];
};
