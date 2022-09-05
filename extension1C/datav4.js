/**
 * Данные расширения версии 4
 *
 * @record
 * @struct
 */
const DataV4 = function ()
{
    /**
     * @type {number}
     * @expose
     */
    this.version = 4;

    /**
     * @type {!Object.<string, !DataV4.HostData>}
     * @expose
     */
    this.hosts = {};
};

/** @return {!DataV4} */
DataV4.create = function()
{
    return { version: 4, hosts: {} };
};

/**
 * Данные расширения хоста
 *
 * @record
 * @struct
 */
DataV4.HostData = function ()
{
    /**
     * @type {!Object<Permission.Type, Permission.Status>}
     * @expose
     */
    this.permissions = {};
};

/** @return {!DataV4.HostData} */
DataV4.HostData.create = function ()
{
    return { permissions: {} };
};
