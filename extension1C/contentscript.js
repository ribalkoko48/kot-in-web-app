/**
 * Посредник между background-скриптом и
 * клиентом (Base.Ext.MessageBased.Client или Base.Ext.CommunicationManager)
 *
 * @constructor
 * @struct
 * @param {{postMessage: function(Object)}} messageManager
 */
function BackgroundBridge(messageManager)
{
    /** @type {Port} */
    this.backgroundPort = null;

    /** @type {{postMessage: (function(Object))}} */
    this.messageManager = messageManager;

    /**
     * @type {!Function}
     * @private
     */
    this.onBackgroundMessageDelegate_ = this.onBackgroundMessage_.bind(this);

    /**
     * @type {!Function}
     * @private
     */
    this.onBackgroundDisconnectDelegate_ = this.onBackgroundDisconnect_.bind(this);

    /**
     * Требующие разрешений запросы (на доступ к файловой системе, к буферу обмена)
     * помещаются в очередь, пока не придет информация о состоянии разрешений.
     *
     * @type {!Array<{msg: !MessageDataObject, permissionType: !Permission.Type}>}
     */
    this.msgQueue = [];

    // Ресурсные строки
    /** @type {!Object<string, string>} */
    this.resStrings = {};

    /** @type {!NativeEnvironment} */
    this.nativeEnv = new NativeEnvironment('');
}

/**
 * Коды ошибок
 *
 * @enum {number}
 */
BackgroundBridge.ErrorCode =
    {
        eException: 0,
        eHostNotInit: 1,
        eHostDisconnected: 2,
        eAccessDenied: 3
    };

/**
 * Обработка сообщений от веб-клиента
 *
 * @param {!MessageDataObject} msg
 */
BackgroundBridge.prototype.processMessage = function(msg)
{
    if (!this.isTypeCorrect_(msg) || !NativeEnvironment.isContextClear(msg))
        return;

    const permissionType = Permission.getPermissionType(msg, this.nativeEnv);

    switch (permissionType)
    {
        case Permission.Type.FileSystem:
        case Permission.Type.Clipboard:
            this.processChecked_(msg, permissionType);
            return;
        case Permission.Type.Unchecked:
            this.processUnchecked_(msg);
            return;
        default:
            return;
    }
};

/**
 * @param {!MessageDataObject} msg
 * @return {boolean}
 * @private
 */
BackgroundBridge.prototype.isTypeCorrect_ = function(msg)
{
    const type = /** @type {string} */(msg['type']).substr(kVendorPrefix.length);

    return type.slice(0, 4) === 'call';
};

/**
 * Обработчик запросов, требующих разрешений (на доступ к диску, буферу обмена)
 *
 * @param {!MessageDataObject} msg
 * @param {Permission.Type} permissionType
 * @private
 */
BackgroundBridge.prototype.processChecked_ = function(msg, permissionType)
{
    if (!this.checkBackgroundPort_())
        return;

    this.msgQueue.push({msg: msg, permissionType: permissionType});
    this.requestPermissions_();
};

/**
 * Обработчик запросов, не требующих разрешений
 *
 * @param {!MessageDataObject} msg
 * @private
 */
BackgroundBridge.prototype.processUnchecked_ = function(msg)
{
    const type = /** @type {string} */(msg['type']).substr(kVendorPrefix.length);

    if (type === 'call.initHost')
    {
        this.resStrings = msg['resStrings'];
        if (typeof msg['hostName'] === 'string')
            this.nativeEnv = new NativeEnvironment(msg['hostName']);
        this.initBackground_(msg['hostName'], msg['version'], msg['reqHeader']);

        return;
    }

    if (type === 'call.disconnectHost')
    {
        this.disconnectHost_();

        return;
    }

    if (this.checkBackgroundPort_())
        this.backgroundPort.postMessage(msg);
};

/**
 * Отправка запроса на наличие разрешения Background скрипту.
 *
 * @private
 */
BackgroundBridge.prototype.requestPermissions_ = function()
{
    const msg = {'type': kVendorPrefix + 'call.permissionRead'};

    this.backgroundPort.postMessage(msg);
};

/** @private */
BackgroundBridge.prototype.disconnectHost_ = function()
{
    if (this.backgroundPort)
        this.backgroundPort.disconnect();
    this.backgroundPort = null;
};

/**
 * @return {boolean}
 * @private
 */
BackgroundBridge.prototype.checkBackgroundPort_ = function()
{
    if (this.backgroundPort !== null)
        return true;

    this.sendErrorMsg_(BackgroundBridge.ErrorCode.eHostNotInit, null,
        'Host not initialized! Need to call ' + kVendorPrefix + 'call.initHost');

    return false;
};

