var searchData = '';
var storageData = null;

function init(data)
{
    initLocale();
    initSearchInputListener();

    chrome.storage.local.get(kStorageKey, updStorageData);
    chrome.storage.onChanged.addListener(onChangedListener);
}

function onChangedListener(mixedData, area)
{
    if (area === 'local' && mixedData && mixedData[kStorageKey] && mixedData[kStorageKey].newValue)
        updStorageData({[kStorageKey]: mixedData[kStorageKey].newValue});
}

function updStorageData(data)
{
    storageData = data;
    createSitesList();
}

function createSitesList()
{
    if (!storageData || !storageData[kStorageKey] || !storageData[kStorageKey].hosts)
        return;

    var hosts = storageData[kStorageKey].hosts;

    clearSites();

    Object.keys(hosts)
        .filter(str => str.toLowerCase().includes(searchData.toLowerCase()))
        .sort()
        .forEach(function(url)
        {
            var hostData = hosts[url];

            if (!hostData || !hostData.permissions)
                return;

            addSite(url, hostData);
        });
}

function clearSites()
{
    var node = document.body.querySelector('.table');

    while (node.firstElementChild !== node.lastElementChild)
    {
        node.removeChild(node.lastElementChild);
    }
}

function addSite(url, hostData)
{
    var site = permissionsContainerTemplate.content.cloneNode(true);
    var tr = site.querySelector('.tr');
    var urlNode = tr.querySelector('.url-mark');
    var filesystemNode= tr.querySelector('.filesystem-mark');
    var clipboardNode = tr.querySelector('.clipboard-mark');
    var screenshotNode = tr.querySelector('.screenshot-mark');

    var trashNode = tr.querySelector('.trash-mark');
    var trashNodeCont = trashNode.parentElement;
    var permissions = getPermissions(hostData);

    initTrashButtonListener(trashNodeCont);

    urlNode.textContent = url;
    urlNode.dataset.url = url;

    initCheckboxes([
        {node: filesystemNode, val: +permissions[Permission.Type.FileSystem]},
        {node: clipboardNode, val: +permissions[Permission.Type.Clipboard]},
        {node: screenshotNode, val: +permissions[Permission.Type.Screenshot]}
    ]);
    initCheckboxesListeners([filesystemNode, clipboardNode]);

    trashNode.setAttribute('href', '#svg_Recycling');
    trashNode
        .closest('span')
        .setAttribute('title', chrome.i18n.getMessage('removeSiteTitle'));

    document.body.querySelector('.table').appendChild(site);
}

function getPermissions(hostData)
{
    var permissions = {};

    permissions[Permission.Type.FileSystem] =
        hostData.permissions[Permission.Type.FileSystem] === Permission.Status.Granted;
    permissions[Permission.Type.Clipboard] =
        hostData.permissions[Permission.Type.Clipboard] === Permission.Status.Granted;
    permissions[Permission.Type.Screenshot] =
        hostData.permissions[Permission.Type.Screenshot] === Permission.Status.Granted;

    return permissions;
}

function initCheckboxes(checkWrappers)
{
    checkWrappers.forEach(function(checkWrapper)
    {
        var node = checkWrapper.node;
        var val = checkWrapper.val;

        node.querySelector('input').checked = val;
        node.querySelector('span').setAttribute('title',
            chrome.i18n.getMessage(val ? 'accessAllowedTitle' : 'accessDeniedTitle'));
        node.querySelector('i').setAttribute('title',
            chrome.i18n.getMessage(val ? 'accessAllowedTitle' : 'accessDeniedTitle'));
    })
}

function initCheckboxesListeners(checkWrappers)
{
    checkWrappers.forEach(function(wrapper, ind)
    {
        wrapper.addEventListener('change', function(e)
        {
            if (!e.target.value)
                return;

            var isChecked = e.target.checked;
            var url = wrapper.closest('.tr').querySelector('.url-mark').dataset.url;

            var permissionType = Permission.Type.FileSystem;
            if (wrapper.classList.contains('clipboard-mark'))
                permissionType = Permission.Type.Clipboard;
            else if (wrapper.classList.contains('screenshot-mark'))
                permissionType = Permission.Type.Screenshot;

            var permissionValue = isChecked ? Permission.Status.Granted : Permission.Status.Denied;

            chrome.storage.local.get(kStorageKey, changePermission.bind(this, url, permissionType, permissionValue));
        });
    })
}

function initTrashButtonListener(node)
{
    node.addEventListener('click', function(e)
    {
        var url = node.closest('.tr').querySelector('.url-mark').dataset.url;

        chrome.storage.local.get(kStorageKey, deleteSite.bind(this, url));
    });
}

function initSearchInputListener()
{
    var searchInp = document.getElementById('searchInput');
    var searchInputClear = document.getElementById('searchInputClear');

    searchInp.addEventListener('input', function()
    {
        searchData = searchInp.value;

        createSitesList();
    });

    searchInputClear.addEventListener('click', function()
    {
        searchInp.value = searchData = '';

        createSitesList();
    });
}

function initLocale()
{
    var title = document.querySelector('title');
    var mainHeader = document.querySelector('.head .header');
    var permissionsTableHeader = document.querySelector('.table-header-mark');
    var searchInput = document.querySelector('#searchInput');
    var searchInputClear = document.querySelector('#searchInputClear');
    var theadFields = document.querySelectorAll('.table .thead .td');

    title.textContent = chrome.i18n.getMessage('mainHeader');
    mainHeader.setAttribute('title', chrome.i18n.getMessage('mainHeader'));
    mainHeader.textContent = chrome.i18n.getMessage('mainHeader');

    permissionsTableHeader.textContent = chrome.i18n.getMessage('permissionsTableHeader');

    permissionsTableHeader.nextElementSibling.setAttribute('title', chrome.i18n.getMessage('searchTitle'));
    searchInput.setAttribute('placeholder', chrome.i18n.getMessage('searchTitle'));
    searchInputClear.setAttribute('title', chrome.i18n.getMessage('clearTitle'));

    theadFields[0].textContent = chrome.i18n.getMessage('siteField');
    theadFields[1].textContent = chrome.i18n.getMessage('filesystemField');
    theadFields[2].textContent = chrome.i18n.getMessage('clipboardField');
    theadFields[3].textContent = chrome.i18n.getMessage('screenshotField');
}

function deleteSite(url, data)
{
    var newData = data;

    if (!newData[kStorageKey].hosts[url])
        return;

    delete newData[kStorageKey].hosts[url];

    chrome.storage.local.set(newData, function()
    {
        chrome.storage.local.get(kStorageKey, updStorageData);
    });
}

function changePermission(url, permissionType, permissionValue, data)
{
    var newData = data;

    if (!newData[kStorageKey].hosts[url])
        return;

    newData[kStorageKey].hosts[url].permissions[permissionType] = permissionValue;

    chrome.storage.local.set(newData);
}

init();
