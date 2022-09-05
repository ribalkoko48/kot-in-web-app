/** @type {!Object} */
const Permission = {};

/** @enum {string} */
Permission.Type =
    {
        Clipboard: 'clipboard',
        FileSystem: 'filesystem',
        Screenshot: 'screenshot',

        /* Специальное разрешение не требуется. */
        Unchecked: 'unchecked'
    };

/** @enum {string} */
Permission.Status =
    {
        /** Неизвестен */
        Unknown: 'unknown',
        /** Разрешен */
        Granted: 'granted',
        /** Запрещен */
        Denied: 'denied'
    };

/** @type {!Object<NativeEnvironment.Type, Permission.Type>} */
Permission.NativeDefault =
    {
        [NativeEnvironment.Type.FileSystem]: Permission.Type.FileSystem,
        [NativeEnvironment.Type.Crypto]: Permission.Type.FileSystem
    };

/** @type {{Extension: !Object<string, Permission.Type>, Native: !Object<NativeEnvironment.Type, !Object<string, Permission.Type>>}} */
Permission.Manifest =
    {
        Extension:
            {
                'initHost': Permission.Type.Unchecked,
                'disconnectHost': Permission.Type.Unchecked,
                'permissionRead': Permission.Type.Unchecked,
                'chooseDesktopMedia': Permission.Type.Unchecked,
                'activateTab': Permission.Type.Unchecked,
                'openTab': Permission.Type.Unchecked,
                'closeExtensionStoreAndReturn': Permission.Type.Unchecked,

                'clipboardWrite': Permission.Type.Clipboard,
                'clipboardRead': Permission.Type.Clipboard,
                'clipboardPaste': Permission.Type.Clipboard,
                'clipboardCopySelected': Permission.Type.Clipboard,
                'clipboardCutSelected': Permission.Type.Clipboard,

                'getCurrentTabScreenshot': Permission.Type.Screenshot
            },
        Native:
            {
                [NativeEnvironment.Type.FileSystem]:
                    {
                        'setConnection': Permission.Type.Unchecked,
                        'setLocale': Permission.Type.Unchecked,
                        'loadAddIn': Permission.Type.Unchecked,
                        'createInstance': Permission.Type.Unchecked,
                        'callExt': Permission.Type.Unchecked,
                        'chooseFiles': Permission.Type.Unchecked,
                        'documentsDir': Permission.Type.Unchecked,
                        'tempFilesDir': Permission.Type.Unchecked,
                        'appDataDir': Permission.Type.Unchecked
                    },
                [NativeEnvironment.Type.Crypto]:
                    {
                        'setConnection': Permission.Type.Unchecked,
                        'setLocale': Permission.Type.Unchecked,
                        'loadAddIn': Permission.Type.Unchecked,
                        'createInstance': Permission.Type.Unchecked,
                        'callExt': Permission.Type.Unchecked
                    }
            }
    };

/**
 * @param {!MessageDataObject} msg
 * @param {!NativeEnvironment} nativeEnv
 * @return {?Permission.Type}
 */
Permission.getPermissionType = function(msg, nativeEnv)
{
    if (Permission.isWebClientCompatibilityBug_(msg))
        return Permission.Type.Unchecked;

    const splitted = /** @type {!Array<string>} */(msg.type.split('.'));
    // Если type вида ***.callHost, то сообщение адресуется нативной компоненте.
    // Если ***.call.*** - расширению.
    if (splitted[1] === 'callHost')
    {
        return Permission.getNativeMsgType_(msg['data'], nativeEnv);
    }

    if (splitted[1] === 'call')
    {
        const method = /** @type {string} */(splitted[2]);

        return Permission.Manifest.Extension[method] || null;
    }

    return null;
};

/**
 * @param {Object|undefined} data
 * @param {!NativeEnvironment} nativeEnv
 * @private
 * @return {?Permission.Type}
 */
Permission.getNativeMsgType_ = function(data, nativeEnv)
{
    if (!data)
        return null;

    if (Permission.isUncheckedNativeType_(nativeEnv))
        return Permission.Type.Unchecked;

    return Permission.getFromTypeProp_(nativeEnv, data);
};

/**
 * Возвращает true, если компонента НЕ поддерживает режим работы "без диалогов / noDialogs"
 *
 * @param {!NativeEnvironment} nativeEnv
 * @private
 * @return {!boolean}
 */
Permission.isUncheckedNativeType_ = function(nativeEnv)
{
    const nativeType = nativeEnv.getType();

    switch (nativeType)
    {
        case NativeEnvironment.Type.FileSystem:
        case NativeEnvironment.Type.Crypto:
            return !nativeEnv.noDialogsAreSupported();
        default:
            return true;
    }
};

/**
 * @param {!NativeEnvironment} nativeEnv
 * @param {!Object} data
 * @private
 * @return {Permission.Type}
 */
Permission.getFromTypeProp_ = function(nativeEnv, data)
{
    const nativeType = nativeEnv.getType();

    const type = /** @type {number|undefined} */(data['type']);
    const createField = /** @type {string|undefined} */(data['create']);
    const method = /** @type {string|undefined} */(data['method']);

    switch (type)
    {
        case NativeMessageType.TYPE_CREATE:
            return (createField === NativeMessageClassName.FILE_STREAM_CLASS_NAME) ?
                Permission.Type.FileSystem : Permission.Type.Unchecked;
        case NativeMessageType.TYPE_CALL:
            if (method && Permission.Manifest.Native[nativeType][method])
                return Permission.Manifest.Native[nativeType][method];
            else return Permission.NativeDefault[nativeType];
        default:
            return Permission.Type.Unchecked;
    }
};

/**
 * {багфикс}
 * Веб-клиент до версии 8.3.16 передает сообщение
 * {
 *      type: %vendor% + 'callHost',
 *      data: {type: %vendor% + 'call.disconnectHost'}
 * }
 * А должен
 * {
 *      type: %vendor% + 'call.disconnectHost'
 * }
 * На такие сообщения права не запрашиваем.
 *
 * @param {!MessageDataObject} msg
 * @return {boolean}
 */
Permission.isWebClientCompatibilityBug_ = function(msg)
{
    const data = /** @type {Object} */(msg['data']);
    /** @type {?string} */
    let dataType = null;

    if (data)
        dataType = /** @type {string} */ (data['type']);

    return dataType === kVendorPrefix + 'call.disconnectHost';
};

/**
 * @constructor
 * @struct
 * @param {{string: Permission.Status}=} opt_permissions
 */
Permission.State = function(opt_permissions)
{
    /** @type {Object<string, Permission.Status>} */
    this.permissions = opt_permissions || {};
};

/**
 * @param {Permission.Type} type
 * @return {Permission.Status}
 */
Permission.State.prototype.getStatus = function(type)
{
    return this.permissions[type] || Permission.Status.Unknown;
};


/**
 * @param {!MessageDataObject} msg
 * @return {!Permission.State}
 */
Permission.State.getProp = function(msg)
{
    return new Permission.State(msg['permissionsState']);
};