/**
 * @param {BackgroundBridge.ErrorCode} code
 * @param {?MessageDataObject=} clientMsg
 * @param {string=} errorDescr
 * @private
 */
BackgroundBridge.prototype.sendErrorMsg_ = function(code, clientMsg, errorDescr)
{
    /** @type {Object} */
    const msg =
        {
            'type': kVendorPrefix + 'response',
            'data': {'errCode': code}
        };

    if (clientMsg && /** @type {Object} */(clientMsg['reqHeader']))
        msg['reqHeader'] = clientMsg['reqHeader'];

    if (errorDescr)
        msg['data']['error'] = errorDescr;

    this.messageManager.postMessage(msg);
}

/**
 * @param {string} hostName
 * @param {string} version
 * @param {Object} reqHeader
 * @private
 */
BackgroundBridge.prototype.initBackground_ = function(hostName, version, reqHeader)
{
    if (this.backgroundPort !== null)
    {
        this.backgroundPort.onMessage.removeListener(this.onBackgroundMessageDelegate_);
        this.backgroundPort.onDisconnect.removeListener(this.onBackgroundDisconnectDelegate_);
        this.backgroundPort.disconnect();
    }

    try
    {
        this.backgroundPort = chrome.runtime.connect({name: hostName});
        this.backgroundPort.onMessage.addListener(this.onBackgroundMessageDelegate_);
        this.backgroundPort.onDisconnect.addListener(this.onBackgroundDisconnectDelegate_);

        // Сразу посылаем привет
        // Если не удастся - сразу отваливаемся (disconnect будет)
        const helloMsg =
            {
                'reqHeader': reqHeader,
                'type': kVendorPrefix + 'hello',
                'version': version,
            };
        this.nativeEnv.appendEnv(helloMsg);
        this.backgroundPort.postMessage(helloMsg);
    }
    catch (e)
    {
    }
};

/**
 * @param {!MessageDataObject} msg
 * @private
 */
BackgroundBridge.prototype.onBackgroundMessage_ = function(msg)
{
    // Для совместимости с предыдущими версиями платформы
    if (msg['data'] === undefined)
        msg['data'] = {};

    const type = /** @type {string} */(msg['type']).substr(kVendorPrefix.length);

    if (NativeEnvironment.containsEnvInfo(msg))
        this.nativeEnv.setupEnv(msg);


    if (type === 'response.permissionRead')
    {
        if (this.isQueryPermission_(msg))
            this.tryChangeToGranted_(msg);

        this.handleMsgQueue_(msg);
    }

    this.messageManager.postMessage(msg);
};

/**
 * @param {!MessageDataObject} msg
 * @return {Permission.Type|undefined}
 * @private
 */
BackgroundBridge.prototype.isQueryPermission_ = function(msg)
{
    return msg['query'];
};

/**
 * @param {!MessageDataObject} msg
 * @private
 */
BackgroundBridge.prototype.tryChangeToGranted_ = function(msg)
{
    const state =  Permission.State.getProp(msg);
    const queryType = /** @type {Permission.Type} */(msg['query']);
    let status = state.getStatus(queryType);

    if (status !== Permission.Status.Granted)
    {
        status = this.getGrantedOrDeniedFromUser_(queryType);
        this.setPermission_(queryType, status);

        /** @type {Object} */(msg['permissionsState'])[queryType] = status;
    }
};

/**
 * @param {!MessageDataObject} stateMsg
 * @private
 */
BackgroundBridge.prototype.handleMsgQueue_ = function(stateMsg)
{
    const state = Permission.State.getProp(stateMsg);
    const self = this;

    this.msgQueue.forEach(
        /** @param {{msg: !MessageDataObject, permissionType: !Permission.Type}} request */
        function(request)
        {
            const status = state.getStatus(request.permissionType);

            switch (request.permissionType)
            {
                case Permission.Type.FileSystem:
                    self.handleFileSystemRequest_.call(self, request, status);
                    return;
                case Permission.Type.Clipboard:
                    self.handleClipboardRequest_.call(self, request, status);
                    return;
                default:
                    self.sendErrorMsg_.call(self, BackgroundBridge.ErrorCode.eException, request.msg);
                    return;
            }
        });

    this.msgQueue = [];
};

/**
 * @param {!Permission.Type} permissionType
 * @return {Permission.Status}
 * @private
 */
