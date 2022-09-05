/**
 * Класс, поддерживающий данные, которые хранит расширение, в актуальном состоянии
 *
 * @constructor
 * @struct
 * @param {!Object} data
 */
function DataActualizer(data)
{
    /**
     * @type {!Object}
     * @private
     */
    this.data_ = data;
}

/**
 * Актуальная версия API хранения данных
 *
 * @const {number}
 */
DataActualizer.kActualVersion = 4;


/**
 * Минимальная версия данных, поддерживающая миграцию
 *
 * @const {number}
 */
DataActualizer.kInitialSupportedVersion = 4;

/**
 * Миграция данных идет пошагово: Ver(n) -> Ver(n+1) -> Ver(n+2) -> ...
 *
 * Однако, версия 4 не поддерживает совместимость с версиями 1, 2, 3.
 * При миграции с этих версий данные не сохраняются.
 *
 * @return {!Object}
 */
DataActualizer.prototype.actualize = function()
{
    let version = this.getVersion_();

    while (version < DataActualizer.kActualVersion)
    {
        this.migrate_(version);
        version = this.getVersion_();
    }

    return this.data_;
};

/**
 * @return {number}
 * @private
 */
DataActualizer.prototype.getVersion_ = function()
{
    if (this.data_['version'] !== undefined)
        return parseInt(this.data_['version'], 10);
    else
        return 1;
};

/**
 * @param {number} version
 * @private
 */
DataActualizer.prototype.migrate_ = function (version)
{
    switch (version)
    {
        case 1:
        case 2:
        case 3:
            this.migrateTo4_();
            break;
        default:
            break;
    }
};

/**
 * Миграция до версии 4 не сохраняет данные storage
 *
 * @private
 */
DataActualizer.prototype.migrateTo4_ = function ()
{
    this.data_ = DataV4.create();
};
