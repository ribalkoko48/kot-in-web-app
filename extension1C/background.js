/**
 * Посредник между нативным хост-расширение и content-script'ом на странице
 *
 * @constructor
 * @struct
 */
function NativeProxy()
{
    /** @type {Port} */
    this.nativePort = null;

    /** @type {Port} */
    this.contentPort = null;

    /** @type {string} */
    this.hostExtensionName_ = '';

    /**
     * @type {!Function}
     * @private
     */
    this.onContentMessageDelegate_ = this.onContentMessage.bind(this);

    /**
     * @type {!Function}
     * @private
     */
    this.onContentDisconnectDelegate_ = this.onContentDisconnect.bind(this);
}

/**
 * @type {HTMLTextAreaElement}
 * @private
 */
NativeProxy.textArea_ = null;

/** @param {string} hostExtensionName */
NativeProxy.prototype.init = function(hostExtensionName)
{
    this.nativePort = chrome.runtime.connectNative(hostExtensionName);
    this.nativePort.onMessage.addListener(this.onNativeMessage.bind(this));
    this.nativePort.onDisconnect.addListener(this.onNativeDisconnect.bind(this));
    chrome.storage.local.get(kStorageKey, this.checkData_.bind(this));
};

/**
 * Проверяет сохраненные в расширении данные на актуальность и актуализирует их при необходимости
 *
 * @param {Object} values
 * @private
 */
NativeProxy.prototype.checkData_ = function(values)
{
    if (!values || !values[kStorageKey])
        return;

    const data = /** @type {!Object} */(values[kStorageKey]);
    const newValues = {};

    newValues[kStorageKey] = (new DataActualizer(data)).actualize();
    chrome.storage.local.set(newValues);
};

/** @param {Object} msg */
NativeProxy.prototype.onNativeMessage = function(msg)
{
    if (!this.contentPort)
        return;
    this.contentPort.postMessage({'data': msg, 'type': kVendorPrefix + 'response.native'});
};

NativeProxy.prototype.onNativeDisconnect = function()
{
    if (!this.contentPort)
        return;

    this.contentPort.disconnect();
    this.contentPort = null;
    this.nativePort = null;
};

NativeProxy.prototype.onContentDisconnect = function()
{
    if (!this.nativePort)
        return;

    this.nativePort.disconnect();
    this.nativePort.onMessage.removeListener(this.onContentMessageDelegate_);
    this.nativePort.onDisconnect.removeListener(this.onContentDisconnectDelegate_);
    this.contentPort = null;
    this.nativePort = null;
};

/** @param {!Port} port */
NativeProxy.prototype.connectPort = function(port)
{
    if (this.contentPort)
    {
        this.contentPort.disconnect();
        this.nativePort.onMessage.removeListener(this.onContentMessageDelegate_);
        this.nativePort.onDisconnect.removeListener(this.onContentDisconnectDelegate_);
    }
    this.contentPort = port;
    port.onMessage.addListener(this.onContentMessageDelegate_);
    port.onDisconnect.addListener(this.onContentDisconnectDelegate_);
};

/**
 * @param {!MessageDataObject} msg
 * @param {Port} port
 */