BackgroundBridge.prototype.getGrantedOrDeniedFromUser_ = function(permissionType)
{
    /** @type {string} */
    const host = document.location.origin;

    /** @type {string} */
    let confirmMsg;
    // Для совместимости с предыдущей версией платформы
    if (permissionType === Permission.Type.Clipboard && this.resStrings['attemptToUse'])
    {
        confirmMsg = this.resStrings['attemptToUse'].replace(/%\w+%/, host);
    }
    else
    {
        switch (permissionType)
        {
            case Permission.Type.FileSystem:
                confirmMsg = this.resStrings['filesystemRequestTemplate'];
                break;
            case Permission.Type.Clipboard:
                confirmMsg = this.resStrings['clipboardRequestTemplate'];
                break;
            default:
                return Permission.Status.Denied;
        }

        confirmMsg = confirmMsg.replace(/%\w+%/, host);
    }

    /** @type {Permission.Status} */
    const result = confirm(confirmMsg) ? Permission.Status.Granted : Permission.Status.Denied;

    this.notifyPermissionChanged_(permissionType, result);

    return result;
};

/**
 * @param {Permission.Type} type
 * @param {Permission.Status} status
 * @private
 */
BackgroundBridge.prototype.notifyPermissionChanged_ = function(type, status)
{
    const data = /** @type {Object} */({'type': type, 'status': status});

    this.messageManager.postMessage({type: kVendorPrefix + 'permissionChanged', 'data': data});
};

/**
 * @param {{msg: !MessageDataObject, permissionType: !Permission.Type}} request
 * @param {Permission.Status} status
 * @private
 */
BackgroundBridge.prototype.handleFileSystemRequest_ = function(request, status)
{
    if (status === Permission.Status.Unknown)
    {
        status = this.getGrantedOrDeniedFromUser_(request.permissionType);
        this.setPermission_(request.permissionType, status);
    }

    switch (status)
    {
        case Permission.Status.Granted:
            this.nativeEnv.setContext([NativeEnvironment.Code.NO_DIALOGS_IN_NATIVE]);
            break;
        case Permission.Status.Denied:
            this.nativeEnv.setContext([]);
            break;
        default:
            return;
    }

    this.nativeEnv.appendContext(request.msg);
    this.backgroundPort.postMessage(request.msg);
};

/**
 * @param {{msg: !MessageDataObject, permissionType: !Permission.Type}} request
 * @param {Permission.Status} status
 * @private
 */
BackgroundBridge.prototype.handleClipboardRequest_ = function(request, status)
{
    if (status !== Permission.Status.Granted)
    {
        status = this.getGrantedOrDeniedFromUser_(request.permissionType);
        this.setPermission_(request.permissionType, status);
    }

    if (status !== Permission.Status.Granted)
    {
        this.sendErrorMsg_(BackgroundBridge.ErrorCode.eAccessDenied, request.msg);

        return;
    }

    let frame = window;
    const msg = /** @type {!MessageDataObject} */(request.msg);
    const msgFrame = /** @type {string} */(msg['frame']);

    if (msgFrame !== undefined)
        frame = /** @type {Window} */(window.frames[msgFrame]);

    const type = /** @type {string} */(msg['type']).substr(kVendorPrefix.length);
    let responseType = /** @type {?string} */(null);

    switch (type)
    {
        case 'call.clipboardCopySelected':
            // Копирование в буфер обмена выделенной области.
            frame.document.execCommand('Copy');
            responseType = 'response.clipboardCopySelected';
            break;
        case 'call.clipboardCutSelected':
            // Вырезание в буфер обмена выделенной области.
            frame.document.execCommand('Cut');
            responseType = 'response.clipboardCutSelected';
            break;
        case 'call.clipboardPaste':
            // Вставка из буфера обмена.
            frame.document.execCommand('Paste');
            responseType = 'response.clipboardPaste';
            break;
    }

    if (responseType)
        this.messageManager.postMessage({'reqHeader': request.msg['reqHeader'], type: kVendorPrefix + responseType})
    else
        this.backgroundPort.postMessage(request.msg);
};

/**
 * @param {Permission.Type} type
 * @param {Permission.Status} status
 * @private
 */
BackgroundBridge.prototype.setPermission_ = function(type, status)
{
    const msg =
        {
            'type': kVendorPrefix + 'call.permissionWrite',
            'permissionType': type,
            'permissionStatus': status
        };

    this.backgroundPort.postMessage(msg);
};

/** @private */
BackgroundBridge.prototype.onBackgroundDisconnect_ = function()
{
    this.backgroundPort = null;
    this.sendErrorMsg_(BackgroundBridge.ErrorCode.eHostDisconnected, null, 'Host disconnected!');
};

/**
 * Посредник между background-скриптом и веб-клиентом
 *
 * @constructor
 * @struct
 */
function WebClientBridge()
{
    /** @type {Object.<!BackgroundBridge>} */
    this.clients = {};
    this.mainMessageListenerInstance = this.mainMessageListener_.bind(this);

    this.init_();
}

/**
 * Ожидаем загрузку веб-клиента
 *
 * @return {*}
 * @private
 */
WebClientBridge.prototype.init_ = function ()
{
    const body = window.document.body;

    if (!body || !body.classList.contains('main-form'))
        return setTimeout(this.init_.bind(this), 100);

    this.initTestConnectionPort_();
};

/** @private */
WebClientBridge.prototype.initTestConnectionPort_ = function()
{
    const port = chrome.runtime.connect({});

    port.onDisconnect.addListener(this.unmount_.bind(this));
    this.mount_();
};

/** @private */
WebClientBridge.prototype.mount_ = function()
{
    window.addEventListener('message', this.mainMessageListenerInstance);
    window.postMessage({type: kVendorPrefix + 'browserExtensionState', data: {state: true}}, '*');
    //legacy
    window.document.body.classList.add('1cei');
};

/** @private */
WebClientBridge.prototype.unmount_ = function()
{
    window.removeEventListener('message', this.mainMessageListenerInstance);
    window.postMessage({type: kVendorPrefix + 'browserExtensionState', data: {state: false}}, '*');
    //legacy
    window.document.body.classList.remove('1cei');
};

/**
 * @param {!MessageDataObject} data
 * @return {boolean}
 * @private
 */
WebClientBridge.prototype.isAllowedClientMessage_ = function(data)
{
    const disallowedTypes = [kVendorPrefix + 'call.permissionWrite'];
    const msgType = data.type;

    return !disallowedTypes.includes(msgType);
};

/**
 * @param {!Event} event
 * @private
 */
WebClientBridge.prototype.mainMessageListener_ = function(event)
{
    const msgEvent = /** @type {!MessageEvent<MessageDataObject>} */(event);
    if (msgEvent.data === null || typeof msgEvent.data !== 'object')
        return;

    const data = msgEvent.data;

    if (!data || typeof data !== 'object')
        return;

    if (!this.isAllowedClientMessage_(data))
        return;

    if (this.isLegacy_(data))
        return;

    if (data.type === kVendorPrefix + 'queryBrowserExtensionState')
    {
        window.postMessage({type: kVendorPrefix + 'browserExtensionState', data: {state: true}}, '*');
        return;
    }

    if (!data[kVendorPrefix + 'clientId'])
        return;

    if (typeof data.type !== 'string' || !data.type.startsWith(kVendorPrefix))
        return;

    if (data['reqHeader'])
        data['reqHeader']['status'] = 'response';

    const clientId = /** @type {string} */(data[kVendorPrefix + 'clientId']);

    this.getBackgroundBridge_(clientId).processMessage(data);
};

/**
 * @param {string} clientId
 * @return {BackgroundBridge}
 * @private
 */
WebClientBridge.prototype.getBackgroundBridge_ = function(clientId)
{
    if (!this.clients[clientId])
    {
        // Экземпляр BackgroundBridge идентифицируется с конкретным clientId.
        // Он прикрипляет этот clientId в свои ответные сообщения.
        this.clients[clientId] = new BackgroundBridge(
            {
                /** @param {Object} msg */
                postMessage: function(msg)
                {
                    msg[kVendorPrefix + 'clientId'] = clientId;
                    window.postMessage(msg, '*');
                }
            });
    }

    return this.clients[clientId];
};

/**
 * Для обратной совместимости
 *
 * @param {!MessageDataObject} data
 * @return {boolean}
 * @private
 */
WebClientBridge.prototype.isLegacy_ = function(data)
{
    // Запрос установлено ли расширение
    if (data.type === kVendorPrefix + 'queryExtensionInstalled')
    {
        window.postMessage(
            {
                'reqHeader': data['reqHeader'],
                'type': kVendorPrefix + 'replyExtensionInstalled',
                'manifest': chrome.runtime.getManifest()
            }, '*');

        return true;
    }

    return false;
};

/**
 * @typedef {{type: string,
 *     data: Object,
 *     hostName: string,
 *     version: string,
 *     frame: string,
 *     text: string,
 *     reqHeader: Object,
 *     permissionType: Permission.Type}}
 */
let MessageDataObject;

new WebClientBridge();