NativeProxy.prototype.onContentMessage = function(msg, port)
{
    try
    {
        const prefix = kVendorPrefix;
        const type = /** @type {string} */(msg['type']).substr(prefix.length);

        switch (type)
        {
            case 'callHost':
                if (!this.nativePort)
                    this.init(this.hostExtensionName_);
                this.nativePort.postMessage(msg['data']);
                break;
            case 'call.activateTab':
                chrome.tabs.get(
                    port.sender.tab.id,
                    function(/** !Tab */tab)
                    {
                        const tabId = tab.id;
                        const windowId = tab.windowId;
                        chrome.tabs.update(tabId, { active: true });
                        chrome.windows.update(windowId, { focused: true });
                    });
                break;
            case 'call.openTab':
                chrome.tabs.get(
                    port.sender.tab.id,
                    function(/** !Tab */tab)
                    {
                        const tabId = tab.id;
                        const windowId = tab.windowId;
                        const url = /** @type {string} */(msg['url']);
                        chrome.tabs.create({
                            url: url,
                            windowId: windowId,
                            openerTabId: tabId
                        });
                    });
                break;
            case 'call.closeExtensionStoreAndReturn':
                chrome.tabs.query({active: true}, function(tabs)
                {
                    const tab = tabs[0];
                    if (tab.url.includes('chrome.google') || tab.url.includes('addons.mozilla'))
                        chrome.tabs.remove(tab.id);
                    const tabId = port.sender.tab.id;
                    chrome.tabs.update(tabId, {selected: true});
                });
                break;
            case 'call.chooseDesktopMedia':
                chrome.permissions.request(
                    {permissions: ['desktopCapture']},
                    this.onDesktopCapturePermissionsResponse_.bind(this, msg, port));
                break;
            case 'call.clipboardWrite':
                this.copyToClipboard_(msg['text']);
                this.postToContentScript_(this.extendMsg_(msg, {'type': prefix + 'response.clipboardWrite'}));
                break;
            case 'call.clipboardRead':
                if (!NativeProxy.textArea_)
                {
                    NativeProxy.textArea_ = /** @type {!HTMLTextAreaElement} */(document.createElement('textarea'));
                    document.body.appendChild(NativeProxy.textArea_);
                }
                NativeProxy.textArea_.value = '';
                NativeProxy.textArea_.focus();
                document.execCommand('Paste');
                this.postToContentScript_(this.extendMsg_(msg, {'type': prefix + 'response.clipboardRead', 'text': NativeProxy.textArea_.value}));
                break;
            case 'hello':
                if (this.nativePort)
                {
                    const helloMsg =
                        {
                            'type': 0,
                            'version': msg['version'],
                            'environment': msg['environment'],
                            'userAgent': navigator.userAgent
                        };

                    try
                    {
                        this.nativePort.postMessage(helloMsg);
                    }
                    catch (e)
                    {
                        this.onNativeDisconnect();
                        this.onContentDisconnect();
                    }
                }
                else if (this.contentPort)
                {
                    this.postToContentScript_(this.extendMsg_(msg,{'type': prefix + 'response.hi', 'userAgent': navigator.userAgent}));
                }
                break;
            case 'call.permissionRead':
                chrome.storage.local.get(kStorageKey, this.permissionRead_.bind(this, msg, port.sender.url));
                break;
            case 'call.permissionWrite':
                chrome.storage.local.get(kStorageKey, this.permissionWrite_.bind(this, msg, port.sender.url));
                break;
        }
    }
    catch (/** @type {Error} */e)
    {
        const err = /** @type {!MessageDataObject} */(
            {
                'type': kVendorPrefix + 'response',
                'data': {'error': e.message}
            });

        this.postToContentScript_(this.extendMsg_(msg, err));
    }
};

/**
 * @param {!MessageDataObject} msg
 * @param {Port} port
 * @param {boolean} granted
 * @private
 */
NativeProxy.prototype.onDesktopCapturePermissionsResponse_ = function (msg, port, granted)
{
    if (granted)
    {
        chrome.desktopCapture.chooseDesktopMedia(
            ['screen', 'tab'],
            port.sender.tab,
            this.onChooseDesktopMedia_.bind(this, msg));
    }
    else
    {
        this.onChooseDesktopMedia_(msg, '', {});
    }
};

/**
 * @param {!MessageDataObject} msg
 * @param {string} streamId
 * @param {Object} options
 * @private
 */
NativeProxy.prototype.onChooseDesktopMedia_ = function(msg, streamId, options)
{
    this.contentPort.postMessage(
        {
            'reqHeader': msg['reqHeader'],
            'type': kVendorPrefix + 'response.chooseDesktopMedia',
            'streamId': streamId,
            'options': options
        });
};

/**
 * @param {!MessageDataObject} msg
 * @private
 */
NativeProxy.prototype.postToContentScript_ = function(msg)
{
    this.toggleReqHeaderToResponse_(msg);
    this.contentPort.postMessage(msg);
};

/**
 * @param {!MessageDataObject} msg
 * @param {!Object=} opt_params
 * @return {!MessageDataObject}
 * @private
 */
NativeProxy.prototype.extendMsg_ = function(msg, opt_params)
{
    return /** @type {!MessageDataObject} */ (Object.assign({}, msg, opt_params));
};

/**
 * @param {Object} response
 * @private
 */
NativeProxy.prototype.toggleReqHeaderToResponse_ = function(response)
{
    if (response['reqHeader'])
        response['reqHeader']['status'] = 'response';
};

/**
 * @param {string} url
 * @return {string}
 * @private
 */
NativeProxy.prototype.getCleanedHost_ = function(url)
{
    const result = new URL(url);

    return result.origin;
};

/**
 * Чтение разрешения из хранилища расширения
 *
 * @param {!MessageDataObject} msg
 * @param {string|undefined} url
 * @param {Object} values
 * @private
 */
NativeProxy.prototype.permissionRead_ = function(msg, url, values)
{
    if (!url)
        return;

    const host = this.getCleanedHost_(url);
    const data = this.getData_(values);
    const hostData = this.getHostData_(data, host);

    if (this.contentPort)
    {
        this.postToContentScript_(this.extendMsg_(msg,
            {'type': kVendorPrefix + 'response.permissionRead', 'permissionsState': hostData.permissions}));
    }
};

/**
 * Запись разрешения в хранилище расширения
 *
 * @param {!MessageDataObject} msg
 * @param {string|undefined} url
 * @param {Object} values
 * @private
 */
NativeProxy.prototype.permissionWrite_ = function(msg, url, values)
{
    if (!url)
        return;

    const host = this.getCleanedHost_(url);
    const permissionType = /** @type {Permission.Type} */(msg['permissionType']);
    const permissionStatus = /** @type {Permission.Status} */(msg['permissionStatus']);
    const data = this.getData_(values);
    const hostData = this.getHostData_(data, host);
    const permissions = hostData.permissions;

    permissions[permissionType] = permissionStatus;
    chrome.storage.local.set({[kStorageKey]: data});
};

/**
 * @param {Object} values
 * @return {!DataV4}
 * @private
 */
NativeProxy.prototype.getData_ = function(values)
{
    return (values && /** @type {!DataV4} */(values[kStorageKey])) ?
        /** @type {!DataV4} */(values[kStorageKey]) :
        DataV4.create();
};

/**
 * @param {!DataV4} data
 * @param {string} host
 * @return {!DataV4.HostData}
 * @private
 */
NativeProxy.prototype.getHostData_ = function(data, host)
{
    if (!data.hosts)
        data.hosts = {};

    if (!data.hosts[host])
        data.hosts[host] = DataV4.HostData.create();

    return /** @type {!DataV4.HostData} */(data.hosts[host]);
};

/**
 * @param {string} text
 * @private
 */
NativeProxy.prototype.copyToClipboard_ = function(text)
{
    if (!NativeProxy.textArea_)
    {
        NativeProxy.textArea_ = /** @type {!HTMLTextAreaElement} */(document.createElement('textarea'));
        document.body.appendChild(NativeProxy.textArea_);
    }
    NativeProxy.textArea_.value = text;
    NativeProxy.textArea_.select();
    if (!text)
        this.forceClipboardCopyText_('');
    document.execCommand('Copy');
};

/**
 * @param {string} forceText
 * @private
 */
NativeProxy.prototype.forceClipboardCopyText_ = function(forceText)
{
    document.oncopy = this.onDocumentCopy_.bind(this, forceText)
};

/**
 * @param {string} forceText
 * @param {!ClipboardEvent} event
 * @private
 */
NativeProxy.prototype.onDocumentCopy_ = function(forceText, event)
{
    event.clipboardData.setData('Text', forceText);
    event.preventDefault();
    document.oncopy = null;
};

chrome.runtime.onConnect.addListener(
    /** @param {!Port} port */
    function(port)
    {
        const proxy = new NativeProxy();
        proxy.connectPort(port);
        if (port.name)
            proxy.init(port.name);
    });

chrome.runtime.onUpdateAvailable.addListener(
    function()
    {
        // Не вызываем chrome.runtime.reload();
        // Расширение обновится при перезапуске браузера
    });

chrome.runtime.onMessageExternal.addListener(
    /**
     * @param {*} message
     * @param {!MessageSender} sender
     * @param {function(*): undefined} sendResponse
     */
    function(message, sender, sendResponse)
    {
        if (message && message['type'] === kVendorPrefix + 'checkEnabled')
        {
            sendResponse({
                enabled: chrome.runtime.id === kChromeTestExtensionId
            });
        }
    });

/**
 * В Chrome во время установки и включения расширения content скрипты не подгружаются на существующих вкладках.
 * Инжектим их, чтобы не вынуждать клиента перезагружать страницу.
 */
chrome.tabs.query({}, injectForAll);


/** @param {!Array<!Tab>} tabs */
function injectForAll(tabs)
{
    const manifest = chrome.runtime.getManifest();
    const scripts = manifest.content_scripts[0].js;

    for (let tab of tabs)
    {
        for (let script of scripts)
            inject(script, tab);
    }
}

/**
 * @param {string} script
 * @param {!Tab} tab
 */
function inject(script, tab)
{
    try
    {
        chrome.tabs.executeScript(tab.id, {'file': script}, function ()
        {
            /** @suppress {suspiciousCode, reportUnknownTypes} */
            chrome.runtime.lastError;
        });
    }
    catch (e)
    {
    }
}

/**
 * @typedef {{
 *     type: string,
 *     data: Object,
 *     hostName: string,
 *     host: string,
 *     version: string,
 *     frame: string,
 *     text: string,
 *     reqHeader: Object,
 *     permissionsState: Array<Permission.Type>}}
 */
let MessageDataObject;
